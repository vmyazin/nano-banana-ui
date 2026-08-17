import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  runwareCreateVideo,
  runwareGenerateImage,
  runwarePollVideo,
} from '@/lib/providers/runware';
import { ProviderError } from '@/lib/providers/types';

function mockFetch(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentTasks(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe('runware image inference', () => {
  it('sends one task array with the vendor field names', async () => {
    const fetchMock = mockFetch({ data: [{ imageURL: 'https://im.runware.ai/a.jpg', cost: 0.0032 }] });

    const result = await runwareGenerateImage({
      apiKey: 'rw-key',
      model: 'runware:z-image@turbo',
      prompt: 'a neon cat',
      aspectRatio: '16:9',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.runware.ai/v1');
    expect(init.headers.Authorization).toBe('Bearer rw-key');

    const [task] = sentTasks(fetchMock);
    expect(task.taskType).toBe('imageInference');
    expect(task.model).toBe('runware:z-image@turbo');
    expect(task.positivePrompt).toBe('a neon cat');
    expect(task.width).toBe(1344);
    expect(task.height).toBe(768);
    expect(task.includeCost).toBe(true);
    expect(typeof task.taskUUID).toBe('string');
    expect(result).toEqual({ url: 'https://im.runware.ai/a.jpg', cost: 0.0032 });
  });

  it('nests references under inputs and caps referenceImages at the documented four', async () => {
    const fetchMock = mockFetch({ data: [{ imageURL: 'https://im.runware.ai/a.jpg' }] });

    await runwareGenerateImage({
      apiKey: 'rw-key',
      model: 'bfl:flux@2-dev',
      prompt: 'compose these',
      images: ['data:image/png;base64,AAA', 'b', 'c', 'd', 'e', 'f'],
    });

    const inputs = sentTasks(fetchMock)[0].inputs as Record<string, unknown>;
    expect(inputs.seedImage).toBe('data:image/png;base64,AAA');
    expect(inputs.referenceImages).toEqual(['b', 'c', 'd']);
  });

  it('treats a 200 carrying an errors array as a failure', async () => {
    mockFetch({
      errors: [{ code: 'invalidApiKey', message: 'Invalid API key provided.' }],
    });

    await expect(
      runwareGenerateImage({ apiKey: 'bad', model: 'runware:z-image@turbo', prompt: 'x' })
    ).rejects.toThrow(/Runware API key is invalid/);
  });
});

describe('runware video inference', () => {
  it('submits async and polls on the same task UUID', async () => {
    const fetchMock = mockFetch({ data: [{ taskUUID: 'ignored' }] });

    const { taskId } = await runwareCreateVideo({
      apiKey: 'rw-key',
      model: 'lightricks:2@1',
      prompt: 'a drifting nebula',
      durationSeconds: 6,
      images: ['data:image/png;base64,AAA'],
    });

    const [task] = sentTasks(fetchMock);
    expect(task.taskType).toBe('videoInference');
    expect(task.deliveryMethod).toBe('async');
    expect(task.duration).toBe(6);
    expect((task.inputs as Record<string, unknown>).frameImages).toEqual(['data:image/png;base64,AAA']);
    // The UUID we generated is the polling handle.
    expect(task.taskUUID).toBe(taskId);
  });

  it('reports progress on the app scale while processing', async () => {
    mockFetch({ data: [{ status: 'processing', progress: 47 }] });

    const task = await runwarePollVideo({ apiKey: 'rw-key', taskId: 'uuid-1' });

    expect(task.state).toBe('running');
    expect(task.progress).toBeCloseTo(0.47);
    expect(task.urls).toEqual([]);
  });

  it('finishes on the media URL even when the status field is gone', async () => {
    mockFetch({ data: [{ videoURL: 'https://vm.runware.ai/v.mp4', cost: 0.18 }] });

    const task = await runwarePollVideo({ apiKey: 'rw-key', taskId: 'uuid-1' });

    expect(task).toMatchObject({ state: 'success', urls: ['https://vm.runware.ai/v.mp4'], cost: 0.18 });
  });

  it('surfaces a rate limit as a readable message with its status', async () => {
    mockFetch({ errors: [{ message: 'Too many requests' }] }, { ok: false, status: 429 });

    const error = await runwarePollVideo({ apiKey: 'rw-key', taskId: 'uuid-1' }).catch((e) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.status).toBe(429);
    expect(error.message).toMatch(/rate limiting/);
  });
});
