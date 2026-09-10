import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Same mocks as tests/account/footer-link.test.tsx, which renders Home for the
// same footer. The control moved here from the API-connections dialog, so the
// suite renders the studio page rather than that dialog.
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
import { resetGenerationChime } from '../../lib/notify/chime';
import { useAppStore } from '../../store/useAppStore';

/** jsdom has no media stack, so stand in for the element and record `play()`. */
function stubAudio() {
  const play = vi.fn(() => Promise.resolve());
  vi.stubGlobal(
    'Audio',
    class {
      volume = 1;
      currentTime = 0;
      preload = '';
      play = play;
      constructor(public src: string) {}
    }
  );
  return play;
}

function soundsCheckbox() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  render(<Home />);
  return screen.getByRole('checkbox', { name: /interface sounds/i }) as HTMLInputElement;
}

describe('the interface sounds setting auditions itself', () => {
  beforeEach(() => {
    resetGenerationChime();
    useAppStore.setState({ apiKey: '', uiSoundsEnabled: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lives in the footer, reachable without signing in', () => {
    // The point of the move: the header's toggle is `sm:`-gated and the command
    // palette needs a keyboard, so this is the control a guest on a phone gets.
    expect(soundsCheckbox()).toBeInTheDocument();
  });

  it('rings once when switched on, so the setting is heard not just read', () => {
    const play = stubAudio();

    fireEvent.click(soundsCheckbox());

    expect(useAppStore.getState().uiSoundsEnabled).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stays silent when switched off', () => {
    useAppStore.setState({ uiSoundsEnabled: true });
    const play = stubAudio();

    fireEvent.click(soundsCheckbox());

    expect(useAppStore.getState().uiSoundsEnabled).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('previews against the value it just set, not the one it replaced', () => {
    // Guards the ordering: reading the store before the write would gate the
    // preview on the old `false` and never ring.
    const play = stubAudio();

    fireEvent.click(soundsCheckbox());

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('no longer offers the setting in the API-connections dialog', async () => {
    // The dialog is mocked out above, so this asserts against its source: the
    // move is only real if the old copy is gone.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(`${process.cwd()}/components/ApiKeyConfig.tsx`, 'utf8');
    expect(source).not.toMatch(/chime|Chime/);
  });
});
