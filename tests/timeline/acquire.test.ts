import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchResultBlob } from '../../lib/gallery/capture';
import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { acquireClipMedia } from '../../lib/timeline/acquire';

// jsdom cannot decode video; the probe is a seam the same way SeekableVideo is
// in tests/video-frame.test.ts.
vi.mock('../../lib/timeline/probe', () => ({
  probeDimensions: vi.fn(async () => ({ width: 1920, height: 1080, durationSeconds: 5 })),
}));
vi.mock('../../lib/video-frame', () => ({
  extractLastFrameFromBlob: vi.fn(async () => new Blob(['poster'])),
}));

const video = (o: Partial<GalleryRecord> = {}): GalleryRecord => ({
  id: 'clip', kind: 'video', createdAt: 1, prompt: 'a neon tiger', provider: 'fal',
  controlValues: {}, mimeType: 'video/mp4', bytes: 0, ...o,
});

describe('acquireClipMedia', () => {
  beforeEach(() => {
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    vi.unstubAllGlobals();
  });

  it('reports missing for a record that is no longer in the library', async () => {
    const result = await acquireClipMedia('gone');
    expect(result).toMatchObject({ status: 'unavailable', reason: 'missing' });
  });

  it('re-pins a record that already holds bytes, because bytes are not safety', async () => {
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: false, bytes: 1 })],
    });
    const result = await acquireClipMedia('clip');
    expect(result.status).toBe('ready');
    expect(useGalleryStore.getState().records[0].pinned).toBe(true);
  });

  it('probes a record kept before this feature existed, so old clips can vote', async () => {
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });
    const result = await acquireClipMedia('clip');
    expect(result).toMatchObject({ status: 'ready', dimensions: { width: 1920 } });
    expect(useGalleryStore.getState().records[0].width).toBe(1920);
  });

  it('downloads and keeps a record that is only a URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['bytes']), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    })));
    useGalleryStore.setState({
      records: [video({ sourceUrl: 'https://cdn.example.com/a.mp4' })],
    });

    const result = await acquireClipMedia('clip');

    expect(result.status).toBe('ready');
    const [record] = useGalleryStore.getState().records;
    expect(record.pinned).toBe(true);
    expect(record.blob).toBeDefined();
    expect(record.posterBlob).toBeDefined();
  });

  it('reports expired when the provider URL is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    useGalleryStore.setState({
      records: [video({ sourceUrl: 'https://cdn.example.com/a.mp4' })],
    });
    expect(await acquireClipMedia('clip')).toMatchObject({
      status: 'unavailable', reason: 'expired',
    });
  });

  it('reports no-source for a record with neither bytes nor a usable URL', async () => {
    useGalleryStore.setState({ records: [video()] });
    expect(await acquireClipMedia('clip')).toMatchObject({
      status: 'unavailable', reason: 'no-source',
    });
  });
});

/**
 * acquire.ts tells "the provider deleted it" (expired) apart from "the network
 * failed" (unreachable) by regex-matching the literal message that
 * fetchResultBlob() in lib/gallery/capture.ts throws on `!response.ok`
 * ('Result could not be fetched'). capture.ts is off-limits for this task, so
 * that string match is the only seam available — but a silent drift between
 * the two files would downgrade every expired clip to "unreachable" without
 * any test noticing, because the 'reports expired' case above only proves the
 * *current* message happens to match today.
 *
 * This test pins the actual string capture.ts throws, using the real
 * (unmocked) fetchResultBlob rather than a mock that would just hardcode
 * whatever message we assume it throws. If lib/gallery/capture.ts ever
 * changes that message, this assertion — not a mock — is what breaks, and the
 * regex in lib/timeline/acquire.ts must be updated to match.
 */
describe('expired-reason coupling to lib/gallery/capture.ts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetchResultBlob still throws the exact message acquire.ts regex-matches on a 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));

    await expect(fetchResultBlob('https://cdn.example.com/a.mp4', 'video')).rejects.toThrow(
      'Result could not be fetched'
    );

    let thrown: unknown;
    try {
      await fetchResultBlob('https://cdn.example.com/a.mp4', 'video');
    } catch (error) {
      thrown = error;
    }

    // The exact regex used at the match site in lib/timeline/acquire.ts.
    expect(/not be fetched/.test(String(thrown))).toBe(true);
  });
});
