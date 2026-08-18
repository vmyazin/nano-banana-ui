import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimelinePreview from '../../components/TimelinePreview';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { TimelineClip, TimelineOutput } from '../../store/useTimelineStore';

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
});

// Restored, or the stub leaks into every later suite sharing this worker —
// object URLs are how half the app previews anything.
afterEach(() => vi.unstubAllGlobals());

const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true };

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
