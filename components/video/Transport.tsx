'use client';

import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { UNKNOWN_DURATION, formatDuration, formatElapsed } from '@/lib/timeline/format';

/**
 * Below this width the bar drops its readout, volume and fullscreen and keeps
 * only play plus the scrubber.
 *
 * A constant rather than a prop, because "is this too narrow for a volume
 * slider" has one answer and two grids passing different numbers would make the
 * same player look like two components. 260 sits above the 180px gallery cell
 * and below the narrowest result panel.
 */
export const COMPACT_MAX_PX = 260;

export interface TransportProps {
  playing: boolean;
  /** Seconds. */
  time: number;
  /** Seconds, or `0` when not yet known — the readout says so rather than hiding. */
  duration: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  /** `false` removes volume entirely: this media has no sound to control. */
  hasAudio?: boolean;
  volume?: { level: number; muted: boolean };
  onVolume?: (next: { level: number; muted: boolean }) => void;
  /** Omitted means no fullscreen button — a control that cannot work is noise. */
  onFullscreen?: () => void;
  /** Painted over the scrub track: cut markers, buffered spans. */
  trackOverlay?: ReactNode;
  /** Names the media this bar controls, for the scrubber's accessible name. */
  label?: string;
  density?: 'auto' | 'full' | 'compact';
}

/**
 * The player's control bar. Values in, callbacks out — it has never heard of a
 * `<video>`, which is what lets the timeline preview render it over two
 * elements driven by a shared clock while `VideoPlayer` renders it over one.
 *
 * It overlays the frame at both densities (variant B, floating scrim: see
 * `design-explorations/video-player-B.reference.html`). Reveal differs by
 * density and the asymmetry is deliberate — see `revealClasses` below.
 */
export default function Transport({
  playing,
  time,
  duration,
  onToggle,
  onSeek,
  hasAudio = true,
  volume,
  onVolume,
  onFullscreen,
  trackOverlay,
  label,
  density = 'auto',
}: TransportProps) {
  const bar = useRef<HTMLDivElement>(null);
  // `full` is the fallback, not `compact`: jsdom has no ResizeObserver, and a
  // test that renders the reduced bar cannot see most of this component.
  const [measured, setMeasured] = useState<'full' | 'compact'>('full');

  useEffect(() => {
    if (density !== 'auto') return;
    const node = bar.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setMeasured(entry.contentRect.width <= COMPACT_MAX_PX ? 'compact' : 'full');
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [density]);

  const compact = density === 'compact' || (density === 'auto' && measured === 'compact');

  // While the thumb is held the range shows the viewer's own value. Without
  // this an arriving `timeupdate` rewrites `value` mid-drag and hauls the thumb
  // backwards under the pointer.
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? Math.min(Math.max(time, 0), duration || 0);
  const release = () => setHeld(null);

  // All three, so a half-wired consumer gets no control rather than a dead one.
  const showVolume = hasAudio && Boolean(volume) && Boolean(onVolume) && !compact;
  const showReadout = !compact;
  const showFullscreen = Boolean(onFullscreen) && !compact;

  /**
   * Compact is always visible; full reveals on hover or focus.
   *
   * The asymmetry is the point. On a large result frame the viewer is judging
   * the framing of a generated clip, so the scrim has to be off the image until
   * they reach for a control. In a 180px cell the bar is the affordance that
   * says the thing is playable at all, and hiding it hides that.
   *
   * `focus-within` rather than focus handlers: the button, the range and the
   * volume slider all count, and one rule beats three listeners. Pinned on
   * coarse pointers because there is no hover on touch, where a
   * reveal-on-hover bar is simply an absent bar. Reduced motion drops the
   * fade and nothing else — pinning it visible there would take the clean
   * resting frame away from exactly the people who asked for less movement.
   */
  const revealClasses = compact
    ? ''
    : 'opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 ' +
      'motion-reduce:transition-none [@media(pointer:coarse)]:opacity-100';

  const iconSize = compact ? 14 : 16;

  return (
    <div
      ref={bar}
      data-testid="transport"
      data-density={compact ? 'compact' : 'full'}
      className={`transport-scrim absolute inset-x-0 bottom-0 flex items-center ${
        compact ? 'gap-[7px] px-2 pb-2 pt-[18px]' : 'gap-2.5 px-3 pb-2.5 pt-[22px]'
      } ${revealClasses}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="shrink-0 text-[#ecf5f5] transition-colors hover:text-[var(--neon-cyan)]"
      >
        {playing ? <Pause size={iconSize} /> : <Play size={iconSize} />}
      </button>

      <span className="relative flex min-w-0 flex-1 items-center">
        <input
          type="range"
          className="transport-range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={shown}
          // The fill is painted by the track off this percentage, because
          // ::-moz-range-progress and ::-webkit-progress-value are not both
          // available on one input.
          style={{ ['--pct' as string]: `${duration ? (shown / duration) * 100 : 0}%` }}
          aria-label={label ? `${label} position` : 'Playback position'}
          onChange={(event) => {
            const next = Number(event.target.value);
            setHeld(next);
            onSeek(next);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onBlur={release}
          onKeyUp={release}
        />
        {trackOverlay && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0">
            {trackOverlay}
          </span>
        )}
      </span>

      {showVolume && volume && onVolume && (
        <button
          type="button"
          onClick={() => onVolume({ level: volume.level, muted: !volume.muted })}
          aria-label={volume.muted ? 'Unmute' : 'Mute'}
          aria-pressed={!volume.muted}
          className="shrink-0 text-[#ecf5f5] transition-colors hover:text-[var(--neon-cyan)]"
        >
          {volume.muted ? <VolumeX size={iconSize} /> : <Volume2 size={iconSize} />}
        </button>
      )}

      {showReadout && (
        // Holds its width from first paint so nothing shifts when
        // `durationchange` lands. 11ch covers `m:ss / m:ss`; a generated clip
        // never reaches ten minutes, and a longer one grows rather than clips.
        <p className="shrink-0 whitespace-nowrap text-center font-mono text-[10.5px] font-medium tabular-nums text-[#ecf5f5] [min-width:11ch]">
          {formatElapsed(shown)} / {duration ? formatDuration(duration) : UNKNOWN_DURATION}
        </p>
      )}

      {showFullscreen && (
        <button
          type="button"
          onClick={onFullscreen}
          aria-label="Fullscreen"
          className="shrink-0 text-[#ecf5f5] transition-colors hover:text-[var(--neon-cyan)]"
        >
          <Maximize2 size={iconSize} />
        </button>
      )}
    </div>
  );
}
