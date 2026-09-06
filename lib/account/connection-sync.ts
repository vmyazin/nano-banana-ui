import { accountRequest } from './client';
import { browserKeyCandidates, type BrowserKeyFields, type BrowserKeyImport, type ImportableProvider } from './key-import';
import type { AccountConnection } from '@/store/useAccountStore';

/** The Worker's own floor, mirrored so a half-typed key never becomes a 400. */
const MIN_KEY_LENGTH = 8;
const CLOUDFLARE_ACCOUNT = /^[a-f0-9]{32}$/i;

/**
 * The keys this device holds that the account does not already have.
 *
 * The hint comparison is the guard that matters. Every write bumps `revision`,
 * and a job still running on the previous revision fails when its connection
 * resolves — so re-uploading a key that has not changed would break jobs for
 * nothing. `hint` is the key's last four characters (`cloud/src/vault.ts:40`).
 */
export function pendingConnectionWrites(
  fields: BrowserKeyFields,
  connections: AccountConnection[],
  optedOut: readonly ImportableProvider[]
): BrowserKeyImport[] {
  const saved = new Map(connections.map(connection => [connection.provider, connection.hint]));
  return browserKeyCandidates(fields).filter(candidate => {
    if (optedOut.includes(candidate.provider)) return false;
    const key = candidate.apiKey.trim();
    if (key.length < MIN_KEY_LENGTH) return false;
    if (candidate.provider === 'cloudflare' && !CLOUDFLARE_ACCOUNT.test(candidate.accountId ?? '')) return false;
    return saved.get(candidate.provider) !== key.slice(-4);
  });
}

export function saveBrowserKey(key: BrowserKeyImport, ownerId: string, signal?: AbortSignal) {
  return accountRequest<{ connections: AccountConnection[] }>('connections', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Account-Id': ownerId },
    body: JSON.stringify(key),
  });
}

export function removeConnection(provider: ImportableProvider, ownerId: string, signal?: AbortSignal) {
  return accountRequest<{ connections: AccountConnection[] }>(`connections/${provider}`, {
    method: 'DELETE',
    signal,
    headers: { 'X-Account-Id': ownerId },
  });
}

/**
 * Writes sequentially, not in parallel: each response returns the whole
 * connection list, and concurrent writes to the same account would race on the
 * revision counter. Returns the providers that failed so the caller can say so
 * without losing the ones that worked.
 */
export async function syncPendingConnections(pending: BrowserKeyImport[], ownerId: string): Promise<ImportableProvider[]> {
  const failed: ImportableProvider[] = [];
  for (const key of pending) {
    try {
      await saveBrowserKey(key, ownerId);
    } catch {
      failed.push(key.provider);
    }
  }
  return failed;
}
