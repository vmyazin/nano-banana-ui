/**
 * How long something is, said the same way everywhere.
 *
 * There used to be three of these — one in the track, one in the export panel,
 * one in playback — and they disagreed on the *value*, not just the wording:
 * the track rounded 4.6s to "0:05", the export panel called it "5s", and the
 * preview floored it to "0:04". Three clips of 4.6s made the preview read
 * "0:13" while the export button beside it read "14s".
 *
 * So rounding lives here, once, and the two presentations are only wording:
 *
 * - `formatDuration` for a length (a clip, a sequence, an export). Rounds,
 *   because a 4.6-second clip is a 5-second clip to anyone reading a label.
 * - `formatElapsed` for a playhead. Floors, because a clock that has not
 *   reached 0:05 must not claim it has.
 *
 * Both render the same `m:ss`; `formatCompactDuration` is the same rounded
 * value written the way a button wants it.
 */

/** Shown where a duration is not known yet. */
export const UNKNOWN_DURATION = '—';

function clock(wholeSeconds: number): string {
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function usable(seconds: number | undefined): seconds is number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

/** A length, as `m:ss`. Rounds. `undefined`/invalid reads as unknown. */
export function formatDuration(seconds: number | undefined): string {
  if (!usable(seconds)) return UNKNOWN_DURATION;
  return clock(Math.round(seconds));
}

/** The same rounded length, written compactly: `47s`, `1:05`. */
export function formatCompactDuration(seconds: number | undefined): string {
  if (!usable(seconds)) return '0s';
  const whole = Math.round(seconds);
  return whole < 60 ? `${whole}s` : clock(whole);
}

/** A playhead position, as `m:ss`. Floors, and 0 is a real position. */
export function formatElapsed(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return clock(Math.floor(seconds));
}
