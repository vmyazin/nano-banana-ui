// components/marketing/GuestOnly.tsx
'use client';

import { useAccountStore } from '@/store/useAccountStore';

/**
 * Hides its children once the session confirms somebody is signed in.
 *
 * Used for the about section, which is an introduction: a signed-in user has
 * already read it, or decided they did not need to, and does not want a pitch
 * under their studio every visit.
 *
 * **It has to be a client gate wrapping server children.** The obvious version
 * — reading the session in `app/page.tsx` and rendering `<LandingIntro/>`
 * conditionally — would make the route render per request instead of
 * prerendering, and the whole point of that section is that it exists in the
 * static HTML for a crawler. So the markup is always generated on the server,
 * and only the browser, after the session resolves, takes it back out. A
 * crawler is never signed in, so it always keeps it.
 *
 * Hidden only on a *confirmed* account, which is the same rule the footer's
 * account link follows: while the session is loading, and if the account
 * service cannot be reached, the section stays. Guessing the other way would
 * blank a guest's introduction on every cold load, and the store starts at
 * `loading` on the server and at hydration alike, so the first client render
 * matches the HTML and nothing mismatches.
 *
 * The cost is that a signed-in user can see the section for the moment before
 * their session resolves. It sits below the whole feature picker, so it is
 * off-screen at rest, and the alternative — waiting for a definite answer
 * before showing it — would instead make it flash *in* for every guest, which
 * is the larger audience and the one the copy is for.
 */
export default function GuestOnly({ children }: { children: React.ReactNode }) {
  const signedIn = useAccountStore((s) => s.status === 'ready' && Boolean(s.session?.account));

  if (signedIn) return null;
  return <>{children}</>;
}
