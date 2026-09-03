// lib/spend/palette.ts
import type { SpendProvider } from './ledger';

/**
 * Chart fills per provider, from the design tokens. Five hues cover nine
 * providers, so the second user of a hue takes it at lower opacity; the pairs
 * are never adjacent in practice because a stack orders by the provider list.
 */
export const PROVIDER_FILL: Record<SpendProvider, { color: string; opacity: number }> = {
  gemini: { color: 'var(--neon-cyan)', opacity: 1 },
  runware: { color: 'var(--neon-cyan)', opacity: 0.5 },
  pollinations: { color: 'var(--neon-purple)', opacity: 1 },
  atlas: { color: 'var(--neon-purple)', opacity: 0.5 },
  fal: { color: 'var(--neon-pink)', opacity: 1 },
  comet: { color: 'var(--neon-pink)', opacity: 0.5 },
  cloudflare: { color: 'var(--brand-accent)', opacity: 1 },
  kie: { color: 'var(--foreground)', opacity: 0.85 },
  'micro-ai': { color: 'var(--foreground-muted)', opacity: 0.7 },
};

/** Stack order, so the same provider always sits at the same height. */
export const PROVIDER_ORDER: SpendProvider[] = [
  'gemini', 'fal', 'kie', 'runware', 'atlas', 'comet', 'pollinations', 'cloudflare', 'micro-ai',
];
