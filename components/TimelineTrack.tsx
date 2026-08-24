'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, Crop, Scan, Trash2, Undo2 } from 'lucide-react';

import type { GalleryRecord } from '@/lib/gallery/storage';
import { UNDECODABLE_WARNING } from '@/lib/timeline/acquire';
import { formatDuration } from '@/lib/timeline/format';
import { reorderHint, reorderIntent } from '@/lib/timeline/reorder';
import {
  buildTrackLayout,
  rulerTicks,
  timeToX,
  xToTime,
  type TrackLayout,
} from '@/lib/timeline/scale';
import { MIN_TRIMMED_SECONDS, isTrimmed, resolveTrim, trimmedDuration } from '@/lib/timeline/trim';
import { posterImage } from '@/lib/timeline/poster';
import { usePlayheadStore } from '@/store/usePlayheadStore';
import { useTimelineStore, type TimelineClip } from '@/store/useTimelineStore';
import type { ClipState } from '@/components/TimelineWorkspace';
import RecoverMediaDropZone from '@/components/RecoverMediaDropZone';
import TimelineFilmstrip from '@/components/TimelineFilmstrip';

interface TimelineTrackProps {
  clips: TimelineClip[];
  records: GalleryRecord[];
  clipStates: Record<string, ClipState>;
  onRemove: (clipId: string) => void;
  /** Fires with the repaired record id so every placement of it re-resolves. */
  onRepaired: (recordId: string) => void;
}

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

const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** jsdom implements setPointerCapture but rejects synthetic pointer ids; a drag works fine without capture there. */
function capturePointer(element: Element, pointerId: number) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    /* no pointer capture available — the drag still tracks via bubbling */
  }
}
/** Trim edits land on tenths — the same step the old sliders used. */
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * One edge of a clip, draggable in time.
 *
 * A drag reads everything from the baseline captured at pointerdown — where
 * the pointer started and what the trim was — so the gesture is a pure
 * function of pointer travel rather than an accumulation over store updates,
 * which would drift and double-apply as re-renders land mid-drag.
 *
 * It is also a slider to the keyboard (arrows step 0.1s, Shift makes it 1s):
 * trimming used to be range inputs and must not become pointer-only by
 * getting prettier.
 */
function TrimHandle({
  clip,
  side,
  sourceDuration,
  pps,
  onDragActive,
}: {
  clip: TimelineClip;
  side: 'in' | 'out';
  sourceDuration: number;
  pps: number;
  /** Fires true while the pointer holds this handle, so the block can stop being draggable. */
  onDragActive: (active: boolean) => void;
}) {
  const { start, end } = resolveTrim(clip, sourceDuration);
  const value = side === 'in' ? start : end;
  const min = side === 'in' ? 0 : round1(start + MIN_TRIMMED_SECONDS);
  const max = side === 'in' ? round1(end - MIN_TRIMMED_SECONDS) : sourceDuration;
  // `pps` is frozen with the rest of the baseline: trimming changes the total
  // duration, which changes the fit-to-width scale mid-drag — feeding the live
  // scale back into the same drag would make the handle chase itself.
  const baselineRef = useRef<{ pointerX: number; start: number; end: number; pps: number } | null>(
    null
  );

  const apply = useCallback(
    (next: number, origin: { start: number; end: number }) => {
      if (side === 'in') {
        const clamped = clampValue(round1(next), 0, origin.end - MIN_TRIMMED_SECONDS);
        useTimelineStore.getState().setTrim(clip.id, { start: clamped, end: origin.end });
      } else {
        const clamped = clampValue(round1(next), origin.start + MIN_TRIMMED_SECONDS, sourceDuration);
        useTimelineStore.getState().setTrim(clip.id, { start: origin.start, end: clamped });
      }
    },
    [clip.id, side, sourceDuration]
  );

  return (
    <div
      data-trim-handle
      role="slider"
      tabIndex={0}
      aria-label={side === 'in' ? 'Trim start, seconds' : 'Trim end, seconds'}
      aria-valuemin={round1(min)}
      aria-valuemax={round1(max)}
      aria-valuenow={round1(value)}
      aria-valuetext={`${value.toFixed(1)} seconds`}
      aria-orientation="horizontal"
      draggable={false}
      onPointerDown={(event) => {
        // preventDefault is what actually wins the gesture: the block above is
        // `draggable`, and an uncancelled pointerdown lets the browser start a
        // native drag, which fires pointercancel and kills the trim mid-grab.
        // It also swallows the focus click, so focus is restored by hand.
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        onDragActive(true);
        baselineRef.current = { pointerX: event.clientX, start, end, pps };
        capturePointer(event.currentTarget, event.pointerId);
      }}
      onPointerMove={(event) => {
        const baseline = baselineRef.current;
        if (!baseline) return;
        const travelled = (event.clientX - baseline.pointerX) / baseline.pps;
        apply((side === 'in' ? baseline.start : baseline.end) + travelled, baseline);
      }}
      onPointerUp={() => {
        baselineRef.current = null;
        onDragActive(false);
      }}
      onPointerCancel={() => {
        baselineRef.current = null;
        onDragActive(false);
      }}
      onKeyDown={(event) => {
        // Alt belongs to reorder on the block underneath; Meta/Ctrl to the OS.
        if (event.altKey || event.metaKey || event.ctrlKey) return;
        const direction =
          event.key === 'ArrowLeft' || event.key === 'ArrowDown'
            ? -1
            : event.key === 'ArrowRight' || event.key === 'ArrowUp'
              ? 1
              : 0;
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        apply(value + direction * (event.shiftKey ? 1 : 0.1), { start, end });
      }}
      className={`group/handle absolute inset-y-0 z-10 w-2.5 cursor-ew-resize touch-none focus-visible:outline-none ${
        side === 'in' ? 'left-0' : 'right-0'
      }`}
    >
      <span
        aria-hidden
        // Discoverable at the block, committed at the handle: hovering the
        // clip shows both edges faintly, and the one under the pointer (or
        // holding focus, or mid-drag) goes solid.
        className={`absolute inset-y-0 w-1 bg-[var(--neon-cyan)] opacity-0 transition-opacity group-hover:opacity-40 group-hover/handle:opacity-100 group-active/handle:opacity-100 group-focus-visible/handle:opacity-100 ${
          side === 'in' ? 'left-0 rounded-r-sm' : 'right-0 rounded-l-sm'
        }`}
      />
    </div>
  );
}

function TrackBlock({
  clip,
  record,
  state,
  width,
  pps,
  index,
  total,
  onRemove,
  onRepaired,
}: {
  clip: TimelineClip;
  record: GalleryRecord | undefined;
  state: ClipState | undefined;
  width: number;
  pps: number;
  index: number;
  total: number;
  onRemove: (clipId: string) => void;
  onRepaired: (recordId: string) => void;
}) {
  const [draggedOver, setDraggedOver] = useState(false);
  // While a trim handle is held, the block must not be draggable at all —
  // the dragstart guard below is only a fallback, because by the time
  // dragstart fires the pointer stream is already being torn down.
  const [trimming, setTrimming] = useState(false);
  const poster = posterImage(record?.posterBlob);
  const previewUrl = usePreviewUrl(poster);

  const isUnavailable = state?.status === 'unavailable';
  const isReady = state?.status === 'ready';
  const isUndurable = isReady && !state.durable;
  const sourceDuration = isReady ? state.dimensions.durationSeconds : 0;
  const trimmed = isReady && isTrimmed(clip, sourceDuration);
  const trim = resolveTrim(clip, sourceDuration);

  /** The one-image view of the clip: what a block showed before filmstrips, and
   *  what it still shows while (or instead of) decoding one. */
  const still = previewUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={previewUrl} alt="" draggable={false} className="h-full w-full select-none object-cover" />
  ) : (
    <span className="flex h-full items-center justify-center text-[0.6rem] text-[var(--foreground-subtle)]">
      {state?.status === 'loading' ? 'Loading…' : 'No preview'}
    </span>
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggedOver(false);
    const draggedId = event.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== clip.id) {
      useTimelineStore.getState().moveClip(draggedId, index);
    }
  };

  const handleReorderKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const intent = reorderIntent(event.key, event, index, total);
    if (!intent) return;
    event.preventDefault();
    useTimelineStore.getState().moveClip(clip.id, intent.toIndex);
    // Focus rides with the block: it has moved in the DOM, and a keyboard
    // user who lost focus after one move could not make a second.
    const element = event.currentTarget;
    requestAnimationFrame(() => element.focus());
  };

  const blockClass =
    'group relative flex flex-none flex-col overflow-hidden border transition-colors ' +
    (isUnavailable
      ? 'border-red-500/40 bg-red-500/5'
      : isUndurable
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-[var(--border)] bg-[var(--background-elevated)]/60') +
    (draggedOver ? ' border-[var(--neon-cyan)]/60' : '') +
    ' first:rounded-l-md last:rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--neon-cyan)]';

  return (
    <div
      // Focusable and self-describing: dragging is a pointer gesture, and the
      // timeline's main verb cannot be pointer-only.
      tabIndex={0}
      role="listitem"
      aria-label={reorderHint(index + 1, total, titleOf(record))}
      onKeyDown={handleReorderKeys}
      draggable={!trimming}
      onDragStart={(event) => {
        // A drag that began on a trim handle is a trim, not a reorder.
        if ((event.target as HTMLElement).closest?.('[data-trim-handle]')) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/plain', clip.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDraggedOver(true);
      }}
      onDragLeave={() => setDraggedOver(false)}
      onDrop={handleDrop}
      style={{ width }}
      className={blockClass}
      title={isUnavailable ? state.message : record?.prompt}
    >
      <button
        type="button"
        onClick={() => onRemove(clip.id)}
        aria-label={`Remove ${titleOf(record)} from the timeline`}
        className="absolute right-0.5 top-0.5 z-20 rounded-md bg-black/60 p-1 text-[var(--foreground-subtle)] opacity-0 transition-opacity hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>

      {isUnavailable ? (
        <div className="flex min-h-16 w-full flex-1 flex-col items-center justify-center gap-1 bg-black/30 p-1.5 text-center">
          <AlertTriangle size={14} className="shrink-0 text-red-400" />
          <p className="text-[0.6rem] leading-tight text-red-300">{state.message}</p>
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
        <div className="relative h-16 w-full cursor-grab overflow-hidden bg-black/40 active:cursor-grabbing">
          {/* A strip of stills across the block, not one poster stretched over
              it: the block's width is its trimmed duration, so what belongs
              there is what happens *during* the clip. The single still stays
              as its fallback — shown until the first frame decodes, and kept
              for good on a browser that cannot decode the source at all. */}
          {isReady ? (
            <TimelineFilmstrip
              recordId={clip.recordId}
              blob={state.blob}
              dimensions={state.dimensions}
              trimStart={trim.start}
              trimEnd={trim.end}
              blockWidth={width}
              fallback={still}
            />
          ) : (
            still
          )}
        </div>
      )}

      <div className="min-w-0 space-y-0.5 px-1.5 py-1">
        <p className="truncate text-[0.65rem] font-medium text-[var(--foreground)]">
          {titleOf(record)}
        </p>
        {isReady && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <p className="tabular-nums text-[0.6rem] text-[var(--foreground-muted)]">
              {formatDuration(trimmedDuration(clip, sourceDuration))}
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
                  aria-label={fit}
                  title={fit === 'contain' ? 'Contain (letterbox)' : 'Cover (fill and crop)'}
                  onClick={() => useTimelineStore.getState().setFit(clip.id, fit)}
                  className={`flex items-center px-1 py-0.5 transition-colors ${
                    clip.fit === fit
                      ? 'bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {fit === 'contain' ? <Scan size={10} /> : <Crop size={10} />}
                </button>
              ))}
            </div>
            {trimmed && (
              <button
                type="button"
                onClick={() => useTimelineStore.getState().setTrim(clip.id, {})}
                title="Use the whole clip"
                aria-label="Use the whole clip"
                className="flex items-center text-[var(--neon-cyan)] hover:text-[var(--foreground)]"
              >
                <Undo2 size={10} />
              </button>
            )}
          </div>
        )}

        {isUndurable && (
          <p
            className="line-clamp-2 flex items-start gap-1 text-[0.6rem] leading-tight text-amber-300"
            title={state.warning ?? undefined}
          >
            <AlertTriangle size={10} className="mt-px shrink-0" />
            {state.warning ?? 'This clip could not be saved and will not survive a reload.'}
          </p>
        )}

        {isReady && state.decodable === false && (
          <p className="line-clamp-2 flex items-start gap-1 text-[0.6rem] leading-tight text-amber-300" title={UNDECODABLE_WARNING}>
            <AlertTriangle size={10} className="mt-px shrink-0" />
            {UNDECODABLE_WARNING}
          </p>
        )}
      </div>

      {isReady && (
        <>
          <TrimHandle clip={clip} side="in" sourceDuration={sourceDuration} pps={pps} onDragActive={setTrimming} />
          <TrimHandle clip={clip} side="out" sourceDuration={sourceDuration} pps={pps} onDragActive={setTrimming} />
        </>
      )}
    </div>
  );
}

/**
 * The wide-screen editor track, laid out like an editor's: a time ruler, clip
 * blocks whose widths are their trimmed durations on one shared
 * pixels-per-second scale, and the playhead the preview is playing — one
 * clock, two surfaces. Scrubbing the ruler seeks the preview; dragging a
 * block's edge trims it; dragging its middle reorders. The `lg`-and-up
 * counterpart to TimelineList — TimelineWorkspace mounts exactly one of the
 * two, never both, so drag listeners never double up over the same clips.
 */
export default function TimelineTrack({
  clips,
  records,
  clipStates,
  onRemove,
  onRepaired,
}: TimelineTrackProps) {
  const byId = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setAvailableWidth(element.clientWidth));
    observer.observe(element);
    setAvailableWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const layout: TrackLayout = useMemo(
    () =>
      buildTrackLayout(
        clips.map((clip) => {
          const state = clipStates[clip.id];
          return {
            id: clip.id,
            seconds:
              state?.status === 'ready'
                ? trimmedDuration(clip, state.dimensions.durationSeconds)
                : null,
          };
        }),
        availableWidth
      ),
    [clips, clipStates, availableWidth]
  );

  const time = usePlayheadStore((state) => state.time);
  const playing = usePlayheadStore((state) => state.playing);
  const playheadX = timeToX(layout, time);
  const ticks = useMemo(() => rulerTicks(layout), [layout]);

  // Keep the playhead on screen while playing — the track scrolls when the
  // scale's floors make it wider than the viewport, and playback should never
  // run off the visible edge.
  useEffect(() => {
    if (!playing) return;
    const scroller = scrollRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const margin = 32;
    if (playheadX < scroller.scrollLeft + margin || playheadX > scroller.scrollLeft + scroller.clientWidth - margin) {
      scroller.scrollLeft = Math.max(0, playheadX - scroller.clientWidth / 2);
    }
  }, [playheadX, playing]);

  const scrubFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      usePlayheadStore.getState().seek(xToTime(layout, event.clientX - rect.left));
    },
    [layout]
  );

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
    <div data-testid="timeline-track" className="glass-card min-w-0 p-3.5">
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="relative" style={{ width: layout.width, minWidth: '100%' }}>
          {/* The ruler is the scrub surface: clicking a clip must stay a
              selection/reorder gesture, so time lives up here — the same split
              the desktop editors use. */}
          <div
            data-testid="track-ruler"
            onPointerDown={(event) => {
              scrubbingRef.current = true;
              capturePointer(event.currentTarget, event.pointerId);
              scrubFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (scrubbingRef.current) scrubFromPointer(event);
            }}
            onPointerUp={() => {
              scrubbingRef.current = false;
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false;
            }}
            className="relative h-6 cursor-crosshair touch-none select-none border-b border-[var(--border)]"
          >
            {ticks.map((tick) => (
              <div
                key={tick.time}
                aria-hidden
                className="pointer-events-none absolute bottom-0 h-full"
                style={{ left: tick.x }}
              >
                <span className="absolute bottom-0 h-1.5 w-px bg-[var(--foreground-subtle)]" />
                <span className="absolute bottom-1.5 left-1 whitespace-nowrap text-[0.6rem] tabular-nums text-[var(--foreground-subtle)]">
                  {tick.label}
                </span>
              </div>
            ))}
          </div>

          <div role="list" aria-label="Timeline clips" className="flex items-stretch pt-1.5">
            {clips.map((clip, index) => (
              <TrackBlock
                key={clip.id}
                clip={clip}
                record={byId.get(clip.recordId)}
                state={clipStates[clip.id]}
                width={layout.blocks[index]?.width ?? 0}
                pps={layout.pps}
                index={index}
                total={clips.length}
                onRemove={onRemove}
                onRepaired={onRepaired}
              />
            ))}
          </div>

          {layout.totalSeconds > 0 && (
            <div
              data-testid="track-playhead"
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-30"
              style={{ left: playheadX }}
            >
              <span className="absolute -left-px inset-y-0 w-0.5 bg-[var(--neon-cyan)]" />
              <span className="absolute -left-[5px] top-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-[var(--neon-cyan)]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
