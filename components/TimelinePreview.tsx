'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Pause, Play } from 'lucide-react';

import {
  buildSequence,
  formatClock,
  locate,
  type PlaybackSequence,
} from '@/lib/timeline/playback';
import type { TimelineClip } from '@/store/useTimelineStore';
import type { ClipState } from '@/components/TimelineWorkspace';

interface TimelinePreviewProps {
  clips: TimelineClip[];
  clipStates: Record<string, ClipState>;
}

type ReadyEntry = { clip: TimelineClip; state: Extract<ClipState, { status: 'ready' }> };

/**
 * The sequence played as one piece rather than a stack of separate files.
 *
 * Two media elements, not one: the idle element holds the *next* clip already
 * loaded and seeked to its first frame, so a cut is a swap between two ready
 * elements instead of a load. A single element would have to fetch and decode
 * at every boundary, which is the stutter this exists to remove — and it must
 * never be given a React `key` that changes, or React tears the element down
 * and the preload dies with it.
 *
 * Still not a proof of the export: each clip plays at its own framing, with no
 * letterboxing to the output format. Compositing that faithfully means running
 * the render pipeline in real time, which is a later slice.
 */
export default function TimelinePreview({ clips, clipStates }: TimelinePreviewProps) {
  const ready = useMemo<ReadyEntry[]>(
    () =>
      clips
        .map((clip) => ({ clip, state: clipStates[clip.id] }))
        .filter((entry): entry is ReadyEntry => entry.state?.status === 'ready'),
    [clips, clipStates]
  );

  const sequence: PlaybackSequence = useMemo(
    () =>
      buildSequence(
        ready.map((entry) => ({
          id: entry.clip.id,
          // The same duration the export panel totals, so the two readouts
          // cannot disagree about how long the sequence is.
          durationSeconds: entry.state.dimensions.durationSeconds,
        }))
      ),
    [ready]
  );

  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of ready) map.set(entry.clip.id, URL.createObjectURL(entry.state.blob));
    return map;
  }, [ready]);

  useEffect(() => {
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, [urls]);

  // Two plain refs rather than an array of them: an array built during render
  // is itself a render value, so everything reached through it reads as
  // render-scope state and mutating an element's `src` or `currentTime`
  // through it is rejected by react-hooks/immutability. A `useRef` is the
  // sanctioned escape hatch; an array of them is not.
  const slotARef = useRef<HTMLVideoElement>(null);
  const slotBRef = useRef<HTMLVideoElement>(null);
  /** Which clip each element currently holds, so a slot is never reloaded with what it already has. */
  const loadedRef = useRef<[string | null, string | null]>([null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const position = locate(sequence, globalTime);
  /**
   * Clamped for display rather than written back through state: the sequence
   * can shrink underneath the playhead (a clip is removed mid-playback) and
   * deriving keeps the readout honest without a setState-in-effect cascade.
   * `locate` already clamps internally, so the frame shown was always right —
   * it was only the clock that could read past the end.
   */
  const shownTime = Math.min(Math.max(globalTime, 0), sequence.total);

  const loadInto = useCallback(
    (slot: 0 | 1, clipId: string | null, atLocalTime = 0) => {
      const element = (slot === 0 ? slotARef : slotBRef).current;
      if (!element) return;
      if (!clipId) {
        loadedRef.current[slot] = null;
        element.removeAttribute('src');
        return;
      }
      const url = urls.get(clipId);
      if (!url) return;
      if (loadedRef.current[slot] !== clipId) {
        loadedRef.current[slot] = clipId;
        element.src = url;
      }
      // Seeking before metadata arrives is ignored by the element, so it is
      // repeated once the element knows how long it is.
      const seek = () => {
        if (Math.abs(element.currentTime - atLocalTime) > 0.05) element.currentTime = atLocalTime;
      };
      seek();
      element.addEventListener('loadedmetadata', seek, { once: true });
    },
    [urls]
  );

  // Keep the active element on the clip the playhead is inside, and the idle
  // element parked on whatever comes next.
  useEffect(() => {
    if (!position) {
      loadInto(0, null);
      loadInto(1, null);
      return;
    }
    const idleSlot = activeSlot === 0 ? 1 : 0;
    if (loadedRef.current[activeSlot] !== position.id) {
      loadInto(activeSlot as 0 | 1, position.id, position.localTime);
    }
    const next = sequence.segments[position.index + 1];
    loadInto(idleSlot as 0 | 1, next?.id ?? null, 0);
  }, [position, activeSlot, sequence, loadInto]);

  // Drive the scrubber from whichever element is actually playing.
  useEffect(() => {
    const element = (activeSlot === 0 ? slotARef : slotBRef).current;
    if (!element) return;
    const onTime = () => {
      const segment = sequence.segments.find((candidate) => candidate.id === loadedRef.current[activeSlot]);
      if (segment) setGlobalTime(segment.start + element.currentTime);
    };
    element.addEventListener('timeupdate', onTime);
    return () => element.removeEventListener('timeupdate', onTime);
  }, [activeSlot, sequence]);

  // A clip ending is a swap, not a load: the idle element is already holding
  // the next clip at its first frame.
  useEffect(() => {
    const element = (activeSlot === 0 ? slotARef : slotBRef).current;
    if (!element) return;
    const onEnded = () => {
      const current = sequence.segments.find((s) => s.id === loadedRef.current[activeSlot]);
      const next = current ? sequence.segments[current.index + 1] : undefined;
      if (!next) {
        setPlaying(false);
        setGlobalTime(sequence.total);
        return;
      }
      const idleSlot = activeSlot === 0 ? 1 : 0;
      setActiveSlot(idleSlot);
      setGlobalTime(next.start);
      // `?.` on the RESULT too: jsdom's play() returns undefined, and calling
      // .catch on that throws — the method guard alone is not enough.
      const upcoming = (idleSlot === 0 ? slotARef : slotBRef).current;
      void upcoming?.play?.()?.catch?.(() => {});
    };
    element.addEventListener('ended', onEnded);
    return () => element.removeEventListener('ended', onEnded);
  }, [activeSlot, sequence]);

  const toggle = () => {
    const element = (activeSlot === 0 ? slotARef : slotBRef).current;
    if (!element || !position) return;
    if (playing) {
      element.pause?.();
      setPlaying(false);
      return;
    }
    // Restart from the top once the sequence has run out, rather than
    // refusing to play because the playhead is parked at the end.
    if (globalTime >= sequence.total) setGlobalTime(0);
    void element.play?.()?.catch?.(() => {});
    setPlaying(true);
  };

  const scrubTo = (next: number) => {
    setGlobalTime(next);
    const target = locate(sequence, next);
    const element = (activeSlot === 0 ? slotARef : slotBRef).current;
    if (!target || !element) return;
    if (loadedRef.current[activeSlot] === target.id) element.currentTime = target.localTime;
  };

  const pending = clips.length - ready.length;

  return (
    <div className="glass-card space-y-2.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Preview</p>
        {sequence.segments.length > 0 && (
          <p className="text-xs text-[var(--foreground-subtle)]">
            {sequence.segments.length} {sequence.segments.length === 1 ? 'clip' : 'clips'} ·{' '}
            {formatClock(sequence.total)}
          </p>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={slotARef}
          muted
          playsInline
          preload="auto"
          data-testid="preview-slot-0"
          data-active={activeSlot === 0 ? 'true' : 'false'}
          className={`absolute inset-0 h-full w-full ${activeSlot === 0 ? '' : 'invisible'}`}
        />
        <video
          ref={slotBRef}
          muted
          playsInline
          preload="auto"
          data-testid="preview-slot-1"
          data-active={activeSlot === 1 ? 'true' : 'false'}
          className={`absolute inset-0 h-full w-full ${activeSlot === 1 ? '' : 'invisible'}`}
        />
        {sequence.segments.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="px-4 text-center text-[0.8125rem] text-[var(--foreground-subtle)]">
              Add a ready clip to preview your sequence.
            </p>
          </div>
        )}
      </div>

      {sequence.segments.length > 0 && (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            className="shrink-0 rounded-md border border-[var(--border)] p-1.5 text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)]"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>

          <div className="relative flex-1">
            <input
              type="range"
              min={0}
              max={sequence.total}
              step={0.05}
              value={shownTime}
              onChange={(event) => scrubTo(Number(event.target.value))}
              aria-label="Preview position"
              className="w-full"
            />
            {/* Where the cuts fall, so the sequence reads as several clips even
                though it plays as one. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-full">
              {sequence.segments.slice(1).map((segment) => (
                <span
                  key={segment.id}
                  className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-[var(--foreground-subtle)]"
                  style={{ left: `${(segment.start / sequence.total) * 100}%` }}
                />
              ))}
            </div>
          </div>

          <p className="shrink-0 tabular-nums text-xs text-[var(--foreground-muted)]">
            {formatClock(shownTime)} / {formatClock(sequence.total)}
          </p>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-[var(--foreground-subtle)]">
        <Info size={12} className="mt-0.5 shrink-0" />
        {pending > 0
          ? `Playing ${ready.length} of ${clips.length} clips — the rest are not ready, so this is not the full sequence.`
          : 'Playback only — silent, and without letterboxing or exact cut timing.'}
      </p>
    </div>
  );
}
