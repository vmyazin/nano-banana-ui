import { describe, expect, it } from 'vitest';

import {
  MAX_FILMSTRIP_FRAMES,
  MIN_FILMSTRIP_FRAMES,
  filmstripFrameCount,
  filmstripSampleTimes,
  filmstripTileWidth,
  filmstripTiles,
} from '../../lib/timeline/filmstrip';

/**
 * The strip's arithmetic is what makes position along a block mean position in
 * the clip. The decode around it is best-effort decoration; this is the part
 * that has to be right, so it is the part that is pure.
 */
describe('filmstripFrameCount', () => {
  it('samples roughly one frame per second and a half', () => {
    expect(filmstripFrameCount(9)).toBe(6);
  });

  it('keeps a short clip above the floor and a long one below the ceiling', () => {
    expect(filmstripFrameCount(1)).toBe(MIN_FILMSTRIP_FRAMES);
    expect(filmstripFrameCount(600)).toBe(MAX_FILMSTRIP_FRAMES);
  });

  it('asks for nothing when the duration is unknown', () => {
    expect(filmstripFrameCount(0)).toBe(0);
    expect(filmstripFrameCount(Number.NaN)).toBe(0);
    expect(filmstripFrameCount(Infinity)).toBe(0);
  });
});

describe('filmstripSampleTimes', () => {
  it('samples slice centres, so neither end frame is spent on a fade', () => {
    // 4s at the 4-frame floor → centres of four 1s slices.
    expect(filmstripSampleTimes(4)).toEqual([0.5, 1.5, 2.5, 3.5]);
  });

  it('stays inside the clip', () => {
    const times = filmstripSampleTimes(10);
    expect(times[0]).toBeGreaterThan(0);
    expect(times[times.length - 1]).toBeLessThan(10);
  });
});

describe('filmstripTileWidth', () => {
  it('holds the source aspect at strip height', () => {
    expect(filmstripTileWidth({ width: 1920, height: 1080 })).toBe(114);
    expect(filmstripTileWidth({ width: 1080, height: 1920 })).toBe(36);
  });

  it('falls back to 16:9 when the source never reported its size', () => {
    expect(filmstripTileWidth({ width: 0, height: 0 })).toBe(114);
  });
});

describe('filmstripTiles', () => {
  const times = filmstripSampleTimes(12); // 8 frames, centres 0.75s apart

  it('walks the clip left to right across the block', () => {
    const tiles = filmstripTiles({
      blockWidth: 800,
      tileWidth: 100,
      trim: { start: 0, end: 12 },
      times,
    });
    expect(tiles).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('leaves a partial tile at the end for the block to clip', () => {
    // 850px of 100px tiles is 8 full tiles and a sliver — nine in total, the
    // last one overflowing, rather than nine squeezed to 94.4px each.
    const tiles = filmstripTiles({
      blockWidth: 850,
      tileWidth: 100,
      trim: { start: 0, end: 12 },
      times,
    });
    expect(tiles).toHaveLength(9);
  });

  it('re-tiles a trimmed clip from the same frames', () => {
    // The back half of the source in half the width: same strip, later frames.
    const tiles = filmstripTiles({
      blockWidth: 400,
      tileWidth: 100,
      trim: { start: 6, end: 12 },
      times,
    });
    expect(tiles).toEqual([4, 5, 6, 7]);
    expect(times[tiles[0]]).toBeGreaterThanOrEqual(6);
  });

  it('repeats a frame rather than going blank when the block outruns the strip', () => {
    const tiles = filmstripTiles({
      blockWidth: 600,
      tileWidth: 100,
      trim: { start: 0, end: 0.4 },
      times,
    });
    expect(tiles).toHaveLength(6);
    expect(new Set(tiles).size).toBeLessThan(tiles.length);
  });

  it('draws nothing before any frame has been sampled', () => {
    expect(filmstripTiles({ blockWidth: 800, tileWidth: 100, trim: { start: 0, end: 12 }, times: [] })).toEqual([]);
    expect(filmstripTiles({ blockWidth: 0, tileWidth: 100, trim: { start: 0, end: 12 }, times })).toEqual([]);
  });
});
