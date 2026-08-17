import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGalleryStore } from '../../store/useGalleryStore';
import { renderWorkspace, setupTimelineTest } from './helpers';

/**
 * The import itself runs for real here — only the two things jsdom cannot do
 * (decode a video, paint a frame) are doubled. That keeps the test honest
 * about whether a picked file actually becomes an addable clip.
 */
const { probeDimensionsMock, extractLastFrameMock } = vi.hoisted(() => ({
  probeDimensionsMock: vi.fn(),
  extractLastFrameMock: vi.fn(),
}));

vi.mock('../../lib/timeline/probe', () => ({ probeDimensions: probeDimensionsMock }));
vi.mock('../../lib/video-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/video-frame')>();
  return { ...actual, extractLastFrameFromBlob: extractLastFrameMock };
});

const pick = () => screen.getByTestId('import-clips').querySelector('input[type=file]') as HTMLInputElement;

describe('adding local files to Your clips', () => {
  beforeEach(() => {
    setupTimelineTest();
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    probeDimensionsMock.mockReset();
    probeDimensionsMock.mockResolvedValue({ width: 1920, height: 1080, durationSeconds: 6 });
    extractLastFrameMock.mockReset();
    extractLastFrameMock.mockResolvedValue(new Blob(['poster']));
  });

  it('offers the import affordance even when the library is empty', () => {
    renderWorkspace();
    expect(screen.getByTestId('import-clips')).toBeInTheDocument();
    expect(screen.getByText(/add files from your computer/i)).toBeInTheDocument();
  });

  it('turns a picked file into a clip that can be added to the timeline', async () => {
    renderWorkspace();

    await userEvent.upload(pick(), new File(['bytes'], 'rooftop shot.mp4', { type: 'video/mp4' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add rooftop shot to the timeline/i })).toBeInTheDocument()
    );
  });

  it('pins the import, because nothing can re-fetch a local file', async () => {
    renderWorkspace();

    await userEvent.upload(pick(), new File(['bytes'], 'rooftop.mp4', { type: 'video/mp4' }));

    await waitFor(() => expect(useGalleryStore.getState().records).toHaveLength(1));
    expect(useGalleryStore.getState().records[0].pinned).toBe(true);
  });

  // The picker carries accept="video/*", so a non-video can only arrive by
  // drag-and-drop — the same filtering a real browser applies. The rejection
  // reachable through the picker is a video the browser cannot decode, which
  // is also the one a user is most likely to hit by accident.
  it('names the file that was refused instead of failing silently', async () => {
    probeDimensionsMock.mockRejectedValue(new Error('no decoder'));
    renderWorkspace();

    await userEvent.upload(pick(), new File(['x'], 'broken.mp4', { type: 'video/mp4' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/broken\.mp4/i));
    expect(screen.getByRole('alert')).toHaveTextContent(/could not read/i);
  });

  it('imports the good files in a mixed selection and reports only the bad one', async () => {
    probeDimensionsMock.mockImplementation(async (blob: Blob) => {
      if ((blob as File).name === 'broken.mp4') throw new Error('no decoder');
      return { width: 1920, height: 1080, durationSeconds: 6 };
    });
    renderWorkspace();

    await userEvent.upload(pick(), [
      new File(['a'], 'first.mp4', { type: 'video/mp4' }),
      new File(['x'], 'broken.mp4', { type: 'video/mp4' }),
      new File(['b'], 'second.mp4', { type: 'video/mp4' }),
    ]);

    await waitFor(() => expect(useGalleryStore.getState().records).toHaveLength(2));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/broken\.mp4/i);
    expect(alert).not.toHaveTextContent(/first\.mp4/i);
  });
});
