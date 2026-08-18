import { beforeEach, describe, expect, it, vi } from 'vitest';

import { measureImageUrl } from '../../lib/draft/reference-dimensions';
import { useDraftStore } from '../../store/useDraftStore';

vi.mock('../../lib/draft/reference-dimensions', () => ({
  measureImageUrl: vi.fn(),
}));

const measure = vi.mocked(measureImageUrl);

function reference(name: string) {
  return { file: new File(['x'], name, { type: 'image/png' }) };
}

describe('reference measurement', () => {
  beforeEach(() => {
    measure.mockReset();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    );
    useDraftStore.setState({ prompt: '', references: [], controlValues: {} });
  });

  it('lands the measured size on the reference after it decodes', async () => {
    let resolve!: (value: { width: number; height: number } | null) => void;
    measure.mockReturnValue(new Promise((r) => (resolve = r)));

    useDraftStore.getState().addReferences([reference('a.png')], 1);
    expect(useDraftStore.getState().references[0].width).toBeUndefined();

    resolve({ width: 1080, height: 1920 });
    await vi.waitFor(() => {
      expect(useDraftStore.getState().references[0]).toMatchObject({ width: 1080, height: 1920 });
    });
  });

  it('ignores a measurement for a reference that was removed meanwhile', async () => {
    let resolve!: (value: { width: number; height: number } | null) => void;
    measure.mockReturnValue(new Promise((r) => (resolve = r)));

    useDraftStore.getState().addReferences([reference('a.png')], 1);
    const { id } = useDraftStore.getState().references[0];
    useDraftStore.getState().removeReference(id);

    resolve({ width: 100, height: 100 });
    await Promise.resolve();
    expect(useDraftStore.getState().references).toEqual([]);
  });

  it('leaves the reference unmeasured when decoding fails', async () => {
    measure.mockResolvedValue(null);
    useDraftStore.getState().addReferences([reference('a.png')], 1);
    await Promise.resolve();
    expect(useDraftStore.getState().references[0].width).toBeUndefined();
  });
});
