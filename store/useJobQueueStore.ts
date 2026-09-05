import { create } from 'zustand';

interface JobQueueState {
  /** Jobs the person has waved away in the overlay. Intentionally not persisted
   *  and per-tab: this hides a row from one status card, it does not stop
   *  tracking the job or touch the account. A reload should show the truth again. */
  dismissed: string[];
  dismiss: (id: string) => void;
}

export const useJobQueueStore = create<JobQueueState>((set) => ({
  dismissed: [],
  dismiss: (id) => set((state) => (state.dismissed.includes(id) ? state : { dismissed: [...state.dismissed, id] })),
}));
