import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Home from '../../app/page';

// The workspace the page is on comes from the query string, which is the only
// input these assertions need; everything heavy the page mounts is stubbed.
const workspaceValue = { current: null as string | null };

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('nuqs', () => ({
  useQueryState: (key: string) => [key === 'workspace' ? workspaceValue.current : null, vi.fn()],
}));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({}, { get: () => 'div' }),
}));
vi.mock('@/components/ApiKeyConfig', () => ({ default: () => null }));
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/FeatureSelector', () => ({ default: () => null }));
vi.mock('@/components/VideoWorkspace', () => ({ default: () => null }));

function renderAt(workspace: string | null) {
  workspaceValue.current = workspace;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const view = render(<Home />);
  const main = view.container.querySelector('main')!;
  const header = view.container.querySelector('header > div')!;
  return { main, header, view };
}

afterEach(() => {
  vi.restoreAllMocks();
  workspaceValue.current = null;
});

describe('studio page column', () => {
  it('gives the timeline the account console’s wide column, header included', () => {
    const { main, header } = renderAt('timeline');

    expect(main.className).toContain('max-w-[110rem]');
    expect(main.className).not.toContain('max-w-7xl');
    // Widened together, or the wordmark stops lining up with the content.
    expect(header.className).toContain('max-w-[110rem]');
  });

  it.each([null, 'video'])('leaves the %s workspace on the studio column', (workspace) => {
    const { main, header } = renderAt(workspace);

    expect(main.className).toContain('max-w-7xl');
    expect(main.className).not.toContain('max-w-[110rem]');
    expect(header.className).toContain('max-w-7xl');
  });
});
