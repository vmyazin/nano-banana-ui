import { describe, expect, it } from 'vitest';

import { falRateLabel } from '@/lib/spend/rates';

/**
 * SA-05: the fal pickers listed Veo 3.1 and Kling 3 Pro by name alone, with no
 * way to stay inside a budget without leaving the app - while the ledger wrote
 * the figures down after every run.
 */
describe('falRateLabel', () => {
  it('names the per-image figure the report asked for', () => {
    // "$0.080 per image - a number the app already knows."
    expect(falRateLabel('fal-ai/nano-banana-2')).toBe('$0.06\u20130.16 / image');
  });

  it('gives a per-second range where audio and resolution move the rate', () => {
    expect(falRateLabel('fal-ai/veo3.1')).toBe('$0.2\u20130.6 / s');
  });

  it('collapses to one figure when the rate does not move', () => {
    expect(falRateLabel('fal-ai/kling-video/v3/pro/text-to-video')).toBe('$0.112\u20130.168 / s');
  });

  it('prices a flat per-clip model by the run', () => {
    expect(falRateLabel('fal-ai/minimax/hailuo-2.3/pro/text-to-video')).toBe('$0.49 / clip');
  });

  it('says nothing rather than guessing for an unlisted endpoint', () => {
    expect(falRateLabel('fal-ai/not-in-the-table')).toBeNull();
  });
});
