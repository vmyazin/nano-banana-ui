'use client';

import { useEffect, useRef, useState } from 'react';

/** One buffered span, in seconds on the source's own timeline. */
export interface BufferedRange {
  start: number;
  end: number;
}

export interface MediaState {
  playing: boolean;
  /** Seconds. */
  time: number;
  /** Seconds, or `0` when the element cannot yet say — see `readDuration`. */
  duration: number;
  volume: { level: number; muted: boolean };
  buffered: readonly BufferedRange[];
  ended: boolean;
}

const IDLE: MediaState = {
  playing: false,
  time: 0,
  duration: 0,
  volume: { level: 1, muted: false },
  buffered: [],
  ended: false,
};

/**
 * `duration` is `NaN` before metadata arrives and `Infinity` for a source with
 * no end. Both mean "not known yet" rather than a number, and both reach the
 * screen as `NaN:NaN` if they are formatted, so they collapse to zero here —
 * the one place that can see them — and the bar reserves its readout's width
 * instead of hiding it.
 */
const readDuration = (element: HTMLVideoElement) =>
  Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0;

const readBuffered = (element: HTMLVideoElement): BufferedRange[] => {
  const ranges: BufferedRange[] = [];
  const { buffered } = element;
  for (let index = 0; index < buffered.length; index += 1) {
    ranges.push({ start: buffered.start(index), end: buffered.end(index) });
  }
  return ranges;
};

const read = (element: HTMLVideoElement): MediaState => ({
  playing: !element.paused && !element.ended,
  time: element.currentTime,
  duration: readDuration(element),
  volume: { level: element.volume, muted: element.muted },
  buffered: readBuffered(element),
  ended: element.ended,
});

/**
 * Mirrors one `<video>` into React state. **The element is the source of truth
 * and this hook only reflects it** — nothing here ever calls `play()`,
 * `pause()` or writes `currentTime`.
 *
 * That direction is not a preference. `useHoverPlay` reaches into the node and
 * sets `muted` and `loop` directly, so state held in parallel disagrees with
 * the element the moment a pointer rests on a clip. `play()` can also be
 * refused outright by autoplay policy, which would leave optimistic state
 * showing a pause icon over a clip that never started. Every value below is
 * therefore re-read from the element on each event rather than taken from the
 * event's payload.
 *
 * `timeupdate` fires around four times a second, which is visibly steppy on a
 * scrubber, so a frame loop drives the clock *while playing only* — running it
 * on a paused element would keep the tab awake for a number that cannot change.
 *
 * Takes the element, not a ref. A ref's `current` is not a valid dependency —
 * mutating it does not re-render, so a subscription keyed on it would never
 * actually move to a new node — and reading it during render is disallowed.
 * The consumer holds the element in state through a callback ref instead, which
 * makes a swapped element a real dependency change.
 */
export function useMediaState(element: HTMLVideoElement | null): MediaState {
  const [state, setState] = useState<MediaState>(IDLE);
  // The frame loop is keyed off the live element rather than React state so it
  // never reschedules on its own output.
  const frame = useRef<number>(0);

  useEffect(() => {
    if (!element) return;

    const sync = () => setState(read(element));

    // `loadedmetadata` and `emptied` are what make this correct across a `src`
    // swap: the cloud grid changes the source to re-run a load, and the element
    // reports a fresh (or absent) duration only through those.
    const events = [
      'play',
      'playing',
      'pause',
      'timeupdate',
      'durationchange',
      'loadedmetadata',
      'volumechange',
      'progress',
      'ended',
      'emptied',
      'seeked',
    ] as const;
    for (const event of events) element.addEventListener(event, sync);

    const tick = () => {
      if (element.paused || element.ended) return;
      setState(read(element));
      frame.current = requestAnimationFrame(tick);
    };
    const startLoop = () => {
      cancelAnimationFrame(frame.current);
      // jsdom has no rAF in some configurations; the events above still carry
      // the clock there, just at `timeupdate`'s own rate.
      if (typeof requestAnimationFrame === 'function') frame.current = requestAnimationFrame(tick);
    };
    const stopLoop = () => cancelAnimationFrame(frame.current);

    element.addEventListener('play', startLoop);
    element.addEventListener('playing', startLoop);
    element.addEventListener('pause', stopLoop);
    element.addEventListener('ended', stopLoop);

    // An element handed to this hook may already be loaded and playing — a
    // remount over a warm element must not report an idle one.
    sync();
    if (!element.paused) startLoop();

    return () => {
      for (const event of events) element.removeEventListener(event, sync);
      element.removeEventListener('play', startLoop);
      element.removeEventListener('playing', startLoop);
      element.removeEventListener('pause', stopLoop);
      element.removeEventListener('ended', stopLoop);
      stopLoop();
    };
  }, [element]);

  // Derived rather than reset in the effect: with no element there is nothing
  // to report, and a synchronous setState there would cascade a render.
  return element ? state : IDLE;
}
