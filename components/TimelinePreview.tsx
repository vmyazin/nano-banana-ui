'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';

import type { TimelineClip } from '@/store/useTimelineStore';
import type { ClipState } from '@/components/TimelineWorkspace';

interface TimelinePreviewProps {
  clips: TimelineClip[];
  clipStates: Record<string, ClipState>;
}

/**
 * A playlist, not a render: swaps `<video>` source at each clip boundary and
 * tracks a sequence-wide position. It does not letterbox to the output format
 * or cut at exact boundaries — that requires actually running a render
 * engine, which is slice 3's problem once transitions make it unavoidable.
 * The label says "Preview", not "proof".
 */
export default function TimelinePreview({ clips, clipStates }: TimelinePreviewProps) {
  const ready = useMemo(
    () =>
      clips
        .map((clip) => ({ clip, state: clipStates[clip.id] }))
        .filter(
          (entry): entry is { clip: TimelineClip; state: Extract<ClipState, { status: 'ready' }> } =>
            entry.state?.status === 'ready'
        ),
    [clips, clipStates]
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

  const [index, setIndex] = useState(0);
  // Clamped rather than reset via an effect: `ready` can shrink (a clip is
  // removed) between renders, and deriving the displayed index here keeps it
  // in range without a setState-in-effect render cascade.
  const safeIndex = ready.length === 0 ? 0 : Math.min(index, ready.length - 1);
  const current = ready[safeIndex];

  return (
    <div className="glass-card space-y-2.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Preview</p>
        {ready.length > 0 && (
          <p className="text-xs text-[var(--foreground-subtle)]">
            Clip {safeIndex + 1} of {ready.length}
          </p>
        )}
      </div>

      {current ? (
        <video
          key={current.clip.id}
          src={urls.get(current.clip.id)}
          autoPlay
          muted
          controls
          onEnded={() => setIndex(safeIndex + 1 < ready.length ? safeIndex + 1 : 0)}
          className="aspect-video w-full rounded-lg bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black/40">
          <p className="px-4 text-center text-[0.8125rem] text-[var(--foreground-subtle)]">
            Add a ready clip to preview your sequence.
          </p>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-[var(--foreground-subtle)]">
        <Info size={12} className="mt-0.5 shrink-0" />
        Playback only — this does not show letterboxing or exact cut timing.
      </p>
    </div>
  );
}
