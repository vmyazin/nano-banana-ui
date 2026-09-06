import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConnectionStorageControl from '@/components/account/ConnectionStorageControl';
import { removeConnection, saveBrowserKey } from '@/lib/account/connection-sync';
import { useAccountStore, type AccountConnection } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

vi.mock('@/lib/account/connection-sync', () => ({
  saveBrowserKey: vi.fn(async () => ({ connections: [] })),
  removeConnection: vi.fn(async () => ({ connections: [] })),
}));
vi.mock('@/lib/account/session', () => ({ accountChanged: vi.fn(), refreshAccount: vi.fn(async () => undefined) }));

function signIn(connections: AccountConnection[] = []) {
  useAccountStore.getState().applySession({
    account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true, localSignIn: false, providers: [], connections,
  });
}
const gemini = (hint = '4f2a'): AccountConnection => ({ id: 'c1', provider: 'gemini', revision: 1, hint });

describe('ConnectionStorageControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ accountKeyOptOuts: [] });
  });

  it('renders nothing for a guest', () => {
    const { container } = render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no key and no connection', () => {
    signIn();
    const { container } = render(<ConnectionStorageControl provider="gemini" apiKey="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows both places and offers removal once the account holds the key', () => {
    signIn([gemini()]);
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(screen.getByText('On this device')).toBeInTheDocument();
    expect(screen.getByText(/Encrypted in your account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove from account/ })).toBeInTheDocument();
  });

  it('names the account copy and warns about browser-only when this device has no key', () => {
    signIn([gemini('9c1d')]);
    render(<ConnectionStorageControl provider="gemini" apiKey="" />);
    expect(screen.getByText(/9c1d/)).toBeInTheDocument();
    expect(screen.getByText(/Browser-only runs need a key on this device/)).toBeInTheDocument();
    expect(screen.queryByText('On this device')).not.toBeInTheDocument();
  });

  it('offers Save to account only for a provider that was opted out', () => {
    signIn();
    useAppStore.setState({ accountKeyOptOuts: ['gemini'] });
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(screen.getByText('Not in your account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save to account/ })).toBeInTheDocument();
  });

  it('shows no button while a key is waiting for the next Save & close', () => {
    signIn();
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(screen.getByText('On this device')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('removing sets the opt-out so the next sync leaves it alone', async () => {
    signIn([gemini()]);
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    fireEvent.click(screen.getByRole('button', { name: /Remove from account/ }));
    await waitFor(() => expect(removeConnection).toHaveBeenCalledWith('gemini', 'owner-1'));
    expect(useAppStore.getState().accountKeyOptOuts).toEqual(['gemini']);
  });

  it('saving clears the opt-out and sends the key that is on screen', async () => {
    signIn();
    useAppStore.setState({ accountKeyOptOuts: ['cloudflare'] });
    render(<ConnectionStorageControl provider="cloudflare" apiKey="cf-token-value" accountId={'a'.repeat(32)} />);
    fireEvent.click(screen.getByRole('button', { name: /Save to account/ }));
    await waitFor(() =>
      expect(saveBrowserKey).toHaveBeenCalledWith(
        { provider: 'cloudflare', apiKey: 'cf-token-value', accountId: 'a'.repeat(32) },
        'owner-1'
      )
    );
    expect(useAppStore.getState().accountKeyOptOuts).toEqual([]);
  });

  it('keeps the connection and reports the failure when removal fails', async () => {
    signIn([gemini()]);
    vi.mocked(removeConnection).mockRejectedValueOnce(new Error('Network unavailable.'));
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    fireEvent.click(screen.getByRole('button', { name: /Remove from account/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable.');
    expect(useAppStore.getState().accountKeyOptOuts).toEqual([]);
  });
});
