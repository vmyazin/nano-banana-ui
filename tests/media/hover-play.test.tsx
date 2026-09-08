import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOVER_PLAY_DELAY_MS, useHoverPlay } from '@/lib/media/use-hover-play';

function Clip() {
  return <video data-testid="clip" src="blob:clip" controls {...useHoverPlay()} />;
}

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom implements neither; the hook only needs to know it asked.
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
  });
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const hover = (video: HTMLElement, pointerType = 'mouse') => fireEvent.pointerEnter(video, { pointerType });

describe('useHoverPlay', () => {
  it('plays muted only after the pointer has rested for a second, and stops on leave', () => {
    render(<Clip />);
    const video = screen.getByTestId('clip') as HTMLVideoElement;
    expect(video.muted).toBe(false);

    hover(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS - 1));
    expect(play).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    expect(play).toHaveBeenCalledOnce();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);

    fireEvent.pointerLeave(video);
    expect(pause).toHaveBeenCalledOnce();
    // The viewer's own sound and loop settings come back with the pointer gone.
    expect(video.muted).toBe(false);
    expect(video.loop).toBe(false);
  });

  it('never starts for a pointer that leaves early, a touch, or a reduced-motion viewer', () => {
    render(<Clip />);
    const video = screen.getByTestId('clip');

    hover(video);
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.pointerLeave(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(play).not.toHaveBeenCalled();

    hover(video, 'touch');
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(play).not.toHaveBeenCalled();

    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    hover(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(play).not.toHaveBeenCalled();
  });

  it('leaves a clip the viewer is already playing alone', () => {
    render(<Clip />);
    const video = screen.getByTestId('clip') as HTMLVideoElement;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });

    hover(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    fireEvent.pointerLeave(video);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it('keeps the preview when a pause event only marks the end of the clip', () => {
    render(<Clip />);
    const video = screen.getByTestId('clip') as HTMLVideoElement;

    hover(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    fireEvent.pause(video);
    expect(video.muted).toBe(true);

    fireEvent.pointerLeave(video);
    expect(video.muted).toBe(false);
  });

  it('gives the settings back the moment the viewer pauses a preview', () => {
    render(<Clip />);
    const video = screen.getByTestId('clip') as HTMLVideoElement;

    hover(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(video.muted).toBe(true);
    fireEvent.pause(video);
    expect(video.muted).toBe(false);
    expect(video.loop).toBe(false);

    fireEvent.pointerLeave(video);
    expect(pause).not.toHaveBeenCalled();
  });

  it('tracks each clip on its own when one hook serves a whole grid', () => {
    function Grid() {
      const hoverPlay = useHoverPlay();
      return (
        <>
          <video data-testid="one" src="blob:one" {...hoverPlay} />
          <video data-testid="two" src="blob:two" {...hoverPlay} />
        </>
      );
    }
    render(<Grid />);
    const one = screen.getByTestId('one') as HTMLVideoElement;
    const two = screen.getByTestId('two') as HTMLVideoElement;

    hover(one);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(one.muted).toBe(true);
    // The second clip starts while the first is still previewing.
    hover(two);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(two.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);

    fireEvent.pointerLeave(two);
    expect(two.muted).toBe(false);
    expect(one.muted).toBe(true);
    fireEvent.pointerLeave(one);
    expect(one.muted).toBe(false);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('puts the element back when playback is refused', async () => {
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    render(<Clip />);
    const video = screen.getByTestId('clip') as HTMLVideoElement;

    hover(video);
    await act(async () => {
      vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS);
      await Promise.resolve();
    });
    expect(video.muted).toBe(false);
    expect(video.loop).toBe(false);
  });

  it('hands the clip over once the viewer unmutes it during a preview', () => {
    render(<Clip />);
    const video = screen.getByTestId('clip') as HTMLVideoElement;

    hover(video);
    act(() => void vi.advanceTimersByTime(HOVER_PLAY_DELAY_MS));
    expect(video.muted).toBe(true);

    video.muted = false;
    fireEvent.volumeChange(video);
    fireEvent.pointerLeave(video);
    expect(pause).not.toHaveBeenCalled();
    expect(video.muted).toBe(false);
  });
});
