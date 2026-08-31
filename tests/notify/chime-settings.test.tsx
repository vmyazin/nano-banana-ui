import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ApiKeyConfig from '../../components/ApiKeyConfig';
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

async function chimeCheckbox() {
  render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
  const box = await waitFor(() =>
    screen.getByRole('checkbox', { name: /chime when a generation finishes/i })
  );
  return box as HTMLInputElement;
}

describe('the chime setting auditions itself', () => {
  beforeEach(() => {
    resetGenerationChime();
    useAppStore.setState({ apiKey: '', chimeOnComplete: false });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rings once when switched on, so the setting is heard not just read', async () => {
    const play = stubAudio();

    fireEvent.click(await chimeCheckbox());

    expect(useAppStore.getState().chimeOnComplete).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stays silent when switched off', async () => {
    useAppStore.setState({ chimeOnComplete: true });
    const play = stubAudio();

    fireEvent.click(await chimeCheckbox());

    expect(useAppStore.getState().chimeOnComplete).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('previews against the value it just set, not the one it replaced', async () => {
    // Guards the ordering: reading the store before the write would gate the
    // preview on the old `false` and never ring.
    const play = stubAudio();
    const box = await chimeCheckbox();

    fireEvent.click(box);

    expect(play).toHaveBeenCalledTimes(1);
  });
});
