import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGalleryStore } from '../../store/useGalleryStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest, video } from './helpers';

/**
 * The timeline persists to localStorage but `clipStates` does not, so a clip
 * that was already on the timeline when the page loaded arrives with no
 * acquisition state at all. Before the mount-time resolve existed, nothing
 * ever gave it one: the row rendered bare, Export stayed disabled, and the
 * only way out was removing and re-adding every clip.
 */

const READY = {
  status: 'ready' as const,
  blob: new Blob(['v']),
  dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
  durable: true,
};

describe('a timeline restored from a previous session', () => {
  beforeEach(() => {
    setupTimelineTest();
  });

  it('resolves clips that were already on the timeline, with nothing clicked', async () => {
    // Exactly what a reload looks like: the persisted store already holds a
    // placement, and the component has never seen an `addClip` call for it.
    useTimelineStore.getState().addClip('clip');
    mockNextAcquireResult(READY);

    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByRole('group', { name: /fit/i })).toBeInTheDocument()
    );
  });

  it('makes a restored timeline exportable rather than permanently disabled', async () => {
    useTimelineStore.getState().addClip('clip');
    mockNextAcquireResult(READY);

    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Export/i })).toBeEnabled()
    );
  });

  it('waits for the gallery before resolving, so a restored clip is not called missing', async () => {
    // Resolving against an un-hydrated (empty) store would look every record
    // up and find nothing — reporting `missing` for clips that are perfectly
    // fine, which is a confident wrong answer rather than a slow right one.
    useTimelineStore.getState().addClip('clip');
    useGalleryStore.setState({ records: [], hydrated: false });
    mockNextAcquireResult(READY);

    renderWorkspace();

    // Nothing claims the clip is gone while the library is still loading.
    await waitFor(() => expect(screen.getByTestId('timeline-list')).toBeInTheDocument());
    expect(screen.queryByText(/no longer in your library/i)).not.toBeInTheDocument();

    // ...and once the library arrives, the gate opens and the clip resolves.
    // Without this half the test would pass against a version that simply
    // never resolves anything, since it would only be asserting an absence.
    mockNextAcquireResult(READY);
    act(() => {
      useGalleryStore.setState({ records: [video()], hydrated: true });
    });
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /fit/i })).toBeInTheDocument()
    );
  });

  it('resolves each placement of a record that appears twice', async () => {
    useTimelineStore.getState().addClip('clip');
    useTimelineStore.getState().addClip('clip');
    mockNextAcquireResult(READY);

    renderWorkspace();

    await waitFor(() => expect(screen.getAllByRole('group', { name: /fit/i })).toHaveLength(2));
  });
});
