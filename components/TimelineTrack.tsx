'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { AlertTriangle, Crop, Scan, Trash2 } from 'lucide-react';

import type { GalleryRecord } from '@/lib/gallery/storage';
import { UNDECODABLE_WARNING } from '@/lib/timeline/acquire';
import { formatDuration } from '@/lib/timeline/format';
import { reorderHint, reorderIntent } from '@/lib/timeline/reorder';
import { trimmedDuration } from '@/lib/timeline/trim';
import { posterImage } from '@/lib/timeline/poster';
import { useTimelineStore, type TimelineClip } from '@/store/useTimelineStore';
import type { ClipState } from '@/components/TimelineWorkspace';
import RecoverMediaDropZone from '@/components/RecoverMediaDropZone';
import TimelineTrimControl from '@/components/TimelineTrimControl';

interface TimelineTrackProps {
  clips: TimelineClip[];
  records: GalleryRecord[];
  clipStates: Record<string, ClipState>;
  onRemove: (clipId: string) => void;
  /** Fires with the repaired record id so every placement of it re-resolves. */
  onRepaired: (recordId: string) => void;
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
/**
 * One height for every poster, with the image free to take its own width.
 * A block is already as wide as its clip is long, so letting the box take the
 * clip's aspect ratio as well would let one tall portrait clip set the height
 * of the whole row. Pinning the height and leaving the width to the image
 * keeps the row level while still showing each clip's real shape.
 */
const PREVIEW_HEIGHT = 'h-24';

const MIN_BLOCK_WIDTH = 108;

function titleOf(record: GalleryRecord | undefined) {
  if (!record) return 'Untitled clip';
  return record.slug?.replace(/-/g, ' ') || record.prompt || 'Untitled clip';
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
  total,
  onRemove,
  onRepaired,
}: {
  clip: TimelineClip;
  record: GalleryRecord | undefined;
  state: ClipState | undefined;
  index: number;
  total: number;
  onRemove: (clipId: string) => void;
  onRepaired: (recordId: string) => void;
}) {
  const [draggedOver, setDraggedOver] = useState(false);
  const poster = posterImage(record?.posterBlob);
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
    (draggedOver ? ' border-[var(--neon-cyan)]/60' : '') +
    ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)]';

  return (
    <div
      // Focusable and self-describing: dragging is a pointer gesture, and the
      // timeline's main verb cannot be pointer-only.
      tabIndex={0}
      role="listitem"
      aria-label={reorderHint(index + 1, total, titleOf(record))}
      onKeyDown={(event) => {
        const intent = reorderIntent(event.key, event, index, total);
        if (!intent) return;
        event.preventDefault();
        useTimelineStore.getState().moveClip(clip.id, intent.toIndex);
        // Focus rides with the block: it has moved in the DOM, and a keyboard
        // user who lost focus after one move could not make a second.
        const element = event.currentTarget;
        requestAnimationFrame(() => element.focus());
      }}
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
        <div className={`flex w-full flex-col items-center justify-center gap-1 rounded-md bg-black/30 p-1.5 text-center ${PREVIEW_HEIGHT}`}>
          <AlertTriangle size={16} className="shrink-0 text-red-400" />
          <p className="text-[0.65rem] leading-tight text-red-300">{state.message}</p>
          {/* `missing` means the record is gone from the library entirely, so
              there is nothing to re-fill and Remove is the only honest action. */}
          {state.reason !== 'missing' && (
            <RecoverMediaDropZone
              recordId={clip.recordId}
              onRepaired={() => onRepaired(clip.recordId)}
              compact
            />
          )}
        </div>
      ) : (
        <div className={`flex w-full cursor-grab items-center justify-center overflow-hidden rounded-md bg-black/40 active:cursor-grabbing ${PREVIEW_HEIGHT}`}>
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="" className="h-full w-auto max-w-full object-contain" />
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
              {formatDuration(trimmedDuration(clip, state.dimensions.durationSeconds))}
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

        {state?.status === 'ready' && (
          <TimelineTrimControl clip={clip} sourceDuration={state.dimensions.durationSeconds} compact />
        )}
      </div>

      {isUndurable && (
        <p className="flex items-center gap-1 text-[0.625rem] leading-tight text-amber-300">
          <AlertTriangle size={11} className="shrink-0" />
          {state.warning ?? 'This clip could not be saved and will not survive a reload.'}
        </p>
      )}

      {state?.status === 'ready' && state.decodable === false && (
        <p className="flex items-center gap-1 text-[0.625rem] leading-tight text-amber-300">
          <AlertTriangle size={11} className="shrink-0" />
          {UNDECODABLE_WARNING}
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
export default function TimelineTrack({
  clips,
  records,
  clipStates,
  onRemove,
  onRepaired,
}: TimelineTrackProps) {
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
      <div role="list" aria-label="Timeline clips" className="flex gap-2">
        {clips.map((clip, index) => (
          <TrackBlock
            key={clip.id}
            clip={clip}
            record={byId.get(clip.recordId)}
            state={clipStates[clip.id]}
            index={index}
            total={clips.length}
            onRemove={onRemove}
            onRepaired={onRepaired}
          />
        ))}
      </div>
    </div>
  );
}
