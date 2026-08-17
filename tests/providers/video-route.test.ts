import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/providers/video/route';

/** The route reads JSON off a Request; NextRequest is compatible for this. */
function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/providers/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
}

function mockFetch(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/providers/video', () => {
  it('rejects a provider it does not serve before touching the network', async () => {
    const fetchMock = mockFetch({});

    const response = await post({ provider: 'midjourney', apiKey: 'k', prompt: 'x' });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a key and a prompt', async () => {
    expect((await post({ provider: 'runware', prompt: 'x' })).status).toBe(400);
    expect((await post({ provider: 'runware', apiKey: 'k', prompt: '   ' })).status).toBe(400);
  });

  it('falls back to the provider default when the model is unknown', async () => {
    const fetchMock = mockFetch({ data: [{}] });

    const response = await post({
      provider: 'runware',
      apiKey: 'rw',
      prompt: 'a slow pan',
      model: 'not-a-real-model',
    });

    const [task] = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(task.model).toBe('lightricks:2@1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });

  it('snaps the clip length to one the model accepts', async () => {
    const fetchMock = mockFetch({ data: [{}] });

    await post({
      provider: 'runware',
      apiKey: 'rw',
      prompt: 'a slow pan',
      model: 'lightricks:2@1',
      durationSeconds: 5,
    });

    // LTX-2 Fast takes 6, 8 or 10 and rejects 5 outright.
    const [task] = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(task.duration).toBe(6);
  });

  it('sends no duration for a model that has no seconds control', async () => {
    const fetchMock = mockFetch({ data: { id: 'pred-1' } });

    await post({
      provider: 'atlas',
      apiKey: 'at',
      prompt: 'a slow pan',
      model: 'ltx-2.3-quality/text-to-video',
      durationSeconds: 6,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty('duration');
  });

  it('passes a provider failure through with its status', async () => {
    mockFetch({ errors: [{ message: 'insufficient credits' }] }, { ok: false, status: 402 });

    const response = await post({ provider: 'runware', apiKey: 'rw', prompt: 'x' });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('out of credits'),
    });
  });

  it('reports task status for a running job', async () => {
    mockFetch({ data: [{ status: 'processing', progress: 20 }] });

    const response = await post({
      provider: 'runware',
      apiKey: 'rw',
      operation: 'status',
      taskId: 'uuid-9',
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      task: { state: 'running', progress: 0.2 },
    });
  });
});
