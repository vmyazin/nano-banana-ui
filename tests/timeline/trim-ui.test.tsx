import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

/**
 * Trimming has to agree with itself in three places at once: the block's own
 * length, the preview total, and what the export button says it will produce.
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

describe('trimming a clip', () => {
  beforeEach(() => {
    setupTimelineTest({ wide: true });
    useTimelineStore.setState({ history: [], undoLabel: null });
  });

  it('starts with the whole clip, and says so', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    expect(within(track).getByLabelText('Trim start, seconds')).toHaveValue('0');
    expect(within(track).getByLabelText('Trim end, seconds')).toHaveValue('8');
    // Nothing to restore, so no offer to.
    expect(within(track).queryByRole('button', { name: /whole clip/i })).not.toBeInTheDocument();
  });

  it('shortens the clip everywhere at once', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');

    fireEvent.change(within(track).getByLabelText('Trim start, seconds'), { target: { value: '2' } });
    fireEvent.change(within(track).getByLabelText('Trim end, seconds'), { target: { value: '6' } });

    expect(clip().trimStart).toBe(2);
    expect(clip().trimEnd).toBe(6);
    // The block reads the trimmed length, not the source's.
    await waitFor(() => expect(within(track).getByText('0:04')).toBeInTheDocument());
    // And so does the export button, which is a promise about the output file.
    expect(await screen.findByRole('button', { name: /export 4s/i })).toBeInTheDocument();
  });

  it('cannot be dragged into a clip of no length', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');
    fireEvent.change(within(track).getByLabelText('Trim end, seconds'), { target: { value: '3' } });

    // The in-point slider stops short of the out-point rather than meeting it.
    const start = within(track).getByLabelText('Trim start, seconds') as HTMLInputElement;
    expect(Number(start.max)).toBeLessThan(3);
  });

  it('gives the whole clip back', async () => {
    await addEightSecondClip();
    const track = screen.getByTestId('timeline-track');
    fireEvent.change(within(track).getByLabelText('Trim start, seconds'), { target: { value: '3' } });

    await userEvent.click(within(track).getByRole('button', { name: /whole clip/i }));

    expect(clip().trimStart).toBeUndefined();
    expect(clip().trimEnd).toBeUndefined();
    await waitFor(() => expect(within(track).getByText('0:08')).toBeInTheDocument());
  });
});
