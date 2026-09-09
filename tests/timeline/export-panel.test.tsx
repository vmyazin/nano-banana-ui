// tests/timeline/export-panel.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTimelineTest } from './helpers';
import TimelineExportPanel from '../../components/TimelineExportPanel';
import type { ClipState } from '../../components/TimelineWorkspace';
import type { RenderEngine, RenderProgress, RenderRequest } from '../../lib/timeline/render/port';
import { acquireAll, acquireClipMedia } from '../../lib/timeline/acquire';
import { useGalleryStore } from '../../store/useGalleryStore';
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
  vi.mocked(acquireAll).mockClear();
});

const OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: true };

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

const SILENT: TimelineOutput = { ...OUTPUT, keepAudio: false };

describe('TimelineExportPanel', () => {
  it('says silent when the box is off', async () => {
    render(
      <TimelineExportPanel
        engines={[stubEngine('webcodecs')]}
        clips={[clip()]}
        clipStates={{ p1: readyState() }}
        output={SILENT}
      />
    );

    expect(await screen.findByRole('button', { name: /export/i })).toHaveTextContent(/silent/i);
  });

  /**
   * The box being ticked is a preference, not a promise: a timeline of clips
   * that were all probed and none of which had an audio track produces a
   * silent file whatever the box says, and the button has to say so.
   */
  it('says silent when every clip is known to have no audio track', async () => {
    render(
      <TimelineExportPanel
        engines={[stubEngine('webcodecs')]}
        clips={[clip()]}
        clipStates={{ p1: readyState({ hasAudio: false }) }}
        output={OUTPUT}
      />
    );

    expect(await screen.findByRole('button', { name: /export/i })).toHaveTextContent(/silent/i);
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
    expect(serverButton).toHaveTextContent(/with audio/i);
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

  it('withdraws the browser engine and names the clip when the browser cannot decode it', async () => {
    // VideoEncoder.isConfigSupported — all the browser engine's own
    // unavailableReason can ask — knows nothing about the clips, so without
    // this the export would start and die minutes in.
    const browser = stubEngine('webcodecs');
    const server = stubEngine('server');
    render(
      <TimelineExportPanel
        engines={[browser, server]}
        clips={[clip()]}
        clipStates={{ p1: readyState({ decodable: false }) }}
        output={OUTPUT}
      />
    );

    await waitFor(() => expect(screen.getByText(/cannot decode neon tiger/i)).toBeInTheDocument());
    // Offered as a next step rather than dead-ending.
    const button = screen.getByRole('button', { name: /export/i });
    expect(button).toHaveTextContent(/on the server/i);
    expect(button).not.toBeDisabled();
    // The browser engine was never even asked to run this request.
    expect(browser.unavailableReason).not.toHaveBeenCalled();
  });

  it('offers the server engine after a browser render fails, once the server confirms it can run', async () => {
    const browser = stubEngine('webcodecs', {
      render: vi.fn(async () => {
        throw new Error('"neon tiger" is in a format this browser cannot decode.');
      }),
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

    await userEvent.click(await screen.findByRole('button', { name: /export/i }));

    await waitFor(() => expect(screen.getByText(/neon tiger.*cannot decode/i)).toBeInTheDocument());
    const fallback = await screen.findByRole('button', { name: /on the server instead/i });

    await userEvent.click(fallback);
    await waitFor(() => expect(server.render).toHaveBeenCalled());
  });

  it('does not offer a server fallback the server itself cannot honour', async () => {
    const browser = stubEngine('webcodecs', {
      render: vi.fn(async () => {
        throw new Error('The export failed.');
      }),
    });
    const server = stubEngine('server', {
      unavailableReason: vi.fn(async () => 'Sign in to use server rendering.'),
    });
    render(
      <TimelineExportPanel
        engines={[browser, server]}
        clips={[clip()]}
        clipStates={{ p1: readyState() }}
        output={OUTPUT}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: /export/i }));

    await waitFor(() => expect(screen.getByText('The export failed.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /on the server instead/i })).not.toBeInTheDocument();
  });

  it('labels each clip in the render request so an engine can name the one that failed', async () => {
    const engine = stubEngine('webcodecs');
    render(
      <TimelineExportPanel engines={[engine]} clips={[clip()]} clipStates={{ p1: readyState() }} output={OUTPUT} />
    );

    await userEvent.click(await screen.findByRole('button', { name: /export/i }));

    await waitFor(() => expect(engine.render).toHaveBeenCalled());
    const [request] = vi.mocked(engine.render).mock.calls[0] as [RenderRequest, unknown];
    expect(request.clips[0].label).toBe('neon tiger');
  });

  it('resolves the export through acquireAll, so the spec bounded concurrency applies where the work happens', async () => {
    const engine = stubEngine('webcodecs');
    render(
      <TimelineExportPanel
        engines={[engine]}
        clips={[clip({ id: 'p1' }), clip({ id: 'p2' })]}
        clipStates={{ p1: readyState(), p2: readyState() }}
        output={OUTPUT}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: /export/i }));

    await waitFor(() => expect(acquireAll).toHaveBeenCalled());
    expect(acquireAll).toHaveBeenCalledWith(['clip', 'clip'], expect.objectContaining({ signal: expect.anything() }));
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

/**
 * The panel used to have no state for "finished": it downloaded the file and
 * reset to the Export button, so the browser's download shelf was the only
 * evidence anything had happened — no name, no size, and nothing to click if
 * the download was missed. A review rated that critical, because the exported
 * file is the single deliverable of the whole feature.
 */
describe('TimelineExportPanel — the end state', () => {
  /** Runs an export to completion and returns the panel. */
  async function exportOnce(blob = new Blob(['x'.repeat(2048)], { type: 'video/mp4' })) {
    const engine = stubEngine('webcodecs', { render: vi.fn(async () => blob) });
    render(
      <TimelineExportPanel
        engines={[engine]}
        clips={[clip()]}
        clipStates={{ p1: readyState() }}
        output={OUTPUT}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: /export/i }));
    await waitFor(() => expect(engine.render).toHaveBeenCalled());
    return engine;
  }

  it('names the file it produced and how big it is', async () => {
    await exportOnce();

    const done = await screen.findByRole('status');
    expect(done).toHaveTextContent(/Exported timeline-export-\d+\.mp4/);
    // 2048 bytes of body, reported the way the rest of the app reports sizes.
    expect(await screen.findByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it('offers the download again without re-encoding', async () => {
    const engine = await exportOnce();

    await userEvent.click(await screen.findByRole('button', { name: /^download$/i }));

    // The point of holding the blob: a missed download costs nothing to repeat.
    expect(engine.render).toHaveBeenCalledTimes(1);
  });

  it('keeps the export as one pinned video when asked', async () => {
    await exportOnce();
    const before = useGalleryStore.getState().records.length;

    await userEvent.click(await screen.findByRole('button', { name: /save to library/i }));

    await waitFor(() => expect(screen.getByText(/saved to library/i)).toBeInTheDocument());
    const records = useGalleryStore.getState().records;
    expect(records).toHaveLength(before + 1);
    // Pinned because eviction reclaims unpinned records to stay under the
    // budget, and an export somebody asked to keep must not quietly vanish.
    expect(records[0]).toMatchObject({ kind: 'video', pinned: true, provider: 'timeline' });
    expect(records[0].blob?.size).toBe(2048);
  });

  it('says so when the library refuses the export rather than looking saved', async () => {
    await exportOnce();
    vi.spyOn(useGalleryStore.getState(), 'record').mockImplementation(async () => {
      useGalleryStore.setState({ storageError: 'This browser is out of storage for kept results.' });
      return null;
    });

    await userEvent.click(await screen.findByRole('button', { name: /save to library/i }));

    expect(await screen.findByText(/out of storage/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to library/i)).not.toBeInTheDocument();
  });

  it('goes back to the export button when dismissed', async () => {
    await exportOnce();

    await userEvent.click(await screen.findByRole('button', { name: /dismiss the finished export/i }));

    expect(await screen.findByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
