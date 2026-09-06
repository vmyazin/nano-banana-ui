import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ApiKeyConfig from '@/components/ApiKeyConfig';
import { syncPendingConnections } from '@/lib/account/connection-sync';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

// ApiKeyConfig renders bare in jsdom — tests/api-key-focus.test.tsx mounts it
// with no mocks at all — so only the modules with side effects need doubling.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/account/session', () => ({ accountChanged: vi.fn(), refreshAccount: vi.fn(async () => undefined) }));
// pendingConnectionWrites stays real: the assertion below is about what it decides.
vi.mock('@/lib/account/connection-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/connection-sync')>()),
  syncPendingConnections: vi.fn(async () => []),
  saveBrowserKey: vi.fn(async () => ({ connections: [] })),
  removeConnection: vi.fn(async () => ({ connections: [] })),
}));

function signIn() {
  useAccountStore.getState().applySession({
    account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true, localSignIn: false, providers: [], connections: [],
  });
}

describe('the connections dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ apiKey: '', kieApiKey: '', falApiKey: '', cfToken: '', cfAccountId: '', runwareApiKey: '', atlasApiKey: '', cometApiKey: '', accountKeyOptOuts: [] });
  });

  it('no longer offers a separate saved-connections form', () => {
    signIn();
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Save connection' })).not.toBeInTheDocument();
    expect(screen.queryByText('Browser-only connections')).not.toBeInTheDocument();
  });

  it('tells a signed-in user their keys reach the account', () => {
    signIn();
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);
    expect(screen.getByText(/encrypted in your account/i)).toBeInTheDocument();
  });

  it('leaves a guest with the browser-only promise', () => {
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);
    expect(screen.getByText(/never to our servers beyond proxying the request/)).toBeInTheDocument();
  });

  it('syncs stored keys to the account on Save & close', async () => {
    signIn();
    useAppStore.setState({ runwareApiKey: 'runware-key-abcd' });
    const onOpenChange = vi.fn();
    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Save & close/ }));

    await waitFor(() =>
      expect(syncPendingConnections).toHaveBeenCalledWith(
        [{ provider: 'runware', apiKey: 'runware-key-abcd' }],
        'owner-1'
      )
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does not reach the account for a guest', async () => {
    useAppStore.setState({ runwareApiKey: 'runware-key-abcd' });
    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & close/ }));
    await waitFor(() => expect(syncPendingConnections).not.toHaveBeenCalled());
  });

  it('dismissing the dialog syncs nothing', async () => {
    signIn();
    useAppStore.setState({ runwareApiKey: 'runware-key-abcd' });
    const onOpenChange = vi.fn();
    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(syncPendingConnections).not.toHaveBeenCalled();
  });
});
