import { createFalClient } from '@fal-ai/client';

import { buildFalInput, extractFalResult, resolveFalVariant } from './catalog';
import type { FalInputMode, FalMediaType, FalTask, FalValue } from './types';

const FAL_PRICING_URL =
  'https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fnano-banana-2';
const FAL_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export class FalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

function publicMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'Your fal API key is invalid, revoked, or lacks access to this model.';
  }
  if (status === 402) return 'Your fal account needs additional credits.';
  if (status === 422) {
    return 'fal rejected one or more model settings. Review the controls and try again.';
  }
  if (status === 429) return 'fal is rate limiting requests. Please wait and try again.';
  if (status >= 500) return 'fal is temporarily unavailable. Please try again.';
  return 'fal could not complete that request.';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function errorStatus(error: unknown, fallbackStatus: number): number {
  const status = asRecord(error).status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : fallbackStatus;
}

function safeError(status: number): FalApiError {
  return new FalApiError(publicMessage(status), status);
}

async function withSafeFalErrors<T>(
  operation: () => Promise<T>,
  fallbackStatus = 502
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FalApiError) throw error;
    throw safeError(errorStatus(error, fallbackStatus));
  }
}

function requireRequestId(value: unknown, status: number): string {
  if (typeof value !== 'string' || !FAL_REQUEST_ID_PATTERN.test(value)) throw safeError(status);
  return value;
}

function singleAttemptFetch(): typeof fetch {
  const transport = globalThis.fetch.bind(globalThis);
  let outcome: Promise<Response> | undefined;

  return async (input, init) => {
    // queue.submit retries independently of client retry settings. Replaying a clone lets the
    // SDK preserve its response handling without issuing a second billable network request.
    outcome ??= Promise.resolve().then(() => transport(input, init));
    const response = await outcome;
    return response.clone();
  };
}

function rawResultUrl(mediaType: FalMediaType, payload: unknown): unknown {
  const record = asRecord(payload);
  if (mediaType === 'video') return asRecord(record.video).url;
  const image = Array.isArray(record.images) ? record.images[0] : undefined;
  return asRecord(image).url;
}

function requireSafeResultUrl(value: unknown): string {
  if (typeof value !== 'string' || /\s/.test(value)) throw safeError(502);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw safeError(502);
  }
  const isFalCdn = url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media');
  if (url.protocol !== 'https:' || url.username || url.password || !isFalCdn) {
    throw safeError(502);
  }

  return value;
}

function normalizedLogs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const message = asRecord(entry).message;
    return typeof message === 'string' && message.trim() ? [message] : [];
  });
}

export async function validateFalApiKey(apiKey: string): Promise<void> {
  await withSafeFalErrors(async () => {
    const response = await fetch(FAL_PRICING_URL, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!response.ok) throw safeError(response.status);
  });
}

export async function uploadFalFile(args: { apiKey: string; file: File }): Promise<string> {
  return withSafeFalErrors(async () => {
    const client = createFalClient({ credentials: args.apiKey });
    const url = await client.storage.upload(args.file, { lifecycle: { expiresIn: '1d' } });
    if (typeof url !== 'string' || !url.trim()) throw safeError(502);
    return url;
  });
}

export async function submitFalTask(args: {
  apiKey: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  prompt: string;
  uploadUrls: string[];
  values: Record<string, FalValue>;
}): Promise<{ requestId: string }> {
  return withSafeFalErrors(async () => {
    const variant = resolveFalVariant(args.modelId, args.mediaType, args.inputMode);
    const input = buildFalInput(variant, {
      prompt: args.prompt,
      uploadUrls: args.uploadUrls,
      values: args.values,
    });

    return withSafeFalErrors(async () => {
      const client = createFalClient({
        credentials: args.apiKey,
        fetch: singleAttemptFetch(),
      });
      const response = await client.queue.submit(variant.endpointId, {
        input,
        headers: { 'X-Fal-Store-IO': '0' },
        storageSettings: { expiresIn: '7d' },
      });
      const record = asRecord(response);
      const requestId = requireRequestId(record.request_id ?? record.requestId, 502);
      return { requestId };
    });
  }, 400);
}

export async function getFalTask(args: {
  apiKey: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  requestId: string;
}): Promise<FalTask> {
  return withSafeFalErrors(async () => {
    const requestId = requireRequestId(args.requestId, 400);
    const variant = resolveFalVariant(args.modelId, args.mediaType, args.inputMode);

    return withSafeFalErrors(async () => {
      const client = createFalClient({ credentials: args.apiKey });
      const response = await client.queue.status(variant.endpointId, {
        requestId,
        logs: true,
      });
      const record = asRecord(response);
      const responseRequestId = requireRequestId(record.request_id, 502);
      if (responseRequestId !== requestId) throw safeError(502);
      const logs = normalizedLogs(record.logs);

      if (record.status === 'IN_QUEUE') return { requestId, state: 'queued', logs };
      if (record.status === 'IN_PROGRESS') return { requestId, state: 'running', logs };
      if (record.status !== 'COMPLETED') throw safeError(502);

      const result = await client.queue.result(variant.endpointId, { requestId });
      const resultRecord = asRecord(result);
      const resultRequestId = requireRequestId(resultRecord.requestId, 502);
      if (resultRequestId !== requestId) throw safeError(502);
      const media = extractFalResult(args.mediaType, resultRecord.data);
      const resultUrl = requireSafeResultUrl(rawResultUrl(args.mediaType, resultRecord.data));
      if (resultUrl !== media.url) throw safeError(502);

      return {
        requestId,
        state: 'success',
        logs,
        resultUrl,
        ...(media.mimeType ? { mimeType: media.mimeType } : {}),
      };
    });
  }, 400);
}

export async function cancelFalTask(args: {
  apiKey: string;
  modelId: string;
  mediaType: FalMediaType;
  inputMode: FalInputMode;
  requestId: string;
}): Promise<void> {
  await withSafeFalErrors(async () => {
    const requestId = requireRequestId(args.requestId, 400);
    const variant = resolveFalVariant(args.modelId, args.mediaType, args.inputMode);

    await withSafeFalErrors(async () => {
      const client = createFalClient({ credentials: args.apiKey });
      await client.queue.cancel(variant.endpointId, { requestId });
    });
  }, 400);
}
