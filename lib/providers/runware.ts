// lib/providers/runware.ts
import {
  ProviderError,
  readableProviderError,
  type ImageRequest,
  type ImageResult,
  type ProviderAdapter,
  type ProviderTask,
  type VideoRequest,
} from './types';

/**
 * Runware — one endpoint, one shape: every request is an array of task objects
 * carrying a `taskType` and a `taskUUID` you generate, and every response echoes
 * that UUID back. Images run synchronously; video is submitted with
 * `deliveryMethod: "async"` and collected with a `getResponse` task.
 *
 * Contract read from https://runware.ai/docs (llms.txt + model pages) on
 * 2026-08-16; see the spec for the quoted request/response bodies.
 */
export const RUNWARE_API = 'https://api.runware.ai/v1';

/** Dimensions must be multiples of 64 and paired; these are the ratios the UI offers. */
const DIMENSIONS: Record<string, [number, number]> = {
  '1:1': [1024, 1024],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
  '4:3': [1152, 896],
  '3:4': [896, 1152],
  '3:2': [1216, 832],
  '2:3': [832, 1216],
  '21:9': [1536, 640],
};

interface RunwareEnvelope {
  data?: Array<Record<string, unknown>>;
  errors?: Array<{ code?: string; message?: string; parameter?: string }>;
}

function dimensionsFor(aspectRatio?: string): [number, number] {
  return DIMENSIONS[aspectRatio ?? '1:1'] ?? DIMENSIONS['1:1'];
}

async function runwareFetch(apiKey: string, tasks: Array<Record<string, unknown>>): Promise<RunwareEnvelope> {
  const response = await fetch(RUNWARE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tasks),
  });

  const payload = (await response.json().catch(() => ({}))) as RunwareEnvelope;
  // Runware reports task-level failures in `errors` with a 200, so the status
  // alone never tells you whether the work happened.
  const firstError = payload.errors?.[0];
  if (!response.ok || firstError) {
    const raw = firstError?.message ?? `Runware returned ${response.status}.`;
    throw new ProviderError(
      readableProviderError('runware', response.status, raw),
      response.ok ? 400 : response.status,
      'runware'
    );
  }
  return payload;
}

function taskUUID(): string {
  return crypto.randomUUID();
}

function imageTask(request: ImageRequest, uuid: string): Record<string, unknown> {
  const [width, height] = dimensionsFor(request.aspectRatio);
  const references = (request.images ?? []).slice(0, 4);
  const task: Record<string, unknown> = {
    taskType: 'imageInference',
    taskUUID: uuid,
    model: request.model,
    positivePrompt: request.prompt,
    width,
    height,
    numberResults: 1,
    includeCost: true,
  };

  if (references.length > 0) {
    // Two different input shapes, per model: the editing models (FLUX.2,
    // Qwen-Image-Edit-Plus) require referenceImages and have no seedImage,
    // while the older checkpoints start from seedImage and treat the rest as
    // reference. Sending the wrong field is rejected outright.
    task.inputs =
      request.imageInput === 'reference'
        ? { referenceImages: references }
        : {
            seedImage: references[0],
            ...(references.length > 1 ? { referenceImages: references.slice(1) } : {}),
          };
  }

  return task;
}

export async function runwareCreateImage(request: ImageRequest): Promise<{taskId: string}> {
  const uuid = taskUUID();
  await runwareFetch(request.apiKey, [{...imageTask(request, uuid), deliveryMethod: 'async'}]);
  return {taskId: uuid};
}

export async function runwareGenerateImage(request: ImageRequest): Promise<ImageResult> {
  const payload = await runwareFetch(request.apiKey, [imageTask(request, taskUUID())]);
  const first = payload.data?.[0] ?? {};
  const url = typeof first.imageURL === 'string' ? first.imageURL : undefined;
  if (!url) {
    throw new ProviderError('Runware accepted the task but returned no image.', 502, 'runware');
  }
  return { url, cost: typeof first.cost === 'number' ? first.cost : undefined };
}

export async function runwareCreateVideo(request: VideoRequest): Promise<{ taskId: string }> {
  const uuid = taskUUID();
  // Video models publish a table of exact sizes and reject anything outside it,
  // so the caller's resolved pair wins over any ratio-derived guess.
  const [width, height] =
    request.width && request.height
      ? [request.width, request.height]
      : dimensionsFor(request.aspectRatio ?? '16:9');
  const frames = request.images ?? [];
  const task: Record<string, unknown> = {
    taskType: 'videoInference',
    taskUUID: uuid,
    model: request.model,
    positivePrompt: request.prompt,
    deliveryMethod: 'async',
    includeCost: true,
  };
  // Models with attached reference media can expose a resolution tier instead
  // of a fixed pixel pair. Runware rejects sending both forms together.
  if (request.resolution) task.resolution = request.resolution;
  else {
    task.width = width;
    task.height = height;
  }
  // Only when the caller resolved one: models list the lengths they accept, and
  // a model that counts frames instead has no duration parameter to reject.
  if (request.durationSeconds !== undefined) task.duration = request.durationSeconds;
  if (frames.length > 0) {
    // The route resolves this field from the catalog. Legacy callers omit it
    // and retain the historical frameImages behavior.
    task.inputs = { [request.inputField ?? 'frameImages']: frames };
  }

  await runwareFetch(request.apiKey, [task]);
  // The submit acknowledgment carries no separate job id: the taskUUID we
  // generated *is* the handle, and getResponse polls on it.
  return { taskId: uuid };
}

async function runwarePoll(args: { apiKey: string; taskId: string }, output: 'imageURL' | 'videoURL'): Promise<ProviderTask> {
  const payload = await runwareFetch(args.apiKey, [
    { taskType: 'getResponse', taskUUID: args.taskId },
  ]);
  const first = payload.data?.[0] ?? {};
  const status = typeof first.status === 'string' ? first.status : undefined;
  const url = typeof first[output] === 'string' ? first[output] as string : undefined;

  // A finished task drops `status` and just carries the media, so a URL is the
  // real terminal signal.
  if (url) {
    return {
      taskId: args.taskId,
      state: 'success',
      progress: 1,
      urls: [url],
      cost: typeof first.cost === 'number' ? first.cost : undefined,
    };
  }
  if (status === 'error') {
    return {
      taskId: args.taskId,
      state: 'error',
      urls: [],
      error: typeof first.message === 'string' ? first.message : 'Runware could not finish this video.',
    };
  }

  const progress = typeof first.progress === 'number' ? first.progress : undefined;
  return {
    taskId: args.taskId,
    state: status === 'processing' ? 'running' : 'queued',
    // The vendor reports progress as a percentage; the app's job UI wants 0–1.
    progress: progress !== undefined ? Math.min(1, progress / 100) : undefined,
    urls: [],
  };
}

export function runwarePollImage(args: {apiKey: string; taskId: string}): Promise<ProviderTask> {
  return runwarePoll(args, 'imageURL');
}

export function runwarePollVideo(args: {apiKey: string; taskId: string}): Promise<ProviderTask> {
  return runwarePoll(args, 'videoURL');
}

export const runwareAdapter: ProviderAdapter = {
  id: 'runware',
  label: 'Runware',
  generateImage: runwareGenerateImage,
  createVideo: runwareCreateVideo,
  pollVideo: runwarePollVideo,
};
