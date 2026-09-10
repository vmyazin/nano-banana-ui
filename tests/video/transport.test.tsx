import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Transport, { COMPACT_MAX_PX, type TransportProps } from '@/components/video/Transport';

const base: TransportProps = {
  playing: false,
  time: 0,
  duration: 4,
  onToggle: () => {},
  onSeek: () => {},
};

const position = () => screen.getByLabelText(/position/i) as HTMLInputElement;

describe('Transport', () => {
  it('renders the full bar when ResizeObserver is unavailable', () => {
    // jsdom ships none. Falling back to compact would hide most of this
    // component from every test in this file.
    expect(typeof ResizeObserver).toBe('undefined');
    render(<Transport {...base} volume={{ level: 1, muted: false }} onVolume={() => {}} />);
    expect(screen.getByTestId('transport')).toHaveAttribute('data-density', 'full');
    expect(screen.getByLabelText(/mute/i)).toBeInTheDocument();
  });

  it('drops the readout, volume and fullscreen at compact density', () => {
    render(
      <Transport
        {...base}
        density="compact"
        volume={{ level: 1, muted: false }}
        onVolume={() => {}}
        onFullscreen={() => {}}
      />
    );
    expect(screen.getByTestId('transport')).toHaveAttribute('data-density', 'compact');
    // Exact, not /play/i — that also matches the range's "Playback position".
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(position()).toBeInTheDocument();
    expect(screen.queryByLabelText(/mute/i)).toBeNull();
    expect(screen.queryByLabelText(/fullscreen/i)).toBeNull();
    expect(screen.queryByText(/0:00/)).toBeNull();
  });

  it('keeps the compact bar visible and reveals the full bar on hover', () => {
    // The asymmetry is deliberate: a large frame stays clear while the viewer
    // judges framing; a 180px cell needs the bar to say it is playable.
    const { rerender } = render(<Transport {...base} density="compact" />);
    expect(screen.getByTestId('transport').className).not.toMatch(/opacity-0/);
    rerender(<Transport {...base} density="full" />);
    const full = screen.getByTestId('transport').className;
    expect(full).toMatch(/opacity-0/);
    expect(full).toMatch(/group-hover:opacity-100/);
    expect(full).toMatch(/focus-within:opacity-100/);
    expect(full).toMatch(/pointer:coarse/);
    // Reduced motion drops the fade only — never pins the bar visible.
    expect(full).toMatch(/motion-reduce:transition-none/);
    expect(full).not.toMatch(/motion-reduce:opacity-100/);
  });

  it('hides volume when the media has no audio', () => {
    render(
      <Transport {...base} hasAudio={false} volume={{ level: 1, muted: false }} onVolume={() => {}} />
    );
    expect(screen.queryByLabelText(/mute/i)).toBeNull();
  });

  it('hides volume when a consumer wires it only half way', () => {
    // No dead button: all three of hasAudio, volume and onVolume are required.
    const { rerender } = render(<Transport {...base} volume={{ level: 1, muted: false }} />);
    expect(screen.queryByLabelText(/mute/i)).toBeNull();
    rerender(<Transport {...base} onVolume={() => {}} />);
    expect(screen.queryByLabelText(/mute/i)).toBeNull();
  });

  it('reports a mute request without assuming it happened', () => {
    const onVolume = vi.fn();
    render(<Transport {...base} volume={{ level: 0.8, muted: false }} onVolume={onVolume} />);
    fireEvent.click(screen.getByLabelText('Mute'));
    expect(onVolume).toHaveBeenCalledWith({ level: 0.8, muted: true });
  });

  it("holds the viewer's value while scrubbing, ignoring an incoming time", () => {
    const onSeek = vi.fn();
    const { rerender } = render(<Transport {...base} duration={10} time={2} onSeek={onSeek} />);
    fireEvent.change(position(), { target: { value: '8' } });
    expect(onSeek).toHaveBeenCalledWith(8);

    // A timeupdate arriving mid-drag must not haul the thumb backwards.
    rerender(<Transport {...base} duration={10} time={2.5} onSeek={onSeek} />);
    expect(position().value).toBe('8');

    fireEvent.pointerUp(position());
    rerender(<Transport {...base} duration={10} time={2.5} onSeek={onSeek} />);
    expect(position().value).toBe('2.5');
  });

  it('says the duration is unknown rather than rendering NaN', () => {
    render(<Transport {...base} duration={0} time={0} />);
    expect(position()).toHaveAttribute('max', '0');
    expect(screen.getByText(/0:00 \/ —/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('reserves the readout width so metadata arriving does not reflow the bar', () => {
    const { rerender } = render(<Transport {...base} duration={0} />);
    const readout = screen.getByText(/0:00 \/ —/);
    expect(readout.className).toMatch(/min-width:11ch/);
    expect(readout.className).toMatch(/tabular-nums/);
    rerender(<Transport {...base} duration={4} time={1} />);
    expect(screen.getByText('0:01 / 0:04').className).toMatch(/min-width:11ch/);
  });

  it('clamps a time past the end instead of overflowing the range', () => {
    render(<Transport {...base} duration={4} time={9} />);
    expect(position().value).toBe('4');
  });

  it('renders trackOverlay over the scrub track, inert and hidden from readers', () => {
    render(<Transport {...base} trackOverlay={<span data-testid="cut" />} />);
    const overlay = screen.getByTestId('cut').parentElement!;
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay.className).toMatch(/pointer-events-none/);
  });

  it('omits the fullscreen button until a handler is given', () => {
    const { rerender } = render(<Transport {...base} />);
    expect(screen.queryByLabelText(/fullscreen/i)).toBeNull();
    rerender(<Transport {...base} onFullscreen={() => {}} />);
    expect(screen.getByLabelText(/fullscreen/i)).toBeInTheDocument();
  });

  it('names the scrubber after the media it controls', () => {
    render(<Transport {...base} label="arcade dolly 4s" />);
    expect(screen.getByLabelText('arcade dolly 4s position')).toBeInTheDocument();
  });

  it('exposes one compact threshold rather than letting callers disagree', () => {
    expect(COMPACT_MAX_PX).toBe(260);
  });
});
