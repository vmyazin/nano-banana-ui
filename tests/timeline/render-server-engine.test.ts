// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServerEngine } from '../../lib/timeline/render/server';
import type { RenderRequest } from '../../lib/timeline/render/port';

/**
 * Exercises the client half of server rendering entirely against a stubbed
 * `fetch` — nothing here spawns ffmpeg or touches the real route. The three
 * client-facing strings the design spec mandates (404, 401, and the 413
 * byte-count message) are exact-match asserted, since they're what a person
 * actually reads in the export panel.
 */

const OUTPUT = { width: 1920, height: 1080, fps: 30, auto: true };

function request(clipSizes: number[] = [1024]): RenderRequest {
  return {
    output: OUTPUT,
    clips: clipSizes.map((size) => ({ media: new Blob([new Uint8Array(size)]), fit: 'contain' as const })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createServerEngine().unavailableReason', () => {
  it('reads a 404 probe as "not available here"', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const reason = await createServerEngine().unavailableReason(request());

    expect(reason).toBe('Server rendering is not available here.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/timeline/render',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('reads a 401 probe as "sign in"', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Sign in to use this feature.' }, 401));

    const reason = await createServerEngine().unavailableReason(request());

    expect(reason).toBe('Sign in to use server rendering.');
  });

  it('reads any other status as available (null) — e.g. the probe succeeding', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));

    const reason = await createServerEngine().unavailableReason(request());

    expect(reason).toBeNull();
  });

  it('reads a 403 (pending or blocked account) as a real reason, not as available', async () => {
    // Reporting `null` here showed pending users a working server-export
    // button that failed the instant they pressed it.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Your account is waiting to be approved.' }, 403));

    const reason = await createServerEngine().unavailableReason(request());

    expect(reason).toBe('Your account is not approved for server rendering.');
  });

  it('still reads an unrecognised status as available, so an unknown failure is not turned into a wrong explanation', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'teapot' }, 418));

    expect(await createServerEngine().unavailableReason(request())).toBeNull();
  });

  it('reads a network failure reaching the route at all as available (null), not as a specific reason', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const reason = await createServerEngine().unavailableReason(request());

    expect(reason).toBeNull();
  });
});

describe('createServerEngine().render — upload failures', () => {
  it('reports a 413 with both the byte count and the ceiling, and polls nothing further', async () => {
    // The route reports its own ceiling; the client has no other way to know
    // it. Both numbers together are what separate "shorten this timeline"
    // (8.4 GB of a 512 MB limit) from "the reverse proxy's
    // client_max_body_size was never raised" (8.4 MB of a 1 MB limit).
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Upload too large', limit: 512 * 1024 * 1024 }, 413)
    );

    const controller = new AbortController();
    const onProgress = vi.fn();
    // Two 1 MiB clips: exercises the client's own byte total, not anything
    // the server's response body says.
    const req = request([1024 * 1024, 1024 * 1024]);

    await expect(
      createServerEngine().render(req, { signal: controller.signal, onProgress })
    ).rejects.toThrow(
      'This timeline is too large to upload (2.0 MB of a 512 MB limit). Remove or shorten clips and try again.'
    );

    // Only the upload attempt happened — no status poll, no result fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('omits the ceiling rather than inventing one when a 413 came from something that is not the route', async () => {
    // nginx rejecting the body itself answers 413 with an HTML page and no
    // `limit` field. The byte count is still worth saying.
    fetchMock.mockResolvedValue(new Response('<html>413 Request Entity Too Large</html>', { status: 413 }));

    await expect(
      createServerEngine().render(request([1024 * 1024]), {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('This timeline is too large to upload (1.0 MB). Remove or shorten clips and try again.');
  });

  it('surfaces the server-provided message for a non-413 failure (e.g. busy or pending approval)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Render queue is full. Try again shortly.' }, 503));

    await expect(
      createServerEngine().render(request(), { signal: new AbortController().signal, onProgress: vi.fn() })
    ).rejects.toThrow('Render queue is full. Try again shortly.');
  });

  it('refuses to render an empty timeline without making any request', async () => {
    await expect(
      createServerEngine().render(request([]), { signal: new AbortController().signal, onProgress: vi.fn() })
    ).rejects.toThrow(/nothing on the timeline/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createServerEngine().render — happy path and job failure', () => {
  it('uploads, polls status until done, and downloads the result', async () => {
    const resultBytes = new Uint8Array([1, 2, 3, 4]);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ jobId: 'job-1' }, 202));
      if (url.includes('result=1')) {
        return Promise.resolve(
          new Response(resultBytes as unknown as BodyInit, { status: 200, headers: { 'content-type': 'video/mp4' } })
        );
      }
      // Status poll — done on the very first check, so the test never has to
      // wait out the real polling interval.
      return Promise.resolve(jsonResponse({ id: 'job-1', phase: 'done', progress: 1, error: null }));
    });

    const onProgress = vi.fn();
    const blob = await createServerEngine().render(request(), {
      signal: new AbortController().signal,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({ phase: 'uploading', completed: null });
    expect(await blob.arrayBuffer()).toEqual(resultBytes.buffer);

    // The multipart body carried the output format, per-clip fit metadata,
    // and one file per clip.
    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'POST');
    const form = (postCall![1] as RequestInit).body as FormData;
    expect(JSON.parse(form.get('output') as string)).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(JSON.parse(form.get('clips') as string)).toEqual([{ fit: 'contain' }]);
    expect(form.get('clip-0')).toBeInstanceOf(Blob);
  });

  it('tells the server to cancel the job when the export is aborted mid-poll', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ jobId: 'job-3' }, 202));
      if (init?.method === 'DELETE') return Promise.resolve(jsonResponse({ cancelled: true }));
      // Still encoding — and the moment the client sees that, the user
      // cancels. Without a DELETE, ffmpeg would run to completion holding
      // the server's one render slot.
      controller.abort();
      return Promise.resolve(jsonResponse({ id: 'job-3', phase: 'encoding', progress: 0.4, error: null }));
    });

    await expect(
      createServerEngine().render(request(), { signal: controller.signal, onProgress: vi.fn() })
    ).rejects.toThrow(/cancelled/i);

    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toBe('/api/timeline/render?id=job-3');
    // Made without the aborted signal — a fetch issued with an already-aborted
    // signal never leaves the browser, so passing it would silently no-op.
    expect((deleteCall![1] as RequestInit).signal).toBeUndefined();
  });

  it('cancels a job whose upload finished after the user had already aborted', async () => {
    // The abort lands between the upload resolving and the poll starting.
    // `addEventListener('abort')` never fires for a signal that is already
    // aborted, so the listener alone would leave this job running.
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        controller.abort();
        return Promise.resolve(jsonResponse({ jobId: 'job-4' }, 202));
      }
      return Promise.resolve(jsonResponse({ cancelled: true }));
    });

    await expect(
      createServerEngine().render(request(), { signal: controller.signal, onProgress: vi.fn() })
    ).rejects.toThrow(/cancelled/i);

    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'DELETE');
    expect(deleteCall?.[0]).toBe('/api/timeline/render?id=job-4');
  });

  it('sends no cancel when the render finishes normally', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ jobId: 'job-5' }, 202));
      if (url.includes('result=1')) {
        return Promise.resolve(new Response(new Uint8Array([9]) as unknown as BodyInit, { status: 200 }));
      }
      return Promise.resolve(jsonResponse({ id: 'job-5', phase: 'done', progress: 1, error: null }));
    });

    await createServerEngine().render(request(), {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    });

    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE')).toBe(false);
  });

  it('throws the job error when the server reports the render failed', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ jobId: 'job-2' }, 202));
      return Promise.resolve(
        jsonResponse({ id: 'job-2', phase: 'error', progress: null, error: 'ffmpeg exited with code 1' })
      );
    });

    await expect(
      createServerEngine().render(request(), { signal: new AbortController().signal, onProgress: vi.fn() })
    ).rejects.toThrow('ffmpeg exited with code 1');
  });
});
