'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * How tall the track band is in the fixed editor shell, and the drag that
 * changes it.
 *
 * The shell spends its height in three bands — toolbar, viewer row, track — and
 * only one of them can be elastic. The viewer is the elastic one (it shrinks to
 * whatever is left, which is what keeps the track on screen at every viewport
 * ratio), so the *track* is the band that carries a number, and this is it.
 *
 * Persisted to localStorage rather than to `useTimelineStore`: that store's
 * persisted shape is the user's project — clips, trims, output format — and a
 * pane height is a property of the window you happen to be editing in, not of
 * the timeline you would send to someone else.
 */

const STORAGE_KEY = 'scene-assembly:timeline-track-height';

/**
 * The default band. Sized from what the track actually stacks: the zoom row
 * (~28), the ruler (24), a filmstrip worth looking at (~64), the block's
 * caption with its fit control (~42), the card's padding (20), a horizontal
 * scrollbar (~15) and the band's own bottom margin (10). Set to 186 first,
 * which is what those add up to *without* the caption — so every block on the
 * track had its name and length clipped away by its own overflow.
 */
export const DEFAULT_TRACK_HEIGHT = 216;
/**
 * Below this the ruler and the filmstrip stop coexisting and the band becomes a
 * scrollbar with ambitions. Dragging stops here rather than letting the track
 * collapse to nothing — a collapsed track is the bug this whole layout exists
 * to prevent, so it must not be reachable by accident.
 */
export const MIN_TRACK_HEIGHT = 176;
/**
 * What everything above the splitter is always left, measured from the window
 * rather than from the shell: the app header (~68px) plus enough for the viewer
 * to show a 16:9 frame and its transport row rather than a sliver. The track
 * may grow, but never by making the thing it is a timeline *of* unusable.
 */
const MIN_BAND_ABOVE = 328;

function clamp(height: number, viewportHeight: number): number {
  const max = Math.max(MIN_TRACK_HEIGHT, viewportHeight - MIN_BAND_ABOVE);
  return Math.min(Math.max(Math.round(height), MIN_TRACK_HEIGHT), max);
}

/**
 * Read synchronously on mount via the lazy initializer. Safe without an SSR
 * guard for the same reason `TimelineWorkspace` reads `matchMedia` that way:
 * this only ever loads inside a component imported with `ssr: false`. A private
 * window, cleared site data or a browser refusing storage all land on the
 * default rather than throwing.
 */
function storedHeight(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_TRACK_HEIGHT;
    return clamp(parsed, window.innerHeight);
  } catch {
    return DEFAULT_TRACK_HEIGHT;
  }
}

export interface TrackHeightControl {
  height: number;
  /** Spread onto the splitter element. */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Keyboard resize — the splitter is a real separator, not a pointer-only grab. */
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  /** True while a drag is in flight, so the shell can suppress transitions. */
  dragging: boolean;
  min: number;
  max: number;
}

export function useTrackHeight(): TrackHeightControl {
  const [height, setHeight] = useState(storedHeight);
  const [dragging, setDragging] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  // The baseline the whole drag is computed from, captured at pointerdown —
  // the same rule the trim handles follow. Accumulating deltas across renders
  // drifts, and a clamped value would feed its own clamp back into the next
  // move, so the pointer would stop tracking the splitter once it hit a bound.
  const baselineRef = useRef<{ pointerY: number; height: number } | null>(null);

  // A window that got shorter can leave a stored height taller than the space
  // that exists, which would push the viewer band below its floor.
  useEffect(() => {
    const onResize = () => {
      setViewportHeight(window.innerHeight);
      setHeight((current) => clamp(current, window.innerHeight));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persist = useCallback((value: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* storage refused — the height still works for this session */
    }
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    baselineRef.current = { pointerY: event.clientY, height: 0 };
    setDragging(true);
    // Read the committed height through the setter so the baseline is the
    // value actually on screen, not one closed over from an older render.
    setHeight((current) => {
      baselineRef.current = { pointerY: event.clientY, height: current };
      return current;
    });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* no pointer capture — the drag still tracks through bubbling */
    }
  }, []);

  // Attached to the window rather than the splitter: a fast drag outruns a
  // 11px-tall element, and pointer capture is not available everywhere.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const baseline = baselineRef.current;
      if (!baseline) return;
      // Dragging *up* grows the track, which is why the delta is inverted.
      setHeight(clamp(baseline.height + (baseline.pointerY - event.clientY), window.innerHeight));
    };
    const onUp = () => {
      baselineRef.current = null;
      setDragging(false);
      setHeight((current) => {
        persist(current);
        return current;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, persist]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      setHeight((current) => {
        const next = clamp(current + direction * (event.shiftKey ? 48 : 12), window.innerHeight);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return {
    height,
    onPointerDown,
    onKeyDown,
    dragging,
    min: MIN_TRACK_HEIGHT,
    max: Math.max(MIN_TRACK_HEIGHT, viewportHeight - MIN_BAND_ABOVE),
  };
}
