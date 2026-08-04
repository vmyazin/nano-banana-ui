import { create } from 'zustand';

import type { FalJob } from '@/lib/fal/types';

interface FalJobsState {
  /** Intentionally tab-local: fal jobs and media URLs are temporary. */
  jobs: FalJob[];
  upsertJob: (job: FalJob) => void;
  removeJob: (id: string) => void;
  clearJobs: () => void;
}

export const useFalJobsStore = create<FalJobsState>((set) => ({
  jobs: [],
  upsertJob: (job) =>
    set((state) => {
      const index = state.jobs.findIndex((current) => current.id === job.id);
      if (index === -1) return { jobs: [job, ...state.jobs] };

      const jobs = [...state.jobs];
      jobs[index] = job;
      return { jobs };
    }),
  removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),
  clearJobs: () => set({ jobs: [] }),
}));
