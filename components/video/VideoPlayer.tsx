'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useHoverPlay } from '@/lib/media/use-hover-play';
import { useMediaState } from '@/lib/media/use-media-state';

import Transport from './Transport';

export interface VideoPlayerProps {
  src: string;
  /**
   * Accessible name for the clip. Omitting it makes the player decorative
   * (`aria-hidden`) — a thumbnail whose meaning is carried by the card around
   * it, not by the video.
   */
  label?: string;
  /** How the frame fills its box. */
  fit?: 'contain' | 'cover';
  /** `'none'` renders no bar: the frame, its poster and hover-preview only. */
  transport?: 'auto' | 'none';
  /**
   * Sets `crossOrigin="anonymous"`. A per-caller opt-in and never a default,
   * because it is a trap in both directions: account assets need it for canvas
   * reads, and setting it against a provider CDN that sends no CORS headers
   * fails the load outright, leaving a clip that never paints.
   */
  crossOrigin?: boolean;
  /** `false` removes the volume control — this clip has no sound to control. */
  hasAudio?: boolean;
  className?: string;
}

/**
 * One clip, played through the app's own controls.
 *
 * Replaces `<video controls>` everywhere, so the browser's own bar — which
 * differs between Chrome, Safari and Firefox and shares nothing with
 * `DESIGN.md` — never frames a generated result. Losing it also loses the `⋮`
 * menu, whose Download bypassed the `downloadFilenameBase` /
 * `lib/account/asset-name.ts` pipeline and handed out a raw CDN URL; every
 * surface here renders its own download button.
 *
 * Four behaviours live here rather than at each call site, where they used to
 * be copy-pasted with their own rationale comments:
 *
 * - **The opening frame.** `preload="none"` never fetches enough to paint one,
 *   and metadata alone still leaves Safari on a black rectangle, so the source
 *   carries a `#t=` fragment and the element seeks there.
 * - **Viewport-gated loading**, so a library page does not pull every clip's
 *   header at once. It is the `src` swap that re-runs the load — a `preload`
 *   raised after the fact is only advisory.
 * - **`playsInline`**, always. Its absence is the iOS bug where a clip takes
 *   over the whole screen.
 * - **Hover-to-preview**, through `useHoverPlay`, which callers no longer
 *   mention.
 */
export default function VideoPlayer({
  src,
  label,
  fit = 'contain',
  transport = 'auto',
  crossOrigin = false,
  hasAudio = true,
  className = '',
}: VideoPlayerProps) {
  const container = useRef<HTMLDivElement>(null);
  /**
   * The element is held twice, on purpose.
   *
   * `node` is a ref because this component *writes* to the element —
   * `currentTime`, `muted`, `play()` — and `react-hooks/immutability` rejects
   * mutating anything reached through a render value, `useState` included. A
   * `useRef` is the sanctioned escape hatch; `TimelinePreview` documents the
   * same constraint for its slots.
   *
   * `subscribed` is state because `useMediaState` keys its event subscription
   * on the element's identity, and a ref's mutation never reaches a dependency
   * array. Neither alone can do both jobs.
   */
  const node = useRef<HTMLVideoElement | null>(null);
  const [subscribed, setSubscribed] = useState<HTMLVideoElement | null>(null);
  const hoverPlay = useHoverPlay();
  const media = useMediaState(subscribed);

  // jsdom has no IntersectionObserver, and a viewer without one still deserves
  // a poster frame rather than a black rectangle.
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (inView || !subscribed || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(subscribed);
    return () => observer.disconnect();
  }, [subscribed, inView]);

  const setVideo = useCallback((next: HTMLVideoElement | null) => {
    node.current = next;
    setSubscribed(next);
  }, []);

  const toggle = () => {
    const element = node.current;
    if (!element) return;
    // Calls the element and sets no state. The `play`/`pause` events are what
    // move the UI, so a play refused by autoplay policy never paints a pause
    // icon over a clip that did not start.
    if (element.paused) void element.play()?.catch?.(() => {});
    else element.pause();
  };

  const enterFullscreen = () => {
    const box = container.current;
    const element = node.current;
    if (box?.requestFullscreen) {
      // The container, not the element, so our own bar is what appears in
      // fullscreen. Not a portaled overlay like ImageLightbox: portaling would
      // remount the <video> and restart the clip from zero mid-watch.
      void box.requestFullscreen().catch(() => {});
      return;
    }
    // iOS Safari fullscreens only the element, and shows its own controls
    // there. A documented divergence rather than something to work around.
    (element as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)
      ?.webkitEnterFullscreen?.();
  };

  /**
   * A `blob:` source already in memory reports one range covering the whole
   * clip, and some browsers report none at all. Both are correct and both mean
   * "nothing useful to draw", so neither paints — a full-width overlay would
   * read as a second progress fill sitting on the real one.
   */
  const buffered = useMemo(() => {
    const { duration } = media;
    if (!duration || media.buffered.length === 0) return undefined;
    const coversEverything =
      media.buffered.length === 1 &&
      media.buffered[0].start <= 0.05 &&
      media.buffered[0].end >= duration - 0.05;
    if (coversEverything) return undefined;
    return (
      <>
        {media.buffered.map((range) => (
          <span
            key={`${range.start}-${range.end}`}
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[rgba(236,245,245,0.22)]"
            style={{
              left: `${(range.start / duration) * 100}%`,
              width: `${((range.end - range.start) / duration) * 100}%`,
            }}
          />
        ))}
      </>
    );
  }, [media]);

  return (
    <div
      ref={container}
      // `group` is the transport's hover target: the bar is revealed by resting
      // on the frame, not on the bar itself.
      className={`group relative overflow-hidden bg-black ${className}`}
    >
      <video
        ref={setVideo}
        // The fragment is what paints the opening frame; see the note above.
        src={inView ? `${src}#t=0.1` : src}
        preload={inView ? 'metadata' : 'none'}
        playsInline
        crossOrigin={crossOrigin ? 'anonymous' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        {...hoverPlay}
      />

      {transport !== 'none' && (
        <Transport
          label={label}
          playing={media.playing}
          time={media.time}
          duration={media.duration}
          onToggle={toggle}
          onSeek={(seconds) => {
            if (node.current) node.current.currentTime = seconds;
          }}
          hasAudio={hasAudio}
          volume={media.volume}
          onVolume={(next) => {
            if (node.current) node.current.muted = next.muted;
          }}
          onFullscreen={enterFullscreen}
          trackOverlay={buffered}
        />
      )}
    </div>
  );
}
