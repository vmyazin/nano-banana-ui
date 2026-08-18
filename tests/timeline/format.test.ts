import { describe, expect, it } from 'vitest';

import {
  UNKNOWN_DURATION,
  formatCompactDuration,
  formatDuration,
  formatElapsed,
} from '@/lib/timeline/format';

/**
 * The bug this module exists to prevent: three surfaces reading the same
 * number and printing three different answers. A 4.6s clip was "0:05" on its
 * block, "5s" on the export button, and floored to "0:04" in the preview
 * total — so three of them totalled "0:13" next to an "Export 14s" button.
 */
describe('duration formatting', () => {
  it('rounds a length, in both spellings, to the same second', () => {
    expect(formatDuration(4.6)).toBe('0:05');
    expect(formatCompactDuration(4.6)).toBe('5s');
    expect(formatDuration(13.8)).toBe('0:14');
    expect(formatCompactDuration(13.8)).toBe('14s');
  });

  it('agrees with itself on a whole timeline', () => {
    const total = 4.6 * 3;
    expect(formatDuration(total)).toBe('0:14');
    expect(formatCompactDuration(total)).toBe('14s');
  });

  it('floors a playhead, because a clock cannot claim a second it has not reached', () => {
    expect(formatElapsed(4.6)).toBe('0:04');
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(64.9)).toBe('1:04');
  });

  it('switches to m:ss past a minute', () => {
    expect(formatCompactDuration(59.4)).toBe('59s');
    expect(formatCompactDuration(60)).toBe('1:00');
    expect(formatCompactDuration(125)).toBe('2:05');
  });

  it('says so when a length is unknown, and never crashes on nonsense', () => {
    expect(formatDuration(undefined)).toBe(UNKNOWN_DURATION);
    expect(formatDuration(Number.NaN)).toBe(UNKNOWN_DURATION);
    expect(formatDuration(0)).toBe(UNKNOWN_DURATION);
    expect(formatCompactDuration(undefined)).toBe('0s');
    expect(formatElapsed(Number.NaN)).toBe('0:00');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});
