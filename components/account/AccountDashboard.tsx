'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, LogOut, RefreshCw, WalletCards } from 'lucide-react';
import AccountAssetImport from './AccountAssetImport';
import AccountConnections from './AccountConnections';
import AccountDeletion from './AccountDeletion';
import AccountKeyImport from './AccountKeyImport';
import AccountLibrary from './AccountLibrary';
import AccountPageShell from './AccountPageShell';
import { AccountSurface } from './AccountSurface';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';

export default function AccountDashboard() {
  const router = useRouter();
  const session = useAccountStore(state => state.session);
  const status = useAccountStore(state => state.status);
  const epoch = useAccountStore(state => state.epoch);
  const scope = `${session?.account?.id ?? 'guest'}:${epoch}`;
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ scope: string; message: string } | null>(null);
  const busy = busyScope === scope;
  const error = errorState?.scope === scope ? errorState.message : null;
  const account = status === 'ready' ? session?.account ?? null : null;

  useEffect(() => {
    if (status === 'ready' && !session?.account) router.replace('/sign-in');
  }, [router, session?.account, status]);

  async function retry() {
    const capturedScope = scope;
    setBusyScope(capturedScope);
    setErrorState(null);
    try {
      await refreshAccount();
    } catch (reason) {
      if (currentScope() === capturedScope) setErrorState({ scope: capturedScope, message: reason instanceof Error ? reason.message : 'Could not check your account.' });
    } finally {
      setBusyScope(current => current === capturedScope ? null : current);
    }
  }

  async function signOut(ownerId: string, ownerEpoch: number) {
    const capturedScope = `${ownerId}:${ownerEpoch}`;
    if (currentScope() !== capturedScope) return;
    setBusyScope(capturedScope);
    setErrorState(null);
    try {
      const response = await fetch('/api/account/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Account-Id': ownerId },
        body: JSON.stringify({ returnTo: '/account' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not sign out.');
      if (currentScope() !== capturedScope) return;
      accountChanged(true);
      await refreshAccount().catch(() => undefined);
      router.replace('/sign-in');
    } catch (reason) {
      if (currentScope() === capturedScope) setErrorState({ scope: capturedScope, message: reason instanceof Error ? reason.message : 'Could not sign out.' });
    } finally {
      setBusyScope(current => current === capturedScope ? null : current);
    }
  }

  function currentScope() {
    const current = useAccountStore.getState();
    return `${current.session?.account?.id ?? 'guest'}:${current.epoch}`;
  }

  if (status === 'loading') {
    return <AccountState><p role="status" className="text-sm text-[var(--foreground-muted)]">Checking your account…</p></AccountState>;
  }

  if (status === 'unavailable') {
    return (
      <AccountState>
        <p role="alert" className="text-sm text-amber-300">Account service is temporarily unavailable. Your account data has not been changed.</p>
        <button type="button" disabled={busy} onClick={() => void retry()} className="btn-secondary mt-5 flex w-full justify-center">
          <RefreshCw size={15} aria-hidden="true" />{busy ? 'Checking…' : 'Try again'}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-[var(--neon-pink)]">{error}</p>}
      </AccountState>
    );
  }

  if (!account) {
    return (
      <AccountPageShell narrow title="Your account" description="Your cloud workspace, saved provider connections, and private library.">
        <p role="status" className="mt-8 text-sm text-[var(--foreground-muted)]">Taking you to sign in…</p>
      </AccountPageShell>
    );
  }

  return (
    <AccountPageShell title="Your account" description="Manage the work and provider connections saved to your private cloud account.">
      <div key={`${account.id}:${epoch}`} className="space-y-5">
        <AccountSurface label="Account overview" className="mt-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400"><Check size={20} aria-hidden="true" /></span>
              <div className="min-w-0"><p className="truncate font-medium text-[var(--foreground)]">{account.name}</p><p className="break-all text-sm text-[var(--foreground-muted)]">{account.email}</p></div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
              <Link href="/spend" className="btn-secondary flex justify-center"><WalletCards size={16} aria-hidden="true" />View spend</Link>
              <Link href="/" className="btn-primary flex justify-center">Open the studio <ArrowRight size={16} aria-hidden="true" /></Link>
              <button type="button" disabled={busy} onClick={() => void signOut(account.id, epoch)} className="btn-secondary flex justify-center"><LogOut size={15} aria-hidden="true" />{busy ? 'Signing out…' : 'Sign out'}</button>
            </div>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-[var(--neon-pink)]">{error}</p>}
        </AccountSurface>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] [&>section]:mt-0"><AccountLibrary localTest={session?.localSignIn} ownerId={account.id} /><AccountConnections /></div>
        <div className="grid items-start gap-5 lg:grid-cols-2 [&>section]:mt-0"><AccountKeyImport ownerId={account.id} /><AccountAssetImport ownerId={account.id} /></div>
        <AccountDeletion ownerId={account.id} />
      </div>
    </AccountPageShell>
  );
}

function AccountState({ children }: { children: React.ReactNode }) {
  return (
    <AccountPageShell narrow title="Your account" description="Your cloud workspace, saved provider connections, and private library.">
      <AccountSurface label="Account status" className="mt-8">{children}</AccountSurface>
    </AccountPageShell>
  );
}
