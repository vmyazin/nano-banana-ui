import { accountRequest } from './client';
import type { EngineId } from '@/lib/engines/registry';
import type { AccountConnection } from '@/store/useAccountStore';

export type ImportableProvider = Exclude<EngineId, 'pollinations'>;
export interface BrowserKeyImport {
  provider: ImportableProvider;
  apiKey: string;
  accountId?: string;
}
export interface KeyImportResponse {
  connections: AccountConnection[];
  import: { provider: ImportableProvider; status: 'inserted' | 'skipped' };
}

export function importBrowserKey(key: BrowserKeyImport, ownerId: string, signal?: AbortSignal) {
  return accountRequest<KeyImportResponse>('connections', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Account-Id': ownerId },
    body: JSON.stringify({ ...key, ifAbsent: true }),
  });
}
