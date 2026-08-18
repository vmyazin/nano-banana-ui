'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Pause, Play } from 'lucide-react';

import { formatDuration, formatElapsed } from '@/lib/timeline/format';
import { resolveTrim } from '@/lib/timeline/trim';
import { buildSequence, locate, type PlaybackSequence } from '@/lib/timeline/playback';
import type { TimelineClip, TimelineOutput } from '@/store/useTimelineStore';
import type { ClipState } from '@/components/TimelineWorkspace';

interface TimelinePreviewProps {
  clips: TimelineClip[];
  clipStates: Record<string, ClipState>;
  /** The frame being exported — the shape this preview has to be, or fit is a lie. */
  output: TimelineOutput;
}

type ReadyEntry = { clip: TimelineClip; state: Extract<ClipState, { status: 'ready' }> };

/** Keeps a 9:16 sequence from pushing the controls off the screen. */
const PREVIEW_MAX_HEIGHT = '60vh';

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
 * The frame is the output frame, and each clip sits in it under its own `fit`
 * — the two things the render actually does with a clip, so Contain and Cover
 * can be judged here rather than discovered in a downloaded file.
 *
 * Still not a proof of the export: cuts land on whole clips rather than at
 * exact frame boundaries, and there is no audio. Proving those means running
 * the render pipeline in real time, which is a later slice.
 */
export default function TimelinePreview({ clips, clipStates, output }: TimelinePreviewProps) {
  const ready = useMemo<ReadyEntry[]>(
    () =>
      clips
        .map((clip) => ({ clip, state: clipStates[clip.id] }))
        .filter((entry): entry is ReadyEntry => entry.state?.status === 'ready'),
    [clips, clipStates]
  );

  /** In/out points per clip, clamped to the source that actually arrived. */
  const trims = useMemo(() => {
    const map = new Map<string, { start: number; end: number }>();
    for (const entry of ready) {
      map.set(entry.clip.id, resolveTrim(entry.clip, entry.state.dimensions.durationSeconds));
    }
    return map;
  }, [ready]);

  const sequence: PlaybackSequence = useMemo(
    () =>
      buildSequence(
        ready.map((entry) => {
          const trim = trims.get(entry.clip.id);
          return {
            id: entry.clip.id,
            // The trimmed length, and the same one the export panel totals —
            // the two readouts cannot disagree about how long this is.
            durationSeconds: trim ? trim.end - trim.start : entry.state.dimensions.durationSeconds,
          };
        })
      ),
    [ready, trims]
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
   * `object-fit` per slot: contain letterboxes inside the output frame, cover
   * fills and crops — the same two things the render does with a clip, so the
   * choice can be judged here instead of in a downloaded file.
   *
   * Derived from what each slot is loaded with rather than from the playhead,
   * because the idle slot is already holding the *next* clip. Reading it off
   * the playhead would frame that preloaded clip wrongly until the swap, which
   * is one visible frame of the wrong crop at every cut.
   */
  const fitClassOf = (clipId: string | null | undefined) =>
    clips.find((clip) => clip.id === clipId)?.fit === 'cover' ? 'object-cover' : 'object-contain';
  const activeClipId = position?.id ?? null;
  const nextClipId = position ? (sequence.segments[position.index + 1]?.id ?? null) : null;
  const fitForSlot = (slot: 0 | 1) =>
    fitClassOf(slot === activeSlot ? activeClipId : nextClipId);
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
      // Local time is time *on the timeline*; the element has to be told where
      // that is inside the source, which trimming moves.
      const inPoint = trims.get(clipId)?.start ?? 0;
      const sourceTime = inPoint + atLocalTime;
      if (loadedRef.current[slot] !== clipId) {
        loadedRef.current[slot] = clipId;
        element.src = url;
      }
      // Seeking before metadata arrives is ignored by the element, so it is
      // repeated once the element knows how long it is.
      const seek = () => {
        if (Math.abs(element.currentTime - sourceTime) > 0.05) element.currentTime = sourceTime;
      };
      seek();
      element.addEventListener('loadedmetadata', seek, { once: true });
    },
    [urls, trims]
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
      const loadedId = loadedRef.current[activeSlot];
      const segment = sequence.segments.find((candidate) => candidate.id === loadedId);
      if (!segment) return;
      const trim = loadedId ? trims.get(loadedId) : undefined;
      const inPoint = trim?.start ?? 0;
      setGlobalTime(segment.start + Math.max(0, element.currentTime - inPoint));
      // A trimmed clip has to be stopped at its out-point: the element would
      // otherwise play the source's own tail, which is not on this timeline.
      if (trim && element.currentTime >= trim.end - 0.02) element.dispatchEvent(new Event('ended'));
    };
    element.addEventListener('timeupdate', onTime);
    return () => element.removeEventListener('timeupdate', onTime);
  }, [activeSlot, sequence, trims]);

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
            {formatDuration(sequence.total)}
          </p>
        )}
      </div>

      {/* The export frame, not a fixed 16:9 box: a vertical timeline previewed
          in a landscape box shows framing that no export will produce. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg bg-black"
        style={{
          aspectRatio: `${output.width} / ${output.height}`,
          // The pair matters: a max-height alone caps the height while `w-full`
          // holds the width, which silently breaks the ratio back into a wide
          // box. Capping the width to what that height allows keeps the frame
          // honest and lets a tall format centre itself instead.
          maxHeight: PREVIEW_MAX_HEIGHT,
          maxWidth: `calc(${PREVIEW_MAX_HEIGHT} * ${output.width} / ${output.height})`,
        }}
        data-testid="preview-frame"
      >
        <video
          ref={slotARef}
          muted
          playsInline
          preload="auto"
          data-testid="preview-slot-0"
          data-active={activeSlot === 0 ? 'true' : 'false'}
          data-fit={fitForSlot(0)}
          className={`absolute inset-0 h-full w-full ${fitForSlot(0)} ${activeSlot === 0 ? '' : 'invisible'}`}
        />
        <video
          ref={slotBRef}
          muted
          playsInline
          preload="auto"
          data-testid="preview-slot-1"
          data-active={activeSlot === 1 ? 'true' : 'false'}
          data-fit={fitForSlot(1)}
          className={`absolute inset-0 h-full w-full ${fitForSlot(1)} ${activeSlot === 1 ? '' : 'invisible'}`}
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
            {formatElapsed(shownTime)} / {formatDuration(sequence.total)}
          </p>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-[var(--foreground-subtle)]">
        <Info size={12} className="mt-0.5 shrink-0" />
        {pending > 0
          ? `Playing ${ready.length} of ${clips.length} clips — the rest are not ready, so this is not the full sequence.`
          : 'Playback only — silent, and cuts land on whole clips rather than exact frames.'}
      </p>
    </div>
  );
}
