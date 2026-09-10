import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Same mocks as tests/account/footer-link.test.tsx, which also renders Home.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('nuqs', () => ({ useQueryState: () => [null, vi.fn()] }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({}, { get: () => 'div' }),
}));
vi.mock('@/components/ApiKeyConfig', () => ({ default: () => null }));
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/FeatureSelector', () => ({ default: () => null }));
vi.mock('@/components/VideoWorkspace', () => ({ default: () => null }));

import Home from '@/app/page';
import { useAccountStore } from '@/store/useAccountStore';

function renderHome() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  render(<Home />);
}

const aboutSection = () => screen.queryByRole('heading', { level: 1, name: /pick the right AI engine/i });

/**
 * The about section introduces the product, so it is for people who have not
 * met it. It comes out for a signed-in reader — but only on a definite answer,
 * the same rule the footer's account link follows, because guessing the other
 * way blanks a guest's introduction on every cold load.
 */
describe('the about section', () => {
  it('is gone once the session confirms somebody is signed in', () => {
    useAccountStore.getState().applySession({
      account: { id: 'owner-1', name: 'Vasily', email: 'v@example.test' },
      googleEnabled: true,
      localSignIn: false,
      providers: [],
      connections: [],
    });

    renderHome();

    expect(aboutSection()).not.toBeInTheDocument();
  });

  it('stays for a guest', () => {
    useAccountStore.getState().applySession({
      account: null,
      googleEnabled: true,
      localSignIn: false,
      providers: [],
      connections: [],
    });

    renderHome();

    expect(aboutSection()).toBeInTheDocument();
  });

  it('stays while the session is still resolving', () => {
    // This is the state the server renders in, and the one a crawler sees.
    useAccountStore.setState({ session: null, status: 'loading' });

    renderHome();

    expect(aboutSection()).toBeInTheDocument();
  });

  it('stays when the account service cannot be reached', () => {
    useAccountStore.getState().unavailable();

    renderHome();

    expect(aboutSection()).toBeInTheDocument();
  });
});
