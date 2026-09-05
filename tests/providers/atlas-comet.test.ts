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

  it('names the aspect field the way each Seedance generation does', async () => {
    const fetchMock = mockFetchSequence([
      { payload: { data: { id: 'pred-4' } } },
      { payload: { data: { id: 'pred-5' } } },
    ]);

    await atlasCreateVideo({
      apiKey: 'at-key',
      model: 'bytedance/seedance-v1-pro-fast/image-to-video',
      prompt: 'push in slowly',
      images: ['data:image/png;base64,AAA'],
      inputField: 'frameImages',
      aspectRatio: '16:9',
    });
    await atlasCreateVideo({
      apiKey: 'at-key',
      model: 'bytedance/seedance-2.0-mini/text-to-video',
      prompt: 'a kite over the harbour',
      aspectRatio: '16:9',
    });

    // Seedance v1 takes `aspect_ratio`; 2.0 renamed it to `ratio`, and either
    // model drops the other spelling in silence rather than failing.
    const v1 = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(v1.aspect_ratio).toBe('16:9');
    expect(v1.ratio).toBeUndefined();

    const v2 = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(v2.ratio).toBe('16:9');
    expect(v2.aspect_ratio).toBeUndefined();
  });

  it('bookends a Seedance 2.0 clip with a closing frame when a second still is sent', async () => {
    const fetchMock = mockFetchSequence([{ payload: { data: { id: 'pred-6' } } }]);

    await atlasCreateVideo({
      apiKey: 'at-key',
      model: 'bytedance/seedance-2.0-mini/image-to-video',
      prompt: 'the door opens',
      images: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
      inputMode: 'frames',
      inputField: 'frameImages',
      durationSeconds: 6,
      resolution: '720p',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      image: 'data:image/png;base64,AAA',
      last_image: 'data:image/png;base64,BBB',
      duration: 6,
      resolution: '720p',
    });
  });

  it('sends subject references as the array the reference endpoints take', async () => {
    const fetchMock = mockFetchSequence([{ payload: { data: { id: 'pred-7' } } }]);

    await atlasCreateVideo({
      apiKey: 'at-key',
      model: 'bytedance/seedance-2.0-fast/reference-to-video',
      prompt: 'Image 1 walks through Image 2',
      images: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
      inputMode: 'reference',
      inputField: 'referenceImages',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.reference_images).toEqual([
      'data:image/png;base64,AAA',
      'data:image/png;base64,BBB',
    ]);
    // The single-frame field would pin the first reference as a first frame.
    expect(body.image).toBeUndefined();
  });

  it('sizes Seedream inside the pixel window it requires', async () => {
    const fetchMock = mockFetchSequence([
      { payload: { data: { id: 'pred-8' } } },
      { payload: { id: 'pred-8', status: 'succeeded', output: ['https://cdn.atlas/b.png'] } },
    ]);

    await atlasGenerateImage(
      {
        apiKey: 'at-key',
        model: 'bytedance/seedream-v5.0-pro/edit',
        prompt: 'make the sign read OPEN',
        images: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
        aspectRatio: '16:9',
      },
      noSleep
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // 1344*768 is below Seedream's 1,048,576-pixel floor, so it takes its own.
    expect(body.size).toBe('2048*1152');
    // The editor takes an array, and rejects the singular `image` field.
    expect(body.images).toEqual(['data:image/png;base64,AAA', 'data:image/png;base64,BBB']);
    expect(body.image).toBeUndefined();
  });

  it('drops a carried-over reference for a Seedream text-to-image run', async () => {
    const fetchMock = mockFetchSequence([
      { payload: { data: { id: 'pred-9' } } },
      { payload: { id: 'pred-9', status: 'succeeded', output: ['https://cdn.atlas/c.png'] } },
    ]);

    await atlasGenerateImage(
      {
        apiKey: 'at-key',
        model: 'bytedance/seedream-v5.0-pro/text-to-image',
        prompt: 'a harbour at dawn',
        images: ['data:image/png;base64,AAA'],
        aspectRatio: '1:1',
      },
      noSleep
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.size).toBe('1536*1536');
    expect(body.image).toBeUndefined();
    expect(body.images).toBeUndefined();
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
    expect(resolveModel('runware', 'image', 'lightricks:ltx@2.5-fast')).toBe('runware:z-image@turbo');
    expect(resolveModel('comet', 'image', 'qwen-image')).toBe('qwen-image');
  });
});
