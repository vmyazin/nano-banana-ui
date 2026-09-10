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
import { ENGINES } from '@/lib/engines/registry';

function renderHome() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  render(<Home />);
}

describe('the home page heading structure', () => {
  it('has exactly one h1, and it describes the product', () => {
    // The header wordmark used to be an h1 on every route, which left /spend
    // and /account carrying two. It is a link home now, and each route owns its
    // heading — this one comes from the crawlable intro.
    renderHome();

    const top = screen.getAllByRole('heading', { level: 1 });
    expect(top).toHaveLength(1);
    expect(top[0]).toHaveTextContent(/pick the right AI engine/i);
  });

  it('names every engine in the page body, not just in a dropdown', () => {
    // "Which UI wraps Gemini / FLUX / Veo / Kling" is how people search for
    // this, so the engine list is prose a crawler can read, generated from the
    // registry the studio itself uses.
    renderHome();

    for (const engine of ENGINES) {
      expect(screen.getByRole('heading', { name: engine.label })).toBeInTheDocument();
    }
  });
});
