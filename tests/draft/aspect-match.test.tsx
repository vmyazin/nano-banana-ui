import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  candidatesFromSizes,
  candidatesFromValues,
  closestAspectCandidate,
  parseAspect,
  useAutoAspect,
} from '../../lib/draft/aspect-match';
import type { DraftReference } from '../../store/useDraftStore';

function reference(id: string, width?: number, height?: number): DraftReference {
  return {
    id,
    file: new File(['x'], `${id}.png`, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
    width,
    height,
  };
}

describe('parseAspect', () => {
  it.each([
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['1280x720', 1280 / 720],
    ['1280×720', 1280 / 720],
    ['auto', null],
    ['720p', null],
    ['0:9', null],
    ['landscape', null],
  ])('%s → %s', (value, expected) => {
    const ratio = parseAspect(value);
    if (expected === null) expect(ratio).toBeNull();
    else expect(ratio).toBeCloseTo(expected);
  });
});

describe('closestAspectCandidate', () => {
  const options = candidatesFromValues(['1:1', '16:9', '9:16', '21:9']);

  it('matches a portrait photo to the portrait option', () => {
    expect(closestAspectCandidate(1080, 1920, options)?.value).toBe('9:16');
  });

  it('matches a landscape photo to the landscape option', () => {
    expect(closestAspectCandidate(4032, 2268, options)?.value).toBe('16:9');
  });

  it('treats 2:1 and 1:2 as equally far from square (log-space distance)', () => {
    const square = candidatesFromValues(['1:1']);
    expect(closestAspectCandidate(200, 100, square)?.value).toBe('1:1');
    expect(closestAspectCandidate(100, 200, square)?.value).toBe('1:1');
  });

  it('returns null when nothing is parsable', () => {
    expect(closestAspectCandidate(100, 100, [])).toBeNull();
  });
});

describe('candidatesFromValues', () => {
  it('keeps only ratio-shaped strings', () => {
    expect(candidatesFromValues(['auto', '16:9', 1024, true]).map((c) => c.value)).toEqual(['16:9']);
  });
});

describe('candidatesFromSizes', () => {
  it('prefers published pixels, falls back to the label, skips bare presets', () => {
    const candidates = candidatesFromSizes([
      { label: 'HD (16:9)', width: 1280, height: 720 },
      { label: '720×1280' },
      { label: '720p', preset: '720p' },
    ]);
    expect(candidates.map((c) => c.value)).toEqual(['HD (16:9)', '720×1280']);
    expect(candidates[0].ratio).toBeCloseTo(16 / 9);
    expect(candidates[1].ratio).toBeCloseTo(9 / 16);
  });
});

describe('useAutoAspect', () => {
  const candidates = candidatesFromValues(['16:9', '9:16']);

  it('applies the match once the reference has dimensions', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ ref }: { ref: DraftReference | undefined }) => useAutoAspect(ref, candidates, apply),
      { initialProps: { ref: reference('a') as DraftReference | undefined } }
    );
    expect(apply).not.toHaveBeenCalled();

    // The measurement lands later, as it does in the store.
    rerender({ ref: reference('a', 1080, 1920) });
    expect(apply).toHaveBeenCalledExactlyOnceWith('9:16');
  });

  it('re-applies for a new reference, but not on unrelated re-renders', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ ref }: { ref: DraftReference }) => useAutoAspect(ref, candidates, apply),
      { initialProps: { ref: reference('a', 1080, 1920) } }
    );
    expect(apply).toHaveBeenCalledTimes(1);

    rerender({ ref: reference('a', 1080, 1920) });
    expect(apply).toHaveBeenCalledTimes(1);

    rerender({ ref: reference('b', 1920, 1080) });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith('16:9');
  });

  it('re-applies when the candidate list changes (model switch)', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ options }: { options: ReturnType<typeof candidatesFromValues> }) =>
        useAutoAspect(reference('a', 1080, 1920), options, apply),
      { initialProps: { options: candidates } }
    );
    expect(apply).toHaveBeenLastCalledWith('9:16');

    rerender({ options: candidatesFromValues(['1:1', '3:4']) });
    expect(apply).toHaveBeenLastCalledWith('3:4');
  });

  it('stays quiet without a reference or without a parsable candidate', () => {
    const apply = vi.fn();
    renderHook(() => useAutoAspect(undefined, candidates, apply));
    renderHook(() => useAutoAspect(reference('a', 100, 100), [], apply));
    expect(apply).not.toHaveBeenCalled();
  });
});
