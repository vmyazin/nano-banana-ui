'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HardDrive } from 'lucide-react';

import { DEFAULT_GALLERY_BUDGET } from '@/lib/gallery/eviction';
import { deriveOutputFormat } from '@/lib/timeline/derive-output';
import { acquireClipMedia, type ClipMedia, type Unavailable } from '@/lib/timeline/acquire';
import type { RenderEngine } from '@/lib/timeline/render/port';
import { useGalleryStore } from '@/store/useGalleryStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import TimelineClipDrawer from '@/components/TimelineClipDrawer';
import TimelineExportPanel from '@/components/TimelineExportPanel';
import TimelineList from '@/components/TimelineList';
import TimelineOutputFormat from '@/components/TimelineOutputFormat';
import TimelinePreview from '@/components/TimelinePreview';
import TimelineTrack from '@/components/TimelineTrack';

/**
 * The state of one placement on the timeline while its bytes are acquired.
 * Keyed by placement id (`TimelineClip.id`), not record id — the same
 * gallery record can legitimately sit on the timeline twice, and each
 * placement acquires and reports independently.
 *
 * Exported because both the horizontal track (wide screens) and the export
 * panel are views over this same map, not owners of their own copy.
 */
export type ClipState = ClipMedia | Unavailable | { status: 'loading' };

interface TimelineWorkspaceProps {
  onExit: () => void;
  onOpenConnections: () => void;
  /**
   * Test seam: fires with the current `clipStates` map whenever it changes.
   * `app/page.tsx` never passes this — `clipStates` is otherwise private to
   * this component, and a placement's acquisition can resolve after the clip
   * that started it was removed (see the abort handling in `addClip`), which
   * is only observable by inspecting the map itself, not by what ends up
   * rendered from it — a removed placement never renders regardless of
   * whether its stale write was guarded away or not.
   */
  onClipStatesChange?: (states: Record<string, ClipState>) => void;
}

function formatBytes(bytes: number) {
  const units = ['KB', 'MB', 'GB', 'TB'];
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export default function TimelineWorkspace({
  onExit,
  onOpenConnections,
  onClipStatesChange,
}: TimelineWorkspaceProps) {
  const records = useGalleryStore((state) => state.records);
  // Gates the restore-on-mount effect below. Resolving before the gallery has
  // hydrated would look up records in an empty store and report every clip as
  // `missing` — a confident wrong answer, worse than the unresolved state it
  // is trying to replace.
  const galleryHydrated = useGalleryStore((state) => state.hydrated);
  const clips = useTimelineStore((state) => state.timeline.clips);
  const output = useTimelineStore((state) => state.timeline.output);

  const [clipStates, setClipStates] = useState<Record<string, ClipState>>({});
  // Read synchronously on mount via the lazy initializer (never on the
  // server: this component only ever loads with `ssr: false`), then kept
  // live by the change listener below. Only matters once Task 7's horizontal
  // track exists to switch into — the vertical list is the layout that works
  // at every width regardless of this value.
  const [isWide, setIsWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  // One AbortController per in-flight placement id. A ref, not state: it
  // must survive re-renders without itself causing one, and nothing ever
  // reads it during render — only inside event handlers and effect cleanup.
  const controllersRef = useRef(new Map<string, AbortController>());

  // The render engines available to the export panel. Starts empty — the
  // browser engine lives behind a dynamic `import()` (it pulls in mediabunny,
  // which must never sit in a top-level import per lib/timeline/render/
  // webcodecs.ts's own contract) so it is loaded once, here, the moment the
  // timeline workspace itself mounts, rather than at module scope.
  const [engines, setEngines] = useState<RenderEngine[]>([]);
  useEffect(() => {
    let cancelled = false;
    // Browser-first order, both loaded lazily: webcodecs pulls in mediabunny
    // (never a top-level import, per that module's own contract) and the
    // server engine only ever speaks HTTP, so neither needs to sit in this
    // component's own bundle before the workspace actually mounts.
    void Promise.all([
      import('@/lib/timeline/render/webcodecs'),
      import('@/lib/timeline/render/server'),
    ]).then(([{ createWebCodecsEngine }, { createServerEngine }]) => {
      if (!cancelled) setEngines([createWebCodecsEngine(), createServerEngine()]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void useGalleryStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Fires the test seam after every clipStates change.
  useEffect(() => {
    onClipStatesChange?.(clipStates);
  }, [clipStates, onClipStatesChange]);

  // Acquisition runs at add time, not export time, so a clip whose source has
  // expired reports that immediately rather than at the end of a render.
  // Each placement gets its own AbortController so removing the clip — or
  // closing the workspace — can cancel the fetch/decode in flight instead of
  // letting it land under a placement id that no longer exists.
  // Shared by adding a clip and by re-resolving one whose file was just
  // restored, so both go through exactly the same acquisition, abort handling
  // and stale-write guard rather than growing a second, subtly different copy.
  const resolveClip = useCallback(async (placementId: string, recordId: string) => {
    setClipStates((prev) => ({ ...prev, [placementId]: { status: 'loading' } }));

    // A repair can land while a previous acquisition for this placement is
    // still in flight; the older one must not overwrite the newer result.
    controllersRef.current.get(placementId)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(placementId, controller);

    try {
      const result = await acquireClipMedia(recordId, { signal: controller.signal });
      // A resolution that was already in flight when the abort fired can
      // still land here even though the controller was aborted, so the
      // timeline itself — not this component's own bookkeeping — is what
      // decides whether the write is still wanted.
      const stillOnTimeline = useTimelineStore
        .getState()
        .timeline.clips.some((clip) => clip.id === placementId);
      if (!stillOnTimeline) return;
      setClipStates((prev) => (placementId in prev ? { ...prev, [placementId]: result } : prev));
    } catch (error) {
      // acquireClipMedia rethrows only AbortError (every other failure is
      // already converted to an Unavailable result) — an aborted acquisition
      // is not a failure to display, so it is dropped silently rather than
      // leaving the row stuck loading or turning it into an error row.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    } finally {
      // Only clear the slot if it is still ours — a newer resolve for this
      // placement may have replaced it while this one was awaiting.
      if (controllersRef.current.get(placementId) === controller) {
        controllersRef.current.delete(placementId);
      }
    }
  }, []);

  const addClip = useCallback(
    async (recordId: string) => {
      const placementId = useTimelineStore.getState().addClip(recordId);
      await resolveClip(placementId, recordId);
    },
    [resolveClip]
  );

  /**
   * A repair fixes the gallery *record*, and the same record can sit on the
   * timeline more than once — so every placement of it is re-resolved, not
   * just the row the user happened to drop the file on. Fixing one twin and
   * leaving the other broken would be the more confusing outcome.
   */
  /**
   * Resolve clips that are on the timeline but have no acquisition state.
   *
   * The timeline persists to localStorage; `clipStates` does not, and until
   * now resolution only ever happened inside `addClip`. So every clip on a
   * reloaded timeline stayed unresolved forever — no duration, no fit
   * controls, and Export permanently disabled, with removing and re-adding
   * each clip as the only way out. This is what makes a saved timeline
   * survive a reload as something you can actually export.
   *
   * Gated on gallery hydration: `acquireClipMedia` looks records up in the
   * store, so running against an un-hydrated (empty) store would report every
   * clip as `missing`.
   */
  useEffect(() => {
    if (!galleryHydrated) return;
    for (const clip of clips) {
      // `resolveClip` writes a `loading` state synchronously, so a clip is
      // only picked up once even though this effect re-runs on every
      // clipStates change.
      if (clipStates[clip.id] || controllersRef.current.has(clip.id)) continue;
      void resolveClip(clip.id, clip.recordId);
    }
  }, [galleryHydrated, clips, clipStates, resolveClip]);

  const repairedRecord = useCallback(
    (recordId: string) => {
      useTimelineStore
        .getState()
        .timeline.clips.filter((clip) => clip.recordId === recordId)
        .forEach((clip) => void resolveClip(clip.id, recordId));
    },
    [resolveClip]
  );

  const removeClip = useCallback((clipId: string) => {
    controllersRef.current.get(clipId)?.abort();
    controllersRef.current.delete(clipId);
    useTimelineStore.getState().removeClip(clipId);
    setClipStates((prev) => {
      if (!(clipId in prev)) return prev;
      const next = { ...prev };
      delete next[clipId];
      return next;
    });
  }, []);

  // Aborts whatever is still in flight when the workspace itself closes —
  // the other half of "in-flight fetches abort when the clip is removed or
  // the workspace closes" (design spec §3).
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  // Tracks the derived format to whatever is ready, as long as the user has
  // not frozen it by editing directly — applyDerivedOutput is a no-op in that
  // case, so this effect does not need to know which state it is in.
  //
  // `output.auto` is a dependency because "match clips" changes *only* that
  // flag: `matchClips` cannot recompute on its own (the store has no access to
  // clipStates), so without this the button would thaw the format and leave
  // the user's edited numbers frozen in place, which is not what it says.
  // It cannot loop: the flag stays `true` across a recompute, and React
  // compares deps by value, so a re-render caused by applyDerivedOutput does
  // not re-run this effect.
  useEffect(() => {
    const dimensions = clips
      .map((clip) => clipStates[clip.id])
      .filter((state): state is ClipMedia => state?.status === 'ready')
      .map((state) => state.dimensions);
    if (dimensions.length === 0) return;
    useTimelineStore.getState().applyDerivedOutput(deriveOutputFormat(dimensions));
  }, [clips, clipStates, output.auto]);

  const storedBytes = records.reduce((total, record) => total + record.bytes, 0);
  const budgetBytes = DEFAULT_GALLERY_BUDGET.maxBytes;
  const storagePct = Math.min(100, (storedBytes / budgetBytes) * 100);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3.5 sm:space-y-4" data-timeline-width={isWide ? 'wide' : 'narrow'}>
      <section className="glass-card p-3.5 md:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onExit} className="btn-secondary shrink-0 px-3 py-2 text-sm">
              Back
            </button>
            <div>
              <p className="eyebrow mb-1 text-[var(--neon-cyan)]">Timeline</p>
              <h2 className="display text-lg font-semibold sm:text-xl">Assemble your clips</h2>
            </div>
          </div>
          <button type="button" onClick={onOpenConnections} className="btn-secondary shrink-0 px-3 py-2 text-xs">
            Connections
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[280px_1fr] lg:gap-4">
        <TimelineClipDrawer records={records} onAdd={(recordId) => void addClip(recordId)} />

        <div className="min-w-0 space-y-3.5">
          <TimelinePreview clips={clips} clipStates={clipStates} />

          <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-3.5">
            <TimelineOutputFormat
              output={output}
              onEdit={(patch) => useTimelineStore.getState().setOutput(patch)}
              onMatchClips={() => useTimelineStore.getState().matchClips()}
            />
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-[var(--foreground-muted)]">
              <HardDrive size={13} className="text-[var(--foreground-subtle)]" />
              {formatBytes(storedBytes)} of {formatBytes(budgetBytes)} stored
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface)]">
                <span
                  className="block h-full rounded-full bg-[var(--neon-cyan)]"
                  style={{ width: `${storagePct}%` }}
                />
              </span>
            </p>
          </div>

          {/* Design spec §7: Export sits in the track header at lg+ and beneath
              the list below — different positions per layout, so it is placed
              inside each branch rather than shared above them. Exactly one of
              the two branches renders at a time (the same mutual exclusivity
              TimelineTrack/TimelineList already have), so this never mounts
              two live instances of the panel, or two copies of its state or
              engine selection — both branches pass the same `clipStates` and
              `engines` this component already owns. */}
          {isWide ? (
            <>
              <TimelineExportPanel engines={engines} clips={clips} clipStates={clipStates} output={output} />
              <TimelineTrack
                clips={clips}
                records={records}
                clipStates={clipStates}
                onRemove={removeClip}
                onRepaired={repairedRecord}
              />
            </>
          ) : (
            <>
              <TimelineList
                clips={clips}
                records={records}
                clipStates={clipStates}
                onRemove={removeClip}
                onRepaired={repairedRecord}
              />
              <TimelineExportPanel engines={engines} clips={clips} clipStates={clipStates} output={output} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
