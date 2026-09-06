import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AccountSessionProvider from '@/components/account/AccountSessionProvider';
import { accountRequest } from '@/lib/account/client';
import type { CloudJobView } from '@/lib/account/contracts';
import { useAccountStore } from '@/store/useAccountStore';

vi.mock('@/lib/account/client', () => ({ accountRequest: vi.fn() }));

const account = { id: 'owner-1', name: 'Owner', email: 'owner@example.test' };
const session = { account, googleEnabled: true, localSignIn: false, providers: [], connections: [] };
function job(state: CloudJobView['state']): CloudJobView {
  return { id: `job-${state}`, provider: 'gemini', state, errorCode: null, createdAt: 1, updatedAt: 1, request: { provider: 'gemini', modelId: 'm', mediaType: 'image', inputMode: 'text', prompt: 'p', values: {}, referenceIds: [] } };
}
function serve(jobs: CloudJobView[]) {
  vi.mocked(accountRequest).mockImplementation(async (path) => {
    if (path === 'session') return session;
    if (path === 'jobs') return { accountId: account.id, jobs };
    if (path === 'assets') return { accountId: account.id, assets: [] };
    throw new Error(`Unexpected path: ${path}`);
  });
}
const paths = () => vi.mocked(accountRequest).mock.calls.map(([path]) => path);

describe('account polling', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads session, jobs and assets once, then stays quiet while nothing is running', async () => {
    serve([job('saved')]);
    render(<AccountSessionProvider><div /></AccountSessionProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(paths()).toEqual(['session', 'jobs', 'assets']);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(paths()).toEqual(['session', 'jobs', 'assets']);

    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(paths()).toEqual(['session', 'jobs', 'assets', 'session', 'jobs', 'assets']);
  });

  it('polls only the work every tick while a job is in flight', async () => {
    serve([job('running')]);
    render(<AccountSessionProvider><div /></AccountSessionProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(useAccountStore.getState().jobs).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(paths()).toEqual(['session', 'jobs', 'assets', 'jobs', 'assets']);
  });

  it('polls nothing while the tab is hidden', async () => {
    serve([job('running')]);
    render(<AccountSessionProvider><div /></AccountSessionProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(paths()).toEqual(['session', 'jobs', 'assets']);
  });
});
