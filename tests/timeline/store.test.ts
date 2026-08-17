import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';

const ids = () => useTimelineStore.getState().timeline.clips.map((c) => c.recordId);

describe('useTimelineStore', () => {
  beforeEach(() => useTimelineStore.getState().clear());

  it('appends clips in the order they are added', () => {
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('b');
    expect(ids()).toEqual(['a', 'b']);
  });

  it('gives each placement its own id so one record can appear twice', () => {
    const first = useTimelineStore.getState().addClip('a');
    const second = useTimelineStore.getState().addClip('a');
    expect(first).not.toBe(second);
    expect(ids()).toEqual(['a', 'a']);
  });

  it('removes by placement id, not by record id', () => {
    const first = useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().removeClip(first);
    expect(useTimelineStore.getState().timeline.clips).toHaveLength(1);
  });

  it('moves a clip to an index without depending on a stale from-index', () => {
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('b');
    const c = useTimelineStore.getState().addClip('c');
    useTimelineStore.getState().moveClip(c, 0);
    expect(ids()).toEqual(['c', 'a', 'b']);
  });

  it('clamps an out-of-range move instead of dropping the clip', () => {
    const a = useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('b');
    useTimelineStore.getState().moveClip(a, 99);
    expect(ids()).toEqual(['b', 'a']);
  });

  it('ignores a move for an unknown clip id', () => {
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().moveClip('nope', 0);
    expect(ids()).toEqual(['a']);
  });

  it('freezes auto the moment the user edits the output, and matchClips thaws it', () => {
    useTimelineStore.getState().setOutput({ fps: 24 });
    expect(useTimelineStore.getState().timeline.output.auto).toBe(false);
    useTimelineStore.getState().matchClips();
    expect(useTimelineStore.getState().timeline.output.auto).toBe(true);
  });
});
