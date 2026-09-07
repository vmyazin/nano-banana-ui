import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveResultImage,
  sendResultToFirstFrame,
  sendResultToReferences,
} from '@/lib/result-handoff';
import { prepareReferences } from '@/lib/draft/ingest';
import { extractLastFrame } from '@/lib/video-frame';
import { useDraftStore } from '@/store/useDraftStore';
import { useSeedFrameStore } from '@/store/useSeedFrameStore';

vi.mock('@/lib/draft/ingest', () => ({ prepareReferences: vi.fn(async (entries) => entries) }));
vi.mock('@/lib/video-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/video-frame')>();
  return { ...actual, extractLastFrame: vi.fn(async () => new Blob(['frame'], { type: 'image/png' })) };
});

const png = () => new Blob(['png'], { type: 'image/png' });

describe('resolveResultImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => png() })));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fixture') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('fetches an image result directly', async () => {
    const blob = await resolveResultImage('https://fixture.test/a.png', 'image');
    expect(blob.type).toBe('image/png');
    expect(extractLastFrame).not.toHaveBeenCalled();
  });

  it('takes a clip s closing frame, never its opening one', async () => {
    // A follow-on shot continues from where the last one ended. This is the
    // same meaning LastFrameActions and the gallery poster already carry.
    await resolveResultImage('https://fixture.test/clip.mp4', 'video');
    expect(extractLastFrame).toHaveBeenCalledWith('https://fixture.test/clip.mp4');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a result whose bytes are gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => png() })));
    await expect(resolveResultImage('https://fixture.test/a.png', 'image')).rejects.toThrow('no longer available');
  });

  it('refuses a response that is not an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'text/html' }) })));
    await expect(resolveResultImage('https://fixture.test/a.png', 'image')).rejects.toThrow('not an image');
  });
});

describe('sendResultToReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDraftStore.getState().reset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fixture') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('runs the bytes through the ingest chokepoint on the way in', async () => {
    // Conversion is what decides the payload, so a size gate must never sit in
    // front of prepareReferences.
    await sendResultToReferences(png(), {
      filenameBase: 'rooftop-at-dusk', kind: 'image', sourceLabel: 'From rooftop-at-dusk', limit: 2,
    });

    expect(prepareReferences).toHaveBeenCalled();
    expect(useDraftStore.getState().references).toHaveLength(1);
    expect(useDraftStore.getState().references[0].file.name).toBe('rooftop-at-dusk.png');
  });

  it('names a clip s contribution as the frame it actually is', async () => {
    await sendResultToReferences(png(), {
      filenameBase: 'rooftop-clip', kind: 'video', sourceLabel: 'From rooftop-clip', limit: 2,
    });
    expect(useDraftStore.getState().references[0].file.name).toContain('last-frame');
  });

  it('refuses once the stack is full rather than silently dropping the pick', async () => {
    useDraftStore.getState().addReferences([{ file: new File(['x'], 'a.png', { type: 'image/png' }) }], 1);
    await expect(sendResultToReferences(png(), {
      filenameBase: 'b', kind: 'image', sourceLabel: 'From b', limit: 1,
    })).rejects.toThrow('Remove a reference');
    expect(useDraftStore.getState().references).toHaveLength(1);
  });

  it('re-checks the limit after conversion, which the user can fill while it runs', async () => {
    vi.mocked(prepareReferences).mockImplementationOnce(async (entries) => {
      useDraftStore.getState().addReferences([{ file: new File(['x'], 'race.png', { type: 'image/png' }) }], 1);
      return entries;
    });
    await expect(sendResultToReferences(png(), {
      filenameBase: 'b', kind: 'image', sourceLabel: 'From b', limit: 1,
    })).rejects.toThrow('Remove a reference');
    expect(useDraftStore.getState().references).toHaveLength(1);
  });
});

describe('sendResultToFirstFrame', () => {
  beforeEach(() => {
    useSeedFrameStore.getState().clearSeedFrame();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fixture') });
  });

  it('leaves the frame in the tray the video workspace claims on mount', async () => {
    // A store rather than a prop: the caller immediately switches workspace,
    // which remounts it and would drop a frame passed as a prop.
    sendResultToFirstFrame(png(), { filenameBase: 'rooftop', kind: 'image', sourceLabel: 'rooftop' });

    const seed = useSeedFrameStore.getState().takeSeedFrame();
    expect(seed?.file.name).toBe('rooftop.png');
    expect(seed?.sourceLabel).toBe('rooftop');
    // Reading it clears it, so a second workspace mount does not re-seed.
    expect(useSeedFrameStore.getState().takeSeedFrame()).toBeNull();
  });
});
