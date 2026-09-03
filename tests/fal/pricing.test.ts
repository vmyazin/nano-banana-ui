import { describe, expect, it } from 'vitest';

import { falDurationSeconds, falUnitQuantity } from '@/lib/fal/pricing';

describe('falUnitQuantity', () => {
  it('bills one unit for per-image, per-video, and per-request endpoints', () => {
    expect(falUnitQuantity('image')).toBe(1);
    expect(falUnitQuantity('video')).toBe(1);
    expect(falUnitQuantity('request')).toBe(1);
  });
  it('bills the duration for per-second endpoints, and nothing without one', () => {
    expect(falUnitQuantity('second', 8)).toBe(8);
    expect(falUnitQuantity('seconds', 8)).toBe(8);
    expect(falUnitQuantity('second')).toBeNull();
  });
  it('refuses units it cannot count', () => {
    expect(falUnitQuantity('megapixel')).toBeNull();
  });
});

describe('falDurationSeconds', () => {
  it('reads numeric and "8s"-style duration controls', () => {
    expect(falDurationSeconds({ duration: 5 })).toBe(5);
    expect(falDurationSeconds({ duration: '8s' })).toBe(8);
    expect(falDurationSeconds({ duration: '10' })).toBe(10);
  });
  it('returns nothing for a missing or unusable value', () => {
    expect(falDurationSeconds({})).toBeUndefined();
    expect(falDurationSeconds({ duration: 'long' })).toBeUndefined();
    expect(falDurationSeconds({ duration: 0 })).toBeUndefined();
  });
});
