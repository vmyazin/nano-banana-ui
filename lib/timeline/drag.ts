/**
 * What a drag onto the timeline is carrying.
 *
 * Two different gestures land on the same drop targets through the same
 * `DataTransfer`, and confusing them is the bug this module exists to make
 * impossible: dragging a *block already on the timeline* is a move that
 * reorders it, while dragging a *clip out of the rail* is a copy that inserts a
 * new placement. Both used to be describable only as `text/plain`, and a record
 * id handed to `moveClip` matches no placement — so a mixed-up drop did not
 * fail loudly, it did nothing at all.
 *
 * So a rail drag is tagged with its own MIME type and reorder keeps
 * `text/plain`. Every drop target asks about the rail first and falls through
 * to reorder, which means an unrecognised drag from anywhere else on the system
 * still behaves the way it always did.
 */

/** A library record id, dragged out of the clip rail. */
export const TIMELINE_RECORD_MIME = 'application/x-nb-timeline-record';

/**
 * Tags a drag as carrying a library record.
 *
 * `text/plain` is set too, and deliberately to the clip's *title* rather than
 * its id: it is what a drop outside the app pastes, and it is what the reorder
 * handlers would read if this drag ever reached one. A title matches no
 * placement, so the worst case there stays a no-op rather than a wrong move.
 */
export function startRecordDrag(
  dataTransfer: DataTransfer,
  recordId: string,
  title: string
): void {
  dataTransfer.setData(TIMELINE_RECORD_MIME, recordId);
  dataTransfer.setData('text/plain', title);
  // Copy, not move: the clip stays in the rail. The cursor says so during the
  // drag, which is the only place the difference from a reorder is visible.
  dataTransfer.effectAllowed = 'copy';
}

/**
 * Whether a drag in flight is carrying a record.
 *
 * Reads `types`, never `getData`, because this is the only question that can be
 * answered during `dragover`: browsers put the payload in protected mode until
 * the drop, so `getData` there returns an empty string. Drop feedback that
 * asked for the value instead would simply never highlight.
 */
export function carriesRecord(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  return Array.from(dataTransfer.types ?? []).includes(TIMELINE_RECORD_MIME);
}

/** The record id on a dropped drag, or null when it was not carrying one. */
export function droppedRecordId(dataTransfer: Pick<DataTransfer, 'getData'>): string | null {
  return dataTransfer.getData(TIMELINE_RECORD_MIME) || null;
}
