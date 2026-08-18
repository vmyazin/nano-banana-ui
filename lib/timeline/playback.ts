/**
 * Laying the timeline's clips out on one clock.
 *
 * The preview plays several separate video files but has to behave like a
 * single piece: one scrubber, one duration, one position. That means every
 * point on the global timeline must map to a clip and an offset inside it,
 * and back again. All of that is arithmetic over durations, so it lives here
 * as pure functions rather than tangled into a component that also juggles
 * two media elements — it is the part worth testing exhaustively.
 */

export interface PlaybackClip {
  /** Placement id, not record id: the same clip can appear twice. */
  id: string;
  durationSeconds: number;
}

export interface PlaybackSegment {
  id: string;
  index: number;
  /** Inclusive start on the global timeline. */
  start: number;
  /** Exclusive end, except for the final segment where it is the total. */
  end: number;
  durationSeconds: number;
}

export interface PlaybackSequence {
  segments: PlaybackSegment[];
  total: number;
}

export interface PlaybackPosition {
  id: string;
  index: number;
  /** Offset within that clip. */
  localTime: number;
}

/**
 * A clip whose duration is unknown or nonsensical occupies no time rather than
 * poisoning the total with NaN. It still appears on the timeline; it simply
 * cannot be played through, which is the honest representation of a clip we
 * could not measure.
 */
function usableDuration(clip: PlaybackClip): number {
  const { durationSeconds } = clip;
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
}

export function buildSequence(clips: PlaybackClip[]): PlaybackSequence {
  const segments: PlaybackSegment[] = [];
  let cursor = 0;

  for (const clip of clips) {
    const durationSeconds = usableDuration(clip);
    // Zero-length segments would make `locate` ambiguous at their position —
    // two segments starting at the same instant, with no way to be inside
    // one. They are dropped from playback rather than represented.
    if (durationSeconds === 0) continue;

    segments.push({
      id: clip.id,
      index: segments.length,
      start: cursor,
      end: cursor + durationSeconds,
      durationSeconds,
    });
    cursor += durationSeconds;
  }

  return { segments, total: cursor };
}

/**
 * Which clip is playing at `globalTime`, and how far into it.
 *
 * A boundary belongs to the clip that starts there: at exactly the end of A,
 * playback is at the first frame of B. Anything past the end clamps to the
 * final frame rather than returning null, so a scrubber dragged to the far
 * right lands somewhere real instead of emptying the player.
 */
export function locate(sequence: PlaybackSequence, globalTime: number): PlaybackPosition | null {
  const { segments, total } = sequence;
  if (segments.length === 0) return null;

  if (!Number.isFinite(globalTime) || globalTime <= 0) {
    const first = segments[0];
    return { id: first.id, index: 0, localTime: 0 };
  }

  if (globalTime >= total) {
    const last = segments[segments.length - 1];
    return { id: last.id, index: last.index, localTime: last.durationSeconds };
  }

  // `end` is exclusive, so the boundary instant falls through to the next
  // segment — which is what makes the end of A and the start of B the same
  // moment rather than two.
  const segment = segments.find((candidate) => globalTime < candidate.end) ?? segments[0];
  return { id: segment.id, index: segment.index, localTime: globalTime - segment.start };
}

/** The inverse: where a position inside a clip sits on the global clock. */
export function globalTimeOf(sequence: PlaybackSequence, clipId: string, localTime: number): number {
  const segment = sequence.segments.find((candidate) => candidate.id === clipId);
  if (!segment) return 0;
  const offset = Number.isFinite(localTime) && localTime > 0 ? Math.min(localTime, segment.durationSeconds) : 0;
  return segment.start + offset;
}

