import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isFalJobTerminal, nextFalPollDelay } from '../../lib/fal/queue';
import type { FalJob, FalTaskState } from '../../lib/fal/types';
import { useFalJobsStore } from '../../store/useFalJobsStore';

const baseJob: FalJob = {
  id: 'req_12345678',
  requestId: 'req_12345678',
  modelId: 'nano-banana-2',
  mediaType: 'image',
  inputMode: 'text',
  prompt: 'A banana observatory',
  state: 'queued',
  logs: [],
  createdAt: 100,
  updatedAt: 100,
  pollAttempt: 0,
};

describe('fal queue helpers', () => {
  it('uses bounded exponential polling delays', () => {
    expect(nextFalPollDelay(0)).toBe(2_500);
    expect(nextFalPollDelay(1)).toBe(5_000);
    expect(nextFalPollDelay(2)).toBe(10_000);
    expect(nextFalPollDelay(3)).toBe(15_000);
    expect(nextFalPollDelay(50)).toBe(15_000);
  });

  it.each([-10, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns a finite in-range delay for defensive attempt %s',
    (attempt) => {
      const delay = nextFalPollDelay(attempt);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(2_500);
      expect(delay).toBeLessThanOrEqual(15_000);
      expect(delay).toBe(2_500);
    }
  );

  it.each([
    ['queued', false],
    ['running', false],
    ['success', true],
    ['fail', true],
    ['timed_out', true],
    ['cancelled', true],
  ] satisfies Array<[FalTaskState, boolean]>)('recognizes %s terminal state as %s', (state, terminal) => {
    expect(isFalJobTerminal(state)).toBe(terminal);
  });
});

describe('tab-local fal jobs store', () => {
  beforeEach(() => {
    useFalJobsStore.getState().clearJobs();
  });

  it('replaces full snapshots so stale errors clear from running and successful jobs', () => {
    useFalJobsStore.getState().upsertJob({
      ...baseJob,
      state: 'fail',
      error: 'Provider failed.',
    });
    const runningJob: FalJob = {
      ...baseJob,
      state: 'running',
      logs: ['Started'],
      updatedAt: 200,
      pollAttempt: 1,
    };
    useFalJobsStore.getState().upsertJob(runningJob);

    expect(useFalJobsStore.getState().jobs).toEqual([runningJob]);

    useFalJobsStore.getState().upsertJob({ ...runningJob, state: 'fail', error: 'Again.' });
    const successJob: FalJob = {
      ...runningJob,
      state: 'success',
      resultUrl: 'https://fal.media/result.png',
      mimeType: 'image/png',
    };
    useFalJobsStore.getState().upsertJob(successJob);

    expect(useFalJobsStore.getState().jobs).toEqual([successJob]);
  });

  it('clears stale result and MIME fields when a job restarts in queued state', () => {
    useFalJobsStore.getState().upsertJob({
      ...baseJob,
      state: 'success',
      resultUrl: 'https://fal.media/result.png',
      mimeType: 'image/png',
    });
    const restartedJob: FalJob = { ...baseJob, updatedAt: 300, pollAttempt: 0 };

    useFalJobsStore.getState().upsertJob(restartedJob);

    expect(useFalJobsStore.getState().jobs).toEqual([restartedJob]);
  });

  it('places new jobs first, removes by ID, and clears all jobs', () => {
    const second = { ...baseJob, id: 'req_abcdefgh', requestId: 'req_abcdefgh' };
    useFalJobsStore.getState().upsertJob(baseJob);
    useFalJobsStore.getState().upsertJob(second);
    expect(useFalJobsStore.getState().jobs.map((job) => job.id)).toEqual([
      second.id,
      baseJob.id,
    ]);

    useFalJobsStore.getState().removeJob(second.id);
    expect(useFalJobsStore.getState().jobs.map((job) => job.id)).toEqual([baseJob.id]);

    useFalJobsStore.getState().clearJobs();
    expect(useFalJobsStore.getState().jobs).toEqual([]);
  });

  it('does not persist jobs to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    useFalJobsStore.getState().upsertJob(baseJob);
    useFalJobsStore.getState().removeJob(baseJob.id);

    expect(setItem).not.toHaveBeenCalled();
    expect('persist' in useFalJobsStore).toBe(false);
  });
});
