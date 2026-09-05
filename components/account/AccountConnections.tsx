'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { ENGINES } from '@/lib/engines/registry';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAccountStore } from '@/store/useAccountStore';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { AccountSurface } from './AccountSurface';

const providers = ENGINES.filter(engine => engine.requiresApiKey).map(engine => [engine.id, engine.label] as const);
interface Connection { id: string; provider: string; revision: number; hint: string }
export default function AccountConnections({initialProvider='gemini'}:{initialProvider?:string}) {
  const ownerId=useAccountStore(state=>state.session?.account?.id);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<string>(initialProvider);
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/connections', { signal: controller.signal, cache: 'no-store',headers:ownerId?{'X-Account-Id':ownerId}:{} }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if(!controller.signal.aborted)setConnections(data.connections);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load connections.'); });
    return () => controller.abort();
  }, [ownerId]);
  async function update(method: 'POST' | 'DELETE', removeProvider?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/account/connections${removeProvider ? `/${removeProvider}` : ''}`, { method, headers: { 'Content-Type': 'application/json',...(ownerId?{'X-Account-Id':ownerId}:{}) }, ...(method === 'POST' ? { body: JSON.stringify({ provider, apiKey, accountId }) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not update this connection.');
      setConnections(data.connections); setApiKey(''); setAccountId('');
      accountChanged();void refreshAccount().catch(()=>{});
      setNotice(method === 'POST' ? 'Connection saved securely to your account.' : 'Connection removed.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); setRemoving(null); }
  }
  return <AccountSurface label="Saved connections" className="mt-5">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={18} className="text-[var(--brand-accent)]" aria-hidden="true" />Saved connections</h2>
    <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Save a provider key to use it for account jobs across devices. Keys are encrypted and are never shown again.</p>
    {connections.length > 0 && <ul className="mt-4 divide-y divide-[var(--border)]">{connections.map(connection => <li key={connection.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{providers.find(([id]) => id === connection.provider)?.[1]}</p><p className="text-xs text-[var(--foreground-muted)]">Key ending in {connection.hint}</p></div><button type="button" disabled={busy} onClick={() => setRemoving(connection)} aria-label={`Remove ${providers.find(([id]) => id === connection.provider)?.[1]} connection`} className="rounded-lg p-3 text-[var(--foreground-muted)] transition-colors hover:bg-red-400/10 hover:text-red-300"><Trash2 size={16} aria-hidden="true" /></button></li>)}</ul>}
    <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void update('POST'); }}>
      <label className="block text-sm font-medium">Provider<select value={provider} onChange={event => setProvider(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-hover)] bg-[var(--background)] px-3 text-[var(--foreground)]">{providers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {provider === 'cloudflare' && <label className="block text-sm font-medium">Cloudflare account ID<input required value={accountId} onChange={event => setAccountId(event.target.value)} autoComplete="off" className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-hover)] bg-[var(--background)] px-3" /></label>}
      <label className="block text-sm font-medium">API key<input required data-account-key type="password" minLength={8} maxLength={4096} value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-hover)] bg-[var(--background)] px-3" /></label>
      {connections.some(c => c.provider === provider) && <p className="text-sm text-amber-300">Saving replaces this connection. Jobs using the previous key may need attention.</p>}
      <button disabled={busy || !apiKey.trim()} type="submit" className="btn-primary flex min-h-11 w-full justify-center">{busy ? 'Saving…' : 'Save connection'}</button>
    </form>
    {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    <ConfirmDialog open={!!removing} title="Remove this connection?" description="Jobs that still need this key may stop. Your existing saved assets remain available." confirmLabel="Remove connection" onConfirm={() => void update('DELETE', removing?.provider)} onCancel={() => setRemoving(null)} />
  </AccountSurface>;
}
