import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ClipState } from '../../components/TimelineWorkspace';
import { mockNextAcquireResult, mockPendingAcquire, renderWorkspace, setupTimelineTest } from './helpers';

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

  it('warns on a clip the browser cannot decode, at add time rather than mid-export', async () => {
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
      durable: true,
      decodable: false,
    });
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    const list = screen.getByTestId('timeline-list');
    await waitFor(() =>
      expect(within(list).getByText(/cannot decode this clip/i)).toBeInTheDocument()
    );
    // Still a usable clip, not a broken placeholder — the server can render it.
    expect(within(list).queryByText(/no longer in your library/i)).not.toBeInTheDocument();
  });

  it('drops the placement from clipStates when it is removed while acquisition is in flight, even once the acquisition later resolves', async () => {
    const pending = mockPendingAcquire();
    const snapshots: Array<Record<string, ClipState>> = [];
    renderWorkspace({ onClipStatesChange: (states) => snapshots.push(states) });

    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    await waitFor(() => expect(Object.keys(snapshots.at(-1) ?? {})).toHaveLength(1));
    const placementId = Object.keys(snapshots.at(-1)!)[0];

    await userEvent.click(screen.getByRole('button', { name: /remove .* from the timeline/i }));
    expect(snapshots.at(-1)).not.toHaveProperty(placementId);

    // The acquisition finally lands, after the clip is already gone.
    await act(async () => {
      pending.resolve({
        status: 'ready',
        blob: new Blob(['v']),
        dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
        durable: true,
      });
      await Promise.resolve();
    });

    expect(snapshots.at(-1)).not.toHaveProperty(placementId);
  });

  it('does not resurrect a row when an acquisition resolves after its clip was removed', async () => {
    const pending = mockPendingAcquire();
    renderWorkspace();

    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    await waitFor(() => expect(pending.signal()).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: /remove .* from the timeline/i }));
    expect(screen.getByText(/no clips yet/i)).toBeInTheDocument();

    await act(async () => {
      pending.resolve({
        status: 'ready',
        blob: new Blob(['v']),
        dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
        durable: true,
      });
      await Promise.resolve();
    });

    // Still empty — the late resolution did not bring the row back. (The
    // drawer keeps its own "neon tiger" entry regardless, so the assertion
    // is scoped to the sequence, not the whole page.)
    expect(screen.getByText(/no clips yet/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('timeline-list')).queryByText('neon tiger')).not.toBeInTheDocument();
  });

  it('aborts an in-flight acquisition when the workspace unmounts', async () => {
    const pending = mockPendingAcquire();
    const { unmount } = renderWorkspace();

    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    await waitFor(() => expect(pending.signal()).toBeDefined());
    expect(pending.signal()?.aborted).toBe(false);

    unmount();

    expect(pending.signal()?.aborted).toBe(true);
  });
});
