'use client';

import { Scissors } from 'lucide-react';

import { formatDuration } from '@/lib/timeline/format';
import { MIN_TRIMMED_SECONDS, isTrimmed, resolveTrim } from '@/lib/timeline/trim';
import { useTimelineStore, type TimelineClip } from '@/store/useTimelineStore';

interface TimelineTrimControlProps {
  clip: TimelineClip;
  /** The source's own length; the points are clamped to it. */
  sourceDuration: number;
  /** The track's blocks are narrow, so it asks for the tighter arrangement. */
  compact?: boolean;
}

/**
 * In and out points as two range sliders rather than draggable handles on the
 * block itself.
 *
 * Handles would be the richer gesture and are also a pointer-only one, on a
 * surface that is often 100px wide. Two ranges are operable by keyboard,
 * announce themselves, and fit the same row as the fit toggle — and they carry
 * the one number that matters (what the clip now runs for) as text beside them,
 * which a handle never does.
 */
export default function TimelineTrimControl({
  clip,
  sourceDuration,
  compact = false,
}: TimelineTrimControlProps) {
  const { start, end } = resolveTrim(clip, sourceDuration);
  const trimmed = isTrimmed(clip, sourceDuration);
  const step = 0.1;

  const setTrim = (next: { start?: number; end?: number }) =>
    useTimelineStore.getState().setTrim(clip.id, {
      start: next.start ?? start,
      end: next.end ?? end,
    });

  return (
    <div className={`space-y-1 ${compact ? 'text-[0.6rem]' : 'text-[0.7rem]'}`}>
      <div className="flex items-center justify-between gap-2 text-[var(--foreground-muted)]">
        <span className="inline-flex items-center gap-1">
          <Scissors size={compact ? 10 : 11} className="shrink-0" aria-hidden />
          Trim
        </span>
        {/* Only the source length. The trimmed length is already printed as
            the block's own duration directly above this, and saying it twice
            invites the two to disagree. */}
        {trimmed && (
          <span className="tabular-nums text-[var(--foreground-subtle)]">
            of {formatDuration(sourceDuration)}
          </span>
        )}
      </div>

      <label className="flex items-center gap-1.5">
        <span className="w-6 shrink-0 text-[var(--foreground-subtle)]">In</span>
        <input
          type="range"
          min={0}
          // Never past the out-point: the two sliders bound each other, so a
          // collapsed clip cannot be produced by dragging.
          max={Math.max(0, end - MIN_TRIMMED_SECONDS)}
          step={step}
          value={start}
          aria-label="Trim start, seconds"
          onChange={(event) => setTrim({ start: Number(event.target.value) })}
          className="h-1 min-w-0 flex-1"
        />
        <span className="w-8 shrink-0 tabular-nums text-right text-[var(--foreground-subtle)]">
          {start.toFixed(1)}s
        </span>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="w-6 shrink-0 text-[var(--foreground-subtle)]">Out</span>
        <input
          type="range"
          min={Math.min(sourceDuration, start + MIN_TRIMMED_SECONDS)}
          max={sourceDuration}
          step={step}
          value={end}
          aria-label="Trim end, seconds"
          onChange={(event) => setTrim({ end: Number(event.target.value) })}
          className="h-1 min-w-0 flex-1"
        />
        <span className="w-8 shrink-0 tabular-nums text-right text-[var(--foreground-subtle)]">
          {end.toFixed(1)}s
        </span>
      </label>

      {trimmed && (
        <button
          type="button"
          onClick={() => useTimelineStore.getState().setTrim(clip.id, {})}
          className="text-[var(--neon-cyan)] underline-offset-2 hover:underline"
        >
          Use the whole clip
        </button>
      )}
    </div>
  );
}
