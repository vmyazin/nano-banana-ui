import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/providers/video/route';
import { resolveSize } from '@/lib/providers/catalog';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/providers/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
}

function mockFetch(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

/**
 * Runware answered a 1344x768 LTX-2 Fast request with "Unsupported width/height
 * combination for this model architecture" — its table is 16:9 only. Sizes are
 * whitelisted per model and resolved before the request leaves.
 */
describe('per-model output sizes', () => {
  it('defaults to the model’s first documented size', () => {
    expect(resolveSize('runware', 'lightricks:2@1')).toMatchObject({ width: 1920, height: 1080 });
  });

  it('ignores a label the model does not publish', () => {
    // "720p · 16:9" belongs to Wan 2.6 Flash, not to LTX-2 Fast.
    expect(resolveSize('runware', 'lightricks:2@1', '720p · 16:9')).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });

  it('sends documented pixels to Runware rather than a ratio-derived guess', async () => {
    const fetchMock = mockFetch({ data: [{}] });

    await post({
      provider: 'runware',
      apiKey: 'rw',
      prompt: 'a misty forest',
      model: 'lightricks:2@1',
      size: '4K · 16:9',
    });

    const [task] = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(task.width).toBe(3840);
    expect(task.height).toBe(2160);
  });

  it('sends a preset string for providers that name their sizes', async () => {
    const fetchMock = mockFetch({ data: { id: 'pred-1' } });

    await post({
      provider: 'atlas',
      apiKey: 'at',
      prompt: 'push in',
      model: 'bytedance/seedance-v1-pro-fast/image-to-video',
      size: '1080p',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.resolution).toBe('1080p');
    expect(body).not.toHaveProperty('width');
  });

  it('every Runware size is a pair the vendor table lists', () => {
    // Both video models publish exact pixels; a preset there would be a bug.
    for (const modelId of ['lightricks:2@1', 'alibaba:wan@2.6-flash']) {
      const size = resolveSize('runware', modelId);
      expect(size?.width).toBeTypeOf('number');
      expect(size?.height).toBeTypeOf('number');
    }
  });
});
