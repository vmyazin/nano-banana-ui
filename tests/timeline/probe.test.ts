import { describe, expect, it } from 'vitest';

import { COMMON_RATES, snapFramerate } from '../../lib/timeline/probe';

/**
 * `snapFramerate` is the whole framerate feature's decision, and the only part
 * of the probe that can be tested here at all — the rest needs a demuxer and
 * real media, neither of which jsdom has.
 *
 * What it decides: `deriveOutputFormat` groups clips by `String(clip.fps)`, so
 * two clips shot at the same nominal rate must snap to the *same number* or
 * they split the vote and lose to a third. That is the entire justification for
 * probing framerate — an all-Veo timeline whose clips fail to agree falls back
 * to 30fps and gets the uneven 3:2 judder the feature exists to avoid.
 */
describe('snapFramerate', () => {
  it('snaps a measured rate onto the nearest common rate', () => {
    expect(snapFramerate(23.9761)).toBe(23.976);
    expect(snapFramerate(30.0001)).toBe(29.97);
    expect(snapFramerate(24.9)).toBe(25);
    expect(snapFramerate(59.9)).toBe(59.94);
  });

  it('puts 23.976 and 24 in the same bucket, so an all-Veo timeline votes together', () => {
    // The case the feature exists for. Two clips a container describes as
    // 23.976 and 24 are the same cadence; a snap that separated them would
    // split the vote between two buckets of one, and a third clip at any
    // other rate would then win the whole timeline.
    const twentyFour = snapFramerate(24);
    const ntsc = snapFramerate(23.976);

    expect(twentyFour).toBe(ntsc);
    // Which of the two it collapses onto is decided by COMMON_RATES's order
    // (first match wins) and matters only in that it is consistent — but it
    // is asserted so a reorder of that list is a deliberate change, not an
    // accidental one that silently re-times every export.
    expect(ntsc).toBe(23.976);
    expect(String(twentyFour)).toBe(String(ntsc));
  });

  it('collapses the other NTSC pairs the same way', () => {
    expect(snapFramerate(30)).toBe(snapFramerate(29.97));
    expect(snapFramerate(60)).toBe(snapFramerate(59.94));
  });

  it('does NOT snap a rate that is genuinely between common rates', () => {
    // 40fps is 33% away from 30 and 20% away from 48 — nowhere near the 2%
    // tolerance. Forcing it onto a neighbour would resample a clip that has a
    // perfectly good rate of its own.
    expect(snapFramerate(40)).toBe(40);
    expect(snapFramerate(37.5)).toBe(37.5);
    expect(snapFramerate(18)).toBe(18);
  });

  it('keeps two decimals for an unrecognised rate rather than an endless float', () => {
    // The value is used as a Map key via String(), so 40.123456789 and
    // 40.123456788 would be two buckets for one cadence.
    expect(snapFramerate(40.123456789)).toBe(40.12);
    expect(String(snapFramerate(40.126))).toBe('40.13');
  });

  it('applies the tolerance proportionally, not as a fixed number of frames', () => {
    // 2% of 120 is 2.4fps, so 118 snaps; 2% of 12 is 0.24fps, so 13 does not.
    expect(snapFramerate(118)).toBe(120);
    expect(snapFramerate(13)).toBe(13);
  });

  it('lists common rates in ascending order, which is what makes the first match the NTSC one', () => {
    // The snap picks the first entry within tolerance, so ordering is
    // behaviour, not presentation.
    expect([...COMMON_RATES].sort((a, b) => a - b)).toEqual(COMMON_RATES);
    expect(COMMON_RATES.indexOf(23.976)).toBeLessThan(COMMON_RATES.indexOf(24));
    expect(COMMON_RATES.indexOf(29.97)).toBeLessThan(COMMON_RATES.indexOf(30));
    expect(COMMON_RATES.indexOf(59.94)).toBeLessThan(COMMON_RATES.indexOf(60));
  });

  it('produces values deriveOutputFormat can group on, for every common rate', () => {
    // Round-trip: a clip measured at exactly a common rate must snap to that
    // same number, or a library of clean sources would vote against itself.
    for (const rate of COMMON_RATES) {
      expect(String(snapFramerate(rate))).toBe(String(snapFramerate(rate)));
      expect(COMMON_RATES).toContain(snapFramerate(rate));
    }
  });
});
