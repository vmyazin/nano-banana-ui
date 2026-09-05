'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, LogOut } from 'lucide-react';
import { AccountSurface } from './AccountSurface';
import AccountLibrary from './AccountLibrary';
import AccountConnections from './AccountConnections';
import AccountAssetImport from './AccountAssetImport';
import AccountKeyImport from './AccountKeyImport';
import AccountDeletion from './AccountDeletion';
import { BrandWordmark } from '@/components/BrandMark';

import { useAccountStore } from '@/store/useAccountStore';
import { accountChanged, refreshAccount } from '@/lib/account/session';

export default function AccountAccess({ mode, signInFailed=false }: { mode: 'sign-in' | 'sign-up'; signInFailed?:boolean }) {
  const session=useAccountStore(state=>state.session);
  const accountStatus=useAccountStore(state=>state.status);
  const [error, setError] = useState<string | null>(signInFailed?'Google sign-in was not completed. Please try again.':null);
  const [busy, setBusy] = useState(false);
  const loading=accountStatus==='loading';
  const signup = mode === 'sign-up';


  async function act(path: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/account/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnTo: `/${mode}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Please try again.');
      if (path === 'sign-in/google') {
        const destination = new URL(data.url);
        if (destination.origin !== 'https://accounts.google.com') throw new Error('Invalid sign-in response.');
        window.location.assign(destination.href);
      } else {
        accountChanged(path==='sign-out');
        await refreshAccount();
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10 sm:py-10">
      <Link href="/" aria-label="Scene Assembly home" className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]">
        <BrandWordmark className="h-8 w-auto text-[var(--foreground)]" />
      </Link>
      <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center py-12">
        <p className="eyebrow mb-4 text-[var(--brand-accent)]">YOUR CREATIVE SPACE</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          {session?.account ? 'You’re signed in.' : signup ? 'Make yourself at home.' : 'Welcome back.'}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--foreground-muted)]">
          {session?.account ? 'Your Scene Assembly account is ready.' : signup ? 'Create your Scene Assembly account with Google.' : 'Sign in to your Scene Assembly account with Google.'}
        </p>
        <AccountSurface label="Account access" className="mt-8">
          {loading ? <p role="status" className="text-sm text-[var(--foreground-muted)]">Checking your account…</p> : session?.account ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400"><Check size={20} aria-hidden="true" /></span>
                <div className="min-w-0"><p className="truncate font-medium">{session.account.name}</p><p className="break-all text-sm text-[var(--foreground-muted)]">{session.account.email}</p></div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--foreground-muted)]">Manage your saved connections and cloud library below. Supported account jobs keep running after you leave the studio.</p>
              <Link href="/" className="btn-primary mt-6 flex w-full justify-center">Open the studio <ArrowRight size={16} aria-hidden="true" /></Link>
              <button type="button" disabled={busy} onClick={() => void act('sign-out')} className="btn-secondary mt-3 flex w-full justify-center"><LogOut size={15} aria-hidden="true" />{busy ? 'Signing out…' : 'Sign out'}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy || !session?.googleEnabled} onClick={() => void act('sign-in/google')} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--border-hover)] bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]">
                <GoogleMark />{busy ? 'Connecting…' : 'Continue with Google'}
              </button>
              {session && !session.googleEnabled && <p className="mt-3 text-sm text-[var(--foreground-muted)]">Google sign-in isn’t available yet. You can keep creating as a guest.</p>}
              {session?.localSignIn && <button type="button" disabled={busy} onClick={() => void act('local-sign-in')} className="btn-secondary mt-4 flex w-full justify-center">Use local test account</button>}
              <p className="mt-5 text-center text-sm leading-relaxed text-[var(--foreground-muted)]">An account is optional. You can create and download without signing in.</p>
            </>
          )}
          {accountStatus==='unavailable'&&<p role="alert" className="mt-4 text-sm text-amber-300">Account service is temporarily unavailable. Please try again shortly.</p>}
          {error && <p role="alert" className="mt-4 text-sm leading-relaxed text-[var(--neon-pink)]">{error}</p>}
        </AccountSurface>
        {session?.account && <div key={session.account.id}><AccountLibrary localTest={session.localSignIn} ownerId={session.account.id} /><AccountConnections /><AccountKeyImport ownerId={session.account.id}/><AccountAssetImport ownerId={session.account.id}/><AccountDeletion ownerId={session.account.id}/></div>}
        {!session?.account && <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">{signup ? 'Already have an account?' : 'New to Scene Assembly?'}{' '}<Link className="text-[var(--foreground)] underline underline-offset-4" href={signup ? '/sign-in' : '/sign-up'}>{signup ? 'Sign in' : 'Create an account'}</Link></p>}
        <Link href="/" className="mx-auto mt-8 inline-flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"><ArrowLeft size={15} aria-hidden="true" />{session?.account?'Return to the studio':'Continue as a guest'}</Link>
      </div>
    </main>
  );
}
function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.9 6.1-14.7Z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16.1 44 24 44Z" /><path fill="#FBBC05" d="M12.6 27.6c-.4-1.2-.6-2.4-.6-3.6s.2-2.4.6-3.6v-5.2H5.8A20 20 0 0 0 4 24c0 3.2.8 6.2 1.8 8.8l6.8-5.2Z" /><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.8 29.5 4 24 4 16.1 4 9.2 8.5 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z" /></svg>;
}
