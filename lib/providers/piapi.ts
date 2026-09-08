import { ProviderError, type ImageRequest, type ImageResult, type ProviderAdapter, type ProviderTask, type VideoRequest } from './types';

/** Contracts: https://piapi.ai/docs/llms.txt, checked 2026-09-07. */
export const PIAPI_TASK_URL = 'https://api.piapi.ai/api/v1/task';
const UPLOAD_URL = 'https://upload.theapi.app/api/ephemeral_resource';
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const fail = (message: string, status = 400): never => { throw new ProviderError(message, status, 'piapi'); };

function publicError(status: number, uploading: boolean): string {
  if (uploading && status === 403) return 'PiAPI blocked this reference upload. Browser reference uploads require the Creator plan or higher. No generation task was submitted.';
  if (status === 401 || status === 403) return 'Your PiAPI API key is invalid or does not have access to this model.';
  if (status === 402) return 'Your PiAPI account needs additional credits.';
  if (status === 429) return 'PiAPI is rate limiting requests. Please try again shortly.';
  return 'PiAPI rejected the request. Check the model settings and your PiAPI task history.';
}

async function request(url: string, apiKey: string, body?: Json, paid = false): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(url, {
      // Workers supports only follow/manual. Reject redirects below so a key
      // never follows Location to another host, in either runtime.
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { 'X-API-Key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return fail(paid ? 'PiAPI may have accepted this task. Check your PiAPI task history before submitting again.' : 'Could not reach PiAPI. Please try again.', paid ? 409 : 503);
  }
  if (String(response.type) === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    return fail(paid ? 'PiAPI may have accepted this task. Check your PiAPI task history before submitting again.' : 'PiAPI returned an unexpected redirect.', paid ? 409 : 502);
  }
  const payload = record(await response.json().catch(() => null));
  const code = typeof payload.code === 'number' ? payload.code : typeof payload.code === 'string' ? Number(payload.code) : undefined;
  const status = !response.ok ? response.status : code && code >= 400 ? code : 200;
  if (status >= 500 && paid) return fail('PiAPI may have accepted this task. Check your PiAPI task history before submitting again.', 409);
  if (status >= 400) return fail(publicError(status, url === UPLOAD_URL), status <= 599 ? status : 400);
  return record(payload.data);
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : undefined; } catch { return undefined; }
}

/** Guest data URLs need hosting; account references already have signed URLs. */
async function referenceUrls(apiKey: string, images: string[] = []): Promise<string[]> {
  const prepared = images.map(image => {
    if (httpsUrl(image)) return { url: image };
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) return fail('PiAPI references must be PNG, JPEG or WebP images.');
    if (match[2].length > 10_000_000) return fail('Each PiAPI reference upload must be under 10 MB after conversion.', 413);
    return { data: image, extension: match[1] === 'jpeg' ? 'jpg' : match[1] };
  });
  const urls: string[] = [];
  for (const ref of prepared) {
    if (ref.url) { urls.push(ref.url); continue; }
    const uploaded = await request(UPLOAD_URL, apiKey, { file_name: `reference-${crypto.randomUUID()}.${ref.extension}`, file_data: ref.data });
    const url = httpsUrl(uploaded.url);
    if (!url) return fail('PiAPI did not return a usable reference URL.', 502);
    urls.push(url);
  }
  return urls;
}

async function submit(apiKey: string, model: string, taskType: string, input: Json): Promise<{ taskId: string }> {
  const data = await request(PIAPI_TASK_URL, apiKey, { model, task_type: taskType, input, config: { service_mode: 'public' } }, true);
  if (typeof data.task_id !== 'string' || !data.task_id) return fail('PiAPI may have accepted this task but returned no task ID. Check your PiAPI task history before submitting again.', 409);
  return { taskId: data.task_id };
}

export async function piapiCreateImage(r: ImageRequest): Promise<{ taskId: string }> {
  if (r.model !== 'nano-banana-2') return fail('Choose a supported PiAPI image model.');
  if ((r.images?.length ?? 0) > 14) return fail('Nano Banana 2 accepts up to 14 references.');
  const resolution = r.resolution ?? '1K';
  if (!['1K', '2K', '4K'].includes(resolution)) return fail('Choose 1K, 2K or 4K for Nano Banana 2.');
  const aspect = r.aspectRatio;
  if (aspect && !['1:1','16:9','9:16','4:3','3:4','21:9','3:2','2:3','5:4','4:5','1:4','1:8','4:1','8:1'].includes(aspect)) return fail('Choose a supported Nano Banana 2 aspect ratio.');
  const urls = await referenceUrls(r.apiKey, r.images);
  return submit(r.apiKey, 'gemini', 'nano-banana-2', {
    prompt: r.prompt, resolution, output_format: 'png',
    ...(aspect ? { aspect_ratio: aspect } : {}), ...(urls.length ? { image_urls: urls } : {}),
  });
}

export async function piapiCreateVideo(r: VideoRequest): Promise<{ taskId: string }> {
  const veo = r.model === 'veo-3.1-fast';
  if (!veo && r.model !== 'kling-3-omni') return fail('Choose a supported PiAPI video model.');
  const duration = r.durationSeconds ?? (veo ? 8 : 5);
  if (!Number.isInteger(duration) || (veo ? ![4,6,8].includes(duration) : duration < 3 || duration > 15)) return fail('Choose a supported video duration.');
  const resolution = r.resolution ?? '720p';
  if (!['720p','1080p'].includes(resolution)) return fail('Choose 720p or 1080p for this PiAPI model.');
  const aspect = r.aspectRatio ?? '16:9';
  if (!(veo ? ['16:9','9:16'] : ['16:9','9:16','1:1']).includes(aspect)) return fail('Choose a supported video aspect ratio.');
  const mode = r.inputMode ?? (r.images?.length ? 'image' : 'text');
  const count = r.images?.length ?? 0;
  if (veo && mode === 'reference') return fail('Veo Fast does not support reference mode here.');
  if ((mode === 'text' && count !== 0) || (mode === 'image' && count !== 1) || (mode === 'frames' && count !== 2) || (mode === 'reference' && (count < 1 || count > 5))) return fail('The reference count does not match the selected video mode.');
  const urls = await referenceUrls(r.apiKey, r.images);
  const input: Json = { prompt: r.prompt, resolution, duration: veo ? `${duration}s` : duration, aspect_ratio: aspect };
  if (veo) {
    input.generate_audio = r.audio ?? false;
    if (urls[0]) input.image_url = urls[0];
    if (urls[1]) input.tail_image_url = urls[1];
  } else {
    input.version = '3.0'; input.enable_audio = r.audio ?? false;
    if (urls.length) input.images = urls;
    // Omni uses prompt references, not separate start/end fields.
    if (mode === 'image') input.prompt = `${r.prompt}\nUse @image_1 as the first frame.`;
    if (mode === 'frames') input.prompt = `${r.prompt}\nUse @image_1 as the first frame and @image_2 as the last frame.`;
  }
  return submit(r.apiKey, veo ? 'veo3.1' : 'kling', veo ? 'veo3.1-video-fast' : 'omni_video_generation', input);
}

export async function piapiPollTask({ apiKey, taskId }: { apiKey: string; taskId: string }): Promise<ProviderTask> {
  const data = await request(`${PIAPI_TASK_URL}/${encodeURIComponent(taskId)}`, apiKey);
  const status = data.status;
  if (['failed','cancelled','canceled'].includes(String(status))) return { taskId, state: 'error', urls: [], error: 'PiAPI could not complete this task. Check your PiAPI task history for details.' };
  if (status !== 'completed') {
    if (!['pending','processing','running','staged'].includes(String(status))) return fail('PiAPI returned an unrecognized task status.', 502);
    return { taskId, state: status === 'pending' ? 'queued' : 'running', urls: [] };
  }
  const output = record(data.output);
  const candidates = [output.image_url, output.video, output.video_url, ...(Array.isArray(output.image_urls) ? output.image_urls : [output.image_urls])];
  const urls = [...new Set(candidates.map(httpsUrl).filter((url): url is string => Boolean(url)))];
  if (!urls.length) return fail('PiAPI completed without a usable output URL.', 502);
  return { taskId, state: 'success', urls };
}

export async function piapiGenerateImage(r: ImageRequest, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))): Promise<ImageResult> {
  const { taskId } = await piapiCreateImage(r);
  for (let attempt = 0; attempt < 60; attempt++) {
    let task: ProviderTask;
    try { task = await piapiPollTask({ apiKey: r.apiKey, taskId }); }
    catch { return fail(`PiAPI task ${taskId} was submitted, but its result could not be retrieved. Check your PiAPI task history before generating again.`, 409); }
    if (task.state === 'success') return { url: task.urls[0] };
    if (task.state === 'error') return fail(task.error!, 422);
    await sleep(2000);
  }
  return fail(`PiAPI task ${taskId} is still running. Check your PiAPI task history before generating again.`, 409);
}

export const piapiAdapter: ProviderAdapter = { id: 'piapi', label: 'PiAPI', generateImage: piapiGenerateImage, createVideo: piapiCreateVideo, pollVideo: piapiPollTask };
