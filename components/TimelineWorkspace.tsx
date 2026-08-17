'use client';

import { useCallback, useEffect, useState } from 'react';
import { HardDrive, Settings2 } from 'lucide-react';

import { DEFAULT_GALLERY_BUDGET } from '@/lib/gallery/eviction';
import { deriveOutputFormat } from '@/lib/timeline/derive-output';
import { acquireClipMedia, type ClipMedia, type Unavailable } from '@/lib/timeline/acquire';
import { useGalleryStore } from '@/store/useGalleryStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import TimelineClipDrawer from '@/components/TimelineClipDrawer';
import TimelineList from '@/components/TimelineList';
import TimelinePreview from '@/components/TimelinePreview';

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

export default function TimelineWorkspace({ onExit, onOpenConnections }: TimelineWorkspaceProps) {
  const records = useGalleryStore((state) => state.records);
  const clips = useTimelineStore((state) => state.timeline.clips);
  const output = useTimelineStore((state) => state.timeline.output);

  const [clipStates, setClipStates] = useState<Record<string, ClipState>>({});
  // Read synchronously on mount via the lazy initializer (never on the
  // server: this component only ever loads with `ssr: false`), then kept
  // live by the change listener below. Only matters once Task 7's horizontal
  // track exists to switch into — the vertical list is the layout that works
  // at every width regardless of this value.
  const [isWide, setIsWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    void useGalleryStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Acquisition runs at add time, not export time, so a clip whose source has
  // expired reports that immediately rather than at the end of a render.
  const addClip = useCallback(async (recordId: string) => {
    const placementId = useTimelineStore.getState().addClip(recordId);
    setClipStates((prev) => ({ ...prev, [placementId]: { status: 'loading' } }));
    const result = await acquireClipMedia(recordId);
    setClipStates((prev) => ({ ...prev, [placementId]: result }));
  }, []);

  const removeClip = useCallback((clipId: string) => {
    useTimelineStore.getState().removeClip(clipId);
    setClipStates((prev) => {
      if (!(clipId in prev)) return prev;
      const next = { ...prev };
      delete next[clipId];
      return next;
    });
  }, []);

  // Tracks the derived format to whatever is ready, as long as the user has
  // not frozen it by editing directly — applyDerivedOutput is a no-op in that
  // case, so this effect does not need to know which state it is in.
  useEffect(() => {
    const dimensions = clips
      .map((clip) => clipStates[clip.id])
      .filter((state): state is ClipMedia => state?.status === 'ready')
      .map((state) => state.dimensions);
    if (dimensions.length === 0) return;
    useTimelineStore.getState().applyDerivedOutput(deriveOutputFormat(dimensions));
  }, [clips, clipStates]);

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

        <div className="space-y-3.5">
          <TimelinePreview clips={clips} clipStates={clipStates} />

          <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-[var(--foreground-muted)]">
              <Settings2 size={13} className="text-[var(--foreground-subtle)]" />
              Output {output.width}×{output.height} @ {output.fps}fps
              {output.auto ? (
                <span className="pill">auto</span>
              ) : (
                <button
                  type="button"
                  onClick={() => useTimelineStore.getState().matchClips()}
                  className="text-[var(--neon-cyan)] underline-offset-2 hover:underline"
                >
                  match clips
                </button>
              )}
            </p>
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

          <TimelineList clips={clips} records={records} clipStates={clipStates} onRemove={removeClip} />
        </div>
      </div>
    </div>
  );
}
