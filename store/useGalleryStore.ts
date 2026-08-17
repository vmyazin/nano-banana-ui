import { create } from 'zustand';

import { DEFAULT_GALLERY_BUDGET, selectEvictions, type GalleryBudget } from '@/lib/gallery/eviction';
import { createIndexedDbGalleryStorage, isIndexedDbAvailable } from '@/lib/gallery/idb-storage';
import { createMemoryGalleryStorage } from '@/lib/gallery/memory-storage';
import { recordBytes, type GalleryRecord, type GalleryStorage } from '@/lib/gallery/storage';

export interface GalleryDraftRecord extends Omit<GalleryRecord, 'id' | 'createdAt' | 'bytes'> {
  id?: string;
  createdAt?: number;
  bytes?: number;
}

interface GalleryState {
  /**
   * In-memory index of what is on disk. Durability comes from IndexedDB, not
   * from zustand persist — the bytes are Blobs, which localStorage cannot hold.
   */
  records: GalleryRecord[];
  hydrated: boolean;
  /** Set when the browser refuses more data, so capture stops nagging. */
  storageError: string | null;
  hydrate: () => Promise<void>;
  /** Adds a result, evicting whatever no longer fits the budget. */
  record: (draft: GalleryDraftRecord) => Promise<GalleryRecord | null>;
  /**
   * Attaches bytes to an existing record and pins it — asking to keep something
   * is the deliberate act that protects it from eviction.
   */
  keep: (id: string, blob: Blob, posterBlob?: Blob) => Promise<void>;
  /** Protects (or releases) a record that already has bytes, such as an image. */
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  /** Caches probed dimensions so the timeline does not re-decode on every visit. */
  setDimensions: (
    id: string,
    dims: { width?: number; height?: number; durationSeconds?: number; fps?: number }
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

let nextRecordId = 0;

/** Chosen once so tests can swap in the memory adapter before anything hydrates. */
let storage: GalleryStorage | null = null;
let budget: GalleryBudget = DEFAULT_GALLERY_BUDGET;

export function galleryStorage(): GalleryStorage {
  return (storage ??= isIndexedDbAvailable()
    ? createIndexedDbGalleryStorage()
    : createMemoryGalleryStorage());
}

/** Test seam: point the store at an adapter and budget of the caller's choosing. */
export function configureGalleryStorage(next: GalleryStorage, nextBudget?: GalleryBudget) {
  storage = next;
  budget = nextBudget ?? DEFAULT_GALLERY_BUDGET;
}

function isQuotaError(error: unknown) {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

const QUOTA_MESSAGE =
  'This browser is out of storage for kept results. Remove some to keep saving.';

export const useGalleryStore = create<GalleryState>((set, get) => ({
  records: [],
  hydrated: false,
  storageError: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      set({ records: await galleryStorage().list(), hydrated: true });
    } catch {
      // A blocked or unavailable database must not take the studio down with it.
      set({ records: [], hydrated: true, storageError: 'Saved results are unavailable.' });
    }
  },

  record: async (draft) => {
    nextRecordId += 1;
    const record: GalleryRecord = {
      ...draft,
      id: draft.id ?? `result-${Date.now()}-${nextRecordId}`,
      createdAt: draft.createdAt ?? Date.now(),
      bytes: draft.bytes ?? recordBytes(draft),
    };

    try {
      await galleryStorage().put(record);
    } catch (error) {
      set({ storageError: isQuotaError(error) ? QUOTA_MESSAGE : 'Could not save this result.' });
      return null;
    }

    const evicted = selectEvictions([...get().records, record], budget);
    await Promise.all(evicted.map((stale) => galleryStorage().remove(stale.id).catch(() => {})));

    const dropped = new Set(evicted.map((stale) => stale.id));
    set((state) => ({
      records: [record, ...state.records].filter((existing) => !dropped.has(existing.id)),
      storageError: null,
    }));
    return record;
  },

  keep: async (id, blob, posterBlob) => {
    const existing = get().records.find((record) => record.id === id);
    if (!existing) return;

    const kept: GalleryRecord = {
      ...existing,
      blob,
      posterBlob,
      pinned: true,
      bytes: recordBytes({ blob, posterBlob }),
    };
    try {
      await galleryStorage().put(kept);
    } catch (error) {
      set({ storageError: isQuotaError(error) ? QUOTA_MESSAGE : 'Could not keep this result.' });
      return;
    }
    set((state) => ({
      records: state.records.map((record) => (record.id === id ? kept : record)),
      storageError: null,
    }));
  },

  setPinned: async (id, pinned) => {
    const existing = get().records.find((record) => record.id === id);
    if (!existing) return;

    const updated: GalleryRecord = { ...existing, pinned };
    try {
      await galleryStorage().put(updated);
    } catch {
      set({ storageError: 'Could not update this result.' });
      return;
    }
    set((state) => ({
      records: state.records.map((record) => (record.id === id ? updated : record)),
    }));
  },

  setDimensions: async (id, dims) => {
    const existing = get().records.find((record) => record.id === id);
    if (!existing) return;

    const updated: GalleryRecord = { ...existing, ...dims };
    try {
      await galleryStorage().put(updated);
    } catch {
      // Dimensions are a cache. Failing to persist them must not fail the add.
      return;
    }
    set((state) => ({
      records: state.records.map((record) => (record.id === id ? updated : record)),
    }));
  },

  remove: async (id) => {
    await galleryStorage().remove(id).catch(() => {});
    set((state) => ({ records: state.records.filter((record) => record.id !== id) }));
  },

  clear: async () => {
    await galleryStorage().clear().catch(() => {});
    set({ records: [], storageError: null });
  },
}));
