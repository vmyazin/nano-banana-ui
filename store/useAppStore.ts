// store/useAppStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { EngineId } from '@/lib/engines/registry';
import type { ImageFormatPreference } from '@/lib/image/policy';
import { DEFAULT_MODELS } from '@/lib/providers/catalog';
import type { ProviderId } from '@/lib/providers/types';

/** Engines that can produce video: the two original ones plus the aggregators. */
export type VideoEngineId = 'kie' | 'fal' | ProviderId;

/** Store field names per provider, so the setters stay one line each. */
const KEY_FIELDS: Record<ProviderId, 'runwareApiKey' | 'atlasApiKey' | 'cometApiKey'> = {
  runware: 'runwareApiKey',
  atlas: 'atlasApiKey',
  comet: 'cometApiKey',
};

const MODEL_FIELDS: Record<ProviderId, Record<'image' | 'video', string>> = {
  runware: { image: 'runwareImageModel', video: 'runwareVideoModel' },
  atlas: { image: 'atlasImageModel', video: 'atlasVideoModel' },
  comet: { image: 'cometImageModel', video: 'cometVideoModel' },
};

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
  videoEngine: VideoEngineId;
  falVideoModel: string;
  /**
   * Aggregator providers (Runware, Atlas Cloud, CometAPI). One key each, plus
   * the model chosen per media kind — their catalogs are large enough that the
   * choice is worth persisting rather than resetting to the default each visit.
   */
  runwareApiKey: string;
  runwareImageModel: string;
  runwareVideoModel: string;
  atlasApiKey: string;
  atlasImageModel: string;
  atlasVideoModel: string;
  cometApiKey: string;
  cometImageModel: string;
  cometVideoModel: string;
  /**
   * Image format policy. `'auto'` re-encodes PNG to WebP wherever bytes enter
   * or leave the app; an explicit format forces it. Persisted because it is a
   * preference about output, not a per-session choice.
   */
  imageFormat: ImageFormatPreference;
  /**
   * Whether the library re-encodes what it stores. Opt-out because it is the
   * one irreversible conversion: once a record holds WebP the original PNG is
   * gone, and a later "download as PNG" can only re-encode a lossy image.
   */
  convertLibraryImages: boolean;
  /**
   * Whether a finished generation rings the completion chime. On by default:
   * the jobs it announces run for minutes, and the sound is the point of
   * being able to look away. Persisted so silencing it survives a reload.
   */
  chimeOnComplete: boolean;
  /** True once the persisted state has rehydrated on the client. */
  hasHydrated: boolean;
  setApiKey: (key: string) => void;
  setEngine: (engine: EngineId) => void;
  setCfAccountId: (v: string) => void;
  setCfToken: (v: string) => void;
  setKieApiKey: (key: string) => void;
  setKieImageModel: (modelId: string) => void;
  setKieVideoModel: (modelId: string) => void;
  setFalApiKey: (key: string) => void;
  setVideoEngine: (engine: VideoEngineId) => void;
  setFalVideoModel: (modelId: string) => void;
  setProviderApiKey: (provider: ProviderId, key: string) => void;
  setProviderModel: (provider: ProviderId, kind: 'image' | 'video', modelId: string) => void;
  setImageFormat: (preference: ImageFormatPreference) => void;
  setConvertLibraryImages: (convert: boolean) => void;
  setChimeOnComplete: (chime: boolean) => void;
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
      runwareApiKey: '',
      runwareImageModel: DEFAULT_MODELS.runware.image,
      runwareVideoModel: DEFAULT_MODELS.runware.video,
      atlasApiKey: '',
      atlasImageModel: DEFAULT_MODELS.atlas.image,
      atlasVideoModel: DEFAULT_MODELS.atlas.video,
      cometApiKey: '',
      cometImageModel: DEFAULT_MODELS.comet.image,
      cometVideoModel: DEFAULT_MODELS.comet.video,
      imageFormat: 'auto',
      convertLibraryImages: true,
      chimeOnComplete: true,
      hasHydrated: false,
      setApiKey: (key) => set({ apiKey: key }),
      setEngine: (engine) => set({ engine }),
      setCfAccountId: (v) => set({ cfAccountId: v }),
      setCfToken: (v) => set({ cfToken: v }),
      setKieApiKey: (key) => set({ kieApiKey: key }),
      setKieImageModel: (modelId) => set({ kieImageModel: modelId }),
      setKieVideoModel: (modelId) => set({ kieVideoModel: modelId }),
      setFalApiKey: (key) => set({ falApiKey: key }),
      setVideoEngine: (engine) => set({ videoEngine: engine }),
      setFalVideoModel: (modelId) => set({ falVideoModel: modelId }),
      setProviderApiKey: (provider, key) => set({ [KEY_FIELDS[provider]]: key } as Partial<AppState>),
      setProviderModel: (provider, kind, modelId) =>
        set({ [MODEL_FIELDS[provider][kind]]: modelId } as Partial<AppState>),
      setImageFormat: (preference) => set({ imageFormat: preference }),
      setConvertLibraryImages: (convert) => set({ convertLibraryImages: convert }),
      setChimeOnComplete: (chime) => set({ chimeOnComplete: chime }),
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
        runwareApiKey: s.runwareApiKey,
        runwareImageModel: s.runwareImageModel,
        runwareVideoModel: s.runwareVideoModel,
        atlasApiKey: s.atlasApiKey,
        atlasImageModel: s.atlasImageModel,
        atlasVideoModel: s.atlasVideoModel,
        cometApiKey: s.cometApiKey,
        cometImageModel: s.cometImageModel,
        cometVideoModel: s.cometVideoModel,
        imageFormat: s.imageFormat,
        convertLibraryImages: s.convertLibraryImages,
        chimeOnComplete: s.chimeOnComplete,
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
