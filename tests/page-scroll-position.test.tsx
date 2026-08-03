import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/page';

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

afterEach(() => vi.restoreAllMocks());

describe('Home', () => {
  it('resets a browser-restored scroll position on initial mount', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    render(<Home />);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
