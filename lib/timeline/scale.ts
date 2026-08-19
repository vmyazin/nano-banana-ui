/**
 * The track's mapping between seconds and pixels.
 *
 * An editor-style track is a linear time axis: a clip's width is its trimmed
 * duration times one shared pixels-per-second, the ruler's ticks and the
 * playhead's position are the same multiplication, and scrubbing is its
 * inverse. All of it is arithmetic, so it lives here as pure functions the
 * same way playback.ts holds the clock math — the component only draws.
 *
 * One wrinkle keeps the mapping honest: a clip that is still loading, or
 * unavailable, has no duration. It still needs a visible block, so it gets a
 * fixed pixel width that represents *no* time — the axis simply skips over
 * it. `timeToX`/`xToTime` are therefore piecewise over the block layout
 * rather than a bare multiply.
 */

export interface TrackBlockInput {
  id: string;
  /** Trimmed duration in seconds, or null for a block that carries no time (loading / unavailable). */
  seconds: number | null;
}

export interface TrackBlockLayout {
  id: string;
  x: number;
  width: number;
  /** Where this block starts on the playback clock; null for an untimed block. */
  start: number | null;
  seconds: number | null;
}

export interface TrackLayout {
  blocks: TrackBlockLayout[];
  /** Total content width in px, including untimed blocks. */
  width: number;
  /** Total playable seconds — matches buildSequence's total for the same clips. */
  totalSeconds: number;
  pps: number;
}

/** Below this the ruler is unreadable and clips are unclickable slivers. */
export const MIN_PPS = 24;
/** Above this a short timeline stretches into a parody of itself. */
export const MAX_PPS = 160;
/** Any clip must stay wide enough to grab its trim handles. */
export const MIN_TIMED_BLOCK_WIDTH = 56;
/** A loading or unavailable block: enough room for its message, no time. */
export const UNTIMED_BLOCK_WIDTH = 132;
/** When nothing has been measured yet (jsdom, first paint before the observer fires). */
export const FALLBACK_TRACK_WIDTH = 960;

/**
 * Fit-to-width, bounded: the timeline fills the container when it can, scrolls
 * when it cannot, and never lets the shortest clip collapse below grabbable.
 */
export function computePps(blocks: TrackBlockInput[], availableWidth: number): number {
  const width = availableWidth > 0 ? availableWidth : FALLBACK_TRACK_WIDTH;
  const timed = blocks.filter(
    (block): block is TrackBlockInput & { seconds: number } =>
      typeof block.seconds === 'number' && block.seconds > 0
  );
  if (timed.length === 0) return MIN_PPS;

  const totalSeconds = timed.reduce((sum, block) => sum + block.seconds, 0);
  const untimedWidth = (blocks.length - timed.length) * UNTIMED_BLOCK_WIDTH;
  const fit = (width - untimedWidth) / totalSeconds;
  const shortest = Math.min(...timed.map((block) => block.seconds));
  // The floor that keeps every clip grabbable wins over both clamps: a track
  // that scrolls is usable, a 4px clip is not.
  return Math.max(Math.min(Math.max(fit, MIN_PPS), MAX_PPS), MIN_TIMED_BLOCK_WIDTH / shortest);
}

export function buildTrackLayout(blocks: TrackBlockInput[], availableWidth: number): TrackLayout {
  const pps = computePps(blocks, availableWidth);
  const laid: TrackBlockLayout[] = [];
  let x = 0;
  let clock = 0;

  for (const block of blocks) {
    const timed = typeof block.seconds === 'number' && block.seconds > 0;
    const width = timed ? (block.seconds as number) * pps : UNTIMED_BLOCK_WIDTH;
    laid.push({
      id: block.id,
      x,
      width,
      start: timed ? clock : null,
      seconds: timed ? block.seconds : null,
    });
    x += width;
    if (timed) clock += block.seconds as number;
  }

  return { blocks: laid, width: x, totalSeconds: clock, pps };
}

/**
 * Where a playback instant falls on the track. A boundary maps to the *next*
 * timed block's left edge, so the playhead hops over an untimed block rather
 * than parking inside pixels that represent no time.
 */
export function timeToX(layout: TrackLayout, time: number): number {
  const timed = layout.blocks.filter((block) => block.start !== null);
  if (timed.length === 0) return 0;
  const clamped = Math.min(Math.max(time, 0), layout.totalSeconds);

  for (const block of timed) {
    const start = block.start as number;
    const seconds = block.seconds as number;
    if (clamped < start + seconds) return block.x + Math.max(0, clamped - start) * layout.pps;
  }
  const last = timed[timed.length - 1];
  return last.x + last.width;
}

/** The inverse: which instant a horizontal position points at, clamped to the playable range. */
export function xToTime(layout: TrackLayout, x: number): number {
  const timed = layout.blocks.filter((block) => block.start !== null);
  if (timed.length === 0) return 0;
  if (x <= timed[0].x) return 0;

  for (const block of timed) {
    if (x < block.x) return block.start as number; // inside an untimed gap before this block
    if (x < block.x + block.width) return (block.start as number) + (x - block.x) / layout.pps;
  }
  return layout.totalSeconds;
}

export interface RulerTick {
  time: number;
  x: number;
  label: string;
}

/** Label spacing the eye can read; the interval is the smallest that clears it. */
const MIN_TICK_SPACING_PX = 72;
const TICK_INTERVALS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

export function rulerTicks(layout: TrackLayout): RulerTick[] {
  if (layout.totalSeconds <= 0) return [];
  const interval =
    TICK_INTERVALS.find((candidate) => candidate * layout.pps >= MIN_TICK_SPACING_PX) ??
    TICK_INTERVALS[TICK_INTERVALS.length - 1];

  const ticks: RulerTick[] = [];
  for (let time = 0; time <= layout.totalSeconds + 1e-6; time += interval) {
    ticks.push({ time, x: timeToX(layout, time), label: formatTick(time) });
  }
  return ticks;
}

function formatTick(time: number): string {
  const whole = Math.floor(time);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  const fraction = time - whole;
  const base = `${minutes}:${String(seconds).padStart(2, '0')}`;
  return fraction > 1e-6 ? `${base}.${Math.round(fraction * 10)}` : base;
}
