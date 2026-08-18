/**
 * Moving a clip along the timeline with the keyboard.
 *
 * Reordering was drag-only, which put the timeline's primary verb out of reach
 * of anyone not using a pointer — and out of reach of tests, since jsdom has no
 * drag. The shortcut is the same on both layouts even though one runs
 * horizontally and the other vertically: earlier is left/up, later is
 * right/down, so whichever mental model you hold, the arrow that points the way
 * you want the clip to go is the one that works.
 *
 * Alt is required. The bare arrows belong to the browser — moving focus and
 * scrolling the track — and stealing them would break keyboard navigation to
 * fix keyboard reordering.
 */
export type ReorderIntent = { toIndex: number } | null;

const EARLIER = new Set(['ArrowLeft', 'ArrowUp']);
const LATER = new Set(['ArrowRight', 'ArrowDown']);

export function reorderIntent(
  key: string,
  modifiers: { altKey: boolean; metaKey?: boolean; ctrlKey?: boolean },
  index: number,
  total: number
): ReorderIntent {
  // Meta/Ctrl combinations are the browser's and the OS's, never ours.
  if (!modifiers.altKey || modifiers.metaKey || modifiers.ctrlKey) return null;

  if (EARLIER.has(key)) return index > 0 ? { toIndex: index - 1 } : null;
  if (LATER.has(key)) return index < total - 1 ? { toIndex: index + 1 } : null;
  // Home/End for the two ends, which is a long way to arrow on a big timeline.
  if (key === 'Home') return index > 0 ? { toIndex: 0 } : null;
  if (key === 'End') return index < total - 1 ? { toIndex: total - 1 } : null;
  return null;
}

/** What a screen reader announces on a clip block, so the move is discoverable. */
export function reorderHint(position: number, total: number, title: string): string {
  return `${title}, clip ${position} of ${total}. Press Alt with an arrow key to move it.`;
}
