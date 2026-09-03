import { describe, expect, it } from 'vitest';

import { geminiResolutionCost, geminiTokenCost, KIE_USD_PER_CREDIT } from '@/lib/spend/rates';

describe('Gemini image rates', () => {
  it('prices output tokens at the published rate', () => {
    expect(geminiTokenCost(0, 1120)).toBeCloseTo(0.1344, 6);
    expect(geminiTokenCost(0, 2000)).toBeCloseTo(0.24, 6);
  });

  it('adds input tokens at the input rate', () => {
    expect(geminiTokenCost(560, 0)).toBeCloseTo(0.00112, 6);
  });

  it('estimates a resolution the same way the studio always has', () => {
    expect(geminiResolutionCost('1K', 0)).toBeCloseTo(0.1344, 6);
    expect(geminiResolutionCost('2K', 0)).toBeCloseTo(0.1344, 6);
    expect(geminiResolutionCost('4K', 2)).toBeCloseTo(0.24 + 2 * 0.00112, 6);
    expect(geminiResolutionCost(undefined, 0)).toBeCloseTo(0.1344, 6);
  });

  it('never returns a negative or non-finite figure', () => {
    expect(geminiTokenCost(Number.NaN, -5)).toBe(0);
  });

  it('publishes the Kie credit rate', () => {
    expect(KIE_USD_PER_CREDIT).toBe(0.005);
  });
});
