import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGalleryStore } from '../../store/useGalleryStore';
import { mockNextAcquireResult, renderWorkspace, setupTimelineTest, video } from './helpers';

/**
 * Posters used to be cropped into a 16:9 box, so a vertical clip looked
 * landscape in the timeline and you only learned its real shape at render.
 * Both layouts now show the source uncropped.
 */
describe('clip posters keep their own proportions', () => {
  beforeEach(() => setupTimelineTest({ wide: true }));

  /** A poster is the only blob a layout will put in an <img>, so seed one. */
  const seedPoster = () =>
    useGalleryStore.setState({
      records: [
        video({ posterBlob: new Blob(['p'], { type: 'image/png' }) }),
        video({ id: 'dead', slug: 'rooftop' }),
      ],
      hydrated: true,
      storageError: null,
    });

  const readyPortraitClip = () =>
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v']),
      dimensions: { width: 1080, height: 1920, durationSeconds: 4 },
      durable: true,
    });

  it('fills the duration-sized block with the poster in the track', async () => {
    seedPoster();
    readyPortraitClip();
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    const track = screen.getByTestId('timeline-track');
    await waitFor(() => expect(within(track).getByText('neon tiger')).toBeInTheDocument());

    // The track is a time axis now: a block's width means seconds, never the
    // source's shape, so the filmstrip crops to fill it — the same trade every
    // desktop editor makes. The clip's true framing is judged in the preview
    // under its Fit setting, not in the thumbnail.
    const poster = track.querySelector('img') as HTMLImageElement;
    expect(poster.className).toContain('object-cover');
    expect(poster.className).toContain('w-full');
  });

  it('never crops the poster in the list either', async () => {
    setupTimelineTest({ wide: false });
    seedPoster();
    readyPortraitClip();
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    const list = screen.getByTestId('timeline-list');
    await waitFor(() => expect(within(list).getByText('neon tiger')).toBeInTheDocument());

    const poster = list.querySelector('img') as HTMLImageElement;
    expect(poster.className).toContain('object-contain');
    expect(poster.className).not.toContain('object-cover');
  });
});

/**
 * The old fallback handed the video blob itself to an <img> when no poster had
 * been extracted yet — a source that never decodes, so the block showed an
 * empty box instead of the "No preview" both layouts already have. That window
 * is visible in practice: a just-imported clip renders before its record comes
 * back from IndexedDB.
 */
describe('a clip with no poster yet', () => {
  beforeEach(() => setupTimelineTest({ wide: true }));

  it('says so rather than showing an empty frame', async () => {
    mockNextAcquireResult({
      status: 'ready',
      blob: new Blob(['v'], { type: 'video/mp4' }),
      dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
      durable: true,
    });

    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    const track = screen.getByTestId('timeline-track');
    await waitFor(() => expect(within(track).getByText('neon tiger')).toBeInTheDocument());

    expect(track.querySelector('img')).toBeNull();
    expect(within(track).getByText('No preview')).toBeInTheDocument();
  });
});
