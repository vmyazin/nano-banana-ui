import type { TimelineClip } from '@/store/useTimelineStore';

/**
 * Where a clip starts and stops inside its source.
 *
 * Both are absolute times in the source, in seconds — not offsets from each
 * other — because that is what every consumer needs: the preview seeks to the
 * in-point, ffmpeg wants `-ss`/`-to`, and the browser engine offsets its frame
 * grid by it. Storing a length instead would make each of them do the same
 * subtraction, differently.
 *
 * Absent means "the whole clip", so an untrimmed timeline carries no trim data
 * at all and older saved timelines keep working untouched.
 */
export interface TrimRange {
  start: number;
  end: number;
}

/** A clip shorter than this cannot be scrubbed to accurately, or seen. */
export const MIN_TRIMMED_SECONDS = 0.1;

/**
 * The in and out points to actually use, clamped to the source.
 *
 * Every stored value is treated as a suggestion: a source can come back shorter
 * than it was when the trim was set (a repaired clip is a *different* file), and
 * an out-point past the end would ask ffmpeg for frames that do not exist.
 */
export function resolveTrim(clip: Pick<TimelineClip, 'trimStart' | 'trimEnd'>, sourceDuration: number): TrimRange {
  const duration = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : 0;
  const start = clampToSource(clip.trimStart, duration, 0);
  const endCandidate = clampToSource(clip.trimEnd, duration, duration);
  // An out-point at or before the in-point is not a clip; give back the tail.
  const end = endCandidate > start + MIN_TRIMMED_SECONDS ? endCandidate : duration;
  return { start: end > start ? start : 0, end };
}

function clampToSource(value: number | undefined, duration: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.min(value, duration);
}

/** How long this clip runs on the timeline, after trimming. */
export function trimmedDuration(
  clip: Pick<TimelineClip, 'trimStart' | 'trimEnd'>,
  sourceDuration: number
): number {
  const { start, end } = resolveTrim(clip, sourceDuration);
  return Math.max(0, end - start);
}

/** True when this clip is showing less than its whole source. */
export function isTrimmed(
  clip: Pick<TimelineClip, 'trimStart' | 'trimEnd'>,
  sourceDuration: number
): boolean {
  const { start, end } = resolveTrim(clip, sourceDuration);
  return start > 0 || end < sourceDuration - 1e-6;
}
