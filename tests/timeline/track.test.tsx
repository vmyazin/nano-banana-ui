import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

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

  it('keeps an unavailable clip in place with its reason and a Remove action', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[1]); // 'dead' -> expired

    const track = screen.getByTestId('timeline-track');
    await waitFor(() =>
      expect(within(track).getByTitle(/source has expired/i)).toBeInTheDocument()
    );
    expect(within(track).getByText('rooftop')).toBeInTheDocument();
    expect(
      within(track).getByRole('button', { name: /remove rooftop from the timeline/i })
    ).toBeInTheDocument();
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
