'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

import StudioHeader from '@/components/StudioHeader';

/**
 * The timeline editor's own route.
 *
 * It lives here rather than as a branch of the studio page because it is the
 * one surface in the app that is not a document: the studio scrolls, and the
 * editor divides a fixed viewport between a bar, a viewer row and a track. Two
 * layout models cannot share one page shell without one of them losing — which
 * is exactly what happened while the editor was a card stack inside the studio
 * column, and why a short landscape window pushed the track below the fold.
 *
 * `ssr: false` for the same reason the studio's own lazy branch used it: the
 * workspace reaches for WebCodecs/mediabunny-adjacent code and reads
 * `matchMedia` and `localStorage` synchronously on mount.
 */
const TimelineWorkspace = dynamic(() => import('@/components/TimelineWorkspace'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] items-center justify-center">
      <div className="loading-spinner" />
    </div>
  ),
});

function TimelineEditor() {
  /**
   * Two bands: the app's own header, and the editor filling what is left.
   *
   * The header is the studio's, extracted rather than reproduced — the Library
   * button here opens the same overlay that adds clips to this timeline, and
   * ⌘K and the API-key dialog are the same ones too. It runs full-bleed so the
   * wordmark lines up with the clip rail below it, and drops the generation
   * chime, which announces something this route cannot do.
   */
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* The route's heading, for anyone navigating by them. Visually hidden
          because the editor's own bar already says where you are, and the
          wordmark above stopped being an `<h1>` when each route took over its
          own heading. */}
      <h1 className="sr-only">Timeline</h1>
      <StudioHeader active="timeline" fullBleed showChime={false} />
      <TimelineWorkspace />
    </div>
  );
}

export default function TimelinePage() {
  // Suspense boundary required because the header's command palette reads the
  // URL via nuqs/useSearchParams — the same reason `app/page.tsx` wraps Studio.
  // Without it the production build fails prerendering this route, which `next
  // dev` does not surface.
  return (
    <Suspense fallback={null}>
      <TimelineEditor />
    </Suspense>
  );
}
