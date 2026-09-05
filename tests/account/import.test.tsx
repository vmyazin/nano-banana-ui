import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountAssetImport from '@/components/account/AccountAssetImport';
import { resetAccountImportAttemptsForTests } from '@/lib/account/import';
import type { GalleryRecord } from '@/lib/gallery/storage';
import { useAccountStore } from '@/store/useAccountStore';
import { useGalleryStore } from '@/store/useGalleryStore';

function record(overrides: Partial<GalleryRecord> = {}): GalleryRecord {
  const blob = new Blob(['original-png'], { type: 'image/png' });
  return {
    id: 'browser-image-1',
    kind: 'image',
    createdAt: 1,
    prompt: 'A cyan city at dusk',
    slug: 'cyan-city',
    provider: 'gemini',
    modelId: 'gemini-image',
    inputMode: 'image',
    controlValues: { seed: 4, enabled: true, bad: Number.NaN },
    mimeType: 'image/webp',
    blob,
    bytes: blob.size,
    ...overrides,
  };
}

function owner(id = 'owner-1') {
  useAccountStore.getState().applySession({
    account: { id, name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true,
    localSignIn: false,
    providers: [],
    connections: [],
  });
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function completed(id = 'import-1') {
  return { id, state: 'completed', assetId: id, expiresAt: 99 };
}

describe('AccountAssetImport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetAccountImportAttemptsForTests();
    owner();
    useGalleryStore.setState({ records: [record()], hydrated: true, storageError: null });
  });

  it('starts unchecked and sends only a selected original Blob with its actual MIME type', async () => {
    const original = useGalleryStore.getState().records[0];
    useGalleryStore.setState({ records: [original, record({ id: 'browser-image-2', slug: 'unselected-image' })] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: 'import-1', state: 'pending', assetId: null, expiresAt: 99, url: 'https://upload.test/one' }, 201))
      .mockResolvedValueOnce(json(completed()));
    vi.stubGlobal('fetch', fetchMock);

    render(<AccountAssetImport ownerId="owner-1" />);
    expect(screen.getByRole('checkbox', { name: /cyan city, ready/i })).not.toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));

    await screen.findByText('imported');
    expect(screen.getByRole('checkbox', { name: /unselected image, ready/i })).not.toBeChecked();
    const intent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(intent).toMatchObject({
      bytes: original.blob?.size,
      mimeType: 'image/png',
      metadata: { provider: 'gemini', mediaType: 'image', inputMode: 'image', prompt: original.prompt, referenceIds: [], values: { seed: 4, enabled: true } },
    });
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Account-Id': 'owner-1' });
    expect(fetchMock.mock.calls[1]).toEqual(['https://upload.test/one', expect.objectContaining({
      method: 'PUT', body: original.blob, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'image/png' },
    })]);
    expect(useGalleryStore.getState().records[0]).toBe(original);
  });

  it('retries an uncertain begin response with the identical stable ID and body', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push([url, init]);
      if (calls.length === 1) return new Response('', { status: 201 });
      return json(completed(), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountAssetImport ownerId="owner-1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retry the selected files');
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));

    await screen.findByText('imported');
    expect(calls).toHaveLength(2);
    expect(calls[1][1]?.body).toBe(calls[0][1]?.body);
    expect(JSON.parse(String(calls[1][1]?.body)).clientImportId).toMatch(/^browser_[A-Za-z0-9_-]{16,128}$/);
  });

  it('skips the direct upload when begin reports the import already completed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(completed(), 201));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountAssetImport ownerId="owner-1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await screen.findByText('imported');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts on an account change and does not start the next selected file', async () => {
    let resolveBegin: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>(resolve => { resolveBegin = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    useGalleryStore.setState({ records: [record(), record({ id: 'browser-image-2', slug: 'second-image' })] });
    const { rerender } = render(<AccountAssetImport ownerId="owner-1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /second image, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;

    act(() => owner('owner-2'));
    rerender(<AccountAssetImport ownerId="owner-2" />);
    expect(firstSignal.aborted).toBe(true);
    resolveBegin?.(json({ id: 'import-1', state: 'pending', assetId: null, expiresAt: 99, url: 'https://upload.test/one' }, 201));
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('excludes invalid and link-only records and explains how to keep remote videos first', () => {
    useGalleryStore.setState({ records: [
      record({ id: 'too-large', blob: new Blob(['x'], { type: 'text/plain' }), mimeType: 'text/plain' }),
      record({ id: 'remote-video', kind: 'video', slug: 'remote-video', blob: undefined, sourceUrl: 'https://video.test/file.mp4', mimeType: 'video/mp4', bytes: 0 }),
    ] });
    vi.stubGlobal('fetch', vi.fn());
    render(<AccountAssetImport ownerId="owner-1" />);
    expect(screen.getByText('No eligible local files are available to import.')).toBeInTheDocument();
    expect(screen.getByText(/Choose Keep in the browser library first/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('offers an explicit terminal restart and persists its new stable ID across remount', async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') bodies.push(init.body);
      return bodies.length === 1
        ? json({ error: 'attempt limit', code: 'import_attempt_limit' }, 409)
        : json(completed(), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = render(<AccountAssetImport ownerId="owner-1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));

    const restart = await screen.findByRole('button', { name: 'Start new import attempt for cyan city' });
    const originalId = JSON.parse(bodies[0]).clientImportId;
    fireEvent.click(restart);
    first.unmount();
    resetAccountImportAttemptsForTests();
    render(<AccountAssetImport ownerId="owner-1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));

    await screen.findByText('imported');
    const retryId = JSON.parse(bodies[1]).clientImportId;
    expect(retryId).not.toBe(originalId);
    expect(retryId).toMatch(/^browser_retry_[A-Za-z0-9_-]{16,128}$/);
    expect(localStorage.getItem('account-asset-import-attempts.v1')).toContain(retryId);
  });

  it('does not offer or mint a new attempt after a generic network failure', async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') bodies.push(init.body);
      if (bodies.length === 1) throw new TypeError('offline');
      return json(completed(), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountAssetImport ownerId="owner-1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /cyan city, ready/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retry the selected files');
    expect(screen.queryByRole('button', { name: /Start new import attempt/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Import selected' }));
    await screen.findByText('imported');
    expect(JSON.parse(bodies[1]).clientImportId).toBe(JSON.parse(bodies[0]).clientImportId);
  });
});
