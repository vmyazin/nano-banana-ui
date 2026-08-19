import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { usePlayheadStore } from '../../store/usePlayheadStore';
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
vi.mock('../../lib/timeline/acquire', () => {
  const acquireClipMedia = vi.fn(async (id: string, options?: { signal?: AbortSignal }) => {
    // Honours the signal the way the real one does — it rethrows AbortError
    // rather than degrading to an Unavailable — so a test that aborts before
    // the call gets the same behaviour a real acquisition would give it.
    if (options?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return id === 'dead'
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
        };
  });
  // Delegates to the mock above rather than returning a canned array: the
  // export panel resolves through `acquireAll`, so a stub that ignored
  // `acquireClipMedia` would silently disconnect every per-clip override a
  // test sets up with `mockResolvedValueOnce`.
  const acquireAll = vi.fn(async (ids: string[], options?: { signal?: AbortSignal }) =>
    Promise.all(ids.map((id) => acquireClipMedia(id, options)))
  );
  return {
    acquireClipMedia,
    acquireAll,
    UNDECODABLE_WARNING: 'This browser cannot decode this clip — export on the server instead.',
  };
});

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

/**
 * Overrides the next `acquireClipMedia` call to return a promise the test
 * settles by hand, and captures the `AbortSignal` that call was made with.
 * Exists for the abort-handling tests: they need to control exactly when an
 * acquisition resolves relative to a remove/unmount, and to assert on the
 * signal `TimelineWorkspace` passed in — neither is possible with the
 * fire-and-forget default mock. Kept here (not inlined per test) so Task 7's
 * track tests can reuse it the same way they reuse `mockNextAcquireResult`.
 */
export function mockPendingAcquire() {
  let settle: ((value: Awaited<ReturnType<typeof acquireClipMedia>>) => void) | undefined;
  let signal: AbortSignal | undefined;
  const pending = new Promise<Awaited<ReturnType<typeof acquireClipMedia>>>((resolve) => {
    settle = resolve;
  });

  vi.mocked(acquireClipMedia).mockImplementationOnce(async (_recordId, options) => {
    signal = options?.signal;
    return pending;
  });

  return {
    resolve: (result: ClipState) => settle?.(result as Awaited<ReturnType<typeof acquireClipMedia>>),
    /** The signal the call was actually made with, once it has happened. */
    signal: () => signal,
  };
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
  usePlayheadStore.getState().reset();
  stubMatchMedia(wide);
}

export function renderWorkspace(props: { onClipStatesChange?: (states: Record<string, ClipState>) => void } = {}) {
  return render(
    <TimelineWorkspace onExit={() => {}} {...props} />
  );
}
