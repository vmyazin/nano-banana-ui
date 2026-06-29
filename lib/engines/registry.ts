import type { Feature } from '@/types';

// Dependency-free engine metadata + capability gating. Safe to import from both
// client components and server routes (no provider SDKs here).

export type EngineId = 'gemini' | 'pollinations';

export interface EngineMeta {
  id: EngineId;
  label: string;
  blurb: string;
  /** Requires the user to supply an API key (stored client-side). */
  requiresApiKey: boolean;
  /** Can accept uploaded reference images (editing / composition / style). */
  supportsInputImages: boolean;
  /** Can ground generation with Google Search. */
  supportsGoogleSearch: boolean;
  /** Free to use. */
  free: boolean;
}

export const ENGINES: EngineMeta[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    blurb: 'Gemini 3 Pro Image — every mode, your API key',
    requiresApiKey: true,
    supportsInputImages: true,
    supportsGoogleSearch: true,
    free: false,
  },
  {
    id: 'pollinations',
    label: 'Pollinations · FLUX',
    blurb: 'Free · text-to-image · no key required',
    requiresApiKey: false,
    supportsInputImages: false,
    supportsGoogleSearch: false,
    free: true,
  },
];

export function getEngine(id: string | null | undefined): EngineMeta {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}

/** Whether an engine can run a given feature mode. */
export function engineSupportsFeature(engine: EngineMeta, feature: Feature): boolean {
  if (feature.requiresImage && !engine.supportsInputImages) return false;
  // Search-grounded visualization is meaningless without real grounding.
  if (feature.id === 'search-grounding' && !engine.supportsGoogleSearch) return false;
  return true;
}

export function enginesForFeature(feature: Feature): EngineMeta[] {
  return ENGINES.filter((e) => engineSupportsFeature(e, feature));
}
