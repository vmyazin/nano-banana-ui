import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { repairRecordFromFile } from '../../lib/timeline/repair';

/**
 * jsdom cannot decode video, so the probe and the poster extractor are doubles —
 * the same seam `tests/timeline/acquire.test.ts` and `tests/video-frame.test.ts`
 * use. What is exercised here is the repair choreography: validation, the
 * mismatch comparison, and that persistence is confirmed rather than assumed.
 */
const { probeDimensionsMock, extractLastFrameMock } = vi.hoisted(() => ({
  probeDimensionsMock: vi.fn(),
  extractLastFrameMock: vi.fn(),
}));

vi.mock('../../lib/timeline/probe', () => ({ probeDimensions: probeDimensionsMock }));
vi.mock('../../lib/video-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/video-frame')>();
  return { ...actual, extractLastFrameFromBlob: extractLastFrameMock };
});

const videoFile = (bytes = 'abc', type = 'video/mp4') =>
  new File([bytes], 'rooftop.mp4', { type });

const record = (overrides: Partial<GalleryRecord> = {}): GalleryRecord => ({
  id: 'clip',
  kind: 'video',
  createdAt: 1,
  prompt: 'a neon rooftop at dusk',
  slug: 'neon-rooftop',
  provider: 'fal',
  controlValues: {},
  mimeType: 'video/mp4',
  bytes: 0,
  sourceUrl: 'https://cdn.example.com/dead.mp4',
  ...overrides,
});

describe('repairRecordFromFile', () => {
  beforeEach(() => {
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [record()], hydrated: true, storageError: null });
    probeDimensionsMock.mockReset();
    probeDimensionsMock.mockResolvedValue({ width: 1080, height: 1920, durationSeconds: 5 });
    extractLastFrameMock.mockReset();
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
  });

  it('refuses a record that is no longer in the library', async () => {
    expect(await repairRecordFromFile('gone', videoFile())).toMatchObject({
      status: 'rejected',
      reason: 'missing',
    });
  });

  it('refuses a file that is not a video', async () => {
    const png = new File(['x'], 'frame.png', { type: 'image/png' });
    expect(await repairRecordFromFile('clip', png)).toMatchObject({
      status: 'rejected',
      reason: 'not-video',
    });
  });

  it('refuses an empty file', async () => {
    expect(await repairRecordFromFile('clip', videoFile(''))).toMatchObject({
      status: 'rejected',
      reason: 'empty',
    });
  });

  it('refuses a video this browser cannot read', async () => {
    probeDimensionsMock.mockRejectedValue(new Error('no decoder'));
    expect(await repairRecordFromFile('clip', videoFile())).toMatchObject({
      status: 'rejected',
      reason: 'unreadable',
    });
  });

  it('refuses a video that opens but reports no dimensions', async () => {
    // Would otherwise reach the encoder as a 0x0 frame.
    probeDimensionsMock.mockResolvedValue({ width: 0, height: 0, durationSeconds: 0 });
    expect(await repairRecordFromFile('clip', videoFile())).toMatchObject({
      status: 'rejected',
      reason: 'unreadable',
    });
  });

  it('stores the bytes, pins the record, and keeps its prompt and slug', async () => {
    const result = await repairRecordFromFile('clip', videoFile());

    expect(result).toMatchObject({ status: 'repaired', durable: true });
    const [stored] = useGalleryStore.getState().records;
    expect(stored.blob).toBeDefined();
    expect(stored.posterBlob).toBeDefined();
    expect(stored.pinned).toBe(true);
    expect(stored.prompt).toBe('a neon rooftop at dusk');
    expect(stored.slug).toBe('neon-rooftop');
  });

  it('caches the probed dimensions so the timeline can derive a format from it', async () => {
    await repairRecordFromFile('clip', videoFile());
    expect(useGalleryStore.getState().records[0]).toMatchObject({
      width: 1080,
      height: 1920,
      durationSeconds: 5,
    });
  });

  it('reports durable: false when the library refuses to store it', async () => {
    // `keep` swallows storage failures, so a repair that did not persist can
    // only be detected by re-reading the store — never by the call throwing.
    configureGalleryStorage({
      list: async () => [],
      get: async () => undefined,
      put: async () => {
        throw new Error('quota');
      },
      remove: async () => {},
      clear: async () => {},
    });

    const result = await repairRecordFromFile('clip', videoFile());

    expect(result).toMatchObject({ status: 'repaired', durable: false });
    expect((result as { warning?: string }).warning).toBeTruthy();
    expect(useGalleryStore.getState().records[0].pinned).not.toBe(true);
  });

  it('warns when the file does not match what the record remembered, but still repairs', async () => {
    useGalleryStore.setState({
      records: [record({ width: 1080, height: 1920, durationSeconds: 5 })],
    });
    probeDimensionsMock.mockResolvedValue({ width: 1920, height: 1080, durationSeconds: 8 });

    const result = await repairRecordFromFile('clip', videoFile());

    expect(result.status).toBe('repaired');
    expect((result as { mismatch?: string }).mismatch).toMatch(/1920x1080 · 8\.0s/);
    expect((result as { mismatch?: string }).mismatch).toMatch(/1080x1920 · 5\.0s/);
  });

  it('stays silent when the file matches', async () => {
    useGalleryStore.setState({
      records: [record({ width: 1080, height: 1920, durationSeconds: 5 })],
    });
    const result = await repairRecordFromFile('clip', videoFile());
    expect(result).not.toHaveProperty('mismatch');
  });

  it('stays silent when the record was never probed and has nothing to compare', async () => {
    const result = await repairRecordFromFile('clip', videoFile());
    expect(result).not.toHaveProperty('mismatch');
  });

  it('treats a small duration difference as the same clip re-encoded', async () => {
    useGalleryStore.setState({
      records: [record({ width: 1080, height: 1920, durationSeconds: 5 })],
    });
    probeDimensionsMock.mockResolvedValue({ width: 1080, height: 1920, durationSeconds: 5.2 });
    expect(await repairRecordFromFile('clip', videoFile())).not.toHaveProperty('mismatch');
  });

  it('repairs even when the poster cannot be extracted', async () => {
    extractLastFrameMock.mockRejectedValue(new Error('no frame'));
    const result = await repairRecordFromFile('clip', videoFile());
    expect(result.status).toBe('repaired');
    expect(useGalleryStore.getState().records[0].blob).toBeDefined();
  });
});
