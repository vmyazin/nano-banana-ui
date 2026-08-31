// lib/notify/chime.ts
import { useAppStore } from '@/store/useAppStore';

const CHIME_SRC = '/sounds/generation-complete.mp3';

/**
 * The asset is normalized to a -3 dBFS peak so the file itself is a known
 * quantity; this is where it becomes a background ping rather than an alert.
 * Turn it down here, not in the mp3, so the level stays adjustable without a
 * re-encode.
 */
const CHIME_VOLUME = 0.35;

/**
 * Two jobs landing together should ring once, not twice. The window is longer
 * than a batch settles in and far shorter than any real generation, so it
 * collapses a burst without ever swallowing a chime the user was waiting on.
 */
const COALESCE_MS = 400;

let element: HTMLAudioElement | null = null;
let lastPlayedAt = 0;

/**
 * One reused element, built on first ring rather than at import: constructing
 * Audio at module scope runs during SSR and in every test that imports
 * anything downstream of this file.
 */
function chimeElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (!element) {
    element = new Audio(CHIME_SRC);
    element.preload = 'auto';
    element.volume = CHIME_VOLUME;
  }
  return element;
}

/**
 * Rings the completion chime, unless the user has silenced it.
 *
 * Every failure here is non-fatal by design. Autoplay policy rejects `play()`
 * when the page has had no user gesture, a headless or muted device may have no
 * output at all, and jsdom has no media stack — none of which says anything
 * about whether the generation succeeded. A generation that finished must never
 * look like it failed because a sound could not play.
 */
export function playGenerationChime(): void {
  if (!useAppStore.getState().chimeOnComplete) return;

  const now = Date.now();
  if (now - lastPlayedAt < COALESCE_MS) return;

  const audio = chimeElement();
  if (!audio) return;

  lastPlayedAt = now;
  try {
    // Rewind so a ring that lands mid-decay restarts instead of being dropped.
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Media stack unavailable — see above.
  }
}

/**
 * Sets the preference, auditioning it on the way on.
 *
 * Every control that flips this setting goes through here rather than calling
 * the store setter and the player in sequence. The order is load-bearing —
 * `playGenerationChime` gates on the very value being written, so reading
 * before the write would test the old one and never ring — and that is exactly
 * the kind of detail that rots when it is copied into three onClick handlers.
 */
export function setChimeEnabled(enabled: boolean): void {
  useAppStore.getState().setChimeOnComplete(enabled);
  if (enabled) playGenerationChime();
}

/** Test seam: forget the cached element and the coalescing window. */
export function resetGenerationChime(): void {
  element = null;
  lastPlayedAt = 0;
}
