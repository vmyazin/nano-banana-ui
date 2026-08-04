import type {
  FalInputMode,
  FalMediaType,
  FalTask,
  FalTaskState,
  FalValue,
} from './types';
import { FAL_JOB_TIMEOUT_MS, nextFalPollDelay } from './queue';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ROUTE_ERROR = 'fal could not complete that request. Please try again.';
const DATA_URL_ERROR =
  'must be a valid PNG, JPEG, WebP, or AVIF data URL.';
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
]);
const TASK_STATES = new Set<FalTaskState>([
  'queued',
  'running',
  'success',
  'fail',
  'timed_out',
  'cancelled',
]);

type FalTaskRequest = {
  apiKey: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  requestId: string;
};

type FalSubmitRequest = {
  apiKey: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  prompt: string;
  uploadUrls: string[];
  values: Record<string, FalValue>;
};

type FalImageRunnerArgs = {
  apiKey: string;
  prompt: string;
  dataUrls: string[];
  values: Record<string, FalValue>;
};

type FalImageRunnerDependencies = {
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeFalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim() || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    const isFalCdn = url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media');
    return url.protocol === 'https:' && !url.username && !url.password && isFalCdn;
  } catch {
    return false;
  }
}

function safeErrorMessage(data: unknown, apiKey: string): string {
  if (!isRecord(data) || typeof data.error !== 'string' || !data.error.trim()) {
    return ROUTE_ERROR;
  }
  const message = data.error.trim();
  return apiKey && message.includes(apiKey) ? ROUTE_ERROR : message;
}

async function requestFalRoute(
  path: string,
  init: RequestInit,
  apiKey: string,
  malformedSuccessError = ROUTE_ERROR
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(ROUTE_ERROR);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(ROUTE_ERROR);
  }

  if (!response.ok) {
    throw new Error(safeErrorMessage(data, apiKey));
  }
  if (!isRecord(data) || data.success !== true) {
    if (isRecord(data) && typeof data.error === 'string') {
      throw new Error(safeErrorMessage(data, apiKey));
    }
    throw new Error(malformedSuccessError);
  }
  return data;
}

function jsonPost(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isFalTask(value: unknown, expectedRequestId: string): value is FalTask {
  if (!isRecord(value)) return false;
  if (
    value.requestId !== expectedRequestId ||
    !REQUEST_ID_PATTERN.test(expectedRequestId) ||
    typeof value.state !== 'string' ||
    !TASK_STATES.has(value.state as FalTaskState) ||
    !Array.isArray(value.logs) ||
    !value.logs.every((log) => typeof log === 'string')
  ) {
    return false;
  }

  if (value.resultUrl !== undefined && !isSafeFalUrl(value.resultUrl)) return false;
  if (value.state === 'success' && !isSafeFalUrl(value.resultUrl)) return false;
  return (
    (value.mimeType === undefined || typeof value.mimeType === 'string') &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

export async function uploadFalFiles(apiKey: string, files: File[]): Promise<string[]> {
  return Promise.all(
    files.map(async (file) => {
      const form = new FormData();
      form.set('apiKey', apiKey);
      form.set('file', file);
      const data = await requestFalRoute(
        '/api/fal/upload',
        { method: 'POST', body: form },
        apiKey
      );
      if (!isSafeFalUrl(data.url)) {
        throw new Error('fal did not return a temporary file URL.');
      }
      return data.url;
    })
  );
}

export async function submitFalJob(args: FalSubmitRequest): Promise<{ requestId: string }> {
  const data = await requestFalRoute(
    '/api/fal/queue',
    jsonPost({
      operation: 'submit',
      apiKey: args.apiKey,
      modelId: args.modelId,
      mediaType: args.mediaType,
      inputMode: args.inputMode,
      prompt: args.prompt,
      uploadUrls: args.uploadUrls,
      values: args.values,
    }),
    args.apiKey
  );
  if (typeof data.requestId !== 'string' || !REQUEST_ID_PATTERN.test(data.requestId)) {
    throw new Error('fal did not return a valid request ID.');
  }
  return { requestId: data.requestId };
}

export async function getFalJobStatus(args: FalTaskRequest): Promise<FalTask> {
  const data = await requestFalRoute(
    '/api/fal/queue',
    jsonPost({
      operation: 'status',
      apiKey: args.apiKey,
      modelId: args.modelId,
      mediaType: args.mediaType,
      inputMode: args.inputMode,
      requestId: args.requestId,
    }),
    args.apiKey
  );
  if (!isFalTask(data.task, args.requestId)) {
    throw new Error('fal did not return a valid task status.');
  }
  return data.task;
}

export async function cancelFalJob(args: FalTaskRequest): Promise<void> {
  await requestFalRoute(
    '/api/fal/queue',
    jsonPost({
      operation: 'cancel',
      apiKey: args.apiKey,
      modelId: args.modelId,
      mediaType: args.mediaType,
      inputMode: args.inputMode,
      requestId: args.requestId,
    }),
    args.apiKey,
    'fal did not confirm the cancellation.'
  );
}

async function dataUrlToFile(dataUrl: string, index: number): Promise<File> {
  const message = `Reference image ${index + 1} ${DATA_URL_ERROR}`;
  const match = /^data:(image\/(?:png|jpeg|webp|avif))(?:;[^,]*)?,/i.exec(dataUrl);
  if (!match) throw new Error(message);

  let blob: Blob;
  try {
    blob = await (await fetch(dataUrl)).blob();
  } catch {
    throw new Error(message);
  }

  const mimeType = blob.type.toLowerCase().split(';', 1)[0].trim();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType) || mimeType !== match[1].toLowerCase()) {
    throw new Error(message);
  }
  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'avif';
  return new File([blob], `reference-${index + 1}.${extension}`, { type: mimeType });
}

function readTime(now: () => number, fallback: number): number {
  try {
    const value = now();
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function terminalTaskError(task: FalTask, apiKey: string): Error {
  if (task.state === 'cancelled') return new Error('fal image generation was cancelled.');
  if (task.state === 'timed_out') return new Error('fal image generation timed out.');

  const providerMessage = task.error?.trim();
  if (providerMessage && !providerMessage.includes(apiKey)) return new Error(providerMessage);
  return new Error('fal image generation failed.');
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runFalImage(
  args: FalImageRunnerArgs,
  dependencies: FalImageRunnerDependencies = {}
): Promise<{ url: string; mimeType?: string }> {
  const dataUrls = [...args.dataUrls];
  const values = { ...args.values };
  const files = await Promise.all(dataUrls.map(dataUrlToFile));
  const uploadUrls = files.length > 0 ? await uploadFalFiles(args.apiKey, files) : [];
  const inputMode: FalInputMode = uploadUrls.length > 0 ? 'image' : 'text';
  const selection = {
    apiKey: args.apiKey,
    modelId: 'nano-banana-2',
    mediaType: 'image' as const,
    inputMode,
  };
  const { requestId } = await submitFalJob({
    ...selection,
    prompt: args.prompt,
    uploadUrls,
    values,
  });

  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;
  const startedAt = readTime(now, 0);
  let latestObserved = startedAt;
  let scheduledElapsed = 0;
  let attempt = 0;

  const elapsedTime = () => {
    latestObserved = Math.max(latestObserved, readTime(now, latestObserved));
    const observedElapsed = latestObserved - startedAt;
    const safeObservedElapsed = Number.isFinite(observedElapsed)
      ? Math.max(0, observedElapsed)
      : FAL_JOB_TIMEOUT_MS;
    return Math.max(scheduledElapsed, safeObservedElapsed);
  };

  while (true) {
    let elapsed = elapsedTime();
    if (elapsed >= FAL_JOB_TIMEOUT_MS) {
      throw new Error('fal image generation timed out after 15 minutes.');
    }

    const task = await getFalJobStatus({ ...selection, requestId });
    elapsed = elapsedTime();
    if (elapsed >= FAL_JOB_TIMEOUT_MS) {
      throw new Error('fal image generation timed out after 15 minutes.');
    }

    if (task.state === 'success') {
      if (!isSafeFalUrl(task.resultUrl)) {
        throw new Error('fal completed without a usable image URL.');
      }
      return { url: task.resultUrl, mimeType: task.mimeType };
    }
    if (task.state === 'fail' || task.state === 'cancelled' || task.state === 'timed_out') {
      throw terminalTaskError(task, args.apiKey);
    }

    const remaining = FAL_JOB_TIMEOUT_MS - elapsed;
    const delay = Math.min(nextFalPollDelay(attempt), remaining);
    await sleep(delay);
    scheduledElapsed += delay;
    attempt += 1;
  }
}
