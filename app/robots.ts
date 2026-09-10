// app/robots.ts
import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

/**
 * The crawl map. Served at /robots.txt.
 *
 * Two different tools do two different jobs here, and mixing them up is the
 * classic robots.txt mistake:
 *
 * - **Disallow** stops a crawl. Used only for surfaces that are worthless to a
 *   search engine *and* that nobody should land on from a result: the API and
 *   the auth pages. Their `robots: { index: false }` metadata stays as a second
 *   layer for anything that ignores this file.
 * - **noindex metadata** keeps a page out of the index but still lets a crawler
 *   read it. That is what `/spend` and `/timeline` get (see their layouts),
 *   because a *disallowed* page can still be indexed URL-only from a link —
 *   Google never fetches it, so it never sees the noindex it would have obeyed.
 *   Blocking and noindexing the same path is self-defeating.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/account', '/sign-in', '/sign-up'],
      },
    ],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}
