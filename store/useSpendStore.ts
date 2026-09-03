import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SPEND_LEDGER_LIMIT, type SpendEntry } from '@/lib/spend/ledger';

const STORAGE_KEY = 'scene-assembly-spend';

interface SpendState {
  /** Newest first. One row per finished generation; failures are never filed. */
  entries: SpendEntry[];
  hasHydrated: boolean;
  /** No-op when the id is already present, so a re-poll cannot bill twice. */
  record: (entry: SpendEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSpendStore = create<SpendState>()(
  persist(
    (set) => ({
      entries: [],
      hasHydrated: false,

      record: (entry) =>
        set((state) => {
          if (state.entries.some((existing) => existing.id === entry.id)) return state;
          return { entries: [entry, ...state.entries].slice(0, SPEND_LEDGER_LIMIT) };
        }),

      remove: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      clear: () => set({ entries: [] }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEY,
      // Bump when the persisted shape changes, and add a migrate() to match.
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ entries: state.entries }),
      // Same deferred hydration as useAppStore: kicked from a mount effect so the
      // server and first client render agree.
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
