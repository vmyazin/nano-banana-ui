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
const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: true };

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

  /**
   * These three replace one assertion that said the *entire* batch of URLs is
   * revoked whenever the clip list changes at all. That is how the leak was
   * avoided, and it is also what made the preview go black: `ready` changes
   * identity every time any one clip resolves, so restoring a saved timeline
   * revoked the URL the video element was still loading, once per clip. The
   * invariant worth keeping is narrower — release what left, keep what stayed.
   */
  it('keeps the URL of a clip that is still on the timeline', () => {
    // Modelled the way the workspace actually accumulates `clipStates`: a
    // placement is resolved once, and adding a third clip does not hand the
    // first two new bytes. Rebuilding every state (as `statesFor` does) would
    // be a repair of all three, which is a different case — covered below.
    const first = [clip('a'), clip('b')];
    const states = statesFor(first);
    const { rerender } = render(<TimelinePreview clips={first} clipStates={states} output={OUTPUT} />);
    const firstBatch = [...created];
    expect(firstBatch).toHaveLength(2);

    const second = [...first, clip('c')];
    rerender(
      <TimelinePreview clips={second} clipStates={{ ...states, c: ready() }} output={OUTPUT} />
    );

    expect(revoked).not.toEqual(expect.arrayContaining(firstBatch));
    expect(created).toHaveLength(3);
  });

  it('revokes the URL of a clip that has left, leaking none', () => {
    const first = [clip('a'), clip('b')];
    const states = statesFor(first);
    const { rerender } = render(<TimelinePreview clips={first} clipStates={states} output={OUTPUT} />);
    const [urlA, urlB] = created;

    rerender(<TimelinePreview clips={[clip('a')]} clipStates={states} output={OUTPUT} />);

    expect(revoked).toContain(urlB);
    expect(revoked).not.toContain(urlA);
  });

  it('replaces the URL when a placement comes back holding different bytes', () => {
    // What a repair does: same placement id, a different file behind it. An id
    // alone cannot see that, so a stale URL would keep pointing at the blob the
    // user just replaced.
    const clips = [clip('a')];
    const { rerender } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);
    const first = created[0];

    rerender(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    expect(revoked).toContain(first);
    expect(created).toHaveLength(2);
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

  it('blanks both media elements when the list empties, not just the transport', () => {
    // Removing `src` alone leaves the last decoded frame painted; only load()
    // resets the element, which is what makes a new project look new.
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const clips = [clip('a'), clip('b')];
    const { rerender } = render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);
    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('src');
    load.mockClear();

    rerender(<TimelinePreview clips={[]} clipStates={{}} output={OUTPUT} />);

    expect(screen.getByTestId('preview-slot-0')).not.toHaveAttribute('src');
    expect(screen.getByTestId('preview-slot-1')).not.toHaveAttribute('src');
    expect(load).toHaveBeenCalledTimes(2);
    load.mockRestore();
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

/**
 * Both render engines carry audio now, so a preview that is silent by
 * construction no longer matches what gets exported — you would approve a cut
 * without hearing what lands on it. The rule is symmetry: the preview is
 * audible exactly when the export will be, and never otherwise.
 */
describe('TimelinePreview — sound', () => {
  function readyWithAudio(hasAudio?: boolean): ClipState {
    return { ...(ready() as Extract<ClipState, { status: 'ready' }>), ...(hasAudio === undefined ? {} : { hasAudio }) };
  }

  it('starts muted, and says so, rather than making noise unasked', () => {
    const clips = [clip('a')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    expect((screen.getByTestId('preview-slot-0') as HTMLVideoElement).muted).toBe(true);
    expect(screen.getByLabelText(/unmute preview/i)).toBeInTheDocument();
    expect(screen.getByText(/this export will keep audio/i)).toBeInTheDocument();
  });

  it('unmutes only the slot on screen, never the one preloading the next clip', () => {
    const clips = [clip('a'), clip('b')];
    render(<TimelinePreview clips={clips} clipStates={statesFor(clips)} output={OUTPUT} />);

    fireEvent.click(screen.getByLabelText(/unmute preview/i));

    // The idle slot is parked on clip B's first frame; audible, it would play
    // the next clip's opening over the top of the one being watched.
    expect((screen.getByTestId('preview-slot-0') as HTMLVideoElement).muted).toBe(false);
    expect((screen.getByTestId('preview-slot-1') as HTMLVideoElement).muted).toBe(true);
    expect(screen.getByLabelText(/mute preview/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no sound at all when the export is silent by choice', () => {
    // Unmuting here would let someone approve an edit by an audio track the
    // downloaded file will not contain.
    const clips = [clip('a')];
    render(
      <TimelinePreview
        clips={clips}
        clipStates={statesFor(clips)}
        output={{ ...OUTPUT, keepAudio: false }}
      />
    );

    expect(screen.queryByLabelText(/unmute preview/i)).not.toBeInTheDocument();
    expect((screen.getByTestId('preview-slot-0') as HTMLVideoElement).muted).toBe(true);
    expect(screen.getByText(/silent, like this export/i)).toBeInTheDocument();
  });

  it('offers no sound when every clip is known to have no audio track', () => {
    const clips = [clip('a'), clip('b')];
    render(
      <TimelinePreview
        clips={clips}
        clipStates={{ a: readyWithAudio(false), b: readyWithAudio(false) }}
        output={OUTPUT}
      />
    );

    expect(screen.queryByLabelText(/unmute preview/i)).not.toBeInTheDocument();
  });

  it('keeps sound on offer for a clip the probe could not answer for', () => {
    // Same direction as the Export button: assume audio unless certain, since
    // promising silence and delivering sound is the worse way to be wrong.
    const clips = [clip('a'), clip('b')];
    render(
      <TimelinePreview
        clips={clips}
        clipStates={{ a: readyWithAudio(false), b: readyWithAudio(undefined) }}
        output={OUTPUT}
      />
    );

    expect(screen.getByLabelText(/unmute preview/i)).toBeInTheDocument();
  });
});
