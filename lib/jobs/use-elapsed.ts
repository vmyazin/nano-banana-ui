'use client';

import { useSyncExternalStore } from 'react';

/** How often a running clock repaints. */
const TICK_MS = 1000;

/**
 * One interval for every clock on the page, and one `now` for all of them.
 *
 * A background list can render eight job rows, and eight independent
 * `setInterval`s that each trigger a render is how a list describing jobs
 * starts costing more than the jobs. The timer only exists while at least one
 * clock is running — a page of finished jobs schedules nothing.
 */
const subscribers = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let nowMs = Date.now();

function subscribeToTicker(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (!ticker) {
    // Refreshed on subscribe, not only on tick. Between the last unsubscribe
    // and now the shared value went stale, and a clock mounting mid-second
    // would otherwise show a number up to a second old — visible as a timer
    // that appears to start at 0:00 twice.
    nowMs = Date.now();
    ticker = setInterval(() => {
      nowMs = Date.now();
      for (const notify of subscribers) notify();
    }, TICK_MS);
  }
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** A frozen clock subscribes to nothing: its value cannot change again. */
const subscribeToNothing = (): (() => void) => () => {};
const readNow = () => nowMs;
const readZero = () => 0;

/** Test seam: assert that many clocks share one timer, and that it stops. */
export function elapsedTickerActive(): boolean {
  return ticker !== null;
}

/** Test seam: how many clocks are currently driven by the shared timer. */
export function elapsedSubscriberCount(): number {
  return subscribers.size;
}

/**
 * Whole seconds between `startedAt` and now, ticking once a second.
 *
 * Pass `frozenAt` once the job is over and the clock stops, reporting
 * `frozenAt - startedAt` instead. Both ends are timestamps rather than a
 * captured duration so the answer survives a reload: a clock started at mount
 * resets to zero every time the tab is revisited, which quietly understates a
 * job that has been running for four minutes.
 *
 * Never negative. A cloud job's `startedAt` comes from the Worker while `now`
 * is the browser's, so a client clock a few seconds behind the server would
 * otherwise render `-0:03`.
 *
 * `useSyncExternalStore` rather than an effect writing state: the ticker is
 * exactly the external source it exists for, and it re-reads the snapshot
 * immediately after subscribing, which is what makes a clock that starts
 * running later pick up the current second rather than a stale one.
 */
export function useElapsedSeconds(
  startedAt: number | undefined,
  options: { frozenAt?: number } = {}
): number {
  const { frozenAt } = options;
  const running = typeof startedAt === 'number' && frozenAt === undefined;

  const now = useSyncExternalStore(
    running ? subscribeToTicker : subscribeToNothing,
    running ? readNow : readZero,
    // The server snapshot is deliberately NOT the live value. React uses it for
    // the server render *and* the hydrating render, so returning `nowMs` there
    // renders one number on the server and a later one in the browser — a
    // hydration mismatch, since a clock's whole job is to differ over time.
    // Zero reads as "not known yet", clamps the result to 0:00, and the first
    // real snapshot corrects it. A frozen clock never reaches this: its `end`
    // is `frozenAt`, so it renders identically in both places.
    readZero
  );

  if (typeof startedAt !== 'number') return 0;
  const end = frozenAt ?? now;
  return Math.max(0, Math.floor((end - startedAt) / 1000));
}
