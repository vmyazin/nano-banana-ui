import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VideoPlayer from '@/components/video/VideoPlayer';

const video = () => document.querySelector('video') as HTMLVideoElement;

/**
 * jsdom implements no media element: `play()` and `pause()` throw "not
 * implemented", `duration` is NaN and no media event ever fires on its own. So
 * the element is stubbed and the events are dispatched by hand — which is
 * exactly what puts the source-of-truth rule under test rather than in a
 * comment.
 */
beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
});

describe('VideoPlayer', () => {
  it('never sets the controls attribute', () => {
    // The entire point of the component: no native browser bar, anywhere.
    render(<VideoPlayer src="blob:x" label="Clip" />);
    expect(video().hasAttribute('controls')).toBe(false);
  });

  it('does not claim to be playing until the element says so', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    fireEvent.click(screen.getByLabelText('Play Clip'));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    // The click set no state. Autoplay policy can refuse a play, so the UI
    // must still read Play until a `play` event actually arrives.
    expect(screen.getByLabelText('Play Clip')).toBeInTheDocument();
  });

  it('follows the element when something else starts it', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    // `paused` has to be stubbed too: jsdom's stays true because the stubbed
    // play() cannot change it, where a real element flips it before the event.
    // The point of the test is that the UI reads the element, not the click.
    Object.defineProperty(video(), 'paused', { value: false, configurable: true });
    fireEvent(video(), new Event('play'));
    expect(screen.getByLabelText('Pause Clip')).toBeInTheDocument();
  });

  it('reads a mute applied directly to the node, as hover-play does', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    expect(screen.getByLabelText('Mute Clip')).toBeInTheDocument();
    // Exactly what useHoverPlay does to the node during a preview.
    video().muted = true;
    fireEvent(video(), new Event('volumechange'));
    expect(screen.getByLabelText('Unmute Clip')).toBeInTheDocument();
  });

  it('mirrors the clock from the element rather than a timer of its own', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    Object.defineProperty(video(), 'duration', { value: 8, configurable: true });
    fireEvent(video(), new Event('durationchange'));
    video().currentTime = 2;
    fireEvent(video(), new Event('timeupdate'));
    expect(screen.getByText('0:02 / 0:08')).toBeInTheDocument();
  });

  it('treats an unknown duration as unknown rather than rendering NaN', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    // jsdom leaves duration NaN, as a real element does until metadata lands.
    expect(Number.isNaN(video().duration)).toBe(true);
    fireEvent(video(), new Event('durationchange'));
    expect(screen.getByText('0:00 / —')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('seeks the element instead of holding a position of its own', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    Object.defineProperty(video(), 'duration', { value: 10, configurable: true });
    fireEvent(video(), new Event('durationchange'));
    fireEvent.change(screen.getByLabelText('Clip position'), { target: { value: '4' } });
    expect(video().currentTime).toBe(4);
  });

  it('paints the opening frame with a seek fragment', () => {
    // preload="none" never fetches enough to paint one, and metadata alone
    // leaves Safari on a black rectangle.
    render(<VideoPlayer src="https://cdn.example/clip.mp4" label="Clip" />);
    expect(video().getAttribute('src')).toBe('https://cdn.example/clip.mp4#t=0.1');
  });

  it('always sets playsInline, whose absence is an iOS takeover bug', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    expect(video().hasAttribute('playsinline')).toBe(true);
  });

  it('opts into crossOrigin only when asked', () => {
    const { rerender } = render(<VideoPlayer src="blob:x" label="Clip" />);
    expect(video().hasAttribute('crossorigin')).toBe(false);
    rerender(<VideoPlayer src="blob:x" label="Clip" crossOrigin />);
    expect(video().getAttribute('crossorigin')).toBe('anonymous');
  });

  it('renders no bar and hides itself when unlabelled with transport none', () => {
    render(<VideoPlayer src="blob:x" transport="none" />);
    expect(screen.queryByTestId('transport')).toBeNull();
    expect(video()).toHaveAttribute('aria-hidden', 'true');
  });

  it('names the clip on every control so a grid is not eight identical buttons', () => {
    render(<VideoPlayer src="blob:x" label="arcade dolly 4s" />);
    expect(screen.getByLabelText('Play arcade dolly 4s')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute arcade dolly 4s')).toBeInTheDocument();
    expect(screen.getByLabelText('Fullscreen arcade dolly 4s')).toBeInTheDocument();
    expect(screen.getByLabelText('arcade dolly 4s position')).toBeInTheDocument();
  });

  it('hides the volume control when the caller knows there is no audio', () => {
    render(<VideoPlayer src="blob:x" label="Clip" hasAudio={false} />);
    expect(screen.queryByLabelText(/mute/i)).toBeNull();
  });

  it('hands the element to a caller that needs it', () => {
    const seen: (HTMLVideoElement | null)[] = [];
    render(<VideoPlayer src="blob:x" label="Clip" videoRef={(node) => { seen.push(node); }} />);
    expect(seen.at(-1)).toBe(video());
  });

  it('fullscreens the container so our own bar is what appears', () => {
    const request = vi.fn(() => Promise.resolve());
    render(<VideoPlayer src="blob:x" label="Clip" />);
    const box = video().parentElement as HTMLDivElement;
    box.requestFullscreen = request;
    fireEvent.click(screen.getByLabelText('Fullscreen Clip'));
    expect(request).toHaveBeenCalled();
  });

  it('falls back to the element on iOS, which cannot fullscreen a container', () => {
    render(<VideoPlayer src="blob:x" label="Clip" />);
    const box = video().parentElement as HTMLDivElement;
    // iOS Safari exposes no requestFullscreen on elements other than <video>,
    // so the property is removed rather than set undefined.
    delete (box as Partial<HTMLDivElement>).requestFullscreen;
    const legacy = vi.fn();
    (video() as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen =
      legacy;
    fireEvent.click(screen.getByLabelText('Fullscreen Clip'));
    expect(legacy).toHaveBeenCalled();
  });
});
