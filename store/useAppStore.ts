// store/useAppStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { EngineId } from '@/lib/engines/registry';

/** Public persist key after rebrand. */
const STORAGE_KEY = 'scene-assembly-store';
/** Pre-rebrand Zustand persist key — read once, then retired. */
const LEGACY_STORAGE_KEY = 'nano-banana-store';

interface AppState {
  /** The user's Gemini API key (persisted to localStorage). */
  apiKey: string;
  /** Selected image generation engine (persisted). */
  engine: EngineId;
  /** Cloudflare Workers AI credentials (persisted). */
  cfAccountId: string;
  cfToken: string;
  /** Kie.ai BYOK credentials and per-media model preferences (persisted). */
  kieApiKey: string;
  kieImageModel: string;
  kieVideoModel: string;
  falApiKey: string;
  videoEngine: 'kie' | 'fal';
  falVideoModel: string;
  /** True once the persisted state has rehydrated on the client. */
  hasHydrated: boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setEngine: (engine: EngineId) => void;
  setCfAccountId: (v: string) => void;
  setCfToken: (v: string) => void;
  setKieApiKey: (key: string) => void;
  setKieImageModel: (modelId: string) => void;
  setKieVideoModel: (modelId: string) => void;
  setFalApiKey: (key: string) => void;
  setVideoEngine: (engine: 'kie' | 'fal') => void;
  setFalVideoModel: (modelId: string) => void;
  setHasHydrated: (v: boolean) => void;
}

/**
 * One-time bridge: if `scene-assembly-store` is missing, copy the full
 * `nano-banana-store` blob (credentials, engine, preferences) into it.
 * Runs on first getItem so rehydration sees the migrated payload.
 */
function createMigratingStorage(): StateStorage {
  return {
    getItem: (name) => {
      const existing = localStorage.getItem(name);
      if (existing != null) return existing;

      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy == null) return null;

      localStorage.setItem(name, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    },
    setItem: (name, value) => {
      localStorage.setItem(name, value);
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
  };
}

/**
 * Centralized client state. Persists under `scene-assembly-store`, migrating
 * from the legacy `nano-banana-store` key on first load, and still lifting the
 * older raw `gemini_api_key` value when no API key is present after rehydrate.
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
      kieApiKey: '',
      kieImageModel: 'nano-banana-pro',
      kieVideoModel: 'veo-3-1',
      falApiKey: '',
      videoEngine: 'kie',
      falVideoModel: 'veo-3-1-fast',
      hasHydrated: false,
      setApiKey: (key) => set({ apiKey: key }),
      clearApiKey: () => set({ apiKey: '' }),
      setEngine: (engine) => set({ engine }),
      setCfAccountId: (v) => set({ cfAccountId: v }),
      setCfToken: (v) => set({ cfToken: v }),
      setKieApiKey: (key) => set({ kieApiKey: key }),
      setKieImageModel: (modelId) => set({ kieImageModel: modelId }),
      setKieVideoModel: (modelId) => set({ kieVideoModel: modelId }),
      setFalApiKey: (key) => set({ falApiKey: key }),
      setVideoEngine: (engine) => set({ videoEngine: engine }),
      setFalVideoModel: (modelId) => set({ falVideoModel: modelId }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createMigratingStorage()),
      partialize: (s) => ({
        apiKey: s.apiKey,
        engine: s.engine,
        cfAccountId: s.cfAccountId,
        cfToken: s.cfToken,
        kieApiKey: s.kieApiKey,
        kieImageModel: s.kieImageModel,
        kieVideoModel: s.kieVideoModel,
        falApiKey: s.falApiKey,
        videoEngine: s.videoEngine,
        falVideoModel: s.falVideoModel,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Legacy pre-Zustand key (older app versions stored the Gemini key raw).
        if (!state.apiKey && typeof localStorage !== 'undefined') {
          const legacy = localStorage.getItem('gemini_api_key');
          if (legacy) state.setApiKey(legacy);
        }
        state.setHasHydrated(true);
      },
    }
  )
);
