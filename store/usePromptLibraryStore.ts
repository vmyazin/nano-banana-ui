import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const STORAGE_KEY = 'scene-assembly-prompts';
/** Enough to scroll back through a session's experiments without unbounded growth. */
const HISTORY_LIMIT = 100;

export interface SavedPrompt {
  id: string;
  text: string;
  savedAt: number;
}

interface PromptLibraryState {
  /**
   * Everything submitted, newest first — nothing worth keeping is lost to
   * forgetting to save it.
   */
  history: SavedPrompt[];
  /** Deliberately starred, so the good ones do not scroll away. */
  favourites: SavedPrompt[];
  hasHydrated: boolean;
  /** Called on submit; consecutive repeats of the same text collapse. */
  remember: (text: string) => void;
  toggleFavourite: (text: string) => void;
  isFavourite: (text: string) => boolean;
  forget: (id: string) => void;
  clearHistory: () => void;
  setHasHydrated: (value: boolean) => void;
}

let nextPromptId = 0;

function entry(text: string): SavedPrompt {
  nextPromptId += 1;
  return { id: `prompt-${Date.now()}-${nextPromptId}`, text, savedAt: Date.now() };
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      history: [],
      favourites: [],
      hasHydrated: false,

      remember: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((state) => {
          if (state.history[0]?.text === trimmed) return state;
          return {
            history: [entry(trimmed), ...state.history.filter((p) => p.text !== trimmed)].slice(
              0,
              HISTORY_LIMIT
            ),
          };
        });
      },

      toggleFavourite: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((state) => {
          const existing = state.favourites.find((p) => p.text === trimmed);
          return {
            favourites: existing
              ? state.favourites.filter((p) => p.text !== trimmed)
              : [entry(trimmed), ...state.favourites],
          };
        });
      },

      isFavourite: (text) => get().favourites.some((p) => p.text === text.trim()),

      forget: (id) =>
        set((state) => ({
          history: state.history.filter((p) => p.id !== id),
          favourites: state.favourites.filter((p) => p.id !== id),
        })),

      clearHistory: () => set({ history: [] }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ history: state.history, favourites: state.favourites }),
      // Same deferred hydration as useAppStore: kicked from a mount effect so the
      // server and first client render agree.
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
