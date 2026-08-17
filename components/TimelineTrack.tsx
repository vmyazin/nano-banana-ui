'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { AlertTriangle, Crop, Scan, Trash2 } from 'lucide-react';

import type { GalleryRecord } from '@/lib/gallery/storage';
import { useTimelineStore, type TimelineClip } from '@/store/useTimelineStore';
import type { ClipState } from '@/components/TimelineWorkspace';

interface TimelineTrackProps {
  clips: TimelineClip[];
  records: GalleryRecord[];
  clipStates: Record<string, ClipState>;
  onRemove: (clipId: string) => void;
}

/**
 * Floor for `flexGrow`: a 1-second clip, or one whose duration isn't known
 * yet (loading, or unavailable and never measured), still claims a fair
 * share of the row instead of collapsing toward zero.
 */
const MIN_GROW = 1;
/**
 * Hard floor in pixels, enforced via `min-width` alongside the flex-grow
 * above. `flexGrow` only distributes space once there's room to distribute —
 * this is what keeps a block clickable when the track is crowded.
 */
const MIN_BLOCK_WIDTH = 108;

function titleOf(record: GalleryRecord | undefined) {
  if (!record) return 'Untitled clip';
  return record.slug?.replace(/-/g, ' ') || record.prompt || 'Untitled clip';
}

function formatDuration(seconds: number | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Object URL for a single blob, revoked when it changes or the block
 * unmounts. Duplicated from TimelineList's identical hook rather than
 * imported — TimelineList is off-limits to modify (including what it
 * exports), and the two layouts otherwise share nothing beyond the store
 * and types.
 */
function usePreviewUrl(blob: Blob | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function growFor(state: ClipState | undefined) {
  if (state?.status === 'ready') return Math.max(state.dimensions.durationSeconds, MIN_GROW);
  return MIN_GROW;
}

function TrackBlock({
  clip,
  record,
  state,
  index,
  onRemove,
}: {
  clip: TimelineClip;
  record: GalleryRecord | undefined;
  state: ClipState | undefined;
  index: number;
  onRemove: (clipId: string) => void;
}) {
  const [draggedOver, setDraggedOver] = useState(false);
  const poster = record?.posterBlob ?? (state?.status === 'ready' ? state.blob : record?.blob);
  const previewUrl = usePreviewUrl(poster);

  const isUnavailable = state?.status === 'unavailable';
  const isUndurable = state?.status === 'ready' && !state.durable;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggedOver(false);
    const draggedId = event.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== clip.id) {
      useTimelineStore.getState().moveClip(draggedId, index);
    }
  };

  const blockClass =
    'group relative flex flex-col gap-1.5 rounded-lg border p-2 transition-colors ' +
    (isUnavailable
      ? 'border-red-500/30 bg-red-500/5'
      : isUndurable
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-[var(--border)] bg-[var(--background-elevated)]/60') +
    (draggedOver ? ' border-[var(--neon-cyan)]/60' : '');

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', clip.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDraggedOver(true);
      }}
      onDragLeave={() => setDraggedOver(false)}
      onDrop={handleDrop}
      style={{ flexGrow: growFor(state), flexShrink: 0, flexBasis: 0, minWidth: MIN_BLOCK_WIDTH }}
      className={blockClass}
      title={isUnavailable ? state.message : undefined}
    >
      <button
        type="button"
        onClick={() => onRemove(clip.id)}
        aria-label={`Remove ${titleOf(record)} from the timeline`}
        className="absolute right-1 top-1 z-10 rounded-md bg-black/50 p-1 text-[var(--foreground-subtle)] opacity-0 transition-opacity hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>

      {isUnavailable ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md bg-black/30 p-1.5 text-center">
          <AlertTriangle size={16} className="shrink-0 text-red-400" />
          <p className="text-[0.65rem] leading-tight text-red-300">{state.message}</p>
        </div>
      ) : (
        <div className="flex aspect-video w-full cursor-grab items-center justify-center overflow-hidden rounded-md bg-black/40 active:cursor-grabbing">
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[0.65rem] text-[var(--foreground-subtle)]">
              {state?.status === 'loading' ? 'Loading…' : 'No preview'}
            </span>
          )}
        </div>
      )}

      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-[0.7rem] font-medium text-[var(--foreground)]" title={record?.prompt}>
          {titleOf(record)}
        </p>
        {state?.status === 'ready' && (
          <div className="flex flex-wrap items-center gap-1">
            <p className="text-[0.65rem] text-[var(--foreground-muted)]">
              {formatDuration(state.dimensions.durationSeconds)}
            </p>
            <div
              role="group"
              aria-label="Fit"
              className="flex overflow-hidden rounded-md border border-[var(--border)]"
            >
              {(['contain', 'cover'] as const).map((fit) => (
                <button
                  key={fit}
                  type="button"
                  aria-pressed={clip.fit === fit}
                  onClick={() => useTimelineStore.getState().setFit(clip.id, fit)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[0.6rem] capitalize transition-colors ${
                    clip.fit === fit
                      ? 'bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {fit === 'contain' ? <Scan size={10} /> : <Crop size={10} />}
                  {fit}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isUndurable && (
        <p className="flex items-center gap-1 text-[0.625rem] leading-tight text-amber-300">
          <AlertTriangle size={11} className="shrink-0" />
          {state.warning ?? 'This clip could not be saved and will not survive a reload.'}
        </p>
      )}
    </div>
  );
}

/**
 * The wide-screen editor track: one horizontally-scrolling row of clip
 * blocks sized by duration, reorderable by dragging a block over another.
 * The `lg`-and-up counterpart to TimelineList — TimelineWorkspace mounts
 * exactly one of the two, never both, so drag listeners never double up
 * over the same clips.
 */
export default function TimelineTrack({ clips, records, clipStates, onRemove }: TimelineTrackProps) {
  const byId = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);

  if (clips.length === 0) {
    return (
      <div data-testid="timeline-track" className="glass-card p-4 text-center">
        <p className="text-[0.8125rem] text-[var(--foreground-muted)]">
          No clips yet. Add one from your clips on the left to start a sequence.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="timeline-track" className="glass-card min-w-0 overflow-x-auto p-3.5">
      <div className="flex gap-2">
        {clips.map((clip, index) => (
          <TrackBlock
            key={clip.id}
            clip={clip}
            record={byId.get(clip.recordId)}
            state={clipStates[clip.id]}
            index={index}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
