import { beforeEach, describe, expect, it, vi } from 'vitest';

import { accountAssetUrl } from '@/lib/account/client';
import { cloudClipRecordId, saveCloudVideoToGallery } from '@/lib/timeline/import-cloud';
import { createMemoryGalleryStorage } from '@/lib/gallery/memory-storage';
import { useAccountStore } from '@/store/useAccountStore';
import { configureGalleryStorage, useGalleryStore } from '@/store/useGalleryStore';

vi.mock('@/lib/account/client', () => ({
  accountAssetUrl: vi.fn(async () => 'https://fixture.test/private-clip'),
}));

/** jsdom cannot decode video; the probe and poster extractor are doubles. */
const { probeDimensionsMock, extractLastFrameMock } = vi.hoisted(() => ({
  probeDimensionsMock: vi.fn(),
  extractLastFrameMock: vi.fn(),
}));

vi.mock('@/lib/timeline/probe', () => ({ probeDimensions: probeDimensionsMock }));
vi.mock('@/lib/video-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/video-frame')>();
  return { ...actual, extractLastFrameFromBlob: extractLastFrameMock };
});

const request = {
  provider: 'fal' as const,
  modelId: 'fixture-video',
  mediaType: 'video' as const,
  inputMode: 'text' as const,
  prompt: 'A rooftop at dusk',
  values: { duration: 6 },
  referenceIds: [],
};
const asset = {
  id: 'asset-1',
  jobId: 'job-1',
  kind: 'video' as const,
  mimeType: 'video/mp4',
  bytes: 2048,
  createdAt: 1,
  metadata: request,
};
const session = {
  account: { id: 'owner-1', name: 'Fixture', email: 'fixture@example.test' },
  googleEnabled: false,
  localSignIn: true,
  providers: [],
  connections: [],
};

const clipResponse = () => ({
  ok: true,
  blob: async () => new Blob(['mp4-bytes'], { type: 'video/mp4' }),
});

describe('saveCloudVideoToGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    useAccountStore.getState().clear();
    useAccountStore.getState().applySession(session);
    probeDimensionsMock.mockReset();
    probeDimensionsMock.mockResolvedValue({ width: 1920, height: 1080, durationSeconds: 6 });
    extractLastFrameMock.mockReset();
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
    vi.stubGlobal('fetch', vi.fn(async () => clipResponse()));
  });

  it('downloads the clip and stores it as a video record the timeline can resolve', async () => {
    const recordId = await saveCloudVideoToGallery(asset, 'owner-1');

    expect(accountAssetUrl).toHaveBeenCalledWith('asset-1', undefined, 'owner-1');
    expect(recordId).toBe(cloudClipRecordId('asset-1'));

    const [stored] = useGalleryStore.getState().records;
    expect(stored).toMatchObject({
      id: 'cloud-asset-1',
      kind: 'video',
      provider: 'fal',
      modelId: 'fixture-video',
      prompt: 'A rooftop at dusk',
      controlValues: { duration: 6 },
      width: 1920,
      height: 1080,
      durationSeconds: 6,
    });
    expect(stored.blob).toBeDefined();
    expect(stored.posterBlob).toBeDefined();
  });

  it('pins the record, because its only source is a URL acquire will not follow', async () => {
    // The cloud content path is relative, and `isDownloadableMediaUrl` rejects
    // a relative URL — so eviction taking these bytes is unrecoverable.
    await saveCloudVideoToGallery(asset, 'owner-1');
    expect(useGalleryStore.getState().records[0].pinned).toBe(true);
  });

  it('reuses the stored copy instead of downloading the same clip twice', async () => {
    await saveCloudVideoToGallery(asset, 'owner-1');
    expect(fetch).toHaveBeenCalledTimes(1);

    const again = await saveCloudVideoToGallery(asset, 'owner-1');

    expect(again).toBe(cloudClipRecordId('asset-1'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useGalleryStore.getState().records).toHaveLength(1);
  });

  it('re-downloads a record that lost its bytes rather than returning a dangling id', async () => {
    await saveCloudVideoToGallery(asset, 'owner-1');
    useGalleryStore.setState((state) => ({
      records: state.records.map((record) => ({ ...record, blob: undefined })),
    }));

    await saveCloudVideoToGallery(asset, 'owner-1');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(useGalleryStore.getState().records[0].blob).toBeDefined();
  });

  it.each([
    ['an image', { ...asset, kind: 'image' as const, mimeType: 'image/png' }],
    ['an oversized clip', { ...asset, bytes: 512 * 1024 * 1024 + 1 }],
  ])('rejects %s without downloading anything', async (_label, candidate) => {
    await expect(saveCloudVideoToGallery(candidate, 'owner-1')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(useGalleryStore.getState().records).toHaveLength(0);
  });

  it('reports a clip the account no longer holds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => new Blob() })));
    await expect(saveCloudVideoToGallery(asset, 'owner-1')).rejects.toThrow('no longer available');
    expect(useGalleryStore.getState().records).toHaveLength(0);
  });

  it.each(['account changes', 'the same account is re-established'])(
    'writes nothing after %s mid-download',
    async (mode) => {
      let resolveFetch!: (response: Response) => void;
      const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
      vi.stubGlobal('fetch', fetchMock);

      const pending = saveCloudVideoToGallery(asset, 'owner-1');
      // The download must actually be in flight: a capability URL is fetched
      // first, so a bare microtask tick would change the account before the
      // request this is about even starts.
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      useAccountStore.getState().clear();
      useAccountStore.getState().applySession(
        mode === 'account changes'
          ? { ...session, account: { ...session.account, id: 'owner-2' } }
          : session
      );
      resolveFetch(clipResponse() as unknown as Response);

      await expect(pending).rejects.toThrow('account changed');
      expect(useGalleryStore.getState().records).toHaveLength(0);
    }
  );

  it('refuses a clip this browser cannot read', async () => {
    probeDimensionsMock.mockRejectedValue(new Error('no decoder'));
    await expect(saveCloudVideoToGallery(asset, 'owner-1')).rejects.toThrow('could not read');
    expect(useGalleryStore.getState().records).toHaveLength(0);
  });

  it('refuses a clip that opens but reports no dimensions', async () => {
    probeDimensionsMock.mockResolvedValue({ width: 0, height: 0, durationSeconds: 0 });
    await expect(saveCloudVideoToGallery(asset, 'owner-1')).rejects.toThrow('could not read');
  });

  it('saves even when the poster cannot be extracted', async () => {
    extractLastFrameMock.mockRejectedValue(new Error('no frame'));
    await saveCloudVideoToGallery(asset, 'owner-1');
    expect(useGalleryStore.getState().records[0].blob).toBeDefined();
  });

  it('surfaces a storage refusal instead of appearing to succeed', async () => {
    // Nothing was written, so this must not read as a clip that was added.
    configureGalleryStorage({
      list: async () => [],
      get: async () => undefined,
      put: async () => {
        throw new Error('quota');
      },
      remove: async () => {},
      clear: async () => {},
    });

    await expect(saveCloudVideoToGallery(asset, 'owner-1')).rejects.toThrow();
    expect(useGalleryStore.getState().records).toHaveLength(0);
  });
});
