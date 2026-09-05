import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountPage from '@/app/account/page';
import SignInPage from '@/app/sign-in/page';
import SignUpPage from '@/app/sign-up/page';
import { useAccountStore, type AccountSession } from '@/store/useAccountStore';

const { replace, refreshAccount, accountChanged } = vi.hoisted(() => ({
  replace: vi.fn(),
  refreshAccount: vi.fn(),
  accountChanged: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/account/session', () => ({ refreshAccount, accountChanged }));
vi.mock('@/components/account/AccountLibrary', () => ({
  default: ({ ownerId }: { ownerId: string }) => <section>Cloud library for {ownerId}</section>,
}));
vi.mock('@/components/account/AccountConnections', () => ({ default: () => <section>Saved connections</section> }));
vi.mock('@/components/account/AccountKeyImport', () => ({
  default: ({ ownerId }: { ownerId: string }) => <section>Key import for {ownerId}</section>,
}));
vi.mock('@/components/account/AccountAssetImport', () => ({
  default: ({ ownerId }: { ownerId: string }) => <section>Asset import for {ownerId}</section>,
}));
vi.mock('@/components/account/AccountDeletion', () => ({
  default: ({ ownerId }: { ownerId: string }) => <section>Deletion for {ownerId}</section>,
}));

const owner = { id: 'owner-1', name: 'Ada Creator', email: 'ada@example.test' };
const signedInSession: AccountSession = {
  account: owner,
  googleEnabled: true,
  localSignIn: true,
  providers: ['gemini'],
  connections: [],
};
const guestSession: AccountSession = { ...signedInSession, account: null, connections: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function signedIn() {
  useAccountStore.getState().applySession(signedInSession);
}

describe('account pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.getState().applySession(guestSession);
    refreshAccount.mockResolvedValue(guestSession);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('places the signed-in identity and every account management surface on /account', () => {
    signedIn();
    render(<AccountPage />);

    expect(screen.getByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    expect(screen.getByText('Ada Creator')).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByText('Cloud library for owner-1')).toBeInTheDocument();
    expect(screen.getByText('Saved connections')).toBeInTheDocument();
    expect(screen.getByText('Key import for owner-1')).toBeInTheDocument();
    expect(screen.getByText('Asset import for owner-1')).toBeInTheDocument();
    expect(screen.getByText('Deletion for owner-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View spend' })).toHaveAttribute('href', '/spend');
  });

  it('shows the Google photo and recovers from a failed photo when its URL changes', () => {
    const picture = 'https://lh3.googleusercontent.com/a/first';
    useAccountStore.getState().applySession({ ...signedInSession, account: { ...owner, picture } });
    render(<AccountPage />);
    const avatar = screen.getByRole('img', { name: "Ada Creator's profile photo" });
    expect(avatar).toHaveAttribute('src', picture);
    fireEvent.error(avatar);
    expect(screen.queryByRole('img', { name: "Ada Creator's profile photo" })).toBeNull();
    expect(screen.getByText('Ada Creator')).toBeInTheDocument();
    act(() => useAccountStore.getState().applySession({ ...signedInSession, account: { ...owner, picture: 'https://lh3.googleusercontent.com/a/new' } }));
    expect(screen.getByRole('img', { name: "Ada Creator's profile photo" })).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/new');
  });

  it.each([null, 'https://unrelated.example.test/avatar.png'])('keeps the identity visible without loading an unavailable or unsupported photo', picture => {
    useAccountStore.getState().applySession({ ...signedInSession, account: { ...owner, picture } });
    render(<AccountPage />);
    expect(screen.queryByRole('img', { name: "Ada Creator's profile photo" })).toBeNull();
    expect(screen.getByText('Ada Creator')).toBeInTheDocument();
  });

  it('redirects signed-in visitors away from both authentication entry points', async () => {
    signedIn();
    const view = render(await SignInPage({ searchParams: Promise.resolve({}) }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));

    replace.mockClear();
    view.unmount();
    render(<SignUpPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));
  });

  it('waits for account resolution without mounting owner-scoped content', () => {
    useAccountStore.setState({ session: null, status: 'loading' });
    render(<AccountPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your account');
    expect(screen.queryByText(/Cloud library for/)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows a recoverable unavailable state without leaking stale owner content', async () => {
    signedIn();
    useAccountStore.getState().unavailable();
    refreshAccount.mockResolvedValue(signedInSession);
    render(<AccountPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Account service is temporarily unavailable');
    expect(screen.queryByText('ada@example.test')).toBeNull();
    expect(screen.queryByText(/Cloud library for/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1));
  });

  it('redirects a resolved guest from /account to sign in', async () => {
    render(<AccountPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
    expect(screen.queryByText(/Cloud library for/)).toBeNull();
  });

  it('returns local sign-in and Google sign-in attempts to /account', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);
    refreshAccount.mockResolvedValue(signedInSession);
    const view = render(await SignInPage({ searchParams: Promise.resolve({}) }));

    fireEvent.click(screen.getByRole('button', { name: 'Use local test account' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account/local-sign-in', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ returnTo: '/account' }),
    })));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));

    vi.mocked(fetch).mockClear();
    view.unmount();
    render(<SignUpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account/sign-in/google', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ returnTo: '/account' }),
    })));
  });

  it('scopes sign-out to the rendered owner before clearing account access', async () => {
    signedIn();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response);
    refreshAccount.mockResolvedValue(guestSession);
    render(<AccountPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account/sign-out', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Account-Id': owner.id }),
      body: JSON.stringify({ returnTo: '/account' }),
    })));
    expect(accountChanged).toHaveBeenCalledWith(true);
    expect(refreshAccount).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/sign-in');
  });

  it('ignores a delayed sign-out response after the same owner starts a new epoch', async () => {
    signedIn();
    const response = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(response.promise);
    render(<AccountPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    useAccountStore.setState(state => ({ epoch: state.epoch + 1 }));
    await act(async () => {
      response.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
      await response.promise;
    });

    await waitFor(() => expect(screen.getByText('ada@example.test')).toBeInTheDocument());
    expect(accountChanged).not.toHaveBeenCalled();
    expect(refreshAccount).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
