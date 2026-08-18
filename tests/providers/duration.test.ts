import { describe, expect, it } from 'vitest';

import { modelsFor, resolveDuration } from '@/lib/providers/catalog';

/**
 * Runware rejected a 5-second LTX-2 Fast clip in production with "Supported
 * values are: '6', '8', '10'". Lengths are per model, so they are whitelisted
 * in the catalog and snapped before the request leaves.
 */
describe('per-model durations', () => {
  it('snaps an unsupported length to the nearest one the model takes', () => {
    expect(resolveDuration('runware', 'lightricks:ltx@2.5-fast', 5)).toBe(6);
    expect(resolveDuration('runware', 'lightricks:ltx@2.5-fast', 9)).toBe(8);
    expect(resolveDuration('runware', 'lightricks:ltx@2.5-fast', 30)).toBe(20);
  });

  it('keeps a supported length untouched', () => {
    expect(resolveDuration('runware', 'lightricks:ltx@2.5-fast', 8)).toBe(8);
    expect(resolveDuration('comet', 'seedance-2-5', 20)).toBe(20);
  });

  it('omits the field for a model that counts frames instead of seconds', () => {
    // Atlas LTX 2.3 Quality takes num_frames; sending duration is meaningless.
    expect(resolveDuration('atlas', 'ltx-2.3-quality/text-to-video', 6)).toBeUndefined();
  });

  it('falls back to the model default when nothing is requested', () => {
    expect(resolveDuration('runware', 'lightricks:ltx@2.5-fast')).toBe(6);
  });

  it('only offers lengths the vendor documents', () => {
    const ltx = modelsFor('runware', 'video').find((model) => model.id === 'lightricks:ltx@2.5-fast');
    expect(ltx?.durations).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
    const wan = modelsFor('runware', 'video').find((model) => model.id === 'alibaba:wan@2.6-flash');
    // Documented range is 2–15; every offered stop has to sit inside it.
    expect(wan?.durations?.every((seconds) => seconds >= 2 && seconds <= 15)).toBe(true);
  });
});
