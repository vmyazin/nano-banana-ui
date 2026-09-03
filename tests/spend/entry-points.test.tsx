import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Same mocks as tests/page-scroll-position.test.tsx, which also renders Home.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
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

describe('spend entry points', () => {
  it('links to the spend page from the footer', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Spend' })).toHaveAttribute('href', '/spend');
  });
});
