'use client';

import { useState } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';

import { carriesRecord, droppedRecordId } from '@/lib/timeline/drag';

interface TimelineDropZoneProps {
  /** Fires with the dragged record id once it is dropped here. */
  onDropRecord: (recordId: string) => void;
  className?: string;
  /** Added while a rail drag is over this zone. */
  activeClassName?: string;
  /** For a zone that has to be placed, like the track's seams. */
  style?: CSSProperties;
  children?: ReactNode;
  'data-testid'?: string;
}

/**
 * A region of the timeline that accepts a clip dragged out of the rail.
 *
 * Both layouts need the two places a drop cannot land on an existing clip —
 * the empty timeline, and the space past the last clip — and both need them to
 * behave identically, so the highlight and the accept/ignore rule live here
 * once rather than in four hand-rolled copies.
 *
 * The accept rule is the whole point of `preventDefault` being conditional: a
 * drop only becomes possible where the default is prevented, so asking
 * `carriesRecord` first is what stops this zone from swallowing every other
 * drag on the page — a file, a selection, a link — and silently doing nothing
 * with it.
 */
export default function TimelineDropZone({
  onDropRecord,
  className = '',
  activeClassName = '',
  style,
  children,
  'data-testid': testId,
}: TimelineDropZoneProps) {
  const [over, setOver] = useState(false);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesRecord(event.dataTransfer)) return;
    event.preventDefault();
    // Copy, not move: the clip stays in the rail, and the cursor should say so.
    event.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };

  return (
    <div
      data-testid={testId}
      data-drop-active={over ? 'true' : 'false'}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        const recordId = droppedRecordId(event.dataTransfer);
        setOver(false);
        if (!recordId) return;
        event.preventDefault();
        onDropRecord(recordId);
      }}
      style={style}
      className={`${className} ${over ? activeClassName : ''}`.trim()}
    >
      {children}
    </div>
  );
}
