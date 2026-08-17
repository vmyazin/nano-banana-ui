import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimelinePreview from '../../components/TimelinePreview';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { TimelineClip } from '../../store/useTimelineStore';

/**
 * The preview holds the one resource jsdom will not reclaim for us: an object
 * URL per ready clip. Both halves matter — every URL created must be revoked
 * (a leaked one pins the whole blob in memory for the life of the document,
 * and this component recreates them on every clip change), and the playhead
 * must survive the clip list shrinking underneath it, which happens whenever
 * a clip is removed mid-playback.
 */

let created: string[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  let counter = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      counter += 1;
      const url = `blob:preview-${counter}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function clip(id: string): TimelineClip {
  return { id, recordId: `record-${id}`, fit: 'contain' };
}

function ready(): ClipState {
  return {
    status: 'ready',
    blob: new Blob(['bytes']),
    dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
    durable: true,
  };
}

function statesFor(clips: TimelineClip[]): Record<string, ClipState> {
  return Object.fromEntries(clips.map((entry) => [entry.id, ready()]));
}

function video(): HTMLVideoElement {
  const element = document.querySelector('video');
  if (!element) throw new Error('no <video> rendered');
  return element as HTMLVideoElement;
}

describe('TimelinePreview — object URL lifecycle', () => {
  it('creates one URL per ready clip and none for clips that are not ready', () => {
    const clips = [clip('a'), clip('b'), clip('c')];
    render(
      <TimelinePreview
        clips={clips}
        clipStates={{
          a: ready(),
          b: { status: 'loading' },
          c: { status: 'unavailable', reason: 'expired', message: 'gone' },
        }}
      />
    );

    expect(created).toHaveLength(1);
  });

  it('revokes every URL it created when the clip list changes, leaking none', () => {
    const first = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={first} clipStates={statesFor(first)} />);
    const firstBatch = [...created];
    expect(firstBatch).toHaveLength(2);
    expect(revoked).toHaveLength(0);

    const second = [clip('a'), clip('b'), clip('c')];
    rerender(<TimelinePreview clips={second} clipStates={statesFor(second)} />);

    // The previous batch is released as soon as a new one replaces it —
    // otherwise a session of adding and removing clips accumulates a live
    // blob reference per edit.
    expect(revoked).toEqual(expect.arrayContaining(firstBatch));
  });

  it('revokes everything still outstanding on unmount', () => {
    const clips = [clip('a'), clip('b')];
    const { unmount } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);

    unmount();

    expect(revoked.sort()).toEqual(created.sort());
    expect(created.length).toBeGreaterThan(0);
  });

  it('points the video at the current clip URL', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);

    expect(video()).toHaveAttribute('src', created[0]);
  });
});

describe('TimelinePreview — playhead against a shrinking clip list', () => {
  it('advances through the sequence and wraps at the end', () => {
    const clips = [clip('a'), clip('b')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);

    expect(screen.getByText('Clip 1 of 2')).toBeInTheDocument();
    fireEvent.ended(video());
    expect(screen.getByText('Clip 2 of 2')).toBeInTheDocument();
    fireEvent.ended(video());
    expect(screen.getByText('Clip 1 of 2')).toBeInTheDocument();
  });

  it('clamps the playhead when the clip list shrinks underneath it', () => {
    const three = [clip('a'), clip('b'), clip('c')];
    const { rerender } = render(<TimelinePreview clips={three} clipStates={statesFor(three)} />);

    // Play through to the last clip, then remove two of them — which is what
    // a user deleting clips during playback does.
    fireEvent.ended(video());
    fireEvent.ended(video());
    expect(screen.getByText('Clip 3 of 3')).toBeInTheDocument();

    const one = [clip('a')];
    rerender(<TimelinePreview clips={one} clipStates={statesFor(one)} />);

    // Index 2 no longer exists. It must clamp rather than render nothing or
    // read past the end.
    expect(screen.getByText('Clip 1 of 1')).toBeInTheDocument();
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('falls back to the empty state when every clip goes away, without crashing', () => {
    const clips = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);
    fireEvent.ended(video());

    rerender(<TimelinePreview clips={[]} clipStates={{}} />);

    expect(screen.getByText(/add a ready clip to preview/i)).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.queryByText(/clip \d+ of/i)).not.toBeInTheDocument();
  });

  it('recovers the playhead when clips come back after the list emptied', () => {
    const clips = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);
    fireEvent.ended(video());
    expect(screen.getByText('Clip 2 of 2')).toBeInTheDocument();

    rerender(<TimelinePreview clips={[]} clipStates={{}} />);
    rerender(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);

    // The stored index is still 1 and is once again in range, so it is honoured
    // rather than reset — the clamp is derived, not a destructive write.
    expect(screen.getByText('Clip 2 of 2')).toBeInTheDocument();
  });

  it('says it is a playback preview, not a proof of the export', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} />);

    expect(screen.getByText(/does not show letterboxing or exact cut timing/i)).toBeInTheDocument();
  });
});
