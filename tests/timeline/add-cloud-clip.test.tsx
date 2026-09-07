import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountLibrary from '@/components/account/AccountLibrary';
import { accountRequest } from '@/lib/account/client';
import type { CloudAsset, CloudJobRequest } from '@/lib/account/contracts';
import { createMemoryGalleryStorage } from '@/lib/gallery/memory-storage';
import { useAccountStore } from '@/store/useAccountStore';
import { configureGalleryStorage, useGalleryStore } from '@/store/useGalleryStore';
import { useTimelineStore } from '@/store/useTimelineStore';

vi.mock('@/lib/account/client', () => ({
  accountRequest: vi.fn(),
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

const request: CloudJobRequest = {
  provider: 'fal', modelId: 'video-model', mediaType: 'video', inputMode: 'text',
  prompt: 'Cloud video', values: {}, referenceIds: [],
};
const video: CloudAsset = {
  id: 'video-1', kind: 'video', mimeType: 'video/mp4', bytes: 2400,
  createdAt: 1, metadata: request, jobId: 'job-2',
};
const image: CloudAsset = {
  id: 'image-1', kind: 'image', mimeType: 'image/png', bytes: 1200,
  createdAt: 2, metadata: { ...request, mediaType: 'image', prompt: 'Cloud image' }, jobId: 'job-1',
};

/**
 * The gap this covers: the default generation mode saves to the cloud, and the
 * timeline only ever reads gallery records — so before this path existed, a
 * finished cloud clip had no route into the editor at all.
 */
describe('adding a cloud clip to the timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    useTimelineStore.getState().clear();
    useAccountStore.getState().applySession({
      account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
      googleEnabled: true, localSignIn: false, providers: [], connections: [],
    });
    probeDimensionsMock.mockReset();
    probeDimensionsMock.mockResolvedValue({ width: 1280, height: 720, durationSeconds: 4 });
    extractLastFrameMock.mockReset();
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['mp4-bytes'], { type: 'video/mp4' }),
    })));
    vi.mocked(accountRequest).mockImplementation(async (path) => {
      if (path === 'jobs') return { jobs: [] };
      if (path === 'storage') return { storage: { limitBytes: 1_000_000_000, usedBytes: 2400, reservedBytes: 0, activeJobs: 0 } };
      if (path === 'assets') return { assets: [video, image], nextCursor: null };
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it('places the clip and keeps a local copy for the editor to resolve', async () => {
    const onAddedToTimeline = vi.fn();
    render(<AccountLibrary ownerId="owner-1" mode="pick-clip" onAddedToTimeline={onAddedToTimeline} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add to timeline' }));

    await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(1));
    expect(useTimelineStore.getState().timeline.clips[0].recordId).toBe('cloud-video-1');
    // The bytes have to be here, not merely referenced: acquireClipMedia
    // resolves a placement through the record's own Blob.
    expect(useGalleryStore.getState().records[0]).toMatchObject({
      id: 'cloud-video-1', kind: 'video', pinned: true, width: 1280, height: 720,
    });
    expect(useGalleryStore.getState().records[0].blob).toBeDefined();
    expect(onAddedToTimeline).toHaveBeenCalled();
  });

  it('offers the clip picker only videos, so nothing unplaceable is on screen', async () => {
    render(<AccountLibrary ownerId="owner-1" mode="pick-clip" />);

    expect(await screen.findByText('Cloud video')).toBeInTheDocument();
    expect(screen.queryByText('Cloud image')).toBeNull();
  });

  it('leaves the timeline untouched when the download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => new Blob() })));
    render(<AccountLibrary ownerId="owner-1" mode="pick-clip" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add to timeline' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(useTimelineStore.getState().timeline.clips).toHaveLength(0);
    expect(useGalleryStore.getState().records).toHaveLength(0);
  });
});
