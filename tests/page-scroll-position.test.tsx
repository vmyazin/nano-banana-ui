import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/page';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
// The studio forwards ?workspace=timeline to the editor's own route, so it
// asks for a router these suites never mount one for.
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

afterEach(() => vi.restoreAllMocks());

describe('Home', () => {
  it('resets a browser-restored scroll position on initial mount', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    render(<Home />);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('links the brand mark to the home page', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<Home />);

    expect(
      screen.getByRole('link', { name: 'Go to Scene Assembly home' }).getAttribute('href')
    ).toBe('/');
  });

  /**
   * The Timeline nav button collapses to an icon-only pill below `sm` via
   * Tailwind's `hidden sm:inline` on its text label — the same treatment the
   * header's own Library button already uses, which keeps
   * `title="Kept results and saved prompts"` as a fallback so its name
   * survives the collapse. Timeline originally had neither `title` nor
   * `aria-label`, so at that width it had no accessible name at all: a real
   * browser DOM check found `innerText: ""`, `title: null`, `aria-label:
   * null`, and `getByRole('button', { name: /timeline/i })` timing out.
   *
   * It is a link now rather than a button — the editor moved to /timeline, so
   * reaching it is a navigation — but the collapse, and the reason the name has
   * to survive it, are unchanged.
   *
   * That collapse is pure CSS (`display: none` on the label span). This
   * suite never loads the compiled stylesheet into jsdom, so
   * `getComputedStyle` reports the UA default (visible) for that span no
   * matter the viewport — a bare `getByRole('button', { name: /timeline/i
   * })`, even with `window.matchMedia` stubbed narrow, would resolve via the
   * span's own text either way and could not have caught this. The
   * assertion below is the part that actually would have failed before the
   * fix: that the button carries an explicit `title` fallback, independent
   * of whether the label span is visible.
   */
  it('keeps an accessible name on the Timeline nav link independent of its collapsible label', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<Home />);

    const timelineLink = screen.getByRole('link', { name: /timeline/i });
    expect(timelineLink).toHaveAttribute('title', 'Timeline');
    expect(timelineLink).toHaveAttribute('href', '/timeline');
  });
});
