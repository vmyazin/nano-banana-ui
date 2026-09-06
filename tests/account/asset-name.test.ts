import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAsset } from '@/lib/account/contracts';

const { slugRequest, assetUrl } = vi.hoisted(() => ({ slugRequest: vi.fn(), assetUrl: vi.fn() }));
vi.mock('@/lib/micro-ai/browser', () => ({ requestPromptSlug: slugRequest, requestExamplePrompt: vi.fn() }));
vi.mock('@/lib/account/client', () => ({ accountAssetUrl: assetUrl, accountRequest: vi.fn() }));

import {
  accountAssetFilenameBase,
  knownAccountAssetFilenameBase,
  resetAccountSlugs,
  warmAccountSlug,
} from '@/lib/account/asset-name';
import { downloadAccountAsset } from '@/lib/account/download';

const asset: CloudAsset = {
  id: 'asset-1', jobId: 'job-1', kind: 'video', mimeType: 'video/mp4', bytes: 10, createdAt: 1,
  metadata: { provider: 'kie', modelId: 'kling-3-pro', mediaType: 'video', inputMode: 'text', prompt: 'A neon tiger prowling a rain-soaked market', values: {}, referenceIds: [] },
};

beforeEach(() => { resetAccountSlugs(); slugRequest.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('account asset download names', () => {
  it('is the guest shape: LLM slug plus the model file code', async () => {
    slugRequest.mockResolvedValue('neon-tiger');
    await expect(accountAssetFilenameBase(asset)).resolves.toBe('neon-tiger-kling-3-pro');
    expect(slugRequest).toHaveBeenCalledWith(asset.metadata.prompt, '');
  });

  it('falls back to the deterministic prompt slug when the route cannot answer', async () => {
    slugRequest.mockResolvedValue(null);
    await expect(accountAssetFilenameBase(asset)).resolves.toBe('a-neon-tiger-prowling-a-rain-kling-3-pro');
  });

  it('warms the slug when a job is accepted so the download does not ask again', async () => {
    slugRequest.mockResolvedValue('neon-tiger');
    warmAccountSlug('job-1', asset.metadata.prompt);
    await vi.waitFor(() => expect(knownAccountAssetFilenameBase(asset)).toBe('neon-tiger-kling-3-pro'));
    await accountAssetFilenameBase(asset);
    expect(slugRequest).toHaveBeenCalledTimes(1);
  });

  it('never names a synchronous base after the asset id', () => {
    expect(knownAccountAssetFilenameBase({ ...asset, jobId: null })).toBe('a-neon-tiger-prowling-a-rain-kling-3-pro');
    expect(knownAccountAssetFilenameBase({ ...asset, jobId: null, metadata: { ...asset.metadata, prompt: '' } })).toBe('generated-video-kling-3-pro');
  });

  it('coalesces concurrent requests for the same job', async () => {
    let resolve!: (value: string) => void;
    slugRequest.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const first = accountAssetFilenameBase(asset);
    const second = accountAssetFilenameBase({ ...asset, id: 'asset-2' });
    resolve('neon-tiger');
    await expect(Promise.all([first, second])).resolves.toEqual(['neon-tiger-kling-3-pro', 'neon-tiger-kling-3-pro']);
    expect(slugRequest).toHaveBeenCalledTimes(1);
  });

  it('downloads a cloud asset under that name with the saved bytes\' extension', async () => {
    slugRequest.mockResolvedValue('neon-tiger');
    assetUrl.mockResolvedValue('https://store.example.test/signed');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'video/mp4' } })));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:result'), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await downloadAccountAsset(asset);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('neon-tiger-kling-3-pro.mp4');
    vi.unstubAllGlobals();
  });
});
