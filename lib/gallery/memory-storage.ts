import type { GalleryRecord, GalleryStorage } from '@/lib/gallery/storage';

/**
 * Map-backed adapter. Exists because jsdom has no IndexedDB, so the store's
 * logic is exercised against this while the IndexedDB adapter is verified in a
 * real browser.
 */
export function createMemoryGalleryStorage(
  seed: GalleryRecord[] = []
): GalleryStorage & { size: () => number } {
  const records = new Map<string, GalleryRecord>(seed.map((record) => [record.id, record]));

  return {
    // Newest first, matching what the overlay renders.
    async list() {
      return [...records.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return records.get(id);
    },
    async put(record) {
      records.set(record.id, record);
    },
    async remove(id) {
      records.delete(id);
    },
    async clear() {
      records.clear();
    },
    size: () => records.size,
  };
}
