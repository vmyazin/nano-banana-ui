import type { FalTaskState } from './types';

export const FAL_JOB_TIMEOUT_MS = 15 * 60 * 1_000;
const FAL_INITIAL_POLL_MS = 2_500;
const FAL_MAX_POLL_MS = 15_000;

export function nextFalPollDelay(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt >= 0 ? Math.floor(attempt) : 0;
  return Math.min(FAL_INITIAL_POLL_MS * 2 ** safeAttempt, FAL_MAX_POLL_MS);
}

export function isFalJobTerminal(state: FalTaskState): boolean {
  return (
    state === 'success' ||
    state === 'fail' ||
    state === 'timed_out' ||
    state === 'cancelled'
  );
}
