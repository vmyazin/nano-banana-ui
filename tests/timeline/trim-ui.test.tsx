import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

/**
 * Trimming has to agree with itself in three places at once: the block's own
 * length, the preview total, and what the export button says it will produce.
 *
 * The gesture is now the editor's — each block edge is a draggable handle
 * that is also a keyboard slider — but the store contract underneath is the
 * same one the old range sliders drove.
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
}

const clip = () => useTimelineStore.getState().timeline.clips[0];

/**
 * One 8s clip in the fallback 960px track measures 120 px/s (fit-to-width),
 * so 120px of pointer travel is exactly one second. jsdom reports no layout,
 * which is precisely why the fallback width is deterministic here.
 */
const PPS = 120;

describe('trimming a clip', () => {
  beforeEach(() => {
    setupTimelineTest({ wide: true });
    useTimelineStore.setState({ history: [], undoLabel: null });
  });

  it('starts with the whole clip, and says so', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    expect(within(track).getByLabelText('Trim start, seconds')).toHaveAttribute('aria-valuenow', '0');
    expect(within(track).getByLabelText('Trim end, seconds')).toHaveAttribute('aria-valuenow', '8');
    // Nothing to restore, so no offer to.
    expect(within(track).queryByRole('button', { name: /whole clip/i })).not.toBeInTheDocument();
  });

  it('trims by dragging the block edges, and it shows everywhere at once', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    const startHandle = within(track).getByLabelText('Trim start, seconds');
    fireEvent.pointerDown(startHandle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(startHandle, { clientX: 2 * PPS, pointerId: 1 });
    fireEvent.pointerUp(startHandle, { pointerId: 1 });

    // Trimming rescales fit-to-width: 6s now fill the 960px fallback track,
    // so the next drag converts at 160 px/s, frozen at its own pointerdown.
    const RESCALED_PPS = 160;
    const endHandle = within(track).getByLabelText('Trim end, seconds');
    fireEvent.pointerDown(endHandle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(endHandle, { clientX: -2 * RESCALED_PPS, pointerId: 1 });
    fireEvent.pointerUp(endHandle, { pointerId: 1 });

    expect(clip().trimStart).toBe(2);
    expect(clip().trimEnd).toBe(6);
    // The block reads the trimmed length, not the source's. `getAllByText`:
    // a ruler tick label can legitimately say the same thing.
    await waitFor(() =>
      expect(within(track).getAllByText('0:04').length).toBeGreaterThan(0)
    );
    // And so does the export button, which is a promise about the output file.
    expect(await screen.findByRole('button', { name: /export 4s/i })).toBeInTheDocument();
  });

  it('trims from the keyboard: arrows step a tenth, Shift a whole second', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    const startHandle = within(track).getByLabelText('Trim start, seconds');
    startHandle.focus();
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}{ArrowRight}');

    expect(clip().trimStart).toBeCloseTo(1.1);
    expect(startHandle).toHaveAttribute('aria-valuenow', '1.1');
  });

  it('cannot be dragged into a clip of no length', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    const startHandle = within(track).getByLabelText('Trim start, seconds');
    fireEvent.pointerDown(startHandle, { clientX: 0, pointerId: 1 });
    // 20s of travel on an 8s clip: the in-point stops short of the out-point
    // rather than meeting or crossing it.
    fireEvent.pointerMove(startHandle, { clientX: 20 * PPS, pointerId: 1 });
    fireEvent.pointerUp(startHandle, { pointerId: 1 });

    const start = clip().trimStart ?? 0;
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(8);
    expect((clip().trimEnd ?? 8) - start).toBeCloseTo(0.1);
  });

  it('gives the whole clip back', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    const startHandle = within(track).getByLabelText('Trim start, seconds');
    fireEvent.pointerDown(startHandle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(startHandle, { clientX: 3 * PPS, pointerId: 1 });
    fireEvent.pointerUp(startHandle, { pointerId: 1 });
    expect(clip().trimStart).toBe(3);

    await userEvent.click(within(track).getByRole('button', { name: /whole clip/i }));

    expect(clip().trimStart).toBeUndefined();
    expect(clip().trimEnd).toBeUndefined();
    await waitFor(() =>
      expect(within(track).getAllByText('0:08').length).toBeGreaterThan(0)
    );
  });
});
