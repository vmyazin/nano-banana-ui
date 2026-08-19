import { describe, expect, it } from 'vitest';

import {
  FALLBACK_TRACK_WIDTH,
  MAX_PPS,
  MIN_PPS,
  MIN_TIMED_BLOCK_WIDTH,
  UNTIMED_BLOCK_WIDTH,
  buildTrackLayout,
  computePps,
  rulerTicks,
  timeToX,
  xToTime,
} from '../../lib/timeline/scale';

/**
 * The whole point of the editor-style track is that pixels mean seconds:
 * every widget on it — blocks, ruler, playhead, scrub — reads through this
 * one mapping, so it is the part that has to be exactly right.
 */
describe('computePps', () => {
  it('fits the timeline to the available width', () => {
    // 10s into 1000px → 100 px/s.
    expect(computePps([{ id: 'a', seconds: 10 }], 1000)).toBe(100);
  });

  it('never drops below the readable floor for a long timeline', () => {
    expect(computePps([{ id: 'a', seconds: 10_000 }], 1000)).toBe(MIN_PPS);
  });

  it('never stretches a short timeline past the ceiling', () => {
    expect(computePps([{ id: 'a', seconds: 1 }], 1000)).toBe(MAX_PPS);
  });

  it('keeps the shortest clip grabbable even when that means scrolling', () => {
    // A 0.5s clip at MIN_PPS would be 12px — under the grabbable floor, so
    // the floor wins and the track scrolls instead.
    const pps = computePps(
      [
        { id: 'a', seconds: 0.5 },
        { id: 'b', seconds: 1000 },
      ],
      1000
    );
    expect(pps).toBe(MIN_TIMED_BLOCK_WIDTH / 0.5);
  });

  it('reserves the untimed blocks’ width before dividing the rest', () => {
    const pps = computePps(
      [
        { id: 'a', seconds: 10 },
        { id: 'b', seconds: null },
      ],
      1000
    );
    expect(pps).toBe((1000 - UNTIMED_BLOCK_WIDTH) / 10);
  });

  it('falls back to a sane width when nothing has been measured', () => {
    expect(computePps([{ id: 'a', seconds: 10 }], 0)).toBe(FALLBACK_TRACK_WIDTH / 10);
  });
});

describe('buildTrackLayout', () => {
  it('gives timed blocks duration-proportional widths and untimed ones the fixed width', () => {
    const layout = buildTrackLayout(
      [
        { id: 'a', seconds: 2 },
        { id: 'b', seconds: null },
        { id: 'c', seconds: 6 },
      ],
      800
    );
    const [a, b, c] = layout.blocks;
    expect(c.width).toBe(a.width * 3);
    expect(b.width).toBe(UNTIMED_BLOCK_WIDTH);
    expect(layout.width).toBe(a.width + b.width + c.width);
    expect(layout.totalSeconds).toBe(8);
  });

  it('lays the playback clock over timed blocks only', () => {
    const layout = buildTrackLayout(
      [
        { id: 'a', seconds: 2 },
        { id: 'b', seconds: null },
        { id: 'c', seconds: 6 },
      ],
      800
    );
    // The clock runs 0..2 in block a, then 2..8 in block c — the untimed
    // block occupies pixels but no time, exactly like the preview's sequence.
    expect(layout.blocks[0].start).toBe(0);
    expect(layout.blocks[1].start).toBeNull();
    expect(layout.blocks[2].start).toBe(2);
  });
});

describe('timeToX / xToTime', () => {
  const layout = buildTrackLayout(
    [
      { id: 'a', seconds: 2 },
      { id: 'b', seconds: null },
      { id: 'c', seconds: 6 },
    ],
    800
  );

  it('round-trips instants inside clips', () => {
    for (const time of [0, 1, 2.5, 7.9]) {
      expect(xToTime(layout, timeToX(layout, time))).toBeCloseTo(time);
    }
  });

  it('hops the boundary instant over the untimed block', () => {
    // t=2 is both the end of a and the start of c; the playhead lands on c's
    // left edge rather than parking inside pixels that mean nothing.
    expect(timeToX(layout, 2)).toBe(layout.blocks[2].x);
  });

  it('maps a click inside an untimed block to the instant at its far edge', () => {
    const untimed = layout.blocks[1];
    expect(xToTime(layout, untimed.x + untimed.width / 2)).toBe(2);
  });

  it('clamps both directions to the playable range', () => {
    expect(timeToX(layout, -5)).toBe(0);
    expect(timeToX(layout, 100)).toBe(layout.width);
    expect(xToTime(layout, -50)).toBe(0);
    expect(xToTime(layout, layout.width + 50)).toBe(8);
  });

  it('degrades to zero when nothing on the track is playable yet', () => {
    const empty = buildTrackLayout([{ id: 'a', seconds: null }], 800);
    expect(timeToX(empty, 3)).toBe(0);
    expect(xToTime(empty, 60)).toBe(0);
  });
});

describe('rulerTicks', () => {
  it('starts at zero and labels whole seconds as m:ss', () => {
    const layout = buildTrackLayout([{ id: 'a', seconds: 8 }], 800);
    const ticks = rulerTicks(layout);
    expect(ticks[0]).toMatchObject({ time: 0, x: 0, label: '0:00' });
    expect(ticks.map((tick) => tick.label)).toContain('0:01');
  });

  it('widens the interval as the scale shrinks so labels stay readable', () => {
    // 800s at the MIN_PPS floor: 1s ticks would be 24px apart — unreadable —
    // so the interval steps up until labels clear the spacing floor.
    const layout = buildTrackLayout([{ id: 'a', seconds: 800 }], 800);
    const ticks = rulerTicks(layout);
    const spacing = ticks[1].x - ticks[0].x;
    expect(spacing).toBeGreaterThanOrEqual(72);
    expect(ticks[ticks.length - 1].time).toBeLessThanOrEqual(800);
  });

  it('has no ticks for a track with no playable time', () => {
    expect(rulerTicks(buildTrackLayout([{ id: 'a', seconds: null }], 800))).toEqual([]);
  });
});
