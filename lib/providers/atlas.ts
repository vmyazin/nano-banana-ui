// lib/providers/atlas.ts
import {
  ProviderError,
  readableProviderError,
  type ImageRequest,
  type ImageResult,
  type ProviderAdapter,
  type ProviderTask,
  type VideoInputField,
  type VideoRequest,
} from './types';

/**
 * Atlas Cloud — submit returns a prediction id, then you poll one endpoint for
 * every modality. Images and video differ only in which submit route you hit.
 *
 * Contract read from https://atlascloud.ai/docs/models/{image,video} and the
 * per-model machine-readable references at
 * https://www.atlascloud.ai/models/{model}/llms.txt on 2026-08-16.
 */
export const ATLAS_API = 'https://api.atlascloud.ai/api/v1';

/** Atlas writes sizes with a star, not an x: "1024*1024". */
const SIZES: Record<string, string> = {
  '1:1': '1024*1024',
  '16:9': '1344*768',
  '9:16': '768*1344',
  '4:3': '1152*896',
  '3:4': '896*1152',
  '3:2': '1216*832',
  '2:3': '832*1216',
  '21:9': '1536*640',
};

/**
 * Atlas is an aggregator, so a request body is the upstream model's, not one of
 * its own: the same idea wears a different field name per model, and a name the
 * model does not know is dropped in silence rather than rejected. Everything
 * from here to the adapter is quoted from a model's own parameter reference.
 *
 * Seedream v5.0 Pro, to start, will not take any of the sizes above: it requires
 * 1,048,576–4,194,304 output pixels and every one of them is smaller. These are
 * its own published sizes, all inside its 1.5K billing tier (≤2.36M pixels), so
 * a run costs the $0.036 the catalog quotes rather than the 2K tier's price. It
 * publishes no 3:2 or 21:9 size, so those snap to the nearest shape it does.
 */
const SEEDREAM_SIZES: Record<string, string> = {
  '1:1': '1536*1536',
  '16:9': '2048*1152',
  '9:16': '1152*2048',
  '4:3': '1776*1328',
  '3:4': '1328*1776',
  '3:2': '1776*1328',
  '2:3': '1328*1776',
  '21:9': '2048*1152',
};

const isSeedream = (model: string) => model.startsWith('bytedance/seedream-');

/** By the model's own size table, since not every model shares one. */
function imageSize(model: string, aspectRatio: string | undefined): string {
  const table = isSeedream(model) ? SEEDREAM_SIZES : SIZES;
  return table[aspectRatio ?? '1:1'] ?? table['1:1'];
}

/** `image` is what the FLUX endpoints take; Seedream's editor takes an array. */
function imageReferenceFields(model: string, images: string[]): Record<string, unknown> {
  if (images.length === 0) return {};
  // Seedream's text-to-image endpoint has no image field at all, so a reference
  // carried over from another model is dropped instead of sent and rejected.
  if (isSeedream(model)) return model.endsWith('/edit') ? { images } : {};
  return { image: images[0] };
}

/**
 * Seedance 2.0 renamed the aspect field to `ratio`; Seedance v1 and everything
 * else here still call it `aspect_ratio`.
 */
const ratioField = (model: string) =>
  model.startsWith('bytedance/seedance-2.0') ? 'ratio' : 'aspect_ratio';

/**
 * A first frame with an optional closing frame (`image` / `last_image`), or a
 * set of subject references (`reference_images`) — which one is decided by the
 * catalog's declared input field, never by how many images happened to arrive.
 */
function videoImageFields(
  field: VideoInputField | undefined,
  images: string[]
): Record<string, unknown> {
  if (images.length === 0) return {};
  if (field === 'referenceImages') return { reference_images: images };
  const [first, last] = images;
  return { image: first, ...(last ? { last_image: last } : {}) };
}

interface AtlasSubmitEnvelope {
  code?: string | number;
  msg?: string;
  message?: string;
  data?: { id?: string } | null;
}

interface AtlasPrediction {
  id?: string;
  status?: 'queued' | 'processing' | 'succeeded' | 'failed' | string;
  output?: string[] | null;
  logs?: string;
}

async function atlasFetch<T>(url: string, apiKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    msg?: string;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    const raw = payload.msg || payload.message || payload.error || `Atlas Cloud returned ${response.status}.`;
    throw new ProviderError(readableProviderError('atlas', response.status, raw), response.status, 'atlas');
  }
  return payload;
}

async function submit(
  apiKey: string,
  path: 'generateImage' | 'generateVideo',
  body: Record<string, unknown>
): Promise<string> {
  const payload = await atlasFetch<AtlasSubmitEnvelope>(`${ATLAS_API}/model/${path}`, apiKey, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const id = payload.data?.id;
  if (!id) {
    throw new ProviderError('Atlas Cloud accepted the request but returned no prediction ID.', 502, 'atlas');
  }
  return id;
}

async function readPrediction(apiKey: string, id: string): Promise<ProviderTask> {
  const prediction = await atlasFetch<AtlasPrediction>(`${ATLAS_API}/model/prediction/${encodeURIComponent(id)}`, apiKey);
  const urls = (prediction.output ?? []).filter((url): url is string => typeof url === 'string' && url.length > 0);

  if (prediction.status === 'succeeded') {
    return { taskId: id, state: 'success', progress: 1, urls };
  }
  if (prediction.status === 'failed') {
    return {
      taskId: id,
      state: 'error',
      urls: [],
      // `logs` is where Atlas puts the reason; it is often the only detail.
      error: prediction.logs?.trim() || 'Atlas Cloud could not finish this generation.',
    };
  }
  return { taskId: id, state: prediction.status === 'processing' ? 'running' : 'queued', urls };
}

/**
 * Images are async here too, but they finish in seconds — so the image path
 * polls inside the request rather than making the browser own a job. The cap
 * keeps a stuck prediction from holding the route open indefinitely.
 */
const IMAGE_POLL_ATTEMPTS = 40;
const IMAGE_POLL_INTERVAL_MS = 1500;

export async function atlasGenerateImage(
  request: ImageRequest,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<ImageResult> {
  const id = await submit(request.apiKey, 'generateImage', {
    model: request.model,
    prompt: request.prompt,
    size: imageSize(request.model, request.aspectRatio),
    num_images: 1,
    ...imageReferenceFields(request.model, request.images ?? []),
  });

  for (let attempt = 0; attempt < IMAGE_POLL_ATTEMPTS; attempt += 1) {
    const task = await readPrediction(request.apiKey, id);
    if (task.state === 'success' && task.urls[0]) return { url: task.urls[0] };
    if (task.state === 'error') throw new ProviderError(task.error ?? 'Atlas Cloud failed.', 502, 'atlas');
    await sleep(IMAGE_POLL_INTERVAL_MS);
  }
  throw new ProviderError('Atlas Cloud is still working on this image. Try again in a moment.', 504, 'atlas');
}

export async function atlasCreateVideo(request: VideoRequest): Promise<{ taskId: string }> {
  const taskId = await submit(request.apiKey, 'generateVideo', {
    model: request.model,
    prompt: request.prompt,
    ...videoImageFields(request.inputField, request.images ?? []),
    ...(request.durationSeconds ? { duration: request.durationSeconds } : {}),
    ...(request.resolution ? { resolution: request.resolution } : {}),
    ...(request.aspectRatio ? { [ratioField(request.model)]: request.aspectRatio } : {}),
  });
  return { taskId };
}

export function atlasPollVideo(args: { apiKey: string; taskId: string }): Promise<ProviderTask> {
  return readPrediction(args.apiKey, args.taskId);
}

export const atlasAdapter: ProviderAdapter = {
  id: 'atlas',
  label: 'Atlas Cloud',
  generateImage: (request) => atlasGenerateImage(request),
  createVideo: atlasCreateVideo,
  pollVideo: atlasPollVideo,
};
