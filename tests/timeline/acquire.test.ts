import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchResultBlob } from '../../lib/gallery/capture';
import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord, GalleryStorage } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { __resetDecodeCacheForTests, acquireClipMedia } from '../../lib/timeline/acquire';

// jsdom cannot decode video; the probe is a seam the same way SeekableVideo is
// in tests/video-frame.test.ts. Framerate is the second half of that seam — it
// needs a demuxer rather than a video element, and jsdom has neither.
const probe = vi.hoisted(() => ({
  probeDimensions: vi.fn(async () => ({ width: 1920, height: 1080, durationSeconds: 5 })),
  probeWithDemuxer: vi.fn(async (): Promise<{ fps?: number; decodable?: boolean }> => ({ fps: 24 })),
}));
vi.mock('../../lib/timeline/probe', () => probe);
vi.mock('../../lib/video-frame', () => ({
  extractLastFrameFromBlob: vi.fn(async () => new Blob(['poster'])),
}));

const video = (o: Partial<GalleryRecord> = {}): GalleryRecord => ({
  id: 'clip', kind: 'video', createdAt: 1, prompt: 'a neon tiger', provider: 'fal',
  controlValues: {}, mimeType: 'video/mp4', bytes: 0, ...o,
});

describe('acquireClipMedia', () => {
  beforeEach(() => {
    __resetDecodeCacheForTests();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    vi.unstubAllGlobals();
    probe.probeDimensions.mockClear();
    probe.probeWithDemuxer.mockClear();
    probe.probeWithDemuxer.mockResolvedValue({ fps: 24 });
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
    // A regression that hard-codes `durable: false` (or omits it) must fail here.
    expect(result).toMatchObject({ durable: true });
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
    // A regression that hard-codes `durable: false` (or omits it) must fail here.
    expect(result).toMatchObject({ durable: true });
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
 * Framerate is the one probed field HTMLVideoElement cannot report, so it has
 * its own probe and its own way of failing. Without these, the whole framerate
 * feature is dead code: nothing would ever write `record.fps`, so
 * deriveOutputFormat's framerate vote would always be empty and every export
 * would fall back to 30fps — which puts all-Veo timelines (24fps) onto a 30fps
 * grid in an uneven 3:2 cadence, the visible judder the feature exists to avoid.
 */
describe('acquireClipMedia caches the clip framerate', () => {
  beforeEach(() => {
    __resetDecodeCacheForTests();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    vi.unstubAllGlobals();
    probe.probeDimensions.mockClear();
    probe.probeWithDemuxer.mockClear();
    probe.probeWithDemuxer.mockResolvedValue({ fps: 24 });
  });

  it('writes the probed framerate onto the record, so the clip can vote on cadence', async () => {
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ status: 'ready', dimensions: { fps: 24 } });
    // The cache is the point: deriveOutputFormat reads GalleryRecord.fps.
    expect(useGalleryStore.getState().records[0].fps).toBe(24);
  });

  it('stays ready when the framerate cannot be read, because cadence is a hint', async () => {
    // A VFR clip, or one in a container the demuxer cannot open, abstains from
    // the vote. It must not be downgraded, warned about, or made unavailable.
    probe.probeWithDemuxer.mockResolvedValue({});
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ status: 'ready', durable: true });
    expect(result).not.toHaveProperty('warning');
    if (result.status === 'ready') expect(result.dimensions.fps).toBeUndefined();
    expect(useGalleryStore.getState().records[0].fps).toBeUndefined();
    // Still fully usable: the dimensions the export actually needs are there.
    expect(useGalleryStore.getState().records[0].width).toBe(1920);
  });

  it('carries the framerate through the download path too', async () => {
    probe.probeWithDemuxer.mockResolvedValue({ fps: 23.976 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['bytes']), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    })));
    useGalleryStore.setState({
      records: [video({ sourceUrl: 'https://cdn.example.com/a.mp4' })],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ status: 'ready', dimensions: { fps: 23.976 } });
    expect(useGalleryStore.getState().records[0].fps).toBe(23.976);
  });

  it('reuses a cached framerate instead of re-opening the demuxer', async () => {
    // Re-probing on every visit to the workspace would decode the whole library
    // again for a number already written down.
    useGalleryStore.setState({
      records: [
        video({ blob: new Blob(['x']), pinned: true, bytes: 1, width: 1280, height: 720, durationSeconds: 8, fps: 30 }),
      ],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ status: 'ready', dimensions: { fps: 30, width: 1280 } });
    expect(probe.probeWithDemuxer).not.toHaveBeenCalled();
    expect(probe.probeDimensions).not.toHaveBeenCalled();
  });
});

/**
 * Design spec §3: acquisition asks `VideoDecoder.isConfigSupported` about the
 * clip's codec while the demuxer is already open, so "your browser cannot
 * decode this clip" surfaces at add time rather than minutes into an export.
 * Best-effort in both directions — a probe that cannot answer must not claim
 * the clip is fine, and a probe that answers "no" must not fail the add: the
 * server engine decodes whatever ffmpeg does.
 */
describe('acquireClipMedia surfaces browser decode support at add time', () => {
  beforeEach(() => {
    __resetDecodeCacheForTests();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    vi.unstubAllGlobals();
    probe.probeDimensions.mockClear();
    probe.probeWithDemuxer.mockClear();
  });

  it('carries a negative decode answer onto the ready clip without failing the add', async () => {
    probe.probeWithDemuxer.mockResolvedValue({ fps: 24, decodable: false });
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    const result = await acquireClipMedia('clip');

    // Ready, not unavailable: blocking the timeline would dead-end the one
    // engine that can still render it.
    expect(result).toMatchObject({ status: 'ready', decodable: false, durable: true });
    if (result.status === 'ready') expect(result.blob).toBeInstanceOf(Blob);
  });

  it('carries a positive decode answer through', async () => {
    probe.probeWithDemuxer.mockResolvedValue({ fps: 24, decodable: true });
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    expect(await acquireClipMedia('clip')).toMatchObject({ status: 'ready', decodable: true });
  });

  it('leaves decodable absent — never true by omission — when the probe cannot answer', async () => {
    // No WebCodecs, an unreadable decoder config, an unopenable container: all
    // "cannot tell". Render-time detection still catches a real failure.
    probe.probeWithDemuxer.mockResolvedValue({ fps: 24 });
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ status: 'ready' });
    expect(result).not.toHaveProperty('decodable');
  });

  it('remembers the answer for a record whose dimensions are already cached', async () => {
    // The second placement of the same clip skips the demuxer entirely (its
    // dimensions are on the record by then), so without the session memo one
    // row would warn and its twin would stay silent about the same file.
    probe.probeWithDemuxer.mockResolvedValue({ fps: 24, decodable: false });
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    expect(await acquireClipMedia('clip')).toMatchObject({ decodable: false });

    probe.probeWithDemuxer.mockClear();
    const second = await acquireClipMedia('clip');

    expect(probe.probeWithDemuxer).not.toHaveBeenCalled();
    expect(second).toMatchObject({ status: 'ready', decodable: false });
  });

  it('never lets the decode probe throw out of an add', async () => {
    // probeWithDemuxer's own contract is that it never rejects, but acquisition
    // must not depend on that being true forever.
    probe.probeWithDemuxer.mockRejectedValue(new Error('demuxer exploded'));
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });

    await expect(acquireClipMedia('clip')).resolves.toMatchObject({ status: 'ready' });
  });
});

/** A storage adapter whose `put()` always rejects, so `setPinned`/`keep` fail
 *  internally without ever throwing out to acquire.ts. */
function withFailingPut(seed: GalleryRecord[] = []): GalleryStorage {
  const base = createMemoryGalleryStorage(seed);
  return {
    ...base,
    put: () => Promise.reject(new Error('disk full')),
  };
}

describe('acquireClipMedia when the store cannot persist', () => {
  beforeEach(() => {
    __resetDecodeCacheForTests();
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    vi.unstubAllGlobals();
  });

  it('reports usable-but-not-durable when pinning a has-bytes record fails, and leaves it genuinely unpinned', async () => {
    // setPinned() and keep() swallow put() rejections internally (catch → set
    // storageError → return, leaving `records` untouched) rather than
    // throwing, so acquireClipMedia cannot tell success from failure just by
    // awaiting the call without segfaulting into a false "ready+durable".
    // This is the exact gap the `durable` flag exists to close — do not
    // remove the re-read as "redundant" with the call above it.
    configureGalleryStorage(withFailingPut());
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: false, bytes: 1 })],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ status: 'ready', durable: false });
    expect(useGalleryStore.getState().records[0].pinned).toBe(false);
  });

  it('reports usable-but-not-durable when keeping a downloaded record fails, but still hands back the real blob', async () => {
    configureGalleryStorage(withFailingPut());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['bytes']), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    })));
    useGalleryStore.setState({
      records: [video({ sourceUrl: 'https://cdn.example.com/a.mp4' })],
    });

    const result = await acquireClipMedia('clip');

    expect(result.status).toBe('ready');
    expect(result).toMatchObject({ durable: false });
    if (result.status === 'ready') {
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(0);
    }
    expect(useGalleryStore.getState().records[0].blob).toBeUndefined();
  });

  it('surfaces the store\'s own storageError text as the warning', async () => {
    configureGalleryStorage(withFailingPut());
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: false, bytes: 1 })],
    });

    const result = await acquireClipMedia('clip');

    expect(result).toMatchObject({ warning: 'Could not update this result.' });
    expect(useGalleryStore.getState().storageError).toBe('Could not update this result.');
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
