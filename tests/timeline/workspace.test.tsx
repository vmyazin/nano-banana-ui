import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockNextAcquireResult, renderWorkspace, setupTimelineTest } from './helpers';

describe('TimelineWorkspace', () => {
  beforeEach(() => setupTimelineTest());

  it('starts empty and says so', () => {
    renderWorkspace();
    expect(screen.getByText(/no clips yet/i)).toBeInTheDocument();
  });

  it('adds a clip from the drawer and shows it in the sequence', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    const list = screen.getByTestId('timeline-list');
    await waitFor(() => expect(within(list).getByText('neon tiger')).toBeInTheDocument());
  });

  it('keeps an expired clip in place and explains why, rather than dropping it', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[1]);
    const list = screen.getByTestId('timeline-list');
    await waitFor(() => expect(within(list).getByText(/source has expired/i)).toBeInTheDocument());
    // Still on the timeline, not silently removed.
    expect(within(list).getByText('rooftop')).toBeInTheDocument();
  });

  it('offers the vertical list below the lg breakpoint', () => {
    renderWorkspace();
    expect(screen.getByTestId('timeline-list')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-track')).not.toBeInTheDocument();
  });

  it('surfaces a warning on a clip that is ready but not durable, distinct from a durable one', async () => {
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
      durable: false,
      warning: 'This browser is out of storage for kept results. Remove some to keep saving.',
    });
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    await waitFor(() =>
      expect(screen.getByText(/out of storage for kept results/i)).toBeInTheDocument()
    );
  });
});
