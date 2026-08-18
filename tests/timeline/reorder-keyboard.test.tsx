import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

/**
 * Reordering was drag-only. jsdom has no drag, so the wiring between the
 * gesture and the store had no coverage either — these drive the real
 * components through the keyboard path instead.
 */
async function addTwoClips() {
  for (let i = 0; i < 2; i += 1) {
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
      durable: true,
    });
  }
  renderWorkspace();
  const addButtons = screen.getAllByRole('button', { name: /add/i });
  await userEvent.click(addButtons[0]); // 'neon tiger'
  await userEvent.click(addButtons[1]); // 'rooftop'
  await waitFor(() => expect(useTimelineStore.getState().timeline.clips).toHaveLength(2));
}

const order = () =>
  useTimelineStore.getState().timeline.clips.map((clip) => clip.recordId);

describe('moving a clip with the keyboard', () => {
  beforeEach(() => setupTimelineTest({ wide: true }));

  it('moves the focused block later and back again in the track', async () => {
    await addTwoClips();
    expect(order()).toEqual(['clip', 'dead']);

    const track = screen.getByTestId('timeline-track');
    const first = within(track).getByText('neon tiger').closest('[role="listitem"]') as HTMLElement;
    first.focus();

    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(order()).toEqual(['dead', 'clip']);

    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(order()).toEqual(['clip', 'dead']);
  });

  it('keeps focus on the clip it moved, so a second move is possible', async () => {
    await addTwoClips();
    const track = screen.getByTestId('timeline-track');
    const first = within(track).getByText('neon tiger').closest('[role="listitem"]') as HTMLElement;
    first.focus();

    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');

    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toMatch(/neon tiger, clip 2 of 2/)
    );
  });

  it('works the same way in the narrow list', async () => {
    setupTimelineTest({ wide: false });
    await addTwoClips();

    const list = screen.getByTestId('timeline-list');
    const first = within(list).getByText('neon tiger').closest('li') as HTMLElement;
    first.focus();

    // Down is "later" on a vertical layout, the same move as right on the track.
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(order()).toEqual(['dead', 'clip']);
  });

  it('leaves the order alone at the ends', async () => {
    await addTwoClips();
    const track = screen.getByTestId('timeline-track');
    const first = within(track).getByText('neon tiger').closest('[role="listitem"]') as HTMLElement;
    first.focus();

    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(order()).toEqual(['clip', 'dead']);
  });
});
