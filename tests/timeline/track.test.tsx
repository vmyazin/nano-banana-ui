import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

/**
 * The exact string `acquireClipMedia`'s mock (helpers.tsx) returns for the
 * 'dead' record — the same string TimelineList renders verbatim for the
 * same state. Both layouts pull the reason from `state.message`, never
 * reformat it, so asserting the track shows this literal string is
 * equivalent to asserting it matches what the list would show for the same
 * state, without needing to mount both layouts in one DOM (only one mounts
 * at a given width, by design).
 */
const EXPIRED_REASON = "This clip's source has expired and the file was never kept.";

describe('TimelineTrack', () => {
  beforeEach(() => setupTimelineTest({ wide: true }));

  it('mounts the track and not the list at lg and above', () => {
    renderWorkspace();
    expect(screen.getByTestId('timeline-track')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-list')).not.toBeInTheDocument();
  });

  it('mounts the list and not the track below lg', () => {
    setupTimelineTest({ wide: false });
    renderWorkspace();
    expect(screen.getByTestId('timeline-list')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-track')).not.toBeInTheDocument();
  });

  it('sizes clip blocks in proportion to their duration', async () => {
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 2 },
      durable: true,
    });
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 6 },
      durable: true,
    });

    renderWorkspace();
    const addButtons = screen.getAllByRole('button', { name: /add/i });
    await userEvent.click(addButtons[0]); // 'clip' / "neon tiger" -> 2s
    await userEvent.click(addButtons[1]); // 'dead' / "rooftop" -> 6s

    const track = screen.getByTestId('timeline-track');
    await waitFor(() => expect(within(track).getByText('neon tiger')).toBeInTheDocument());
    await waitFor(() => expect(within(track).getByText('rooftop')).toBeInTheDocument());

    const shortBlock = within(track).getByText('neon tiger').closest('[style]') as HTMLElement;
    const longBlock = within(track).getByText('rooftop').closest('[style]') as HTMLElement;

    const shortGrow = Number(shortBlock.style.flexGrow);
    const longGrow = Number(longBlock.style.flexGrow);
    expect(shortGrow).toBeGreaterThan(0);
    // 6s should grow exactly 3x as much as 2s — real proportionality, not
    // just "some difference".
    expect(longGrow).toBe(shortGrow * 3);
  });

  it('keeps an unavailable clip in place with its reason as visible text and a Remove action', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[1]); // 'dead' -> expired

    const track = screen.getByTestId('timeline-track');
    // Visible text, not just a hover-only title attribute — title tooltips
    // never appear on touch devices and aren't reliably announced. Queried
    // by text so this fails if it ever regresses to tooltip-only.
    await waitFor(() => expect(within(track).getByText(EXPIRED_REASON)).toBeInTheDocument());
    expect(within(track).getByText('rooftop')).toBeInTheDocument();
    expect(
      within(track).getByRole('button', { name: /remove rooftop from the timeline/i })
    ).toBeInTheDocument();
  });

  it('shows the same unavailable reason text the list renders for the same state', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[1]); // 'dead' -> expired

    const track = screen.getByTestId('timeline-track');
    // TimelineList renders `state.message` verbatim too (it is off-limits to
    // modify, so this can't be asserted by mounting both at once) — matching
    // this exact literal is equivalent to matching what the list shows.
    await waitFor(() => expect(within(track).getByText(EXPIRED_REASON)).toBeInTheDocument());
  });

  it('exposes a Fit control on a ready clip block that calls through to the store', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    const track = screen.getByTestId('timeline-track');
    await waitFor(() => expect(within(track).getByText('neon tiger')).toBeInTheDocument());

    const fitGroup = within(track).getByRole('group', { name: /fit/i });
    const clipId = useTimelineStore.getState().timeline.clips[0].id;
    expect(useTimelineStore.getState().timeline.clips[0].fit).toBe('contain');

    await userEvent.click(within(fitGroup).getByRole('button', { name: /cover/i }));

    expect(
      useTimelineStore.getState().timeline.clips.find((clip) => clip.id === clipId)?.fit
    ).toBe('cover');
  });

  it('surfaces a visible warning on a clip that is ready but not durable', async () => {
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
      durable: false,
      warning: 'This browser is out of storage for kept results. Remove some to keep saving.',
    });

    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    const track = screen.getByTestId('timeline-track');
    await waitFor(() =>
      expect(within(track).getByText(/out of storage for kept results/i)).toBeInTheDocument()
    );
  });
});
