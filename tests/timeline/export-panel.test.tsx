import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTimelineTest } from './helpers';
import TimelineExportPanel from '../../components/TimelineExportPanel';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { RenderEngine, RenderProgress, RenderRequest } from '../../lib/timeline/render/port';
import { acquireClipMedia } from '../../lib/timeline/acquire';
import type { TimelineClip, TimelineOutput } from '../../store/useTimelineStore';

/**
 * `setupTimelineTest` seeds the memory gallery adapter with two records
 * ('clip' and 'dead') and stubs matchMedia — the same fixtures every other
 * timeline test uses. This suite does not mount `TimelineWorkspace`, so the
 * matchMedia stub is unused, but the gallery seeding is what lets the panel
 * resolve a clip's title from `useGalleryStore` and what `acquireClipMedia`'s
 * mock (declared once in helpers.tsx) reads from when re-resolving.
 */
beforeEach(() => {
  setupTimelineTest();
  vi.mocked(acquireClipMedia).mockClear();
});

const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true };

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return { id: 'p1', recordId: 'clip', fit: 'contain', ...overrides };
}

function readyState(overrides: Partial<Extract<ClipState, { status: 'ready' }>> = {}): ClipState {
  return {
    status: 'ready',
    blob: new Blob(['stale']),
    dimensions: { width: 1920, height: 1080, durationSeconds: 24 },
    durable: true,
    ...overrides,
  };
}

function stubEngine(id: RenderEngine['id'], overrides: Partial<RenderEngine> = {}): RenderEngine {
  return {
    id,
    unavailableReason: vi.fn(async () => null),
    render: vi.fn(async () => new Blob(['out'], { type: 'video/mp4' })),
    ...overrides,
  };
}

describe('TimelineExportPanel', () => {
  it('offers to export in the browser and says the export is silent', async () => {
    const engine = stubEngine('webcodecs');
    render(
      <TimelineExportPanel engines={[engine]} clips={[clip()]} clipStates={{ p1: readyState() }} output={OUTPUT} />
    );

    const button = await screen.findByRole('button', { name: /export/i });
    expect(button).toHaveTextContent(/silent/i);
    expect(button).toHaveTextContent(/in your browser/i);
    expect(button).not.toBeDisabled();
  });

  it('shows the browser rejection reason and a separate server export button', async () => {
    const browser = stubEngine('webcodecs', {
      unavailableReason: vi.fn(async () => 'This browser cannot encode H.264 video at this size.'),
    });
    const server = stubEngine('server');
    render(
      <TimelineExportPanel
        engines={[browser, server]}
        clips={[clip()]}
        clipStates={{ p1: readyState() }}
        output={OUTPUT}
      />
    );

    await waitFor(() =>
      expect(screen.getByText(/This browser cannot encode H\.264/i)).toBeInTheDocument()
    );

    const serverButton = screen.getByRole('button', { name: /export/i });
    expect(serverButton).toHaveTextContent(/silent/i);
    expect(serverButton).toHaveTextContent(/server/i);
    expect(screen.getByText(/deleted from the server/i)).toBeInTheDocument();
  });

  it('disables export and names both reasons when neither engine can run', async () => {
    const browser = stubEngine('webcodecs', {
      unavailableReason: vi.fn(async () => 'This browser cannot encode video on its own.'),
    });
    render(
      <TimelineExportPanel engines={[browser]} clips={[clip()]} clipStates={{ p1: readyState() }} output={OUTPUT} />
    );

    await waitFor(() =>
      expect(screen.getByText(/This browser cannot encode video on its own/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/no server render is configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('disables export and names the count when a clip is unavailable', () => {
    const engine = stubEngine('webcodecs');
    render(
      <TimelineExportPanel
        engines={[engine]}
        clips={[clip({ id: 'p1', recordId: 'clip' }), clip({ id: 'p2', recordId: 'dead' })]}
        clipStates={{
          p1: readyState(),
          p2: { status: 'unavailable', reason: 'expired', message: "This clip's source has expired." },
        }}
        output={OUTPUT}
      />
    );

    expect(screen.getByText(/1 clip can.t be exported/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('aborts the in-flight render when Cancel is pressed', async () => {
    let capturedSignal: AbortSignal | undefined;
    const engine = stubEngine('webcodecs', {
      render: vi.fn(
        (_request: RenderRequest, opts: { signal: AbortSignal; onProgress: (p: RenderProgress) => void }) => {
          capturedSignal = opts.signal;
          return new Promise<Blob>(() => {
            /* never resolves — the test only cares that the signal fires */
          });
        }
      ),
    });
    render(
      <TimelineExportPanel engines={[engine]} clips={[clip()]} clipStates={{ p1: readyState() }} output={OUTPUT} />
    );

    const button = await screen.findByRole('button', { name: /export/i });
    await userEvent.click(button);

    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('re-resolves every clip through acquireClipMedia at export time instead of trusting clipStates', async () => {
    // clipStates says the clip is ready with a 5-byte blob, but the export
    // must re-resolve rather than trust that — mock a fresh, different
    // acquisition result for the same clip and confirm the render request
    // is built from the fresh bytes, not the stale prop.
    vi.mocked(acquireClipMedia).mockResolvedValueOnce({
      status: 'ready',
      blob: new Blob(['freshly-resolved-bytes']),
      dimensions: { width: 1920, height: 1080, durationSeconds: 24 },
      durable: true,
    });

    const engine = stubEngine('webcodecs');
    render(
      <TimelineExportPanel
        engines={[engine]}
        clips={[clip()]}
        clipStates={{ p1: readyState({ blob: new Blob(['stale']) }) }}
        output={OUTPUT}
      />
    );

    const button = await screen.findByRole('button', { name: /export/i });
    await userEvent.click(button);

    await waitFor(() => expect(acquireClipMedia).toHaveBeenCalledWith('clip', expect.objectContaining({ signal: expect.anything() })));

    await waitFor(() => expect(engine.render).toHaveBeenCalled());
    const [request] = vi.mocked(engine.render).mock.calls[0] as [RenderRequest, unknown];
    expect(request.clips[0].media.size).toBe(new Blob(['freshly-resolved-bytes']).size);
  });

  it('blocks export and reports the failure when re-resolution finds a clip has vanished', async () => {
    vi.mocked(acquireClipMedia).mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'missing',
      message: 'This clip is no longer in your library.',
    });

    const engine = stubEngine('webcodecs');
    render(
      <TimelineExportPanel engines={[engine]} clips={[clip()]} clipStates={{ p1: readyState() }} output={OUTPUT} />
    );

    const button = await screen.findByRole('button', { name: /export/i });
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByText(/1 clip could not be exported/i)).toBeInTheDocument());
    expect(engine.render).not.toHaveBeenCalled();
  });
});
