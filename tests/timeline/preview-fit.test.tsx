import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimelinePreview from '../../components/TimelinePreview';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { TimelineClip, TimelineOutput } from '../../store/useTimelineStore';

/**
 * Contain and Cover used to change nothing you could see: the preview ignored
 * `fit` entirely and framed every clip in a fixed 16:9 box, so the choice was
 * only observable in a downloaded file minutes later.
 */
beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
});

// Restored, or the stub leaks into every later suite sharing this worker —
// object URLs are how half the app previews anything.
afterEach(() => vi.unstubAllGlobals());

function clip(id: string, fit: TimelineClip['fit']): TimelineClip {
  return { id, recordId: `record-${id}`, fit };
}

function ready(): ClipState {
  return {
    status: 'ready',
    blob: new Blob(['bytes']),
    dimensions: { width: 1080, height: 1920, durationSeconds: 4 },
    durable: true,
  };
}

const PORTRAIT: TimelineOutput = { width: 1080, height: 1920, fps: 30, auto: true, keepAudio: true };
const LANDSCAPE: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: true };

describe('the preview frame is the export frame', () => {
  it('takes the output’s shape, not a fixed 16:9 box', () => {
    const clips = [clip('a', 'contain')];
    const { rerender } = render(
      <TimelinePreview clips={clips} clipStates={{ a: ready() }} output={PORTRAIT} />
    );

    expect(screen.getByTestId('preview-frame')).toHaveStyle({ aspectRatio: '1080 / 1920' });

    rerender(<TimelinePreview clips={clips} clipStates={{ a: ready() }} output={LANDSCAPE} />);
    expect(screen.getByTestId('preview-frame')).toHaveStyle({ aspectRatio: '1920 / 1080' });
  });

  it('frames the playing clip by its own fit', () => {
    const clips = [clip('a', 'cover')];
    render(<TimelinePreview clips={clips} clipStates={{ a: ready() }} output={LANDSCAPE} />);

    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('data-fit', 'object-cover');
  });

  it('frames the preloaded next clip by *its* fit, not the playing one’s', () => {
    // The idle slot is already holding the next clip. Reading fit off the
    // playhead would show one frame of the wrong crop at every cut.
    const clips = [clip('a', 'contain'), clip('b', 'cover')];
    render(
      <TimelinePreview clips={clips} clipStates={{ a: ready(), b: ready() }} output={LANDSCAPE} />
    );

    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('data-fit', 'object-contain');
    expect(screen.getByTestId('preview-slot-1')).toHaveAttribute('data-fit', 'object-cover');
  });

  it('follows a fit change without waiting for playback', () => {
    const { rerender } = render(
      <TimelinePreview
        clips={[clip('a', 'contain')]}
        clipStates={{ a: ready() }}
        output={LANDSCAPE}
      />
    );
    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('data-fit', 'object-contain');

    rerender(
      <TimelinePreview clips={[clip('a', 'cover')]} clipStates={{ a: ready() }} output={LANDSCAPE} />
    );
    expect(screen.getByTestId('preview-slot-0')).toHaveAttribute('data-fit', 'object-cover');
  });
});
