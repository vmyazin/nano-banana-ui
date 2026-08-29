// lib/brand.ts
/**
 * Single source of truth for product branding.
 * Import from here instead of hardcoding the name or tagline in UI/metadata.
 */

export const brand = {
  name: 'Scene Assembly',
  /** Provider-neutral one-liner used in headers, hero copy, and metadata. */
  description: 'A multi-engine image and video studio.',
  /** Short eyebrow / subtitle next to the product name in the nav. */
  tagline: 'Multi-engine image & video studio',
  /**
   * Landing hero blurb. Kept to a single line: it shares a row with the engine
   * pills, and a wrapped blurb leaves them hanging off to one side.
   */
  heroBlurb: 'Generate and edit images and video across multiple engines.',
  /** Footer credit line product label (links to the repo). */
  shortName: 'Scene Assembly',
  githubUrl: 'https://github.com/vmyazin/nano-banana-ui',
  siteUrl: 'https://sceneassembly.mzork.com',
  /** Document / social card title: "Scene Assembly — Multi-engine image & video studio" */
  metaTitle: 'Scene Assembly — Multi-engine image & video studio',
  /** Search / social description — provider-neutral, engines named as capabilities. */
  metaDescription:
    'A multi-engine AI studio — generate and edit images with Gemini and FLUX, and create video with Veo, Kling, and Seedance.',
  /** Open Graph image alt text. */
  ogImageAlt: 'Scene Assembly — a multi-engine image and video studio',
  maintainer: {
    name: 'Vasily Simon',
    url: 'https://github.com/vmyazin',
  },
} as const;

export type Brand = typeof brand;
