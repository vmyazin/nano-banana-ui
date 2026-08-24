'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import type { ClipDimensions } from '@/lib/timeline/derive-output';
import {
  filmstripSnapshot,
  filmstripTileWidth,
  filmstripTiles,
  requestFilmstrip,
  subscribeFilmstrip,
  type Filmstrip,
} from '@/lib/timeline/filmstrip';

interface TimelineFilmstripProps {
  /** Cache key: the *record*, not the placement — two placements of one clip
   *  share a strip and only differ in how they tile it. */
  recordId: string;
  blob: Blob;
  dimensions: ClipDimensions;
  /** The clip's trim, in source seconds. Two numbers rather than the `{ start,
   *  end }` the rest of the timeline passes around: a fresh object every render
   *  would defeat the tiling memo below, which is the whole point of it. */
  trimStart: number;
  trimEnd: number;
  /** The block's width in px — its trimmed duration on the track's scale. */
  blockWidth: number;
  /** Drawn until the first real frame lands, so the block is never empty — the
   *  block's own still, which is also what it keeps forever if this browser
   *  cannot decode the source. */
  fallback: ReactNode;
}

/**
 * The row of stills across a track block.
 *
 * It fills in progressively: frames decode in time order, and each one that
 * lands re-renders only this strip. Until the first arrives the block keeps the
 * poster it has always shown, so a browser that cannot decode the source — or a
 * test environment with no canvas — degrades to exactly the previous behaviour
 * rather than to a blank block.
 */
export default function TimelineFilmstrip({
  recordId,
  blob,
  dimensions,
  trimStart,
  trimEnd,
  blockWidth,
  fallback,
}: TimelineFilmstripProps) {
  const strip = useSyncExternalStore<Filmstrip>(
    useCallback((listener) => subscribeFilmstrip(recordId, listener), [recordId]),
    useCallback(() => filmstripSnapshot(recordId), [recordId]),
    useCallback(() => filmstripSnapshot(recordId), [recordId])
  );

  useEffect(() => {
    requestFilmstrip(recordId, blob, dimensions.durationSeconds);
  }, [recordId, blob, dimensions.durationSeconds]);

  const tileWidth = useMemo(() => filmstripTileWidth(dimensions), [dimensions]);
  const tiles = useMemo(
    () =>
      filmstripTiles({
        blockWidth,
        tileWidth,
        trim: { start: trimStart, end: trimEnd },
        times: strip.times,
      }),
    [blockWidth, tileWidth, trimStart, trimEnd, strip.times]
  );

  if (!strip.frames.some(Boolean)) return <>{fallback}</>;

  return (
    <div aria-hidden data-testid="clip-filmstrip" className="flex h-full w-full">
      {tiles.map((frameIndex, tile) => {
        const frame = strip.frames[frameIndex];
        return (
          <span
            key={tile}
            style={{ width: tileWidth }}
            // `flex-none` plus the parent's overflow is what clips the last
            // tile at the block's edge instead of squeezing every tile to fit.
            className="relative block h-full flex-none overflow-hidden border-r border-black/40 last:border-r-0"
          >
            {frame ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={frame}
                alt=""
                draggable={false}
                className="h-full w-full select-none object-cover"
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
