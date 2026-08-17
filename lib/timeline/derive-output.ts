import type { TimelineOutput } from '@/store/useTimelineStore';

export interface ClipDimensions {
  width: number;
  height: number;
  durationSeconds: number;
  /** Best-effort: only the demuxer can report it, and only for clips it can read. */
  fps?: number;
}

export type DerivedOutput = Omit<TimelineOutput, 'auto'>;

const FALLBACK: DerivedOutput = { width: 1920, height: 1080, fps: 30 };

/** Two decimals is enough to separate 16:9 from 4:3 without splitting 1918x1080 off. */
function aspectKey(clip: ClipDimensions) {
  return (clip.width / clip.height).toFixed(2);
}

/** The key with the most total duration; count is not the tiebreak, seconds are. */
function heaviest<T>(items: T[], key: (item: T) => string, weight: (item: T) => number) {
  const totals = new Map<string, number>();
  for (const item of items) {
    const w = weight(item);
    const clamped = Number.isFinite(w) && w > 0 ? w : 0;
    totals.set(key(item), (totals.get(key(item)) ?? 0) + clamped);
  }
  let best: string | null = null;
  let bestWeight = -Infinity;
  for (const [candidate, total] of totals) {
    if (total > bestWeight) {
      best = candidate;
      bestWeight = total;
    }
  }
  return best;
}

export function deriveOutputFormat(clips: ClipDimensions[]): DerivedOutput {
  const usable = clips.filter((clip) => clip.width > 0 && clip.height > 0);
  if (usable.length === 0) return { ...FALLBACK };

  const aspect = heaviest(usable, aspectKey, (clip) => clip.durationSeconds);
  const atAspect = usable.filter((clip) => aspectKey(clip) === aspect);

  const largest = atAspect.reduce((best, clip) =>
    clip.width * clip.height > best.width * best.height ? clip : best
  );

  const rated = usable.filter((clip) => typeof clip.fps === 'number' && clip.fps > 0);
  const fps = rated.length
    ? Number(heaviest(rated, (clip) => String(clip.fps), (clip) => clip.durationSeconds))
    : FALLBACK.fps;

  return { width: largest.width, height: largest.height, fps };
}
