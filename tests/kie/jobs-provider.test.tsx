import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import KieJobsProvider from '../../components/KieJobsProvider';
import { useAppStore } from '../../store/useAppStore';
import { useKieJobsStore } from '../../store/useKieJobsStore';

const { getKieJobStatus } = vi.hoisted(() => ({ getKieJobStatus: vi.fn() }));
vi.mock('../../lib/kie/browser', () => ({ getKieJobStatus }));

describe('KieJobsProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getKieJobStatus.mockReset();
    useAppStore.setState({ kieApiKey: 'kie_test_key' });
    useKieJobsStore.getState().clearJobs();
  });

  afterEach(() => vi.useRealTimers());

  it('polls an active task without resubmitting it', async () => {
    getKieJobStatus.mockResolvedValue({
      taskId: 'task_poll_1',
      state: 'success',
      resultUrls: ['https://temp.kie.ai/result.png'],
    });
    useKieJobsStore.getState().upsertJob({
      id: 'task_poll_1',
      taskId: 'task_poll_1',
      protocol: 'market',
      state: 'queuing',
      resultUrls: [],
      modelId: 'nano-banana-pro',
      mediaType: 'image',
      inputMode: 'text',
      prompt: 'A studio banana',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pollAttempt: 0,
    });
    render(<KieJobsProvider><div /></KieJobsProvider>);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });

    expect(getKieJobStatus).toHaveBeenCalledWith({
      apiKey: 'kie_test_key',
      taskId: 'task_poll_1',
      protocol: 'market',
    });
    expect(useKieJobsStore.getState().jobs[0]).toMatchObject({
      state: 'success',
      resultUrls: ['https://temp.kie.ai/result.png'],
      pollAttempt: 1,
    });
  });

  it('marks a task as failed after 15 minutes without another provider call', async () => {
    useKieJobsStore.getState().upsertJob({
      id: 'task_timeout_1',
      taskId: 'task_timeout_1',
      protocol: 'market',
      state: 'generating',
      resultUrls: [],
      modelId: 'nano-banana-pro',
      mediaType: 'image',
      inputMode: 'text',
      prompt: 'A studio banana',
      createdAt: Date.now() - 15 * 60 * 1_000,
      updatedAt: Date.now(),
      pollAttempt: 4,
    });
    render(<KieJobsProvider><div /></KieJobsProvider>);

    await act(async () => undefined);
    expect(useKieJobsStore.getState().jobs[0]).toMatchObject({ state: 'fail' });
    expect(getKieJobStatus).not.toHaveBeenCalled();
  });
});
