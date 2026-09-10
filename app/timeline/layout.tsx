// app/timeline/layout.tsx
import type { Metadata } from 'next';

/**
 * See `app/spend/layout.tsx` for why these shells are noindexed rather than
 * disallowed. The editor is the stronger case of the two: it renders
 * `ssr: false`, so the crawlable HTML is a loading spinner, and every clip in
 * it belongs to one browser.
 */
export const metadata: Metadata = {
  title: 'Timeline · Scene Assembly',
  robots: { index: false, follow: true },
};

export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
