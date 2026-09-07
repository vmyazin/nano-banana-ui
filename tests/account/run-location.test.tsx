import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCloudWorkspace } from '@/lib/account/useCloudWorkspace';
import { useAccountStore, type AccountSession } from '@/store/useAccountStore';
import { useRunLocationStore } from '@/store/useRunLocationStore';

vi.mock('@/lib/account/session', () => ({ refreshAccount: vi.fn() }));
vi.mock('@/lib/account/client', () => ({
  uploadAccountReferences: vi.fn(),
  submitAccountJob: vi.fn(),
  accountRequest: vi.fn(),
  accountAssetUrl: vi.fn(),
}));

const session: AccountSession = {
  account: { id: 'owner', name: 'Owner', email: 'owner@example.test' },
  googleEnabled: true,
  localSignIn: false,
  providers: ['kie'],
  connections: [{ id: 'connection', provider: 'kie', hint: 'test', revision: 1 }],
};

/**
 * The complaint: "each return to a mode reverted to Runs in the background,
 * and roughly ten re-selections across one short job". The choice lived in
 * component state, and switching engine or input mode remounts the workspace
 * that held it.
 */
describe('where an engine runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRunLocationStore.getState().reset();
    useAccountStore.getState().applySession(session);
  });

  it('defaults a signed-in engine to the background', () => {
    const { result } = renderHook(() => useCloudWorkspace('kie'));
    expect(result.current.cloud).toBe(true);
  });

  it('keeps the browser choice across the remount that used to discard it', () => {
    const first = renderHook(() => useCloudWorkspace('kie'));
    act(() => first.result.current.useBrowser());
    expect(first.result.current.cloud).toBe(false);
    first.unmount();

    // Switching engine or input mode remounts the workspace. This is the exact
    // moment the old useState pair reset and the mode flipped back.
    const second = renderHook(() => useCloudWorkspace('kie'));
    expect(second.result.current.cloud).toBe(false);
  });

  it('lets the choice be reversed, and that reversal also survives', () => {
    const first = renderHook(() => useCloudWorkspace('kie'));
    act(() => first.result.current.useBrowser());
    act(() => first.result.current.useCloud());
    first.unmount();

    expect(renderHook(() => useCloudWorkspace('kie')).result.current.cloud).toBe(true);
  });

  it('holds the choice per engine, so one engine does not speak for another', () => {
    const kie = renderHook(() => useCloudWorkspace('kie'));
    act(() => kie.result.current.useBrowser());

    expect(renderHook(() => useCloudWorkspace('fal')).result.current.cloud).toBe(true);
  });

  it('never carries one account s choice into another s', () => {
    // The owner comparison this replaces existed for exactly this reason: a
    // decision to run *this account's* work in the browser says nothing about
    // the next account to sign in.
    const kie = renderHook(() => useCloudWorkspace('kie'));
    act(() => kie.result.current.useBrowser());
    kie.unmount();

    act(() => {
      useAccountStore.getState().clear();
      useAccountStore.getState().applySession({
        ...session,
        account: { ...session.account, name: 'Other', email: 'other@example.test', id: 'other-owner' },
      });
    });

    expect(renderHook(() => useCloudWorkspace('kie')).result.current.cloud).toBe(true);
  });

  it('still lets a signed-out session opt out while the account state is unknown', () => {
    act(() => {
      useAccountStore.getState().clear();
      useAccountStore.setState({ status: 'unavailable', session: null });
    });

    const { result } = renderHook(() => useCloudWorkspace('kie'));
    // Unknown account state assumes background, and says it is still checking.
    expect(result.current.cloud).toBe(true);
    expect(result.current.checking).toBe(true);

    act(() => result.current.useBrowser());
    expect(result.current.cloud).toBe(false);
    expect(result.current.checking).toBe(false);
  });
});
