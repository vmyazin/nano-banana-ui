import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { playGenerationChime, resetGenerationChime, setChimeEnabled } from '../../lib/notify/chime';
import { useAppStore } from '../../store/useAppStore';

/**
 * jsdom has no media stack, so a real `new Audio()` would throw on `play()`.
 * The stub stands in for the element and records what the module asked it to do.
 */
function stubAudio() {
  const play = vi.fn(() => Promise.resolve());
  const instances: Array<{ src: string; volume: number; currentTime: number }> = [];

  class FakeAudio {
    src: string;
    volume = 1;
    currentTime = 0;
    preload = '';
    play = play;

    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }
  }

  vi.stubGlobal('Audio', FakeAudio);
  return { play, instances };
}

beforeEach(() => {
  resetGenerationChime();
  useAppStore.setState({ chimeOnComplete: true });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('playGenerationChime', () => {
  it('rings when the preference is on', () => {
    const { play } = stubAudio();

    playGenerationChime();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the user has muted it', () => {
    const { play } = stubAudio();
    useAppStore.setState({ chimeOnComplete: false });

    playGenerationChime();

    expect(play).not.toHaveBeenCalled();
  });

  it('plays the asset at a background level, not full volume', () => {
    const { instances } = stubAudio();

    playGenerationChime();

    expect(instances[0].src).toBe('/sounds/generation-complete.mp3');
    expect(instances[0].volume).toBeLessThan(1);
  });

  it('collapses a burst of completions into one ring', () => {
    const { play } = stubAudio();

    // Three jobs settling in the same tick — one sound, not three.
    playGenerationChime();
    playGenerationChime();
    playGenerationChime();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('rings again once the burst window has passed', () => {
    const { play } = stubAudio();

    playGenerationChime();
    vi.advanceTimersByTime(401);
    playGenerationChime();

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('reuses one element rather than leaking one per ring', () => {
    const { instances } = stubAudio();

    playGenerationChime();
    vi.advanceTimersByTime(401);
    playGenerationChime();

    expect(instances).toHaveLength(1);
  });

  it('rewinds so a ring landing mid-decay restarts', () => {
    const { instances } = stubAudio();

    playGenerationChime();
    instances[0].currentTime = 0.9;
    vi.advanceTimersByTime(401);
    playGenerationChime();

    expect(instances[0].currentTime).toBe(0);
  });

  it('swallows an autoplay-policy rejection', async () => {
    const play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
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

    // A generation that finished must not look failed because sound was blocked.
    expect(() => playGenerationChime()).not.toThrow();
    await Promise.resolve();
  });

  it('does nothing when the environment has no media stack', () => {
    vi.stubGlobal('Audio', undefined);

    expect(() => playGenerationChime()).not.toThrow();
  });
});

describe('setChimeEnabled', () => {
  it('writes the preference and auditions it on the way on', () => {
    const { play } = stubAudio();
    useAppStore.setState({ chimeOnComplete: false });

    setChimeEnabled(true);

    expect(useAppStore.getState().chimeOnComplete).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('writes the preference silently on the way off', () => {
    const { play } = stubAudio();

    setChimeEnabled(false);

    expect(useAppStore.getState().chimeOnComplete).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('writes before it plays, or the audition would gate on the old value', () => {
    const { play } = stubAudio();
    useAppStore.setState({ chimeOnComplete: false });

    // Fails if the store write is moved after the play call.
    setChimeEnabled(true);

    expect(play).toHaveBeenCalledTimes(1);
  });
});
