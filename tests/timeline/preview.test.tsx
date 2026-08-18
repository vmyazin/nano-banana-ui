import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimelinePreview from '../../components/TimelinePreview';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { TimelineClip, TimelineOutput } from '../../store/useTimelineStore';

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

function clip(id: string, fit: TimelineClip['fit'] = 'contain'): TimelineClip {
  return { id, recordId: `record-${id}`, fit };
}

/** The format the preview frames itself to; 16:9 unless a test says otherwise. */
const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true };

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
        output={OUTPUT}
      />
    );

    expect(created).toHaveLength(1);
  });

  it('revokes every URL it created when the clip list changes, leaking none', () => {
    const first = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={first} clipStates={statesFor(first)} output={OUTPUT} />);
    const firstBatch = [...created];
    expect(firstBatch).toHaveLength(2);
    expect(revoked).toHaveLength(0);

    const second = [clip('a'), clip('b'), clip('c')];
    rerender(<TimelinePreview clips={second} clipStates={statesFor(second)} output={OUTPUT} />);

    // The previous batch is released as soon as a new one replaces it —
    // otherwise a session of adding and removing clips accumulates a live
    // blob reference per edit.
    expect(revoked).toEqual(expect.arrayContaining(firstBatch));
  });

  it('revokes everything still outstanding on unmount', () => {
    const clips = [clip('a'), clip('b')];
    const { unmount } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    unmount();

    expect(revoked.sort()).toEqual(created.sort());
    expect(created.length).toBeGreaterThan(0);
  });

  it('points the video at the current clip URL', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    expect(video()).toHaveAttribute('src', created[0]);
  });
});

describe('TimelinePreview — one continuous transport', () => {
  it('reports the whole sequence, not the current clip', () => {
    const clips = [clip('a'), clip('b'), clip('c')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    // 3 clips x 4s. The old preview said "Clip 1 of 3"; the point of this one
    // is that the sequence has a single duration.
    expect(screen.getByText(/3 clips · 0:12/)).toBeInTheDocument();
    expect(screen.getByText('0:00 / 0:12')).toBeInTheDocument();
  });

  it('keeps both media elements mounted so the next clip stays preloaded', () => {
    const clips = [clip('a'), clip('b')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    // A cut is a swap between two ready elements. Tearing one down at a
    // boundary — which a changing React key would do — is the stutter this
    // design exists to avoid.
    expect(screen.getByTestId('preview-slot-0')).toBeInTheDocument();
    expect(screen.getByTestId('preview-slot-1')).toBeInTheDocument();
    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('data-active', 'true');
  });

  it('hands over to the other element at a cut instead of reloading', () => {
    const clips = [clip('a'), clip('b')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    fireEvent.ended(screen.getByTestId('preview-slot-0'));

    expect(screen.getByTestId('preview-slot-1')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('data-active', 'false');
    // The playhead is now at the start of the second clip on the global clock.
    expect(screen.getByText('0:04 / 0:08')).toBeInTheDocument();
  });

  it('stops at the end of the sequence rather than looping', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    fireEvent.ended(screen.getByTestId('preview-slot-0'));

    expect(screen.getByText('0:04 / 0:04')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play preview/i })).toBeInTheDocument();
  });

  it('scrubs across the whole sequence, not within one clip', () => {
    const clips = [clip('a'), clip('b'), clip('c')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    fireEvent.change(screen.getByLabelText(/preview position/i), { target: { value: '9' } });

    // 9s lands inside the third clip, one second in.
    expect(screen.getByText('0:09 / 0:12')).toBeInTheDocument();
  });

  it('offers play and pause as one control for the sequence', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    fireEvent.click(screen.getByRole('button', { name: /play preview/i }));
    expect(screen.getByRole('button', { name: /pause preview/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pause preview/i }));
    expect(screen.getByRole('button', { name: /play preview/i })).toBeInTheDocument();
  });
});

describe('TimelinePreview — a sequence that changes underneath the playhead', () => {
  it('clamps the playhead when the clip list shrinks', () => {
    const three = [clip('a'), clip('b'), clip('c')];
    const { rerender } = render(<TimelinePreview clips={three} clipStates={statesFor(three)} output={OUTPUT} />);

    fireEvent.change(screen.getByLabelText(/preview position/i), { target: { value: '11' } });
    expect(screen.getByText('0:11 / 0:12')).toBeInTheDocument();

    const one = [clip('a')];
    rerender(<TimelinePreview clips={one} clipStates={statesFor(one)} output={OUTPUT} />);

    // 11s no longer exists. The readout must clamp to the new total rather
    // than reading past the end.
    expect(screen.getByText('0:04 / 0:04')).toBeInTheDocument();
  });

  it('falls back to the empty state when every clip goes away, without crashing', () => {
    const clips = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);
    fireEvent.ended(screen.getByTestId('preview-slot-0'));

    rerender(<TimelinePreview clips={[]} clipStates={{}} output={OUTPUT} />);

    expect(screen.getByText(/add a ready clip to preview/i)).toBeInTheDocument();
    // The transport goes away with the sequence; the elements stay mounted so
    // their refs survive a clip coming back.
    expect(screen.queryByRole('button', { name: /play preview/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preview position/i)).not.toBeInTheDocument();
  });

  it('recovers when clips come back after the list emptied', () => {
    const clips = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    rerender(<TimelinePreview clips={[]} clipStates={{}} output={OUTPUT} />);
    rerender(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    expect(screen.getByLabelText(/preview position/i)).toBeInTheDocument();
    expect(screen.getByText(/2 clips · 0:08/)).toBeInTheDocument();
  });

  it('says the sequence is incomplete when some clips are not ready', () => {
    // Silently skipping a broken clip would mean what you watch differs from
    // what you would export, with nothing saying so.
    const clips = [clip('a'), clip('b')];
    render(
      <TimelinePreview
        clips={clips}
        clipStates={{ a: ready(), b: { status: 'unavailable', reason: 'expired', message: 'gone' } }}
        output={OUTPUT}
      />
    );

    expect(screen.getByText(/playing 1 of 2 clips/i)).toBeInTheDocument();
  });

  it('says it is playback, not a proof of the export', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    // The caption tracks what the preview actually does: it letterboxes to the
    // output frame now, so the caveats left are audio and cut timing.
    expect(screen.getByText(/cuts land on whole clips rather than exact frames/i)).toBeInTheDocument();
  });
});
