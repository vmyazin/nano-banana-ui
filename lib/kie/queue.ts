import type { KieTask } from './types';

export const KIE_JOB_TIMEOUT_MS = 15 * 60 * 1_000;
const KIE_INITIAL_POLL_MS = 2_500;
const KIE_MAX_POLL_MS = 15_000;

export function nextKiePollDelay(attempt: number): number {
  return Math.min(KIE_INITIAL_POLL_MS * 2 ** Math.max(0, attempt), KIE_MAX_POLL_MS);
}

export function currentKieTime(): number {
  return Date.now();
}

export function isKieJobTerminal(state: KieTask['state']): boolean {
  return state === 'success' || state === 'fail';
}
