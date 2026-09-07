import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAccountAssetAsReference } from '@/lib/account/reference';
import { accountAssetUrl } from '@/lib/account/client';
import { prepareReferences } from '@/lib/draft/ingest';
import { useAccountStore } from '@/store/useAccountStore';
import { useDraftStore } from '@/store/useDraftStore';

vi.mock('@/lib/account/client', () => ({ accountAssetUrl: vi.fn(async () => 'https://fixture.test/private-image') }));
vi.mock('@/lib/draft/ingest', () => ({ prepareReferences: vi.fn(async (entries) => entries) }));

const request = {
  provider: 'gemini' as const,
  modelId: 'fixture',
  mediaType: 'image' as const,
  inputMode: 'text' as const,
  prompt: 'Test image',
  values: {},
  referenceIds: [],
};
const asset = {
  id: 'asset-1', jobId: 'job-1', kind: 'image' as const, mimeType: 'image/png', bytes: 3,
  createdAt: 1, metadata: request,
};
const session = {
  account: { id: 'owner-1', name: 'Fixture', email: 'fixture@example.test' },
  googleEnabled: false, localSignIn: true, providers: [], connections: [],
};

describe('useAccountAssetAsReference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.getState().clear();
    useAccountStore.getState().applySession(session);
    useDraftStore.getState().reset();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fixture') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('downloads an image and adds it to the draft using the explicit owner', async () => {
    await useAccountAssetAsReference(asset, 'owner-1', 2);
    expect(accountAssetUrl).toHaveBeenCalledWith('asset-1', undefined, 'owner-1');
    expect(useDraftStore.getState().references).toHaveLength(1);
    expect(useDraftStore.getState().references[0]?.file.type).toBe('image/png');
  });

  it('downloads a legacy image with generic saved MIME metadata and verifies the response', async () => {
    await useAccountAssetAsReference({ ...asset, mimeType: 'application/octet-stream' }, 'owner-1', 2);
    expect(fetch).toHaveBeenCalledOnce();
    expect(useDraftStore.getState().references[0]?.file.type).toBe('image/png');
  });

  it('accepts a full-resolution result that conversion brings under the upload cap', async () => {
    // What background mode actually saves: a provider PNG far over the 20 MB
    // input cap, which prepareReferences re-encodes to a fraction of its size.
    vi.mocked(prepareReferences).mockResolvedValueOnce([
      { file: new File([new Uint8Array(6_000_000)], 'cloud.webp', { type: 'image/webp' }) },
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array(1)], { type: 'image/png' }),
    })));

    await useAccountAssetAsReference({ ...asset, bytes: 23_000_000 }, 'owner-1', 2);
    expect(useDraftStore.getState().references).toHaveLength(1);
  });

  it('rejects an image still over the cap after conversion', async () => {
    // A source conversion cannot shrink — the one case the upload cap is for.
    vi.mocked(prepareReferences).mockResolvedValueOnce([
      { file: new File([new Uint8Array(21_000_000)], 'cloud.png', { type: 'image/png' }) },
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array(1)], { type: 'image/png' }),
    })));

    await expect(useAccountAssetAsReference({ ...asset, bytes: 23_000_000 }, 'owner-1', 2))
      .rejects.toThrow('after compression');
    expect(useDraftStore.getState().references).toHaveLength(0);
  });

  it.each([
    ['video', { ...asset, kind: 'video' as const }],
    ['oversized metadata', { ...asset, bytes: 120_000_001 }],
  ])('rejects %s without downloading', async (_label, candidate) => {
    await expect(useAccountAssetAsReference(candidate, 'owner-1', 2)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(useDraftStore.getState().references).toHaveLength(0);
  });

  it('rejects when the draft is already full', async () => {
    useDraftStore.getState().addReferences([{ file: new File(['x'], 'existing.png', { type: 'image/png' }) }], 1);
    await expect(useAccountAssetAsReference(asset, 'owner-1', 1)).rejects.toThrow('Remove a reference');
    expect(useDraftStore.getState().references).toHaveLength(1);
  });

  it.each(['account changes', 'the same account is re-established'])('does not insert after %s mid-download', async (mode) => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    const pending = useAccountAssetAsReference(asset, 'owner-1', 2);
    await Promise.resolve();
    if (mode === 'account changes') {
      useAccountStore.getState().clear();
      useAccountStore.getState().applySession({ ...session, account: { ...session.account, id: 'owner-2' } });
    } else {
      useAccountStore.getState().clear();
      useAccountStore.getState().applySession(session);
    }
    resolveFetch({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) } as Response);
    await expect(pending).rejects.toThrow('account changed');
    expect(useDraftStore.getState().references).toHaveLength(0);
  });

  it.each([
    ['declared image with video response', asset, 'video/mp4'],
    ['legacy image with generic response', { ...asset, mimeType: 'application/octet-stream' }, 'application/octet-stream'],
    ['legacy image with text response', { ...asset, mimeType: 'application/octet-stream' }, 'text/plain'],
  ])('rejects %s', async (_label, candidate, responseType) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['not-image'], { type: responseType }) })));
    await expect(useAccountAssetAsReference(candidate, 'owner-1', 2)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
    expect(prepareReferences).not.toHaveBeenCalled();
  });
});
