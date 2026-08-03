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
  /** Longer marketing blurb for the landing hero. */
  heroBlurb:
    'Generate, edit, and transform images across multiple engines — from text-to-image to viral social thumbnails.',
  /** Footer credit line product label (links to the repo). */
  shortName: 'Scene Assembly',
  githubUrl: 'https://github.com/vmyazin/nano-banana-ui',
  siteUrl: 'https://nbanana.mzork.com',
  maintainer: {
    name: 'Vasily Simon',
    url: 'https://github.com/vmyazin',
  },
} as const;

export type Brand = typeof brand;
