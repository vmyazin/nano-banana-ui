'use client';

import { useEffect, useState } from 'react';

import { carriesRecord } from '@/lib/timeline/drag';

/**
 * Whether a clip is being dragged out of the rail right now.
 *
 * The track's between-clip drop targets sit *on top of* the blocks — they have
 * to, because blocks are laid out at pixel-exact widths on a shared time scale
 * and anything taking up real space between them would move every clip and put
 * the playhead in the wrong place. An overlay that was always mounted would
 * swallow the gestures the blocks own (reorder drags, trim handles, the remove
 * button), so the seams are mounted only while there is a drag they could
 * possibly serve.
 *
 * Watched on `window` rather than passed down: the drag starts in
 * `TimelineClipDrawer`, which is a sibling of the track under the workspace,
 * and threading a "someone is dragging" flag through the workspace would put
 * a piece of transient pointer state into the component that owns the timeline.
 *
 * `dragstart` is the one moment `dataTransfer.types` can be read on the way
 * out — during `dragover` the payload is protected — and it bubbles, so the
 * rail does not need to announce itself.
 */
export function useRecordDragActive(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onStart = (event: DragEvent) => {
      if (event.dataTransfer && carriesRecord(event.dataTransfer)) setActive(true);
    };
    // `dragend` fires on the source however the drag finished — dropped,
    // cancelled with Escape, or released over nothing — so the seams cannot be
    // left stranded on screen. `drop` is listened for too because a drop that
    // is handled and stops propagating still reaches window in the capture the
    // browser does for the source's own dragend, and clearing twice is free.
    const stop = () => setActive(false);

    window.addEventListener('dragstart', onStart);
    window.addEventListener('dragend', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragstart', onStart);
      window.removeEventListener('dragend', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  return active;
}
