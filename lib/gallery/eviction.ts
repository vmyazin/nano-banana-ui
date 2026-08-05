import { isPinned, recordBytes, type GalleryRecord } from '@/lib/gallery/storage';

export interface GalleryBudget {
  /** Ceiling on stored bytes. Metadata-only records cost nothing against it. */
  maxBytes: number;
  /** Ceiling on record count, so an all-metadata gallery cannot grow forever. */
  maxCount: number;
}

/** Roughly a hundred 4K stills, or a few dozen kept clips. */
export const DEFAULT_GALLERY_BUDGET: GalleryBudget = {
  maxBytes: 500 * 1024 * 1024,
  maxCount: 500,
};

/**
 * Which records to drop to get back inside the budget, oldest first.
 *
 * Pinned records are evicted last and only to satisfy the count ceiling — never
 * to free bytes, since pinning was a deliberate act and the provider URL has
 * probably expired by now. Auto-captured images are not pinned, so the gallery
 * can still reclaim space from them.
 */
export function selectEvictions(
  records: GalleryRecord[],
  budget: GalleryBudget = DEFAULT_GALLERY_BUDGET
): GalleryRecord[] {
  const oldestFirst = [...records].sort((a, b) => a.createdAt - b.createdAt);
  const evicted = new Set<GalleryRecord>();

  let bytes = oldestFirst.reduce((total, record) => total + recordBytes(record), 0);
  if (bytes > budget.maxBytes) {
    for (const record of oldestFirst) {
      if (bytes <= budget.maxBytes) break;
      if (isPinned(record)) continue;
      evicted.add(record);
      bytes -= recordBytes(record);
    }
    // Still over only because pinned records fill it; those are the user's to remove.
  }

  let count = oldestFirst.length - evicted.size;
  if (count > budget.maxCount) {
    for (const pass of [false, true]) {
      for (const record of oldestFirst) {
        if (count <= budget.maxCount) break;
        if (evicted.has(record) || isPinned(record) !== pass) continue;
        evicted.add(record);
        count -= 1;
      }
    }
  }

  return oldestFirst.filter((record) => evicted.has(record));
}
