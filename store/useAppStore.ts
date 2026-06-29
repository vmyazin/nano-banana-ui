import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EngineId } from '@/lib/engines/registry';

interface AppState {
  /** The user's Gemini API key (persisted to localStorage). */
  apiKey: string;
  /** Selected image generation engine (persisted). */
  engine: EngineId;
  /** Cloudflare Workers AI credentials (persisted). */
  cfAccountId: string;
  cfToken: string;
  /** True once the persisted state has rehydrated on the client. */
  hasHydrated: boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setEngine: (engine: EngineId) => void;
  setCfAccountId: (v: string) => void;
  setCfToken: (v: string) => void;
  setHasHydrated: (v: boolean) => void;
}

/**
 * Centralized client state. Persists the API key under `nano-banana-store`
 * and migrates the legacy raw `gemini_api_key` value from older versions.
 *
 * Hydration is deferred (`skipHydration`) and kicked off from a mount effect
 * so the server and first client render agree (no hydration mismatch on the
 * header CTA). Call `useAppStore.persist.rehydrate()` once on mount.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      apiKey: '',
      engine: 'gemini',
      cfAccountId: '',
      cfToken: '',
      hasHydrated: false,
      setApiKey: (key) => set({ apiKey: key }),
      clearApiKey: () => set({ apiKey: '' }),
      setEngine: (engine) => set({ engine }),
      setCfAccountId: (v) => set({ cfAccountId: v }),
      setCfToken: (v) => set({ cfToken: v }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'nano-banana-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ apiKey: s.apiKey, engine: s.engine, cfAccountId: s.cfAccountId, cfToken: s.cfToken }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.apiKey && typeof localStorage !== 'undefined') {
          const legacy = localStorage.getItem('gemini_api_key');
          if (legacy) state.setApiKey(legacy);
        }
        state.setHasHydrated(true);
      },
    }
  )
);
