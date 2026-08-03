import { beforeEach, describe, expect, it } from 'vitest';
import { isKieJobTerminal, nextKiePollDelay } from '../../lib/kie/queue';
import { useKieJobsStore } from '../../store/useKieJobsStore';

describe('Kie in-memory job queue', () => {
  beforeEach(() => {
    useKieJobsStore.getState().clearJobs();
  });

  it('uses bounded exponential polling and recognizes only terminal tasks', () => {
    expect(nextKiePollDelay(0)).toBe(2_500);
    expect(nextKiePollDelay(2)).toBe(10_000);
    expect(nextKiePollDelay(8)).toBe(15_000);
    expect(isKieJobTerminal('success')).toBe(true);
    expect(isKieJobTerminal('fail')).toBe(true);
    expect(isKieJobTerminal('generating')).toBe(false);
  });

  it('keeps jobs in browser memory and updates an existing task without resubmitting it', () => {
    useKieJobsStore.getState().upsertJob({
      id: 'task_1',
      taskId: 'task_1',
      modelId: 'veo-3-1',
      mediaType: 'video',
      inputMode: 'text',
      prompt: 'A quiet ocean at dawn',
      protocol: 'veo',
      state: 'waiting',
      resultUrls: [],
      createdAt: 100,
      updatedAt: 100,
      pollAttempt: 0,
    });
    expect(useKieJobsStore.getState().jobs).toHaveLength(1);

    useKieJobsStore.getState().upsertJob({
      ...useKieJobsStore.getState().jobs[0],
      state: 'generating',
      progress: 0.5,
      updatedAt: 200,
      pollAttempt: 1,
    });

    expect(useKieJobsStore.getState().jobs).toMatchObject([
      { id: 'task_1', state: 'generating', progress: 0.5 },
    ]);
  });
});
