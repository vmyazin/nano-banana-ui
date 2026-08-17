import { afterEach, describe, expect, it, vi } from 'vitest';

import { atlasCreateVideo, atlasGenerateImage, atlasPollVideo } from '@/lib/providers/atlas';
import { cometCreateVideo, cometGenerateImage, cometPollVideo } from '@/lib/providers/comet';
import { resolveModel } from '@/lib/providers/catalog';

/** Queues one response per call so a submit-then-poll pair can be scripted. */
function mockFetchSequence(responses: Array<{ payload: unknown; ok?: boolean; status?: number }>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.payload,
    });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const noSleep = async () => {};

afterEach(() => vi.unstubAllGlobals());

describe('atlas cloud', () => {
  it('submits, then polls the prediction until it succeeds', async () => {
    const fetchMock = mockFetchSequence([
      { payload: { data: { id: 'pred-1' } } },
      { payload: { id: 'pred-1', status: 'processing' } },
      { payload: { id: 'pred-1', status: 'succeeded', output: ['https://cdn.atlas/a.png'] } },
    ]);

    const result = await atlasGenerateImage(
      {
        apiKey: 'at-key',
        model: 'black-forest-labs/flux-schnell',
        prompt: 'a lighthouse',
        aspectRatio: '9:16',
      },
      noSleep
    );

    const [submitUrl, submitInit] = fetchMock.mock.calls[0];
    expect(submitUrl).toBe('https://api.atlascloud.ai/api/v1/model/generateImage');
    const body = JSON.parse(submitInit.body as string);
    // Atlas writes sizes with a star, not an x.
    expect(body).toMatchObject({
      model: 'black-forest-labs/flux-schnell',
      prompt: 'a lighthouse',
      size: '768*1344',
      num_images: 1,
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.atlascloud.ai/api/v1/model/prediction/pred-1');
    expect(result).toEqual({ url: 'https://cdn.atlas/a.png' });
  });

  it('fails with the prediction logs, which are the only detail Atlas gives', async () => {
    mockFetchSequence([
      { payload: { data: { id: 'pred-2' } } },
      { payload: { id: 'pred-2', status: 'failed', logs: 'content policy violation' } },
    ]);

    await expect(
      atlasGenerateImage(
        { apiKey: 'at-key', model: 'black-forest-labs/flux-schnell', prompt: 'x' },
        noSleep
      )
    ).rejects.toThrow(/content policy violation/);
  });

  it('passes an image-to-video reference as the documented image field', async () => {
    const fetchMock = mockFetchSequence([{ payload: { data: { id: 'pred-3' } } }]);

    const { taskId } = await atlasCreateVideo({
      apiKey: 'at-key',
      model: 'bytedance/seedance-v1-pro-fast/image-to-video',
      prompt: 'push in slowly',
      images: ['data:image/png;base64,AAA'],
      durationSeconds: 5,
      resolution: '720p',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.atlascloud.ai/api/v1/model/generateVideo');
    expect(body).toMatchObject({ image: 'data:image/png;base64,AAA', duration: 5, resolution: '720p' });
    expect(taskId).toBe('pred-3');
  });

  it('maps a queued prediction to a queued task', async () => {
    mockFetchSequence([{ payload: { id: 'pred-3', status: 'queued' } }]);

    expect(await atlasPollVideo({ apiKey: 'at-key', taskId: 'pred-3' })).toMatchObject({
      state: 'queued',
      urls: [],
    });
  });
});

describe('cometapi', () => {
  it('sends the OpenAI image shape and reads base64 when the model returns it', async () => {
    const fetchMock = mockFetchSequence([{ payload: { data: [{ b64_json: 'QUJD' }] } }]);

    const result = await cometGenerateImage({
      apiKey: 'cm-key',
      model: 'gpt-image-2',
      prompt: 'a paper crane',
      aspectRatio: '1:1',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cometapi.com/v1/images/generations');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gpt-image-2',
      prompt: 'a paper crane',
      n: 1,
      size: '1024x1024',
    });
    expect(result).toEqual({ base64: 'QUJD', mimeType: 'image/png' });
  });

  it('falls back to the URL for models that return one', async () => {
    mockFetchSequence([{ payload: { data: [{ url: 'https://cdn.comet/a.png' }] } }]);

    expect(await cometGenerateImage({ apiKey: 'cm-key', model: 'qwen-image', prompt: 'x' })).toEqual({
      url: 'https://cdn.comet/a.png',
    });
  });

  it('creates video as multipart form data, the only shape the route documents', async () => {
    const fetchMock = mockFetchSequence([{ payload: { id: 'vid-1' } }]);

    const { taskId } = await cometCreateVideo({
      apiKey: 'cm-key',
      model: 'seedance-2-5',
      prompt: 'a rotating cube',
      durationSeconds: 4,
      aspectRatio: '16:9',
      images: ['data:image/png;base64,QUJD'],
    });

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('model')).toBe('seedance-2-5');
    expect(form.get('seconds')).toBe('4');
    expect(form.get('size')).toBe('1280x720');
    expect(form.get('input_reference')).toBeInstanceOf(Blob);
    expect(taskId).toBe('vid-1');
  });

  it('treats both documented terminal failures as errors', async () => {
    mockFetchSequence([
      { payload: { status: 'failed', error: { message: 'provider rejected the task' } } },
      { payload: { status: 'error' } },
    ]);

    expect(await cometPollVideo({ apiKey: 'cm-key', taskId: 'vid-1' })).toMatchObject({
      state: 'error',
      error: 'provider rejected the task',
    });
    expect(await cometPollVideo({ apiKey: 'cm-key', taskId: 'vid-1' })).toMatchObject({ state: 'error' });
  });

  it('reports in-progress work with progress on the app scale', async () => {
    mockFetchSequence([{ payload: { status: 'in_progress', progress: 40 } }]);

    expect(await cometPollVideo({ apiKey: 'cm-key', taskId: 'vid-1' })).toMatchObject({
      state: 'running',
      progress: 0.4,
    });
  });
});

describe('model resolution', () => {
  it('falls back to the provider default when the persisted model is unknown or foreign', () => {
    expect(resolveModel('runware', 'image', 'gpt-image-2')).toBe('runware:z-image@turbo');
    expect(resolveModel('atlas', 'video', undefined)).toBe('ltx-2.3-quality/text-to-video');
    // A model of the wrong kind is as wrong as one that does not exist.
    expect(resolveModel('runware', 'image', 'lightricks:2@1')).toBe('runware:z-image@turbo');
    expect(resolveModel('comet', 'image', 'qwen-image')).toBe('qwen-image');
  });
});
