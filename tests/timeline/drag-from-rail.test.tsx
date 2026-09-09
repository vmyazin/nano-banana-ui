import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { TIMELINE_RECORD_MIME, carriesRecord, droppedRecordId } from '../../lib/timeline/drag';
import { useGalleryStore } from '../../store/useGalleryStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import { renderWorkspace, setupTimelineTest, video } from './helpers';

/**
 * jsdom runs no real drag gesture, but the handlers are ordinary event
 * handlers reading `event.dataTransfer` — so a stand-in for that one object is
 * enough to exercise every branch that matters. `types` and `getData` are kept
 * consistent with each other deliberately: the components ask `types` during
 * dragover (the payload is protected until drop) and `getData` on drop, and a
 * fake that let those two disagree could pass a test the browser would fail.
 */
function dataTransfer(entries: Record<string, string>) {
  return {
    types: Object.keys(entries),
    getData: (type: string) => entries[type] ?? '',
    setData: () => {},
    dropEffect: 'none',
    effectAllowed: 'none',
  };
}

const railDrag = (recordId: string) =>
  dataTransfer({ [TIMELINE_RECORD_MIME]: recordId, 'text/plain': 'some clip' });

const clipsOnTimeline = () => useTimelineStore.getState().timeline.clips;

describe('the drag payload keeps a rail drag apart from a reorder', () => {
  it('recognises a rail drag from its types alone, as dragover must', () => {
    // `getData` returns '' during dragover in a real browser, so a check that
    // reached for the value instead would never highlight anything.
    expect(carriesRecord(dataTransfer({ [TIMELINE_RECORD_MIME]: 'r1' }))).toBe(true);
    expect(carriesRecord(dataTransfer({ 'text/plain': 'placement-1' }))).toBe(false);
  });

  it('reads no record id out of a reorder drag', () => {
    expect(droppedRecordId(dataTransfer({ 'text/plain': 'placement-1' }))).toBeNull();
  });
});

describe('dragging a clip from the rail onto the timeline', () => {
  beforeEach(() => {
    setupTimelineTest();
    useGalleryStore.setState({
      records: [
        video({ id: 'r1', slug: 'first', blob: new Blob(['x']), bytes: 1 }),
        video({ id: 'r2', slug: 'second', blob: new Blob(['x']), bytes: 1 }),
      ],
      hydrated: true,
    });
  });

  it('marks the rail rows draggable so the gesture exists at all', () => {
    renderWorkspace();
    const row = within(screen.getByRole('list')).getAllByRole('listitem')[0];
    expect(row).toHaveAttribute('draggable', 'true');
  });

  it('adds a clip dropped on the empty timeline', () => {
    renderWorkspace();

    fireEvent.drop(screen.getByTestId('timeline-list'), { dataTransfer: railDrag('r1') });

    expect(clipsOnTimeline()).toHaveLength(1);
    expect(clipsOnTimeline()[0].recordId).toBe('r1');
  });

  it('inserts at the row it was dropped on, pushing that clip down', () => {
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();

    const rows = within(screen.getByTestId('timeline-list')).getAllByRole('listitem');
    fireEvent.drop(rows[1], { dataTransfer: railDrag('r2') });

    // Dropped on the second row, so it becomes the second clip.
    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r1', 'r2', 'r1']);
  });

  it('appends when dropped past the last clip', () => {
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();

    fireEvent.drop(screen.getByTestId('list-drop-end'), { dataTransfer: railDrag('r2') });

    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r1', 'r2']);
  });

  it('still reorders when the drag is a block already on the timeline', () => {
    // The regression this guards: both gestures arrive through the same
    // DataTransfer, and reading a rail drop as a reorder would hand `moveClip`
    // a record id that matches no placement — a silent no-op, not an error.
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r2');
    const [first] = clipsOnTimeline();
    renderWorkspace();

    const rows = within(screen.getByTestId('timeline-list')).getAllByRole('listitem');
    fireEvent.drop(rows[1], { dataTransfer: dataTransfer({ 'text/plain': first.id }) });

    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r2', 'r1']);
    expect(clipsOnTimeline()).toHaveLength(2);
  });

  it('acquires media for a dropped clip, not just a placement', () => {
    // Added through the workspace rather than straight to the store, so the
    // clip arrives with bytes, a duration, and a way into an export.
    renderWorkspace();

    fireEvent.drop(screen.getByTestId('timeline-list'), { dataTransfer: railDrag('r1') });

    return screen.findByText('0:04');
  });
});

describe('dragging onto the wide track', () => {
  beforeEach(() => {
    setupTimelineTest({ wide: true });
    useGalleryStore.setState({
      records: [
        video({ id: 'r1', slug: 'first', blob: new Blob(['x']), bytes: 1 }),
        video({ id: 'r2', slug: 'second', blob: new Blob(['x']), bytes: 1 }),
      ],
      hydrated: true,
    });
  });

  it('adds a clip dropped on the empty track', () => {
    renderWorkspace();

    fireEvent.drop(screen.getByTestId('timeline-track'), { dataTransfer: railDrag('r2') });

    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r2']);
  });

  it('appends when dropped on the track past the last block', () => {
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();

    fireEvent.drop(screen.getByTestId('track-drop-end'), { dataTransfer: railDrag('r2') });

    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r1', 'r2']);
  });

  it('ignores a drag carrying nothing it understands', () => {
    // A file, a selection, a link from another tab: the zone must not accept
    // what it cannot use, or it silently swallows the drop.
    renderWorkspace();

    fireEvent.drop(screen.getByTestId('timeline-track'), {
      dataTransfer: dataTransfer({ 'text/uri-list': 'https://example.com' }),
    });

    expect(clipsOnTimeline()).toHaveLength(0);
  });
});

/**
 * Blocks butt straight against each other on a pixel-exact time scale, so the
 * boundary between two clips is a line with no width. Dropping "on a clip"
 * cannot express whether you meant before or after it; the seams can.
 */
describe('the between-clips seams on the wide track', () => {
  beforeEach(() => {
    setupTimelineTest({ wide: true });
    useGalleryStore.setState({
      records: [
        video({ id: 'r1', slug: 'first', blob: new Blob(['x']), bytes: 1 }),
        video({ id: 'r2', slug: 'second', blob: new Blob(['x']), bytes: 1 }),
      ],
      hydrated: true,
    });
  });

  /** Starts a rail drag the way the drawer does, so the seams mount. */
  function beginRailDrag() {
    fireEvent.dragStart(
      within(screen.getAllByRole('list')[0]).getAllByRole('listitem')[0],
      { dataTransfer: railDrag('r2') }
    );
  }

  it('shows no seams until a clip is actually being dragged', () => {
    // A permanent overlay would sit on top of the blocks and eat the reorder
    // drags, trim handles and remove buttons underneath it.
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();

    expect(screen.queryByTestId('track-seam-0')).not.toBeInTheDocument();
  });

  it('opens a seam at every clip boundary once a drag starts', () => {
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();

    beginRailDrag();

    expect(screen.getByTestId('track-seam-0')).toBeInTheDocument();
    expect(screen.getByTestId('track-seam-1')).toBeInTheDocument();
  });

  it('drops between two clips, not before or after both', () => {
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();
    beginRailDrag();

    fireEvent.drop(screen.getByTestId('track-seam-1'), { dataTransfer: railDrag('r2') });

    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r1', 'r2', 'r1']);
  });

  it('drops at the head through the first seam', () => {
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();
    beginRailDrag();

    fireEvent.drop(screen.getByTestId('track-seam-0'), { dataTransfer: railDrag('r2') });

    expect(clipsOnTimeline().map((clip) => clip.recordId)).toEqual(['r2', 'r1']);
  });

  it('places each seam on its block boundary, in order along the track', () => {
    // The offsets come from the same `TrackBlockLayout.x` the ruler and
    // playhead are drawn from, so a seam cannot drift away from the cut it
    // claims to be on.
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r1');
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();
    beginRailDrag();

    const lefts = [0, 1, 2].map((index) =>
      Number.parseFloat(screen.getByTestId(`track-seam-${index}`).style.left)
    );

    // The head seam is pinned at 0 — centring it would hang half of it outside
    // the scroll container, where it would be clipped and unhittable.
    expect(lefts[0]).toBe(0);
    expect(lefts[1]).toBeGreaterThan(lefts[0]);
    expect(lefts[2]).toBeGreaterThan(lefts[1]);
  });

  it('closes the seams again when the drag ends without a drop', () => {
    // Cancelled with Escape, or released over nothing: `dragend` fires either
    // way, and seams left on screen would block the track for good.
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();
    beginRailDrag();
    expect(screen.getByTestId('track-seam-0')).toBeInTheDocument();

    fireEvent.dragEnd(window);

    expect(screen.queryByTestId('track-seam-0')).not.toBeInTheDocument();
  });

  it('ignores a drag of something other than a clip', () => {
    useTimelineStore.getState().addClip('r1');
    renderWorkspace();

    fireEvent.dragStart(window, { dataTransfer: dataTransfer({ 'text/plain': 'placement-1' }) });

    expect(screen.queryByTestId('track-seam-0')).not.toBeInTheDocument();
  });
});
