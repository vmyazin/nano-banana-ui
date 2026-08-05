import type { GalleryRecord, GalleryStorage } from '@/lib/gallery/storage';

/**
 * IndexedDB adapter. IndexedDB is used rather than localStorage because it
 * stores Blobs natively and its quota is measured in hundreds of megabytes
 * rather than five, which is what lets a result outlive its provider URL.
 *
 * jsdom has no IndexedDB, so this file is covered by a browser check rather
 * than unit tests; the logic that decides *what* to store lives in the store
 * and in eviction.ts, both of which are unit-tested against the memory adapter.
 */
const DATABASE_NAME = 'scene-assembly-gallery';
const DATABASE_VERSION = 1;
const STORE_NAME = 'results';
const CREATED_AT_INDEX = 'createdAt';

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(CREATED_AT_INDEX, 'createdAt');
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB could not be opened'));
    open.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

export function createIndexedDbGalleryStorage(): GalleryStorage {
  let database: Promise<IDBDatabase> | null = null;
  const connect = () => (database ??= openDatabase());

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const active = await connect();
    const transaction = active.transaction(STORE_NAME, mode);
    const result = await request(run(transaction.objectStore(STORE_NAME)));
    // Writes are not durable until the transaction itself completes.
    if (mode === 'readwrite') {
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      });
    }
    return result;
  }

  return {
    async list() {
      const records = await withStore<GalleryRecord[]>('readonly', (store) =>
        store.index(CREATED_AT_INDEX).getAll()
      );
      return records.reverse(); // the index ascends; the overlay wants newest first
    },
    get: (id) => withStore('readonly', (store) => store.get(id)),
    put: (record) => withStore('readwrite', (store) => store.put(record)).then(() => undefined),
    remove: (id) => withStore('readwrite', (store) => store.delete(id)),
    clear: () => withStore('readwrite', (store) => store.clear()),
  };
}
