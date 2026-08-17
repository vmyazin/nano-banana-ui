// lib/engines/docs.ts
import type { EngineId } from '@/lib/engines/registry';

/**
 * Where to read up on each engine we can call. These are the vendors' own API
 * docs — the page a developer needs to understand what a connected key buys
 * them, and what the engine can do beyond what this UI exposes.
 *
 * Shared because two surfaces list them: the footer's "Engine docs" row and the
 * ⌘K palette's Resources group. One list keeps a new engine from showing up in
 * only one of them.
 */
export const ENGINE_DOCS: ReadonlyArray<{
  id: EngineId;
  label: string;
  href: string;
  /** Hover accent, matched to the color each engine carries elsewhere. */
  accentClass: string;
}> = [
  {
    id: 'gemini',
    label: 'Gemini',
    href: 'https://ai.google.dev/gemini-api/docs/image-generation',
    accentClass: 'hover:text-[var(--neon-cyan)]',
  },
  {
    id: 'pollinations',
    label: 'Pollinations',
    href: 'https://gen.pollinations.ai/docs',
    accentClass: 'hover:text-[var(--neon-purple)]',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    href: 'https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/',
    accentClass: 'hover:text-[var(--brand-accent)]',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    href: 'https://fal.ai/docs',
    accentClass: 'hover:text-[var(--neon-pink)]',
  },
  {
    id: 'kie',
    label: 'Kie.ai',
    href: 'https://docs.kie.ai/',
    accentClass: 'hover:text-[var(--foreground)]',
  },
  {
    id: 'runware',
    label: 'Runware',
    href: 'https://runware.ai/docs',
    accentClass: 'hover:text-[var(--neon-cyan)]',
  },
  {
    id: 'atlas',
    label: 'Atlas Cloud',
    href: 'https://atlascloud.ai/docs',
    accentClass: 'hover:text-[var(--neon-purple)]',
  },
  {
    id: 'comet',
    label: 'CometAPI',
    href: 'https://apidoc.cometapi.com',
    accentClass: 'hover:text-[var(--neon-pink)]',
  },
];
