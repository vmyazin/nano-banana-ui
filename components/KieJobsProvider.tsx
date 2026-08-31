'use client';

import { useEffect } from 'react';
import { getKieJobStatus } from '@/lib/kie/browser';
import { isKieJobTerminal, KIE_JOB_TIMEOUT_MS, nextKiePollDelay } from '@/lib/kie/queue';
import { useAppStore } from '@/store/useAppStore';
import { useKieJobsStore } from '@/store/useKieJobsStore';
import { recordFinishedJob } from '@/lib/gallery/record-job';
import { playGenerationChime } from '@/lib/notify/chime';

export default function KieJobsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = useAppStore((state) => state.kieApiKey);
  const jobs = useKieJobsStore((state) => state.jobs);
  const upsertJob = useKieJobsStore((state) => state.upsertJob);

  useEffect(() => {
    if (!apiKey) return;

    const timers = jobs
      .filter((job) => !isKieJobTerminal(job.state))
      .map((job) => {
        const elapsed = Date.now() - job.createdAt;
        if (elapsed >= KIE_JOB_TIMEOUT_MS) {
          upsertJob({
            ...job,
            state: 'fail',
            error: 'Kie generation timed out after 15 minutes. The task was not resubmitted.',
            updatedAt: Date.now(),
          });
          return undefined;
        }

        return window.setTimeout(() => {
          void getKieJobStatus({ apiKey, taskId: job.taskId, protocol: job.protocol })
            .then((task) => {
              // Poll stops at a terminal state, so this transition happens once.
              if (task.state === 'success') {
                recordFinishedJob('kie', job, task.resultUrls[0]);
                playGenerationChime();
              }
              upsertJob({
                ...job,
                ...task,
                updatedAt: Date.now(),
                pollAttempt: job.pollAttempt + 1,
              });
            })
            .catch((error: unknown) =>
              upsertJob({
                ...job,
                state: 'fail',
                error:
                  error instanceof Error
                    ? error.message
                    : 'Kie status check failed. The task was not resubmitted.',
                updatedAt: Date.now(),
              })
            );
        }, Math.min(nextKiePollDelay(job.pollAttempt), KIE_JOB_TIMEOUT_MS - elapsed));
      })
      .filter((timer): timer is number => timer !== undefined);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [apiKey, jobs, upsertJob]);

  return children;
}
