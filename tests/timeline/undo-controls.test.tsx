import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

async function addOneClip() {
  mockNextAcquireResult({
    status: 'ready',
    blob: new Blob(['v']),
    dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
    durable: true,
  });
  renderWorkspace();
  await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
  await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(1));
}

describe('undo and clear in the header', () => {
  beforeEach(() => {
    setupTimelineTest({ wide: true });
    useTimelineStore.setState({ history: [], undoLabel: null });
  });

  it('offers neither control on an untouched timeline', () => {
    renderWorkspace();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('names what undo would put back', async () => {
    await addOneClip();
    await userEvent.click(screen.getByRole('button', { name: /remove neon tiger/i }));

    expect(await screen.findByRole('button', { name: /undo the removed clip/i })).toBeInTheDocument();
  });

  it('restores the clip when undo is pressed', async () => {
    await addOneClip();
    await userEvent.click(screen.getByRole('button', { name: /remove neon tiger/i }));
    await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(0));

    await userEvent.click(screen.getByRole('button', { name: /undo/i }));

    expect(useTimelineStore.getState().timeline.clips).toHaveLength(1);
    // Scoped to the track: the same title also sits in the library rail on the
    // left, which never went anywhere. The restored clip resolves again rather
    // than coming back as an unusable row.
    const track = screen.getByTestId('timeline-track');
    await waitFor(() => expect(within(track).getByText('neon tiger')).toBeInTheDocument());
    await waitFor(() => expect(within(track).getByText('0:04')).toBeInTheDocument());
  });

  it('clears the whole timeline, and offers that back', async () => {
    await addOneClip();

    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useTimelineStore.getState().timeline.clips).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /undo the cleared timeline/i }));
    expect(useTimelineStore.getState().timeline.clips).toHaveLength(1);
  });
});
