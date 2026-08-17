import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import TimelineWorkspace, { type ClipState } from '../../components/TimelineWorkspace';
import { acquireClipMedia } from '../../lib/timeline/acquire';

/**
 * Shared across every timeline layout test (the vertical list here, the
 * horizontal track in a later task): both are views over the same store and
 * the same mocked acquisition, so they need the same fixtures rather than
 * each hand-rolling a copy that drifts.
 *
 * `acquireClipMedia` reports 'dead' as expired and anything else as a ready
 * 1920x1080 clip — enough for both "add and see it" and "add and see why it
 * can't be used" without a real network or a real video decoder.
 */
vi.mock('../../lib/timeline/acquire', () => ({
  acquireClipMedia: vi.fn(async (id: string) =>
    id === 'dead'
      ? {
          status: 'unavailable',
          reason: 'expired',
          message: "This clip's source has expired and the file was never kept.",
        }
      : {
          status: 'ready',
          blob: new Blob(['v']),
          dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
          durable: true,
        }
  ),
  acquireAll: vi.fn(async () => []),
}));

/**
 * Overrides the next `acquireClipMedia` call's result — e.g. to simulate a
 * clip that came back ready but not durable. Defined here rather than
 * re-exporting the mock itself: a bare `export { x } from '...'` bypasses
 * Vitest's mock interception and resolves the real module, so the only
 * reliable way to reach the mock from a test file is through a function that
 * closes over the binding this file already imported (and which Vitest did
 * intercept, per the `vi.mock` call above).
 */
export function mockNextAcquireResult(result: ClipState) {
  vi.mocked(acquireClipMedia).mockResolvedValueOnce(result as Awaited<ReturnType<typeof acquireClipMedia>>);
}

export function video(overrides: Partial<GalleryRecord> = {}): GalleryRecord {
  return {
    id: 'clip',
    kind: 'video',
    createdAt: 1,
    prompt: 'a neon tiger',
    slug: 'neon-tiger',
    provider: 'fal',
    controlValues: {},
    mimeType: 'video/mp4',
    bytes: 0,
    ...overrides,
  };
}

/** Lets a test choose which layout `TimelineWorkspace` should mount. */
export function stubMatchMedia(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: wide,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

/**
 * Resets every piece of state `TimelineWorkspace` reads from: a fresh memory
 * gallery adapter, two seeded video records ('clip' ready, 'dead' expired), an
 * empty timeline, and the matchMedia stub. Call this in `beforeEach`.
 */
export function setupTimelineTest({ wide = false }: { wide?: boolean } = {}) {
  configureGalleryStorage(createMemoryGalleryStorage());
  useGalleryStore.setState({
    records: [video(), video({ id: 'dead', slug: 'rooftop' })],
    hydrated: true,
    storageError: null,
  });
  useTimelineStore.getState().clear();
  stubMatchMedia(wide);
}

export function renderWorkspace() {
  return render(<TimelineWorkspace onExit={() => {}} onOpenConnections={() => {}} />);
}
