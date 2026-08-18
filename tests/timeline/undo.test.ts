import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';

/**
 * Removing a clip used to be final. That is fine for a generated clip whose
 * source can be re-fetched, and not fine for an imported one: it is pinned
 * with no source URL, so the only copy is the one you just deleted.
 */
beforeEach(() => {
  useTimelineStore.setState({ history: [], undoLabel: null });
  useTimelineStore.getState().clear();
  useTimelineStore.setState({ history: [], undoLabel: null });
});

const ids = () => useTimelineStore.getState().timeline.clips.map((clip) => clip.recordId);

describe('undo', () => {
  it('is not offered until there is something to undo', () => {
    expect(useTimelineStore.getState().undoLabel).toBeNull();
    useTimelineStore.getState().undo();
    expect(ids()).toEqual([]);
  });

  it('puts a removed clip back where it was', () => {
    const store = useTimelineStore.getState();
    store.addClip('a');
    const middle = store.addClip('b');
    store.addClip('c');

    useTimelineStore.getState().removeClip(middle);
    expect(ids()).toEqual(['a', 'c']);
    expect(useTimelineStore.getState().undoLabel).toBe('the removed clip');

    useTimelineStore.getState().undo();
    // Back in position, not appended to the end.
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('brings back a whole cleared timeline', () => {
    const store = useTimelineStore.getState();
    store.addClip('a');
    store.addClip('b');

    useTimelineStore.getState().clear();
    expect(ids()).toEqual([]);
    expect(useTimelineStore.getState().undoLabel).toBe('the cleared timeline');

    useTimelineStore.getState().undo();
    expect(ids()).toEqual(['a', 'b']);
  });

  it('does not offer to undo clearing a timeline that was already empty', () => {
    useTimelineStore.getState().clear();
    expect(useTimelineStore.getState().undoLabel).toBeNull();
  });

  it('leaves reversible edits out of the history, so undo means the destructive one', () => {
    const store = useTimelineStore.getState();
    const first = store.addClip('a');
    store.addClip('b');
    useTimelineStore.getState().removeClip(first);

    // Fit and order are visible and trivially redone by hand; pushing them
    // would bury the removal under noise.
    useTimelineStore.getState().setFit(useTimelineStore.getState().timeline.clips[0].id, 'cover');
    useTimelineStore.getState().moveClip(useTimelineStore.getState().timeline.clips[0].id, 0);

    useTimelineStore.getState().undo();
    expect(ids()).toEqual(['a', 'b']);
  });

  it('steps back through several removals', () => {
    const store = useTimelineStore.getState();
    const a = store.addClip('a');
    const b = store.addClip('b');

    useTimelineStore.getState().removeClip(a);
    useTimelineStore.getState().removeClip(b);
    expect(ids()).toEqual([]);

    useTimelineStore.getState().undo();
    expect(ids()).toEqual(['b']);
    useTimelineStore.getState().undo();
    expect(ids()).toEqual(['a', 'b']);
    expect(useTimelineStore.getState().undoLabel).toBeNull();
  });

  it('keeps the history out of localStorage', () => {
    const store = useTimelineStore.getState();
    store.addClip('a');
    useTimelineStore.getState().removeClip(useTimelineStore.getState().timeline.clips[0]?.id ?? 'x');

    const persisted = JSON.parse(localStorage.getItem('scene-assembly-timeline') ?? '{}');
    // A restored stack would offer to revive clips whose bytes are long gone.
    expect(persisted.state).not.toHaveProperty('history');
    expect(persisted.state).toHaveProperty('timeline');
  });
});
