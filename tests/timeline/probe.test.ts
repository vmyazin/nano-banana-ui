import { describe, expect, it } from 'vitest';

import { COMMON_RATES, snapFramerate } from '../../lib/timeline/probe';

describe('snapFramerate', () => {
  it('snaps a measured rate onto the nearest common rate', () => {
    expect(snapFramerate(23.9761)).toBe(23.976);
    expect(snapFramerate(30.0001)).toBe(30);
    expect(snapFramerate(24.9)).toBe(25);
    expect(snapFramerate(59.9)).toBe(59.94);
  });

  it.each([
    [24, 24000 / 1001, 23.976],
    [30, 30000 / 1001, 29.97],
    [60, 60000 / 1001, 59.94],
  ])('keeps exact %s distinct from its fractional neighbour', (integer, measured, fractional) => {
    expect(snapFramerate(integer)).toBe(integer);
    expect(snapFramerate(measured)).toBe(fractional);
    expect(snapFramerate(integer)).not.toBe(snapFramerate(measured));
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

  it.each(COMMON_RATES)('preserves the standard rate %s', (rate) => {
    expect(snapFramerate(rate)).toBe(rate);
  });
});
