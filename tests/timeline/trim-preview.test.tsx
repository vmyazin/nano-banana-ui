import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimelinePreview from '../../components/TimelinePreview';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { TimelineClip, TimelineOutput } from '../../store/useTimelineStore';

/**
 * jsdom has no `requestVideoFrameCallback`, so the preview's frame-accurate
 * out-point check would simply never run here. Stubbing it as a manually fired
 * callback is what makes that path testable at all — and, unlike `fireEvent`,
 * lets two checks land inside one React batch, which is what a real cut looks
 * like at 60fps.
 */
const frameCallbacks = new Map<HTMLVideoElement, () => void>();

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  frameCallbacks.clear();
  Object.assign(HTMLVideoElement.prototype, {
    requestVideoFrameCallback(this: HTMLVideoElement, callback: () => void) {
      frameCallbacks.set(this, callback);
      return 1;
    },
    cancelVideoFrameCallback() {},
  });
});

// Restored, or the stub leaks into every later suite sharing this worker —
// object URLs are how half the app previews anything.
afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).cancelVideoFrameCallback;
});

const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: true };

function clip(id: string, trim?: { start?: number; end?: number }): TimelineClip {
  return { id, recordId: `record-${id}`, fit: 'contain', trimStart: trim?.start, trimEnd: trim?.end };
}

function ready(durationSeconds = 8): ClipState {
  return {
    status: 'ready',
    blob: new Blob(['bytes']),
    dimensions: { width: 1920, height: 1080, durationSeconds },
    durable: true,
  };
}

/**
 * The preview is where a trim is judged, so it has to play the trimmed clip —
 * not the source with the cut parts still in it.
 */
describe('the preview plays the trimmed sequence', () => {
  it('totals the trimmed lengths, not the sources', () => {
    render(
      <TimelinePreview
        clips={[clip('a', { start: 2, end: 6 }), clip('b')]}
        clipStates={{ a: ready(8), b: ready(8) }}
        output={OUTPUT}
      />
    );

    // 4s trimmed + 8s whole, not 16s.
    expect(screen.getByText(/2 clips · 0:12/)).toBeInTheDocument();
    expect(screen.getByText('0:00 / 0:12')).toBeInTheDocument();
  });

  it('starts the element at the in-point rather than at the file start', () => {
    render(
      <TimelinePreview
        clips={[clip('a', { start: 3, end: 7 })]}
        clipStates={{ a: ready(8) }}
        output={OUTPUT}
      />
    );

    const element = screen.getByTestId('preview-slot-0') as HTMLVideoElement;
    expect(element.currentTime).toBeCloseTo(3);
  });

  it('ignores an in-point past the end of the source it got back', () => {
    render(
      <TimelinePreview clips={[clip('a', { start: 30 })]} clipStates={{ a: ready(8) }} output={OUTPUT} />
    );

    expect(screen.getByText(/1 clip · 0:08/)).toBeInTheDocument();
  });
});

/**
 * The out-point is checked once per presented frame, not only on `timeupdate`,
 * so a trim lands within a frame of where it was set instead of up to a ~250ms
 * tick late. Checking that often means the same cut is reached several times
 * before the swap it causes has re-rendered, so handing over has to stay
 * idempotent — otherwise raising the check rate would start skipping clips.
 */
describe('the preview cuts at the out-point exactly once', () => {
  it('drives the out-point check from presented frames, not just timeupdate', () => {
    render(
      <TimelinePreview
        clips={[clip('a', { start: 0, end: 4 }), clip('b')]}
        clipStates={{ a: ready(8), b: ready(8) }}
        output={OUTPUT}
      />
    );

    const first = screen.getByTestId('preview-slot-0') as HTMLVideoElement;
    const onFrame = frameCallbacks.get(first);
    expect(onFrame).toBeTypeOf('function');

    first.currentTime = 4;
    act(() => onFrame?.());

    expect(screen.getByTestId('preview-slot-1')).toHaveAttribute('data-active', 'true');
  });

  it('hands over one clip when two frame checks cross the out-point together', () => {
    render(
      <TimelinePreview
        clips={[clip('a', { start: 0, end: 4 }), clip('b'), clip('c')]}
        clipStates={{ a: ready(8), b: ready(8), c: ready(8) }}
        output={OUTPUT}
      />
    );

    const first = screen.getByTestId('preview-slot-0') as HTMLVideoElement;
    const onFrame = frameCallbacks.get(first);
    first.currentTime = 4;

    // Both inside one act, so React has not re-rendered — and the listener has
    // not moved to the other slot — between them. Two `fireEvent` calls cannot
    // reproduce this, because each one flushes.
    act(() => {
      onFrame?.();
      onFrame?.();
    });

    // On the second clip, which starts at 4s — not the third, at 12s.
    expect(screen.getByText('0:04 / 0:20')).toBeInTheDocument();
    expect(screen.getByTestId('preview-slot-1')).toHaveAttribute('data-active', 'true');
  });

  it('lets a clip end again once the playhead is back before its out-point', () => {
    render(
      <TimelinePreview
        clips={[clip('a', { start: 0, end: 4 }), clip('b')]}
        clipStates={{ a: ready(8), b: ready(8) }}
        output={OUTPUT}
      />
    );

    const first = screen.getByTestId('preview-slot-0') as HTMLVideoElement;
    first.currentTime = 4;
    fireEvent.timeUpdate(first);
    expect(screen.getByTestId('preview-slot-1')).toHaveAttribute('data-active', 'true');

    // Scrubbed back into the first clip: it is live again, so reaching the
    // out-point a second time has to hand over a second time.
    fireEvent.change(screen.getByLabelText(/preview position/i), { target: { value: '1' } });
    const back = screen.getByTestId('preview-slot-0') as HTMLVideoElement;
    back.currentTime = 1;
    fireEvent.timeUpdate(back);
    expect(screen.getByText('0:01 / 0:12')).toBeInTheDocument();
  });
});
