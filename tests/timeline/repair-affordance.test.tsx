import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGalleryStore } from '../../store/useGalleryStore';
import {
  mockNextAcquireResult,
  renderWorkspace,
  setupTimelineTest,
  stubMatchMedia,
  video,
} from './helpers';

const { repairMock, toastWarnMock } = vi.hoisted(() => ({
  repairMock: vi.fn(),
  toastWarnMock: vi.fn(),
}));
vi.mock('../../lib/timeline/repair', () => ({ repairRecordFromFile: repairMock }));
vi.mock('sonner', () => ({ toast: { warning: toastWarnMock, error: vi.fn(), success: vi.fn() } }));

const EXPIRED = {
  status: 'unavailable' as const,
  reason: 'expired' as const,
  message: "This clip's source has expired and the file was never kept.",
};

const READY = {
  status: 'ready' as const,
  blob: new Blob(['v']),
  dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
  durable: true,
};

async function addFirstClip() {
  await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
}

describe('restoring an expired clip from a local file', () => {
  beforeEach(() => {
    setupTimelineTest();
    useGalleryStore.setState({ records: [video()], hydrated: true, storageError: null });
    repairMock.mockReset();
    toastWarnMock.mockReset();
    repairMock.mockResolvedValue({
      status: 'repaired',
      dimensions: { width: 1920, height: 1080, durationSeconds: 4 },
      durable: true,
    });
  });

  it('offers the affordance on a clip whose source expired', async () => {
    mockNextAcquireResult(EXPIRED);
    renderWorkspace();
    await addFirstClip();

    await waitFor(() => expect(screen.getByTestId('recover-media')).toBeInTheDocument());
  });

  it('does not offer it on a healthy clip', async () => {
    mockNextAcquireResult(READY);
    renderWorkspace();
    await addFirstClip();

    // The fit control only renders on a ready clip, unlike the title, which
    // also appears on the drawer card this clip was added from.
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /fit/i })).toBeInTheDocument()
    );
    expect(screen.queryByTestId('recover-media')).not.toBeInTheDocument();
  });

  it('does not offer it when the record itself is gone, since there is nothing to re-fill', async () => {
    mockNextAcquireResult({
      status: 'unavailable',
      reason: 'missing',
      message: 'This clip is no longer in your library.',
    });
    renderWorkspace();
    await addFirstClip();

    await waitFor(() =>
      expect(screen.getByText(/no longer in your library/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId('recover-media')).not.toBeInTheDocument();
  });

  it('passes the picked file to the repair, keyed by record id', async () => {
    mockNextAcquireResult(EXPIRED);
    renderWorkspace();
    await addFirstClip();
    await waitFor(() => expect(screen.getByTestId('recover-media')).toBeInTheDocument());

    const file = new File(['bytes'], 'rooftop.mp4', { type: 'video/mp4' });
    const input = screen.getByTestId('recover-media').querySelector('input[type=file]');
    await userEvent.upload(input as HTMLInputElement, file);

    await waitFor(() => expect(repairMock).toHaveBeenCalledWith('clip', file));
  });

  it('surfaces a rejection instead of claiming the clip was restored', async () => {
    repairMock.mockResolvedValue({
      status: 'rejected',
      reason: 'not-video',
      message: 'That is not a video file.',
    });
    mockNextAcquireResult(EXPIRED);
    renderWorkspace();
    await addFirstClip();
    await waitFor(() => expect(screen.getByTestId('recover-media')).toBeInTheDocument());

    const input = screen.getByTestId('recover-media').querySelector('input[type=file]');
    await userEvent.upload(input as HTMLInputElement, new File(['x'], 'a.mp4', { type: 'video/mp4' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not a video file/i));
  });

  it('warns when the file does not match what the clip remembered', async () => {
    repairMock.mockResolvedValue({
      status: 'repaired',
      dimensions: { width: 1920, height: 1080, durationSeconds: 8 },
      durable: true,
      mismatch: 'This file is 1920x1080 · 8.0s; the clip was 1080x1920 · 5.0s. Using it anyway.',
    });
    mockNextAcquireResult(EXPIRED);
    renderWorkspace();
    await addFirstClip();
    await waitFor(() => expect(screen.getByTestId('recover-media')).toBeInTheDocument());

    const input = screen.getByTestId('recover-media').querySelector('input[type=file]');
    await userEvent.upload(input as HTMLInputElement, new File(['x'], 'a.mp4', { type: 'video/mp4' }));

    // Asserted on the toast, not inline: a successful repair unmounts this
    // zone on the same render, so an inline notice could never be read.
    await waitFor(() =>
      expect(toastWarnMock).toHaveBeenCalledWith(expect.stringMatching(/the clip was 1080x1920/i))
    );
  });

  it('offers the affordance in the wide-screen track too', async () => {
    stubMatchMedia(true);
    mockNextAcquireResult(EXPIRED);
    renderWorkspace();
    await addFirstClip();

    await waitFor(() => expect(screen.getByTestId('timeline-track')).toBeInTheDocument());
    expect(screen.getByTestId('recover-media')).toBeInTheDocument();
  });
});
