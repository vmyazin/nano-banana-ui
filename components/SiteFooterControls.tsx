// components/SiteFooterControls.tsx
'use client';

import Link from 'next/link';
import { CircleDollarSign, CircleUserRound, Volume2, VolumeX } from 'lucide-react';

import { setUiSoundsEnabled } from '@/lib/notify/chime';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

/**
 * The two parts of the footer that depend on browser state, split out so the
 * rest of `SiteFooter` can stay a server component and reach the crawler as
 * HTML. They render on the server too — neither store touches `window` during
 * render, and `useAppStore` persists with `skipHydration`, so the first paint
 * matches the markup.
 */

export function FooterLinks() {
  /**
   * The session resolves a moment after paint, so the footer waits for a
   * definite answer before offering to sign anyone in: until then the row reads
   * Account and points at /account, which sends a signed-out visitor on to
   * sign-in anyway. Nobody sees a broken link, and nobody already signed in
   * watches the row flip out from under them.
   */
  const signedOut = useAccountStore((s) => s.status === 'ready' && !s.session?.account);

  return (
    <ul className="rounded-xl border border-[var(--border)] bg-[var(--background-glass)] px-5 py-4 space-y-2 text-[0.8125rem] font-bold">
      <li>
        <Link
          href="/spend"
          className="inline-flex items-center gap-2 text-[var(--neon-cyan)] hover:text-[var(--neon-purple)] transition-colors hover:underline"
        >
          <CircleDollarSign size={15} aria-hidden="true" />
          Spend
        </Link>
      </li>
      <li>
        <Link
          href={signedOut ? '/sign-in' : '/account'}
          className="inline-flex items-center gap-2 text-[var(--neon-cyan)] hover:text-[var(--neon-purple)] transition-colors hover:underline"
        >
          <CircleUserRound size={15} aria-hidden="true" />
          {signedOut ? 'Sign in' : 'Account'}
        </Link>
      </li>
    </ul>
  );
}

/**
 * A studio preference rather than an account one, so it lives with the page
 * whose sounds it governs. The footer specifically: it is the only place
 * reachable without signing in AND at every width — the header's toggle is
 * `sm:`-gated and the command palette needs a keyboard, which between them left
 * a guest on a phone with no way to silence the studio.
 */
export function FooterSoundToggle() {
  const uiSoundsEnabled = useAppStore((s) => s.uiSoundsEnabled);

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]">
      <input
        type="checkbox"
        checked={uiSoundsEnabled}
        onChange={(event) => setUiSoundsEnabled(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--neon-cyan)]"
      />
      {/* Follows the state, the way the header's button already does. */}
      {uiSoundsEnabled ? <Volume2 size={13} aria-hidden="true" /> : <VolumeX size={13} aria-hidden="true" />}
      Interface sounds
    </label>
  );
}
