import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePlayheadStore } from '../../store/usePlayheadStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

/**
 * The preview and the track share one clock. Scrubbing either surface must
 * move the other, and the playhead line must sit at the same multiplication
 * of that clock the blocks and ruler are drawn with.
 */
async function addEightSecondClip() {
  mockNextAcquireResult({
    status: 'ready',
    blob: new Blob(['v']),
    dimensions: { width: 1920, height: 1080, durationSeconds: 8 },
    durable: true,
  });
  renderWorkspace();
  await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
  await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(1));
  await waitFor(() => expect(screen.getByTestId('track-ruler')).toBeInTheDocument());
}

/** One 8s clip in the fallback 960px track → 120 px/s (see trim-ui.test.tsx). */
const PPS = 120;

describe('the shared playhead', () => {
  beforeEach(() => setupTimelineTest({ wide: true }));

  it('scrubbing the ruler seeks the preview', async () => {
    await addEightSecondClip();

    fireEvent.pointerDown(screen.getByTestId('track-ruler'), { clientX: 2 * PPS, pointerId: 1 });

    expect(usePlayheadStore.getState().time).toBeCloseTo(2);
    // The preview transport reads the same clock.
    expect(screen.getByText('0:02 / 0:08')).toBeInTheDocument();
  });

  it('keeps scrubbing while the pointer drags along the ruler', async () => {
    await addEightSecondClip();
    const ruler = screen.getByTestId('track-ruler');

    fireEvent.pointerDown(ruler, { clientX: PPS, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 3 * PPS, pointerId: 1 });
    fireEvent.pointerUp(ruler, { pointerId: 1 });

    expect(usePlayheadStore.getState().time).toBeCloseTo(3);
    // Released: further movement is not a scrub.
    fireEvent.pointerMove(ruler, { clientX: 5 * PPS, pointerId: 1 });
    expect(usePlayheadStore.getState().time).toBeCloseTo(3);
  });

  it('draws the playhead line at the clock’s position on the time axis', async () => {
    await addEightSecondClip();

    act(() => usePlayheadStore.getState().seek(1));

    expect(screen.getByTestId('track-playhead').style.left).toBe(`${PPS}px`);
  });

  it('moves the playhead when the preview slider scrubs', async () => {
    await addEightSecondClip();

    fireEvent.change(screen.getByLabelText(/preview position/i), { target: { value: '4' } });

    expect(usePlayheadStore.getState().time).toBe(4);
    expect(screen.getByTestId('track-playhead').style.left).toBe(`${4 * PPS}px`);
  });

  it('scrubbing past the sequence clamps to its end', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    fireEvent.pointerDown(screen.getByTestId('track-ruler'), { clientX: 5000, pointerId: 1 });

    expect(usePlayheadStore.getState().time).toBe(8);
    expect(within(track).getByTestId('track-playhead').style.left).toBe(`${8 * PPS}px`);
  });
});
