// app/spend/layout.tsx
import type { Metadata } from 'next';

/**
 * `/spend` is a client page, so it cannot export metadata itself — hence this
 * layout.
 *
 * `noindex` because the page is an empty shell to a crawler: every number on it
 * comes from the visitor's own ledger (browser store or signed-in account)
 * after hydration, so there is nothing here to rank and nothing a searcher
 * could usefully land on. `follow` stays on so the links out of it still pass
 * through. Deliberately *not* disallowed in robots.txt — a blocked page is
 * never fetched, so this tag would never be read.
 */
export const metadata: Metadata = {
  title: 'Spend · Scene Assembly',
  robots: { index: false, follow: true },
};

export default function SpendLayout({ children }: { children: React.ReactNode }) {
  return children;
}
