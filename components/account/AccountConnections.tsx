'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { ENGINES, type EngineId } from '@/lib/engines/registry';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProviderLogo from '@/components/ProviderLogo';
import { providerAccent } from '@/lib/providers/mark-color';
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog';
import { useAccountStore } from '@/store/useAccountStore';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { AccountSurface } from './AccountSurface';

const providers = ENGINES.map(engine => [engine.id, engine.label] as const);
interface Connection { id: string; provider: string; revision: number; hint: string }

const EXPLAINER = 'Save a provider key to use it for account jobs across devices. Keys are encrypted and are never shown again.';

export default function AccountConnections({ initialProvider = 'gemini', variant = 'panel' }: { initialProvider?: string; variant?: 'panel' | 'rail' }) {
  const ownerId=useAccountStore(state=>state.session?.account?.id);
  const connectionRevision=useAccountStore(state=>(state.session?.connections||[]).map(connection=>`${connection.id}:${connection.revision}`).join(','));
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<string>(initialProvider);
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [adding, setAdding] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Only the rail keeps the form behind a dialog, so the hook is inert in the
  // panel variant rather than conditionally called.
  useAccessibleDialog({ open: adding, onClose: () => { if (!busy) setAdding(false); }, dialogRef });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/connections', { signal: controller.signal, cache: 'no-store',headers:ownerId?{'X-Account-Id':ownerId}:{} }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if(!controller.signal.aborted)setConnections(data.connections);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load connections.'); });
    return () => controller.abort();
  }, [ownerId,connectionRevision]);

  async function update(method: 'POST' | 'DELETE', removeProvider?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/account/connections${removeProvider ? `/${removeProvider}` : ''}`, { method, headers: { 'Content-Type': 'application/json',...(ownerId?{'X-Account-Id':ownerId}:{}) }, ...(method === 'POST' ? { body: JSON.stringify({ provider, apiKey, accountId }) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not update this connection.');
      setConnections(data.connections); setApiKey(''); setAccountId('');
      accountChanged();void refreshAccount().catch(()=>{});
      setNotice(method === 'POST' ? 'Connection saved securely to your account.' : 'Connection removed.');
      if (method === 'POST') setAdding(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); setRemoving(null); }
  }

  const label = (id: string) => providers.find(([value]) => value === id)?.[1];

  const list = connections.length > 0 && (
    <ul className={variant === 'rail' ? 'mt-2.5' : 'mt-4 divide-y divide-[var(--border)]'}>
      {connections.map(connection => (
        <li key={connection.id} className={`flex items-center justify-between gap-3 ${variant === 'rail' ? 'border-b border-[var(--border)] py-2' : 'py-3'}`}>
          <div className="flex min-w-0 items-center gap-2.5">
            {/* The mark carries the provider's identity here; the colour is
                derived from the id so a new engine is never colourless. */}
            <span className="shrink-0" style={{ color: providerAccent(connection.provider) }}>
              <ProviderLogo provider={connection.provider as EngineId} size={variant === 'rail' ? 15 : 17} />
            </span>
            <div className="min-w-0">
              <p className={`truncate font-medium ${variant === 'rail' ? 'text-[13px]' : 'text-sm'}`}>{label(connection.provider)}</p>
              {variant === 'panel' && <p className="text-xs text-[var(--foreground-muted)]">Key ending in {connection.hint}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {variant === 'rail' && <span className="font-mono text-[10px] text-[var(--foreground-subtle)]">··{connection.hint}</span>}
            <button type="button" disabled={busy} onClick={() => setRemoving(connection)} aria-label={`Remove ${label(connection.provider)} connection`} className={`rounded-lg text-[var(--foreground-muted)] transition-colors hover:bg-red-400/10 hover:text-red-300 ${variant === 'rail' ? 'p-1.5' : 'p-3'}`}>
              <Trash2 size={variant === 'rail' ? 14 : 16} aria-hidden="true" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  const form = (
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void update('POST'); }}>
      <label className="block text-sm font-medium">Provider<select value={provider} onChange={event => setProvider(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-hover)] bg-[var(--background)] px-3 text-[var(--foreground)]">{providers.map(([id, engineLabel]) => <option key={id} value={id}>{engineLabel}</option>)}</select></label>
      {provider === 'cloudflare' && <label className="block text-sm font-medium">Cloudflare account ID<input required value={accountId} onChange={event => setAccountId(event.target.value)} autoComplete="off" className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-hover)] bg-[var(--background)] px-3" /></label>}
      <label className="block text-sm font-medium">API key<input required data-account-key type="password" minLength={8} maxLength={4096} value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-hover)] bg-[var(--background)] px-3" /></label>
      {connections.some(c => c.provider === provider) && <p className="text-sm text-amber-300">Saving replaces this connection. Jobs using the previous key may need attention.</p>}
      <button disabled={busy || !apiKey.trim()} type="submit" className="btn-primary flex min-h-11 w-full justify-center">{busy ? 'Saving…' : 'Save connection'}</button>
    </form>
  );

  const removalDialog = <ConfirmDialog open={!!removing} title="Remove this connection?" description="Jobs that still need this key may stop. Your existing saved assets remain available." confirmLabel="Remove connection" onConfirm={() => void update('DELETE', removing?.provider)} onCancel={() => setRemoving(null)} />;

  if (variant === 'rail') {
    return (
      <section aria-label="Saved connections">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">Saved connections</span>
          <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--foreground-subtle)]">{connections.length}</span>
        </div>
        {list}
        {connections.length === 0 && <p className="mt-2 text-[11px] leading-relaxed text-[var(--foreground-subtle)]">No provider keys are saved to this account yet.</p>}
        <button type="button" onClick={() => { setAdding(true); setNotice(null); setError(null); }} className="btn-secondary mt-3 flex w-full justify-center">
          <Plus size={15} aria-hidden="true" />Add provider key
        </button>
        {notice && <p role="status" className="mt-2.5 text-xs text-emerald-300">{notice}</p>}
        {error && !adding && <p role="alert" className="mt-2.5 text-xs text-red-300">{error}</p>}
        <AnimatePresence>
          {adding && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-md sm:items-center sm:p-4" onClick={() => { if (!busy) setAdding(false); }}>
              <motion.div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                initial={{ y: 24, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 24, opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                onClick={event => event.stopPropagation()}
                className="dialog-panel dialog-mobile-sheet dialog-touch-targets w-full max-w-md p-4 outline-none sm:p-5"
              >
                <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                  <KeyRound size={17} className="text-[var(--brand-accent)]" aria-hidden="true" />Add a provider key
                </h2>
                {/* The reassurance belongs at the moment of typing a secret, not
                    in the rail where the key is not being handled. */}
                <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-[var(--foreground-muted)]">{EXPLAINER}</p>
                <div className="mt-4">{form}</div>
                {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
                <button type="button" disabled={busy} onClick={() => setAdding(false)} className="btn-secondary mt-2 flex w-full justify-center">Cancel</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {removalDialog}
      </section>
    );
  }

  return <AccountSurface label="Saved connections" className="mt-5">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={18} className="text-[var(--brand-accent)]" aria-hidden="true" />Saved connections</h2>
    <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">{EXPLAINER}</p>
    {list}
    <div className="mt-5">{form}</div>
    {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {removalDialog}
  </AccountSurface>;
}
