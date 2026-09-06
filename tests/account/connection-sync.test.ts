import { describe, expect, it, vi, beforeEach } from 'vitest';

import { pendingConnectionWrites, syncPendingConnections } from '@/lib/account/connection-sync';
import { accountRequest } from '@/lib/account/client';
import type { BrowserKeyFields } from '@/lib/account/key-import';

vi.mock('@/lib/account/client', () => ({ accountRequest: vi.fn() }));

const EMPTY: BrowserKeyFields = {
  apiKey: '', cfToken: '', cfAccountId: '', kieApiKey: '',
  falApiKey: '', runwareApiKey: '', atlasApiKey: '', cometApiKey: '',
};
const connection = (provider: string, hint: string) => ({ id: `${provider}-1`, provider, revision: 1, hint });

describe('pendingConnectionWrites', () => {
  it('skips a provider whose stored hint already matches the local key', () => {
    const pending = pendingConnectionWrites(
      { ...EMPTY, apiKey: 'AIzaSyLocalKey4f2a' },
      [connection('gemini', '4f2a')],
      []
    );
    expect(pending).toEqual([]);
  });

  it('includes a provider whose local key has changed', () => {
    const pending = pendingConnectionWrites(
      { ...EMPTY, apiKey: 'AIzaSyLocalKey9c1d' },
      [connection('gemini', '4f2a')],
      []
    );
    expect(pending).toEqual([{ provider: 'gemini', apiKey: 'AIzaSyLocalKey9c1d' }]);
  });

  it('includes a provider the account has never held', () => {
    const pending = pendingConnectionWrites({ ...EMPTY, falApiKey: 'fal-key-abcd' }, [], []);
    expect(pending.map(key => key.provider)).toEqual(['fal']);
  });

  it('skips a provider the user opted out of', () => {
    const pending = pendingConnectionWrites({ ...EMPTY, falApiKey: 'fal-key-abcd' }, [], ['fal']);
    expect(pending).toEqual([]);
  });

  it('skips a key below the length the Worker accepts', () => {
    const pending = pendingConnectionWrites({ ...EMPTY, kieApiKey: 'short' }, [], []);
    expect(pending).toEqual([]);
  });

  it('skips cloudflare until its account id is a 32-character hex string', () => {
    const withoutId = pendingConnectionWrites({ ...EMPTY, cfToken: 'cf-token-value', cfAccountId: 'nope' }, [], []);
    expect(withoutId).toEqual([]);

    const withId = pendingConnectionWrites(
      { ...EMPTY, cfToken: 'cf-token-value', cfAccountId: 'a'.repeat(32) },
      [], []
    );
    expect(withId).toEqual([{ provider: 'cloudflare', apiKey: 'cf-token-value', accountId: 'a'.repeat(32) }]);
  });
});

describe('syncPendingConnections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports only the providers that failed, and still writes the rest', async () => {
    vi.mocked(accountRequest).mockImplementation(async (path, init) => {
      if (String(init?.body).includes('fal-key')) throw new Error('nope');
      return { connections: [] };
    });

    const failed = await syncPendingConnections(
      [{ provider: 'gemini', apiKey: 'AIzaSyGood' }, { provider: 'fal', apiKey: 'fal-key-abcd' }],
      'owner-1'
    );

    expect(failed).toEqual(['fal']);
    expect(accountRequest).toHaveBeenCalledTimes(2);
  });
});
