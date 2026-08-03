import { create } from 'zustand';
import type { KieJob } from '@/lib/kie/types';

interface KieJobsState {
  /** Intentionally not persisted: Kie URLs and jobs are temporary. */
  jobs: KieJob[];
  upsertJob: (job: KieJob) => void;
  removeJob: (id: string) => void;
  clearJobs: () => void;
}

export const useKieJobsStore = create<KieJobsState>((set) => ({
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
