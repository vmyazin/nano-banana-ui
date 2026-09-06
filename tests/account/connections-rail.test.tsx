import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountConnections from '@/components/account/AccountConnections';
import { useAccountStore, type AccountConnection } from '@/store/useAccountStore';

const connections: AccountConnection[] = [
  { id: 'c1', provider: 'gemini', revision: 1, hint: '4f2a' },
  { id: 'c2', provider: 'fal', revision: 3, hint: '9c1d' },
];

function signIn(list: AccountConnection[]) {
  useAccountStore.getState().applySession({
    account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true, localSignIn: false, providers: [], connections: list,
  });
}

describe('the connections rail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists what the account holds, from the session rather than a fetch', () => {
    signIn(connections);
    render(<AccountConnections onManage={() => undefined} />);
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText('··9c1d')).toBeInTheDocument();
  });

  it('says so plainly when the account holds nothing', () => {
    signIn([]);
    render(<AccountConnections onManage={() => undefined} />);
    expect(screen.getByText(/No provider keys are saved to this account yet/)).toBeInTheDocument();
  });

  it('hands managing off to the dialog instead of its own form', () => {
    signIn(connections);
    const onManage = vi.fn();
    render(<AccountConnections onManage={onManage} />);
    expect(screen.queryByRole('button', { name: /Add provider key/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Manage connections/ }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
