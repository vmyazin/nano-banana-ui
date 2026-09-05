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

/**
 * The browser keys eligible for import, built from the app store's key fields.
 *
 * Shared so the import panel and the account rail's "found on this device"
 * summary count the same things. Two copies of this list would drift the first
 * time a provider is added — the panel would offer a key the summary never
 * mentioned.
 */
export interface BrowserKeyFields {
  apiKey: string; cfToken: string; cfAccountId: string; kieApiKey: string;
  falApiKey: string; runwareApiKey: string; atlasApiKey: string; cometApiKey: string;
}

export function browserKeyCandidates(fields: BrowserKeyFields): BrowserKeyImport[] {
  return ([
    { provider: 'gemini', apiKey: fields.apiKey },
    { provider: 'cloudflare', apiKey: fields.cfToken, accountId: fields.cfAccountId },
    { provider: 'kie', apiKey: fields.kieApiKey },
    { provider: 'fal', apiKey: fields.falApiKey },
    { provider: 'runware', apiKey: fields.runwareApiKey },
    { provider: 'atlas', apiKey: fields.atlasApiKey },
    { provider: 'comet', apiKey: fields.cometApiKey },
  ] as BrowserKeyImport[]).filter(key => key.apiKey.trim().length > 0);
}
