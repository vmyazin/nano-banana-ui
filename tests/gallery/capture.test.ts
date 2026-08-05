import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blobFromDataUrl, resultBlob } from '../../lib/gallery/capture';
import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import { recordFinishedJob } from '../../lib/gallery/record-job';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';

describe('blobFromDataUrl', () => {
  it('decodes without touching the network', () => {
    // "hi" base64-encoded.
    const blob = blobFromDataUrl('data:image/png;base64,aGk=');

    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(2);
  });

  it('keeps the declared type, normalized', () => {
    expect(blobFromDataUrl('data:image/JPEG;base64,aGk=').type).toBe('image/jpeg');
  });

  it('rejects anything that is not a data URL', () => {
    expect(() => blobFromDataUrl('https://v3.fal.media/x.png')).toThrow(/data URL/);
  });
});

describe('resultBlob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('decodes a data URL locally rather than fetching it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const blob = await resultBlob('data:image/png;base64,aGk=', 'image');

    expect(blob.size).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a provider URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('bytes', { status: 200, headers: { 'Content-Type': 'image/png' } })
    ));

    const blob = await resultBlob('https://v3.fal.media/x.png', 'image');
    expect(blob.size).toBe(5);
    expect(blob.type).toBe('image/png');
  });

  it('refuses a URL it would not download', async () => {
    await expect(resultBlob('http://insecure.example/x.png', 'image')).rejects.toThrow();
  });
});

describe('recordFinishedJob', () => {
  let storage: ReturnType<typeof createMemoryGalleryStorage>;

  beforeEach(() => {
    storage = createMemoryGalleryStorage();
    configureGalleryStorage(storage);
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
  });

  const job = {
    id: 'request_1',
    prompt: 'A neon tiger in the rain',
    slug: 'neon-tiger-in-the-rain',
    modelId: 'veo-3-1-fast',
    mediaType: 'video' as const,
    inputMode: 'text',
    controlValues: { aspect_ratio: '16:9' },
    mimeType: 'video/mp4',
  };

  it('files metadata without downloading the clip', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    recordFinishedJob('fal', job, 'https://v3.fal.media/result.mp4');
    await vi.waitFor(() => expect(useGalleryStore.getState().records).toHaveLength(1));

    const record = useGalleryStore.getState().records[0];
    expect(record.kind).toBe('video');
    expect(record.sourceUrl).toBe('https://v3.fal.media/result.mp4');
    expect(record.controlValues).toEqual({ aspect_ratio: '16:9' });
    expect(record.blob).toBeUndefined();
    expect(record.bytes).toBe(0);
    // Deriving a poster would mean pulling the whole file, which is the cost
    // that keeping video on request exists to avoid.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keys on the provider job so a re-poll cannot file it twice', async () => {
    recordFinishedJob('fal', job, 'https://v3.fal.media/result.mp4');
    await vi.waitFor(() => expect(useGalleryStore.getState().records).toHaveLength(1));
    recordFinishedJob('fal', job, 'https://v3.fal.media/result.mp4');
    await vi.waitFor(() => expect(storage.size()).toBe(1));

    expect(useGalleryStore.getState().records).toHaveLength(1);
  });

  it('ignores a success that carries no result URL', () => {
    recordFinishedJob('kie', job, undefined);
    expect(useGalleryStore.getState().records).toEqual([]);
  });
});
