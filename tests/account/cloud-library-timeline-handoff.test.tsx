import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountConsole from '@/components/account/AccountConsole';
import { accountRequest } from '@/lib/account/client';
import type { CloudAsset, CloudJobRequest } from '@/lib/account/contracts';
import { createMemoryGalleryStorage } from '@/lib/gallery/memory-storage';
import { useAccountStore } from '@/store/useAccountStore';
import { configureGalleryStorage, useGalleryStore } from '@/store/useGalleryStore';
import { useTimelineStore } from '@/store/useTimelineStore';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Only the two account reads are replaced; the rest of the client module stays
// real so the components the console mounts keep the exports they import.
vi.mock('@/lib/account/client', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/account/client')>()),
  accountRequest: vi.fn(),
  accountAssetUrl: vi.fn(async () => 'https://fixture.test/private-clip'),
}));
// Rail panels with requests of their own, mocked for the same reason
// account-page.test.tsx mocks them: this test is about the library grid.
vi.mock('@/components/account/AccountConnections', () => ({ default: () => <section>Connections</section> }));
vi.mock('@/components/account/AccountDeletion', () => ({ default: () => <section>Deletion</section> }));

/** jsdom cannot decode video; the probe and poster extractor are doubles. */
const { probeDimensionsMock, extractLastFrameMock } = vi.hoisted(() => ({
  probeDimensionsMock: vi.fn(),
  extractLastFrameMock: vi.fn(),
}));

vi.mock('@/lib/timeline/probe', () => ({ probeDimensions: probeDimensionsMock }));
vi.mock('@/lib/video-frame', async importOriginal => {
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

const owner = { id: 'owner-1', name: 'Ada Creator', email: 'ada@example.test' };

function renderConsole() {
  return render(
    <AccountConsole account={owner} busy={false} error={null} onSignOut={() => {}} onManageKeys={() => {}} />
  );
}

/**
 * The account console's own library had no follow-through: the clip really was
 * placed, but the page stayed on /account with only a toast to say so — and
 * /account carries no timeline, so the work looked like it had gone nowhere.
 * The studio header already answers this by moving to the editor with the clip.
 */
describe('adding a cloud clip from the account library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    useTimelineStore.getState().clear();
    useAccountStore.getState().applySession({
      account: owner, googleEnabled: true, localSignIn: false, providers: [], connections: [],
    });
    probeDimensionsMock.mockResolvedValue({ width: 1280, height: 720, durationSeconds: 2 });
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['mp4-bytes'], { type: 'video/mp4' }),
    })));
    vi.mocked(accountRequest).mockImplementation(async (path: string) => {
      if (path === 'jobs') return { jobs: [] };
      if (path === 'storage') return { storage: { limitBytes: 1_000_000_000, usedBytes: 2400, reservedBytes: 0, activeJobs: 0 } };
      if (path === 'assets') return { assets: [video], nextCursor: null };
      if (path === 'spend/totals') return { accountId: owner.id, totals: { costUsd: 0, runs: 0, exactUsd: 0, estimatedUsd: 0, unknownRuns: 0 } };
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it('follows the clip to the timeline once it is placed', async () => {
    renderConsole();

    fireEvent.click(await screen.findByRole('button', { name: 'Add to timeline' }));

    await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(1));
    expect(useTimelineStore.getState().timeline.clips[0].recordId).toBe('cloud-video-1');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/timeline'));
    // One placement is one move: a second push would be a re-entered handler.
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('stays on the account page when the clip cannot be added', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => new Blob() })));
    renderConsole();

    fireEvent.click(await screen.findByRole('button', { name: 'Add to timeline' }));

    // Waiting on the toast, not on `fetch`: the toast is written in the catch,
    // so it is the first moment the whole failure path — including the
    // navigation that must not happen — has finished running.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('This cloud clip is no longer available.')
    );
    expect(useTimelineStore.getState().timeline.clips).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
});
