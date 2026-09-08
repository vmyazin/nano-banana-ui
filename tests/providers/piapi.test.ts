import { afterEach, describe, expect, it, vi } from 'vitest';
import { piapiCreateImage, piapiCreateVideo, piapiGenerateImage, piapiPollTask, PIAPI_TASK_URL } from '@/lib/providers/piapi';
import { findModel } from '@/lib/providers/catalog';
import { resolveCatalogRate } from '@/lib/spend/resolve';

function responses(...data: unknown[]) {
  const mock = vi.fn();
  for (const value of data) mock.mockResolvedValueOnce(Response.json({ code: 200, data: value }));
  vi.stubGlobal('fetch', mock);
  return mock;
}
const image = { apiKey: 'test-only', model: 'nano-banana-2', prompt: 'A lighthouse' };
const video = { apiKey: 'test-only', model: 'veo-3.1-fast', prompt: 'Waves crash', inputMode: 'text' as const };
const accepted = { task_id: 'task-1' };
afterEach(() => vi.unstubAllGlobals());

describe('PiAPI contracts', () => {
  it('uploads guest references before a single Nano Banana task, preserving quality and aspect', async () => {
    const mock = responses({ url: 'https://upload.theapi.app/ref.webp' }, accepted);
    await piapiCreateImage({ ...image, resolution: '4K', aspectRatio: '3:2', images: ['data:image/webp;base64,AQID'] });
    expect(mock.mock.calls[0][0]).toBe('https://upload.theapi.app/api/ephemeral_resource');
    expect(JSON.parse(mock.mock.calls[0][1].body).file_data).toBe('data:image/webp;base64,AQID');
    expect(mock.mock.calls[1][0]).toBe(PIAPI_TASK_URL);
    expect(mock.mock.calls[1][1]).toMatchObject({ redirect: 'manual', headers: expect.objectContaining({ 'X-API-Key': 'test-only' }) });
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ model: 'gemini', task_type: 'nano-banana-2', input: { prompt: image.prompt, resolution: '4K', aspect_ratio: '3:2', output_format: 'png', image_urls: ['https://upload.theapi.app/ref.webp'] }, config: { service_mode: 'public' } });
  });
  it('uses hosted account references without uploading them again', async () => {
    const mock = responses(accepted);
    await piapiCreateImage({ ...image, images: ['https://account.example/reference?signature=test'] });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe(PIAPI_TASK_URL);
  });
  it('explains the upload subscription requirement before any paid task', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ code: 403 }, { status: 403 })); vi.stubGlobal('fetch', mock);
    await expect(piapiCreateImage({ ...image, images: ['data:image/png;base64,AQID'] })).rejects.toMatchObject({ status: 403, message: expect.stringContaining('No generation task was submitted.') });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it.each([301, 302, 307, 308])('rejects HTTP %s without forwarding credentials or retrying payment', async status => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status, headers: { Location: 'https://untrusted.example/task' } }));
    vi.stubGlobal('fetch', mock);
    await expect(piapiCreateImage(image)).rejects.toMatchObject({ status: 409 });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][1].redirect).toBe('manual');
  });
  it('rejects browser opaque redirects during reference upload before a paid task', async () => {
    const mock = vi.fn().mockResolvedValue({ type: 'opaqueredirect', status: 0 });
    vi.stubGlobal('fetch', mock);
    await expect(piapiCreateImage({ ...image, images: ['data:image/png;base64,AQID'] })).rejects.toMatchObject({ status: 502 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('maps Veo frames, audio and duration to its own schema', async () => {
    const mock = responses(accepted);
    await piapiCreateVideo({ ...video, inputMode: 'frames', images: ['https://example.com/first.png', 'https://example.com/last.png'], durationSeconds: 6, resolution: '1080p', aspectRatio: '9:16', audio: true });
    expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({ model: 'veo3.1', task_type: 'veo3.1-video-fast', input: { duration: '6s', resolution: '1080p', aspect_ratio: '9:16', generate_audio: true, image_url: 'https://example.com/first.png', tail_image_url: 'https://example.com/last.png' } });
  });
  it('keeps Kling subject tokens and maps audio and integer durations', async () => {
    const mock = responses(accepted);
    await piapiCreateVideo({ ...video, model: 'kling-3-omni', inputMode: 'reference', prompt: '@image_1 walks toward @image_2', images: ['https://example.com/a.png','https://example.com/b.png'], durationSeconds: 15, audio: true });
    expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({ model: 'kling', task_type: 'omni_video_generation', input: { version: '3.0', duration: 15, enable_audio: true, prompt: '@image_1 walks toward @image_2', images: ['https://example.com/a.png','https://example.com/b.png'] } });
  });
  it('designates Kling first and last frames in the prompt', async () => {
    const mock = responses(accepted);
    await piapiCreateVideo({ ...video, model: 'kling-3-omni', inputMode: 'frames', images: ['https://example.com/a.png','https://example.com/b.png'] });
    expect(JSON.parse(mock.mock.calls[0][1].body).input.prompt).toContain('Use @image_1 as the first frame and @image_2 as the last frame.');
  });
  it('rejects unsupported settings before uploads or paid submissions', async () => {
    const mock = responses();
    for (const patch of [{ durationSeconds: 5 }, { resolution: '4K' }, { aspectRatio: '1:1' }, { inputMode: 'reference' as const }, { inputMode: 'frames' as const, images: ['https://example.com/a.png'] }]) await expect(piapiCreateVideo({ ...video, ...patch })).rejects.toMatchObject({ status: 400 });
    await expect(piapiCreateImage({ ...image, images: Array(15).fill('https://example.com/a.png') })).rejects.toMatchObject({ status: 400 });
    expect(mock).not.toHaveBeenCalled();
  });
  it.each(['pending', 'processing', 'completed', 'failed'])('normalizes %s task status', async status => {
    responses({ status, output: { video: 'https://piapi.ai/clip.mp4' } });
    expect(await piapiPollTask({ apiKey: 'test', taskId: 'task-1' })).toMatchObject({ state: { pending: 'queued', processing: 'running', completed: 'success', failed: 'error' }[status] });
  });
  it('polls image tasks without creating a second task', async () => {
    const mock = responses(accepted, { status: 'processing' }, { status: 'completed', output: { image_url: 'https://piapi.ai/image.png' } });
    expect(await piapiGenerateImage(image, async () => {})).toEqual({ url: 'https://piapi.ai/image.png' });
    expect(mock.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
  });
  it('prevents automatic paid retry after an ambiguous submit or lost polling response', async () => {
    const mock = vi.fn().mockRejectedValue(new Error('lost')); vi.stubGlobal('fetch', mock);
    await expect(piapiCreateVideo(video)).rejects.toMatchObject({ status: 409 });
    mock.mockReset().mockResolvedValueOnce(Response.json({ data: accepted })).mockRejectedValueOnce(new Error('lost'));
    await expect(piapiGenerateImage(image, async () => {})).rejects.toMatchObject({ status: 409, message: expect.stringContaining('task-1') });
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe('PiAPI estimates', () => {
  it.each([['1K', 0.06], ['2K', 0.08], ['4K', 0.12]] as const)('prices Nano Banana at %s', (size, costUsd) => {
    expect(resolveCatalogRate(findModel('piapi', 'nano-banana-2'), undefined, 1, { size })).toMatchObject({ costUsd, confidence: 'estimated' });
  });
  it.each([['veo-3.1-fast', '720p', false, 0.48], ['veo-3.1-fast', '1080p', true, 0.72], ['kling-3-omni', '720p', false, 0.8], ['kling-3-omni', '1080p', true, 1.6]] as const)('prices %s %s audio=%s', (model, size, audio, cost) => {
    expect(resolveCatalogRate(findModel('piapi', model), 8, 1, { size, audio }).costUsd).toBeCloseTo(cost);
  });
});
