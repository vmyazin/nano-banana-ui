import { useEffect, useRef } from 'react';

import type { ProviderSize } from '@/lib/providers/types';
import type { DraftReference } from '@/store/useDraftStore';

/**
 * One selectable option a workspace could snap to: the value it would write
 * into its control, and the aspect ratio that value stands for.
 */
export interface AspectCandidate {
  value: string;
  ratio: number;
}

/** '16:9', '9x16', '1280×720' → width/height. Null for 'auto', presets, etc. */
export function parseAspect(value: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

/** Select-option values ('16:9', 'auto', 1024, …) → the ratio-parsable subset. */
export function candidatesFromValues(values: Array<string | number | boolean>): AspectCandidate[] {
  const candidates: AspectCandidate[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const ratio = parseAspect(value);
    if (ratio !== null) candidates.push({ value, ratio });
  }
  return candidates;
}

/**
 * A provider's published size table → candidates keyed by label, which is what
 * the "Output size" select stores. Entries that publish neither pixels nor a
 * ratio-shaped label (a bare vendor preset) cannot be matched and are skipped.
 */
export function candidatesFromSizes(sizes: ProviderSize[]): AspectCandidate[] {
  const candidates: AspectCandidate[] = [];
  for (const size of sizes) {
    const ratio =
      size.width && size.height && size.width > 0 && size.height > 0
        ? size.width / size.height
        : parseAspect(size.label);
    if (ratio !== null) candidates.push({ value: size.label, ratio });
  }
  return candidates;
}

/**
 * The candidate whose ratio is closest to the image's, measured in log space
 * so that 2:1 and 1:2 sit at the same distance from square — a linear
 * difference would treat portrait ratios as all nearly alike.
 */
export function closestAspectCandidate(
  width: number,
  height: number,
  candidates: AspectCandidate[]
): AspectCandidate | null {
  if (width <= 0 || height <= 0) return null;
  const target = Math.log(width / height);
  let best: AspectCandidate | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.ratio) || candidate.ratio <= 0) continue;
    const distance = Math.abs(Math.log(candidate.ratio) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * Snaps a size-shaped control to the reference image the user just added.
 *
 * Fires when the driving reference (or its late-arriving measurement) changes,
 * and when the candidate list changes — a model switch publishes a different
 * whitelist, so the match is recomputed against it. It deliberately does NOT
 * fire on a manual control change: a pick made after the image was added is
 * the user overruling the guess, and it must stick.
 */
export function useAutoAspect(
  reference: DraftReference | undefined,
  candidates: AspectCandidate[],
  apply: (value: string) => void
) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  // Identity-stable key: candidates are rebuilt every render.
  const candidatesKey = candidates.map((candidate) => candidate.value).join('|');
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  const { id, width, height } = reference ?? {};
  useEffect(() => {
    if (!id || !width || !height) return;
    const matched = closestAspectCandidate(width, height, candidatesRef.current);
    if (matched) applyRef.current(matched.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- candidatesKey stands in for the candidates array
  }, [id, width, height, candidatesKey]);
}
