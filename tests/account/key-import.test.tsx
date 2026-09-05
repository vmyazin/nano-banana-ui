import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountKeyImport from '@/components/account/AccountKeyImport';
import { accountRequest } from '@/lib/account/client';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

vi.mock('@/lib/account/client', () => ({ accountRequest: vi.fn() }));
vi.mock('@/lib/account/session', () => ({ accountChanged: vi.fn(), refreshAccount: vi.fn().mockResolvedValue(undefined) }));

const owner = { id: 'owner-1', name: 'Owner', email: 'owner@example.test' };
function signedIn(connections: Array<{ id: string; provider: string; revision: number; hint: string }> = []) {
  useAccountStore.getState().applySession({ account: owner, googleEnabled: true, localSignIn: false, providers: [], connections });
}

describe('AccountKeyImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      apiKey: 'gemini-browser-dummy-key', cfToken: '', cfAccountId: '', kieApiKey: 'kie-browser-dummy-key',
      falApiKey: '', runwareApiKey: '', atlasApiKey: '', cometApiKey: '', hasHydrated: true,
    });
    signedIn();
    vi.mocked(accountRequest).mockImplementation(async (_path, init) => {
      const body = JSON.parse(String(init?.body));
      return { connections: [], import: { provider: body.provider, status: 'inserted' } };
    });
  });

  it('does not import automatically and starts every available key unchecked', () => {
    render(<AccountKeyImport ownerId={owner.id} />);
    expect(accountRequest).not.toHaveBeenCalled();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getAllByRole('checkbox').every(checkbox => !(checkbox as HTMLInputElement).checked)).toBe(true);
  });

  it('imports only selected keys and preserves the browser key', async () => {
    render(<AccountKeyImport ownerId={owner.id} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Google Gemini' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await waitFor(() => expect(accountRequest).toHaveBeenCalledTimes(1));
    expect(accountRequest).toHaveBeenCalledWith('connections', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Account-Id': owner.id }),
      body: JSON.stringify({ provider: 'gemini', apiKey: 'gemini-browser-dummy-key', ifAbsent: true }),
    }));
    expect(useAppStore.getState().apiKey).toBe('gemini-browser-dummy-key');
    expect(accountChanged).toHaveBeenCalledTimes(1);
    expect(refreshAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps failed choices selected and retries only the missing key', async () => {
    vi.mocked(accountRequest)
      .mockResolvedValueOnce({ connections: [], import: { provider: 'gemini', status: 'inserted' } })
      .mockRejectedValueOnce(new Error('Kie unavailable'))
      .mockResolvedValueOnce({ connections: [], import: { provider: 'kie', status: 'inserted' } });
    render(<AccountKeyImport ownerId={owner.id} />);
    screen.getAllByRole('checkbox').forEach(checkbox => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kie unavailable');
    expect(screen.getByRole('checkbox', { name: 'Kie.ai' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await waitFor(() => expect(accountRequest).toHaveBeenCalledTimes(3));
    const providers = vi.mocked(accountRequest).mock.calls.map(([, init]) => JSON.parse(String(init?.body)).provider);
    expect(providers).toEqual(['gemini', 'kie', 'kie']);
  });

  it('disables existing account connections and skips them', async () => {
    signedIn([{ id: 'saved-1', provider: 'gemini', revision: 1, hint: 'test' }]);
    render(<AccountKeyImport ownerId={owner.id} />);
    expect(screen.getByRole('checkbox', { name: 'Google Gemini' })).toBeDisabled();
    expect(screen.getByText('Already saved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kie.ai' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await waitFor(() => expect(accountRequest).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(accountRequest).mock.calls[0][1]?.body)).provider).toBe('kie');
  });

  it('halts before the next key when the account changes during an import', async () => {
    vi.mocked(accountRequest).mockImplementationOnce(async () => {
      useAccountStore.getState().applySession({ account: { ...owner, id: 'owner-2' }, googleEnabled: true, localSignIn: false, providers: [], connections: [] });
      return { connections: [], import: { provider: 'gemini', status: 'inserted' } };
    });
    render(<AccountKeyImport ownerId={owner.id} />);
    screen.getAllByRole('checkbox').forEach(checkbox => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await waitFor(() => expect(accountRequest).toHaveBeenCalledTimes(1));
    expect(accountChanged).not.toHaveBeenCalled();
    expect(refreshAccount).not.toHaveBeenCalled();
  });
});
