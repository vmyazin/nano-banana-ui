import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import {
  importLocalVideo,
  importLocalVideos,
  LOCAL_PROVIDER,
  titleFromFileName,
} from '../../lib/timeline/import-local';

/** jsdom cannot decode video; the probe and poster extractor are doubles. */
const { probeDimensionsMock, extractLastFrameMock } = vi.hoisted(() => ({
  probeDimensionsMock: vi.fn(),
  extractLastFrameMock: vi.fn(),
}));

vi.mock('../../lib/timeline/probe', () => ({ probeDimensions: probeDimensionsMock }));
vi.mock('../../lib/video-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/video-frame')>();
  return { ...actual, extractLastFrameFromBlob: extractLastFrameMock };
});

const videoFile = (name = 'rooftop shot.mp4', bytes = 'abc', type = 'video/mp4') =>
  new File([bytes], name, { type });

describe('titleFromFileName', () => {
  it('drops the extension so a card reads like a name', () => {
    expect(titleFromFileName('rooftop shot FINAL v2.mp4')).toBe('rooftop shot FINAL v2');
  });

  it('falls back rather than producing an empty title', () => {
    expect(titleFromFileName('.mp4')).toBe('Imported clip');
  });
});

describe('importLocalVideo', () => {
  beforeEach(() => {
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    probeDimensionsMock.mockReset();
    probeDimensionsMock.mockResolvedValue({ width: 1920, height: 1080, durationSeconds: 6 });
    extractLastFrameMock.mockReset();
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
  });

  it('refuses a file that is not a video', async () => {
    const png = new File(['x'], 'frame.png', { type: 'image/png' });
    expect(await importLocalVideo(png)).toMatchObject({ status: 'rejected', reason: 'not-video' });
  });

  it('refuses an empty file', async () => {
    expect(await importLocalVideo(videoFile('a.mp4', ''))).toMatchObject({
      status: 'rejected',
      reason: 'empty',
    });
  });

  it('refuses a video this browser cannot read', async () => {
    probeDimensionsMock.mockRejectedValue(new Error('no decoder'));
    expect(await importLocalVideo(videoFile())).toMatchObject({
      status: 'rejected',
      reason: 'unreadable',
    });
  });

  it('refuses a video that opens but reports no dimensions', async () => {
    probeDimensionsMock.mockResolvedValue({ width: 0, height: 0, durationSeconds: 0 });
    expect(await importLocalVideo(videoFile())).toMatchObject({
      status: 'rejected',
      reason: 'unreadable',
    });
  });

  it('creates a video record carrying the file, a poster and its dimensions', async () => {
    const result = await importLocalVideo(videoFile());

    expect(result.status).toBe('imported');
    const [stored] = useGalleryStore.getState().records;
    expect(stored).toMatchObject({
      kind: 'video',
      provider: LOCAL_PROVIDER,
      prompt: 'rooftop shot',
      width: 1920,
      height: 1080,
      durationSeconds: 6,
    });
    expect(stored.blob).toBeDefined();
    expect(stored.posterBlob).toBeDefined();
  });

  it('pins the import, because nothing can ever re-fetch it', async () => {
    // An imported record has no sourceUrl. If eviction takes it, the file is
    // gone from the app with no recovery path — unlike a generated clip.
    await importLocalVideo(videoFile());
    expect(useGalleryStore.getState().records[0].pinned).toBe(true);
    expect(useGalleryStore.getState().records[0].sourceUrl).toBeUndefined();
  });

  it('leaves controlValues empty so nothing offers to replay settings it never had', async () => {
    await importLocalVideo(videoFile());
    expect(useGalleryStore.getState().records[0].controlValues).toEqual({});
  });

  it('reports a storage refusal instead of appearing to succeed', async () => {
    // `record()` returns null when the write fails, and unlike a degraded
    // save this leaves nothing behind at all — the user must not read it as
    // an import that worked.
    configureGalleryStorage({
      list: async () => [],
      get: async () => undefined,
      put: async () => {
        throw new Error('quota');
      },
      remove: async () => {},
      clear: async () => {},
    });

    const result = await importLocalVideo(videoFile());

    expect(result).toMatchObject({ status: 'rejected', reason: 'storage-full' });
    expect(useGalleryStore.getState().records).toHaveLength(0);
  });

  it('imports even when the poster cannot be extracted', async () => {
    extractLastFrameMock.mockRejectedValue(new Error('no frame'));
    expect((await importLocalVideo(videoFile())).status).toBe('imported');
    expect(useGalleryStore.getState().records[0].blob).toBeDefined();
  });
});

describe('importLocalVideos', () => {
  beforeEach(() => {
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    probeDimensionsMock.mockReset();
    probeDimensionsMock.mockResolvedValue({ width: 1920, height: 1080, durationSeconds: 6 });
    extractLastFrameMock.mockReset();
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
  });

  it('continues past a bad file rather than discarding the whole selection', async () => {
    const results = await importLocalVideos([
      videoFile('good-one.mp4'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      videoFile('good-two.mp4'),
    ]);

    expect(results.map((r) => r.status)).toEqual(['imported', 'rejected', 'imported']);
    expect(useGalleryStore.getState().records).toHaveLength(2);
  });

  it('names the file that failed, so a multi-select can say which one', async () => {
    const results = await importLocalVideos([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(results[0]).toMatchObject({ fileName: 'notes.txt' });
  });
});
