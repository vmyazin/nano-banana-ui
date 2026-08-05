import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDraftStore } from '../../store/useDraftStore';

const revokeObjectURL = vi.fn();
let created = 0;

function reference(name: string) {
  return { file: new File(['x'], name, { type: 'image/png' }) };
}

describe('useDraftStore', () => {
  beforeEach(() => {
    created = 0;
    revokeObjectURL.mockClear();
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:draft-${++created}`),
      revokeObjectURL,
    }));
    useDraftStore.setState({ prompt: '', references: [], controlValues: {} });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('carries the prompt independent of any workspace', () => {
    useDraftStore.getState().setPrompt('A neon tiger in the rain');
    expect(useDraftStore.getState().prompt).toBe('A neon tiger in the rain');
  });

  it('gives every reference a stable id and its own preview', () => {
    useDraftStore.getState().addReferences([reference('a.png'), reference('b.png')], 4);

    const { references } = useDraftStore.getState();
    expect(references.map((r) => r.file.name)).toEqual(['a.png', 'b.png']);
    expect(new Set(references.map((r) => r.id)).size).toBe(2);
    expect(references.map((r) => r.previewUrl)).toEqual(['blob:draft-1', 'blob:draft-2']);
  });

  it('keeps the newest when a model accepts fewer than were added', () => {
    useDraftStore.getState().addReferences(
      [reference('a.png'), reference('b.png'), reference('c.png')],
      1
    );

    expect(useDraftStore.getState().references.map((r) => r.file.name)).toEqual(['c.png']);
    // The two that no longer fit must not leak their object URLs.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:draft-1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:draft-2');
  });

  it('trims to a stricter ceiling when switching to a single-image model', () => {
    useDraftStore.getState().addReferences([reference('a.png'), reference('b.png')], 4);
    revokeObjectURL.mockClear();

    useDraftStore.getState().limitReferences(1);

    expect(useDraftStore.getState().references.map((r) => r.file.name)).toEqual(['b.png']);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:draft-1');
  });

  it('leaves references alone when the new ceiling is roomier', () => {
    useDraftStore.getState().addReferences([reference('a.png')], 4);
    revokeObjectURL.mockClear();

    useDraftStore.getState().limitReferences(8);

    expect(useDraftStore.getState().references).toHaveLength(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes exactly the removed preview', () => {
    useDraftStore.getState().addReferences([reference('a.png'), reference('b.png')], 4);
    const [first] = useDraftStore.getState().references;
    revokeObjectURL.mockClear();

    useDraftStore.getState().removeReference(first.id);

    expect(useDraftStore.getState().references.map((r) => r.file.name)).toEqual(['b.png']);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:draft-1');
  });

  it('ignores removal of an id it does not hold', () => {
    useDraftStore.getState().addReferences([reference('a.png')], 4);
    revokeObjectURL.mockClear();

    useDraftStore.getState().removeReference('draft-reference-does-not-exist');

    expect(useDraftStore.getState().references).toHaveLength(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('accumulates control values across models rather than replacing them', () => {
    useDraftStore.getState().rememberControlValues({ aspect_ratio: '16:9', seed: 7 });
    useDraftStore.getState().rememberControlValues({ duration: '10' });

    expect(useDraftStore.getState().controlValues).toEqual({
      aspect_ratio: '16:9',
      seed: 7,
      duration: '10',
    });
  });
});
