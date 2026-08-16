// lib/brand.ts
/**
 * Single source of truth for product branding.
 * Import from here instead of hardcoding the name or tagline in UI/metadata.
 */

export const brand = {
  name: 'Scene Assembly',
  /** Provider-neutral one-liner used in headers, hero copy, and metadata. */
  description: 'A multi-engine image studio.',
  /** Short eyebrow / subtitle next to the product name in the nav. */
  tagline: 'Multi-engine image studio',
  /**
   * Landing hero blurb. Kept to a single line: it shares a row with the engine
   * pills, and a wrapped blurb leaves them hanging off to one side.
   */
  heroBlurb: 'Generate, edit, and transform images across multiple engines.',
  /** Footer credit line product label (links to the repo). */
  shortName: 'Scene Assembly',
  githubUrl: 'https://github.com/vmyazin/nano-banana-ui',
  siteUrl: 'https://nbanana.mzork.com',
  /** Document / social card title: "Scene Assembly — Multi-engine image studio" */
  metaTitle: 'Scene Assembly — Multi-engine image studio',
  /** Search / social description — provider-neutral, engines named as capabilities. */
  metaDescription:
    'A multi-engine image studio — generate and edit with Gemini, Pollinations, Cloudflare, and more.',
  /** Open Graph image alt text. */
  ogImageAlt: 'Scene Assembly — a multi-engine image studio',
  maintainer: {
    name: 'Vasily Simon',
    url: 'https://github.com/vmyazin',
  },
} as const;

export type Brand = typeof brand;
