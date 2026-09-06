'use client';

import { useState } from 'react';
import { CloudUpload, Loader2, Lock, MonitorSmartphone } from 'lucide-react';

import { removeConnection, saveBrowserKey } from '@/lib/account/connection-sync';
import type { ImportableProvider } from '@/lib/account/key-import';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

/**
 * Where one provider's key is kept, and the single button that changes it.
 *
 * Signed in, Save & close puts every key in both places, so this control is an
 * exit from that default rather than the route to it: the common case renders a
 * badge and a Remove button, and "Save to account" appears only for a provider
 * previously opted out.
 */
export default function ConnectionStorageControl({
  provider,
  apiKey,
  accountId,
}: {
  provider: ImportableProvider;
  apiKey: string;
  accountId?: string;
}) {
  const ownerId = useAccountStore((state) => state.session?.account?.id);
  const connection = useAccountStore((state) =>
    (state.session?.connections ?? []).find((entry) => entry.provider === provider)
  );
  const optedOut = useAppStore((state) => state.accountKeyOptOuts.includes(provider));
  const setOptOut = useAppStore((state) => state.setAccountKeyOptOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = apiKey.trim();
  if (!ownerId || (!connection && !key)) return null;

  async function run(action: () => Promise<unknown>, thenOptOut: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      // The flag flips only after the write lands, so a failed removal does not
      // leave the provider opted out of a connection it still has.
      setOptOut(provider, thenOptOut);
      accountChanged();
      void refreshAccount().catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => saveBrowserKey({ provider, apiKey: key, ...(accountId ? { accountId } : {}) }, ownerId), false);
  const remove = () => run(() => removeConnection(provider, ownerId), true);

  const button = connection ? (
    <button
      type="button"
      disabled={busy}
      onClick={() => void remove()}
      className="btn-secondary shrink-0 gap-1.5 px-2 py-1 text-xs disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      Remove from account
    </button>
  ) : optedOut ? (
    <button
      type="button"
      disabled={busy}
      onClick={() => void save()}
      className="btn-secondary shrink-0 gap-1.5 border-[var(--neon-cyan)]/30 px-2 py-1 text-xs text-[var(--neon-cyan)] disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CloudUpload size={13} aria-hidden="true" />}
      Save to account
    </button>
  ) : null;

  const badge = (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--foreground-subtle)]">
      {key && (
        <span className="inline-flex items-center gap-1.5">
          <MonitorSmartphone size={13} aria-hidden="true" />On this device
        </span>
      )}
      {key && (connection || optedOut) && <span aria-hidden="true">·</span>}
      {connection ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <Lock size={13} aria-hidden="true" />Encrypted in your account
          {!key && <span className="font-mono"> · ends ··{connection.hint}</span>}
        </span>
      ) : optedOut ? (
        <span>Not in your account</span>
      ) : null}
    </p>
  );

  const note = !key && connection
    ? 'Cloud jobs use it already. Browser-only runs need a key on this device.'
    : optedOut && key
      ? 'Kept off your account, so cloud jobs cannot use it.'
      : null;

  return (
    <>
      {button}
      <div className="space-y-1.5">
        {badge}
        {note && <p className="text-xs leading-snug text-[var(--foreground-subtle)]">{note}</p>}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>
    </>
  );
}
