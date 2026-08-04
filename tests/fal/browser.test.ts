import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelFalJob,
  getFalJobStatus,
  runFalImage,
  submitFalJob,
  uploadFalFiles,
} from '../../lib/fal/browser';
import { FAL_JOB_TIMEOUT_MS } from '../../lib/fal/queue';
import type { FalTask } from '../../lib/fal/types';

const apiKey = 'id:secret';
const requestId = 'req_12345678';

const submitArgs = {
  apiKey,
  modelId: 'nano-banana-2',
  mediaType: 'image' as const,
  inputMode: 'text' as const,
  prompt: 'A banana observatory',
  uploadUrls: [] as string[],
  values: { aspect_ratio: '16:9', resolution: '1K', enable_web_search: false },
};

const taskArgs = {
  apiKey,
  modelId: 'nano-banana-2',
  mediaType: 'image' as const,
  inputMode: 'text' as const,
  requestId,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successTask(overrides: Partial<FalTask> = {}): FalTask {
  return {
    requestId,
    state: 'success',
    logs: [],
    resultUrl: 'https://v3.fal.media/image.png',
    mimeType: 'image/png',
    ...overrides,
  };
}

function queueBodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/fal/queue')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

function expectOneSubmitAndNoCancel(fetchMock: ReturnType<typeof vi.fn>) {
  const bodies = queueBodies(fetchMock);
  expect(bodies.filter((body) => body.operation === 'submit')).toHaveLength(1);
  expect(bodies.filter((body) => body.operation === 'cancel')).toHaveLength(0);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fal browser route transport', () => {
  it('uploads each File with real FormData and preserves URL order', async () => {
    const files = [
      new File(['first'], 'first.png', { type: 'image/png' }),
      new File(['second'], 'second.webp', { type: 'image/webp' }),
    ];
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(
      (url: string, init?: RequestInit) => {
        void url;
        void init;
        return new Promise<Response>((resolve) => pending.push(resolve));
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = uploadFalFiles(apiKey, files);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const [index, [, init]] of fetchMock.mock.calls.entries()) {
      expect(init).toMatchObject({ method: 'POST' });
      const form = (init as RequestInit).body;
      expect(form).toBeInstanceOf(FormData);
      expect((form as FormData).get('apiKey')).toBe(apiKey);
      expect((form as FormData).get('file')).toBe(files[index]);
    }

    pending[1](jsonResponse({ success: true, url: 'https://fal.media/second.webp' }));
    pending[0](jsonResponse({ success: true, url: 'https://fal.media/first.png' }));

    await expect(result).resolves.toEqual([
      'https://fal.media/first.png',
      'https://fal.media/second.webp',
    ]);
  });

  it('rejects safe upload route errors and malformed successes without leaking credentials', async () => {
    const file = new File(['source'], 'source.png', { type: 'image/png' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Upload refused.' }, 400))
      .mockResolvedValueOnce(jsonResponse({ success: true, url: 42 }))
      .mockRejectedValueOnce(new TypeError(`network failed with ${apiKey}`));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFalFiles(apiKey, [file])).rejects.toThrow('Upload refused.');
    await expect(uploadFalFiles(apiKey, [file])).rejects.toThrow(
      'fal did not return a temporary file URL.'
    );
    const networkError = await uploadFalFiles(apiKey, [file]).catch((error: unknown) => error);
    expect(networkError).toBeInstanceOf(Error);
    expect(String(networkError)).not.toContain(apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('submits exactly once with only the required catalog and request fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, requestId })
    );
    vi.stubGlobal('fetch', fetchMock);
    const argsWithUntrustedFields = {
      ...submitArgs,
      endpointId: 'attacker/model',
      endpointUrl: 'https://attacker.example/steal',
    };

    await expect(submitFalJob(argsWithUntrustedFields)).resolves.toEqual({ requestId });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/fal/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'submit', ...submitArgs }),
    });
  });

  it.each([
    { success: true },
    { success: true, requestId: 'short' },
    { success: true, requestId: 'request/id/is/not/allowed' },
  ])('rejects malformed submit success payloads: %j', async (payload) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitFalJob(submitArgs)).rejects.toThrow(
      'fal did not return a valid request ID.'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses a safe route submit error and does not retry the POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'fal is rate limiting requests.' }, 429)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitFalJob(submitArgs)).rejects.toThrow(
      'fal is rate limiting requests.'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('posts status fields and validates the returned task shape and request ID', async () => {
    const task = successTask({ state: 'running', resultUrl: undefined, mimeType: undefined });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, task }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getFalJobStatus(taskArgs)).resolves.toEqual(task);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/fal/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'status', ...taskArgs }),
    });
  });

  it.each([
    { requestId, state: 'unknown', logs: [] },
    { requestId: 'req_different1', state: 'queued', logs: [] },
    { requestId, state: 'queued', logs: [42] },
    { requestId, state: 'queued', logs: [], resultUrl: 42 },
    { requestId, state: 'success', logs: [] },
    { requestId, state: 'success', logs: [], resultUrl: 'javascript:alert(1)' },
  ])('rejects malformed status tasks: %j', async (task) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, task }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getFalJobStatus(taskArgs)).rejects.toThrow(
      'fal did not return a valid task status.'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('posts cancel fields, validates success, and does not retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelFalJob(taskArgs)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/fal/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'cancel', ...taskArgs }),
    });
  });

  it('rejects a malformed cancel response without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: 'yes' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelFalJob(taskArgs)).rejects.toThrow(
      'fal did not confirm the cancellation.'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('runFalImage', () => {
  it('runs text mode without uploading and does not mutate caller-owned inputs', async () => {
    const dataUrls: string[] = [];
    const values = { ...submitArgs.values };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/fal/queue');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.operation === 'submit') return jsonResponse({ success: true, requestId });
      return jsonResponse({ success: true, task: successTask() });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls, values },
        {
          now: vi.fn().mockReturnValueOnce(0).mockReturnValue(1_000),
          sleep: vi.fn().mockResolvedValue(undefined),
        }
      )
    ).resolves.toEqual({ url: 'https://v3.fal.media/image.png', mimeType: 'image/png' });

    expect(queueBodies(fetchMock)[0]).toEqual({ operation: 'submit', ...submitArgs });
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/fal/upload')).toBe(false);
    expect(dataUrls).toEqual([]);
    expect(values).toEqual(submitArgs.values);
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('converts a supported image data URL, uploads once, and submits image mode once', async () => {
    const dataUrl = 'data:image/webp;charset=utf-8;base64,c291cmNl';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === dataUrl) {
        return new Response('source', {
          headers: { 'Content-Type': 'image/webp;charset=utf-8' },
        });
      }
      if (url === '/api/fal/upload') {
        const form = init?.body as FormData;
        const file = form.get('file') as File;
        expect(file).toEqual(expect.objectContaining({ name: 'reference-1.webp', type: 'image/webp' }));
        return jsonResponse({ success: true, url: 'https://fal.media/reference.webp' });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.operation === 'submit') return jsonResponse({ success: true, requestId });
      return jsonResponse({ success: true, task: successTask() });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls: [dataUrl], values: submitArgs.values },
        { now: () => 0, sleep: vi.fn().mockResolvedValue(undefined) }
      )
    ).resolves.toEqual({ url: 'https://v3.fal.media/image.png', mimeType: 'image/png' });

    const submit = queueBodies(fetchMock).find((body) => body.operation === 'submit');
    expect(submit).toEqual({
      operation: 'submit',
      ...submitArgs,
      inputMode: 'image',
      uploadUrls: ['https://fal.media/reference.webp'],
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/fal/upload')).toHaveLength(1);
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('polls queued and running tasks with bounded delays before success', async () => {
    const tasks = [
      successTask({ state: 'queued', resultUrl: undefined, mimeType: undefined }),
      successTask({ state: 'running', resultUrl: undefined, mimeType: undefined }),
      successTask(),
    ];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.operation === 'submit'
        ? jsonResponse({ success: true, requestId })
        : jsonResponse({ success: true, task: tasks.shift() });
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls: [], values: submitArgs.values },
        { now: () => 0, sleep }
      )
    ).resolves.toEqual({ url: 'https://v3.fal.media/image.png', mimeType: 'image/png' });

    expect(sleep).toHaveBeenNthCalledWith(1, 2_500);
    expect(sleep).toHaveBeenNthCalledWith(2, 5_000);
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it.each([
    [successTask({ state: 'fail', error: 'fal rejected this prompt.', resultUrl: undefined }), 'fal rejected this prompt.'],
    [successTask({ state: 'cancelled', resultUrl: undefined }), 'fal image generation was cancelled.'],
    [successTask({ state: 'timed_out', resultUrl: undefined }), 'fal image generation timed out.'],
  ] as const)('throws a stable terminal task error for %s', async (task, message) => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.operation === 'submit'
        ? jsonResponse({ success: true, requestId })
        : jsonResponse({ success: true, task });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls: [], values: submitArgs.values },
        { now: () => 0, sleep: vi.fn().mockResolvedValue(undefined) }
      )
    ).rejects.toThrow(message);
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('rejects a success task without a usable result URL', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.operation === 'submit'
        ? jsonResponse({ success: true, requestId })
        : jsonResponse({ success: true, task: successTask({ resultUrl: 'javascript:alert(1)' }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls: [], values: submitArgs.values },
        { now: () => 0, sleep: vi.fn().mockResolvedValue(undefined) }
      )
    ).rejects.toThrow('fal did not return a valid task status.');
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('surfaces post-submit transport failures safely without resubmitting or cancelling', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.operation === 'submit') return jsonResponse({ success: true, requestId });
      throw new TypeError(`network error exposed ${apiKey}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const error = await runFalImage(
      { apiKey, prompt: submitArgs.prompt, dataUrls: [], values: submitArgs.values },
      { now: () => 0, sleep: vi.fn().mockResolvedValue(undefined) }
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(apiKey);
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('stops at 15 minutes even when injected time does not advance', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.operation === 'submit'
        ? jsonResponse({ success: true, requestId })
        : jsonResponse({
            success: true,
            task: successTask({ state: 'queued', resultUrl: undefined, mimeType: undefined }),
          });
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls: [], values: submitArgs.values },
        { now: () => 0, sleep }
      )
    ).rejects.toThrow('fal image generation timed out after 15 minutes.');

    expect(sleep.mock.calls.reduce((total, [delay]) => total + delay, 0)).toBe(
      FAL_JOB_TIMEOUT_MS
    );
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('stops at 15 minutes for a frozen high-magnitude injected clock', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.operation === 'submit'
        ? jsonResponse({ success: true, requestId })
        : jsonResponse({
            success: true,
            task: successTask({ state: 'queued', resultUrl: undefined, mimeType: undefined }),
          });
    });
    let sleepCalls = 0;
    const sleep = vi.fn(async () => {
      sleepCalls += 1;
      if (sleepCalls > 100) throw new Error('poll loop guard exceeded');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        { apiKey, prompt: submitArgs.prompt, dataUrls: [], values: submitArgs.values },
        { now: () => Number.MAX_VALUE, sleep }
      )
    ).rejects.toThrow('fal image generation timed out after 15 minutes.');

    expect(sleepCalls).toBeLessThanOrEqual(100);
    expectOneSubmitAndNoCancel(fetchMock);
  });

  it('rejects unsupported image data URLs before upload', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runFalImage(
        {
          apiKey,
          prompt: submitArgs.prompt,
          dataUrls: ['data:image/svg+xml;base64,PHN2Zy8+'],
          values: submitArgs.values,
        },
        { now: () => 0, sleep: vi.fn().mockResolvedValue(undefined) }
      )
    ).rejects.toThrow('Reference image 1 must be a valid PNG, JPEG, WebP, or AVIF data URL.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
