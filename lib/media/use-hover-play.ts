'use client';

import { useEffect, useRef, type PointerEvent, type SyntheticEvent } from 'react';

/** How long a pointer rests on a clip before it starts playing on its own. */
export const HOVER_PLAY_DELAY_MS = 1000;

interface HoverPlayHandlers {
  onPointerEnter: (event: PointerEvent<HTMLVideoElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLVideoElement>) => void;
  onPause: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onVolumeChange: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

/** What a preview changed on an element, so it can be given back. */
interface Preview {
  timer?: number;
  restore?: { muted: boolean; loop: boolean };
}

/**
 * Hover-to-preview for any `<video>` a viewer can rest a pointer on: after one
 * second the clip plays muted and looping, and it stops when the pointer
 * leaves. Spread the handlers onto the element — `<video {...useHoverPlay()} />`.
 *
 * The delay is what keeps a library grid quiet: a pointer crossing eight cards
 * on its way somewhere never starts eight clips. Sound never starts on its own,
 * so the element is muted for the preview and given its old setting back after;
 * it loops so a two-second clip does not freeze on its last frame under the
 * pointer.
 *
 * State is kept per element, not per hook call, because a grid spreads one
 * hook's handlers across every clip it maps over. The preview hands over the
 * moment the viewer takes the controls: unmuting keeps playing as they set it,
 * and pausing gives their settings back at once. A clip already playing is
 * theirs and is never touched. Touch and pen have no hover, and a reduced-motion
 * preference means no unasked motion.
 */
export function useHoverPlay(): HoverPlayHandlers {
  const previews = useRef(new Map<HTMLVideoElement, Preview>());

  useEffect(() => {
    const active = previews.current;
    return () => {
      for (const preview of active.values()) window.clearTimeout(preview.timer);
      active.clear();
    };
  }, []);

  const endPreview = (video: HTMLVideoElement, pauseIt: boolean) => {
    const preview = previews.current.get(video);
    if (!preview) return;
    previews.current.delete(video);
    window.clearTimeout(preview.timer);
    if (!preview.restore) return;
    if (pauseIt) video.pause();
    video.muted = preview.restore.muted;
    video.loop = preview.restore.loop;
  };

  const onPointerEnter = (event: PointerEvent<HTMLVideoElement>) => {
    if (event.pointerType !== 'mouse') return;
    const video = event.currentTarget;
    if (!video.paused) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    endPreview(video, false);
    const preview: Preview = {};
    preview.timer = window.setTimeout(() => {
      if (!video.paused || !video.isConnected) {
        previews.current.delete(video);
        return;
      }
      preview.restore = { muted: video.muted, loop: video.loop };
      video.muted = true;
      video.loop = true;
      // Autoplay can be refused, or the clip may fail to load: then the
      // preview never happened and the element goes back as it was.
      video.play()?.catch?.(() => {
        if (previews.current.get(video) === preview) endPreview(video, false);
      });
    }, HOVER_PLAY_DELAY_MS);
    previews.current.set(video, preview);
  };

  const onPointerLeave = (event: PointerEvent<HTMLVideoElement>) => {
    endPreview(event.currentTarget, true);
  };

  const onPause = (event: SyntheticEvent<HTMLVideoElement>) => {
    // Reaching the end also fires pause, and a looping preview never ends;
    // any other pause is the viewer's, and they get their settings back now.
    if (event.currentTarget.ended) return;
    endPreview(event.currentTarget, false);
  };

  const onVolumeChange = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (previews.current.get(video)?.restore && !video.muted) previews.current.delete(video);
  };

  return { onPointerEnter, onPointerLeave, onPause, onVolumeChange };
}
