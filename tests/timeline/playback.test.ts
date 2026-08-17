import { describe, expect, it } from 'vitest';

import {
  buildSequence,
  formatClock,
  globalTimeOf,
  locate,
  type PlaybackClip,
} from '../../lib/timeline/playback';

const clips = (...durations: number[]): PlaybackClip[] =>
  durations.map((durationSeconds, index) => ({ id: `c${index}`, durationSeconds }));

describe('buildSequence', () => {
  it('lays clips end to end on one clock', () => {
    const { segments, total } = buildSequence(clips(4, 2, 6));
    expect(total).toBe(12);
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 6],
      [6, 12],
    ]);
  });

  it('is empty for an empty timeline rather than throwing', () => {
    expect(buildSequence([])).toEqual({ segments: [], total: 0 });
  });

  it('drops unmeasurable clips instead of poisoning the total', () => {
    // A NaN or zero duration would otherwise make every downstream number NaN,
    // or create two segments starting at the same instant.
    const { segments, total } = buildSequence([
      { id: 'a', durationSeconds: 3 },
      { id: 'bad', durationSeconds: Number.NaN },
      { id: 'zero', durationSeconds: 0 },
      { id: 'negative', durationSeconds: -5 },
      { id: 'b', durationSeconds: 2 },
    ]);
    expect(total).toBe(5);
    expect(segments.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('renumbers indices over the clips that survive', () => {
    const { segments } = buildSequence([
      { id: 'a', durationSeconds: 3 },
      { id: 'bad', durationSeconds: 0 },
      { id: 'b', durationSeconds: 2 },
    ]);
    expect(segments.map((s) => s.index)).toEqual([0, 1]);
  });
});

describe('locate', () => {
  const sequence = buildSequence(clips(4, 2, 6));

  it('finds the clip playing at a moment inside it', () => {
    expect(locate(sequence, 5)).toEqual({ id: 'c1', index: 1, localTime: 1 });
  });

  it('treats a boundary as the first frame of the next clip', () => {
    // The end of c0 and the start of c1 are the same instant, not two.
    expect(locate(sequence, 4)).toEqual({ id: 'c1', index: 1, localTime: 0 });
  });

  it('starts at the first clip for time zero', () => {
    expect(locate(sequence, 0)).toEqual({ id: 'c0', index: 0, localTime: 0 });
  });

  it('clamps past the end to the final frame rather than emptying the player', () => {
    expect(locate(sequence, 999)).toEqual({ id: 'c2', index: 2, localTime: 6 });
  });

  it('clamps a negative or NaN time to the start', () => {
    expect(locate(sequence, -3)).toEqual({ id: 'c0', index: 0, localTime: 0 });
    expect(locate(sequence, Number.NaN)).toEqual({ id: 'c0', index: 0, localTime: 0 });
  });

  it('returns nothing when there is nothing to play', () => {
    expect(locate(buildSequence([]), 0)).toBeNull();
  });

  it('round-trips against globalTimeOf at every boundary', () => {
    for (const segment of sequence.segments) {
      const position = locate(sequence, segment.start);
      expect(position).not.toBeNull();
      expect(globalTimeOf(sequence, position!.id, position!.localTime)).toBe(segment.start);
    }
  });
});

describe('globalTimeOf', () => {
  const sequence = buildSequence(clips(4, 2, 6));

  it('places an offset inside a clip on the global clock', () => {
    expect(globalTimeOf(sequence, 'c2', 1.5)).toBe(7.5);
  });

  it('never runs past the clip it belongs to', () => {
    expect(globalTimeOf(sequence, 'c1', 99)).toBe(6);
  });

  it('treats an unknown clip as the start rather than producing NaN', () => {
    expect(globalTimeOf(sequence, 'nope', 3)).toBe(0);
  });
});

describe('formatClock', () => {
  it('reads as minutes and seconds', () => {
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(64)).toBe('1:04');
    expect(formatClock(600)).toBe('10:00');
  });

  it('never shows a broken value for a broken input', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
