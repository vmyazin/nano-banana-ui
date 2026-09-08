import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importGalleryRecord } from '@/lib/account/import';
import { keepUploadedImages, uploadRecordId } from '@/lib/gallery/keep-upload';
import { createMemoryGalleryStorage } from '@/lib/gallery/memory-storage';
import { useAccountStore, type AccountSession } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';
import { configureGalleryStorage, useGalleryStore } from '@/store/useGalleryStore';

vi.mock('@/lib/account/import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/account/import')>();
  // The predicate is real; only the transfer is observed.
  return { ...actual, importGalleryRecord: vi.fn(async () => ({ id: 'i', state: 'completed' })) };
});

const session: AccountSession = {
  account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
  googleEnabled: false,
  localSignIn: true,
  providers: [],
  connections: [],
};

const image = (bytes: string, name = 'attic.png') =>
  ({ file: new File([bytes], name, { type: 'image/png' }) });

describe('keeping an uploaded image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    useAccountStore.setState({ session: null, status: 'ready', epoch: 0, jobs: [], assets: [] });
    // Library conversion is its own decision, tested elsewhere; keep the bytes
    // as uploaded so these assertions are about storing, not re-encoding.
    useAppStore.setState({ convertLibraryImages: false });
  });

  it('keeps it in the browser library, named after the file', async () => {
    // A reference used to live only in the draft, which dies with the tab.
    await keepUploadedImages([image('attic-bytes', 'The Attic FINAL v2.png')]);

    const [record] = useGalleryStore.getState().records;
    expect(record).toMatchObject({ kind: 'image', provider: 'local', prompt: 'The Attic FINAL v2' });
    expect(record.blob).toBeDefined();
  });

  it('stores one copy however often the same picture is attached', async () => {
    // The point of a content-derived id: reusing one reference across four
    // clips must not leave four copies or spend the quota four times.
    useAccountStore.getState().applySession(session);

    await keepUploadedImages([image('same-bytes', 'first-name.png')]);
    await keepUploadedImages([image('same-bytes', 'renamed-since.png')]);

    expect(useGalleryStore.getState().records).toHaveLength(1);
    // The import is attempted again, and that is deliberate: both carry the
    // same record id, so both derive the same client import id and the Worker
    // answers "completed" without re-sending the bytes.
    const ids = vi.mocked(importGalleryRecord).mock.calls.map(([record]) => record.id);
    expect(new Set(ids).size).toBe(1);
  });

  it('reaches the cloud on a later attach when the first happened signed out', async () => {
    // Why a locally-held copy still re-attempts: signing in afterwards, or a
    // cloud that refused the first time, would otherwise strand the image in
    // this browser forever.
    await keepUploadedImages([image('attic-bytes')]);
    expect(importGalleryRecord).not.toHaveBeenCalled();

    useAccountStore.getState().applySession(session);
    await keepUploadedImages([image('attic-bytes')]);

    expect(importGalleryRecord).toHaveBeenCalledTimes(1);
    expect(useGalleryStore.getState().records).toHaveLength(1);
  });

  it('keeps genuinely different pictures apart', async () => {
    await keepUploadedImages([image('one'), image('two')]);
    expect(useGalleryStore.getState().records).toHaveLength(2);
  });

  it('sends it to the cloud library when there is an account to hold it', async () => {
    useAccountStore.getState().applySession(session);

    await keepUploadedImages([image('attic-bytes')]);

    expect(importGalleryRecord).toHaveBeenCalledTimes(1);
    const [record, owner] = vi.mocked(importGalleryRecord).mock.calls[0];
    expect(owner).toBe('owner-1');
    expect(record.id).toBe(useGalleryStore.getState().records[0].id);
  });

  it('keeps it locally and imports nothing while signed out', async () => {
    await keepUploadedImages([image('attic-bytes')]);

    expect(useGalleryStore.getState().records).toHaveLength(1);
    expect(importGalleryRecord).not.toHaveBeenCalled();
  });

  it('ignores anything that is not an image', async () => {
    await keepUploadedImages([{ file: new File(['clip'], 'clip.mp4', { type: 'video/mp4' }) }]);

    expect(useGalleryStore.getState().records).toHaveLength(0);
    expect(importGalleryRecord).not.toHaveBeenCalled();
  });

  it('survives a library that refuses to store it', async () => {
    // Storing is a courtesy; the reference is already in the draft, and the
    // generation the reader was starting must not fall over.
    configureGalleryStorage({
      list: async () => [],
      get: async () => undefined,
      put: async () => { throw new Error('quota'); },
      remove: async () => {},
      clear: async () => {},
    });
    useAccountStore.getState().applySession(session);

    await expect(keepUploadedImages([image('attic-bytes')])).resolves.toBeUndefined();
    expect(importGalleryRecord).not.toHaveBeenCalled();
  });

  it('survives a refused cloud import, keeping the local copy', async () => {
    useAccountStore.getState().applySession(session);
    vi.mocked(importGalleryRecord).mockRejectedValueOnce(new Error('quota'));

    await expect(keepUploadedImages([image('attic-bytes')])).resolves.toBeUndefined();
    expect(useGalleryStore.getState().records).toHaveLength(1);
  });
});

describe('uploadRecordId', () => {
  it('follows the bytes, not the name or the timestamp', async () => {
    // prepareReferences re-encodes before this sees the file, so its name and
    // modified time were minted moments ago and differ on every upload.
    const first = await uploadRecordId(new File(['same'], 'a.png', { type: 'image/png', lastModified: 1 }));
    const second = await uploadRecordId(new File(['same'], 'b.png', { type: 'image/png', lastModified: 999 }));
    const other = await uploadRecordId(new File(['different'], 'a.png', { type: 'image/png' }));

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first.startsWith('upload-')).toBe(true);
  });
});
