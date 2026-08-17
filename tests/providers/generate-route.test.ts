import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate/route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/generate — aggregator providers', () => {
  it('resolves the provider URL to bytes so the client sees the usual shape', async () => {
    const fetchMock = vi.fn()
      // The provider call.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ imageURL: 'https://im.runware.ai/a.jpg', cost: 0.0032 }] }),
      })
      // The download of the finished image.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => new Uint8Array(200).fill(7).buffer,
      });
    vi.stubGlobal('fetch', fetchMock);

    const response = await post({
      engine: 'runware',
      apiKey: 'rw-key',
      prompt: 'a harbour at dusk',
      model: 'runware:z-image@turbo',
      config: { aspectRatio: '1:1' },
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      mimeType: 'image/jpeg',
      cost: 0.0032,
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://im.runware.ai/a.jpg');
  });

  it('re-wraps bare base64 references as data URIs, which is what the providers accept', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ imageURL: 'https://im.runware.ai/a.jpg' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => new Uint8Array(200).fill(1).buffer,
      });
    vi.stubGlobal('fetch', fetchMock);

    await post({
      engine: 'runware',
      apiKey: 'rw-key',
      prompt: 'restyle this',
      images: ['QUJD'],
    });

    const [task] = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(task.inputs.seedImage).toBe('data:image/png;base64,QUJD');
  });

  it('asks for the key before spending a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await post({ engine: 'atlas', prompt: 'x' });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
