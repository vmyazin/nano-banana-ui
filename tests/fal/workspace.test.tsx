import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FalGenerationWorkspace from '../../components/FalGenerationWorkspace';
import type { FalJob, FalTaskState } from '../../lib/fal/types';
import { useAppStore } from '../../store/useAppStore';
import { useFalJobsStore } from '../../store/useFalJobsStore';

const { cancelFalJobMock, submitFalJobMock, uploadFalFilesMock } = vi.hoisted(() => ({
  cancelFalJobMock: vi.fn(),
  submitFalJobMock: vi.fn(),
  uploadFalFilesMock: vi.fn(),
}));

vi.mock('../../lib/fal/browser', () => ({
  cancelFalJob: cancelFalJobMock,
  submitFalJob: submitFalJobMock,
  uploadFalFiles: uploadFalFilesMock,
}));

const NOW = new Date('2026-08-04T12:00:00.000Z').getTime();
const SAFE_VIDEO_URL = 'https://v3.fal.media/files/tiger/result.mp4';
const labels = [
  'Veo 3.1 Standard',
  'Veo 3.1 Fast',
  'Seedance 2.0 Standard',
  'Seedance 2.0 Fast',
  'Kling 3 Standard',
  'Kling 3 Pro',
  'MiniMax Hailuo 2.3 Standard',
  'MiniMax Hailuo 2.3 Pro',
  'Wan 2.7',
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderWorkspace(inputMode: 'text' | 'image' = 'text', props: {
  onBack?: () => void;
  onOpenConnections?: () => void;
} = {}) {
  return render(
    <FalGenerationWorkspace
      inputMode={inputMode}
      onBack={props.onBack ?? (() => undefined)}
      onOpenConnections={props.onOpenConnections ?? (() => undefined)}
    />
  );
}

function makeJob(state: FalTaskState, overrides: Partial<FalJob> = {}): FalJob {
  return {
    id: `request_${state}1`,
    requestId: `request_${state}1`,
    state,
    logs: [`${state} log`],
    modelId: 'veo-3-1-fast',
    mediaType: 'video',
    inputMode: 'text',
    prompt: `${state} prompt`,
    createdAt: NOW,
    updatedAt: NOW,
    pollAttempt: 0,
    ...overrides,
  };
}

describe('FalGenerationWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:reference-preview'),
      revokeObjectURL: vi.fn(),
    }));
    uploadFalFilesMock.mockResolvedValue([]);
    submitFalJobMock.mockResolvedValue({ requestId: 'request_submit01' });
    cancelFalJobMock.mockResolvedValue(undefined);
    useAppStore.setState({
      apiKey: '',
      falApiKey: 'fal-key-secret',
      videoEngine: 'fal',
      falVideoModel: 'veo-3-1-fast',
    });
    useFalJobsStore.getState().clearJobs();
  });

  it('renders the persisted Veo Fast model with catalog text defaults through shared controls', () => {
    renderWorkspace();

    expect((screen.getByRole('combobox', { name: 'Model' }) as HTMLSelectElement).value).toBe('veo-3-1-fast');
    expect(screen.getByRole('combobox', { name: 'Aspect ratio' })).toHaveDisplayValue('16:9');
    expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveDisplayValue('8s');
    expect(screen.getByRole('radio', { name: '720p' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Generate audio' })).toBeChecked();
    expect(screen.getByText('fal inputs and outputs use public, temporary CDN URLs.')).toBeInTheDocument();
  });

  it('lists exactly nine curated models and searches label, provider, and description', () => {
    renderWorkspace();
    const model = screen.getByRole('combobox', { name: 'Model' });
    expect(within(model).getAllByRole('option').map((option) => option.textContent?.split(' · ')[0])).toEqual(labels);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fal video models' }), {
      target: { value: 'MiniMax' },
    });
    expect(within(model).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fal video models' }), {
      target: { value: 'Higher-tier' },
    });
    expect(within(model).getAllByRole('option')).toHaveLength(1);
    expect(within(model).getByRole('option')).toHaveTextContent('Kling 3 Pro');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search fal video models' }), {
      target: { value: 'no-such-model' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('No fal video models match');
    expect(within(model).queryAllByRole('option')).toHaveLength(0);
  });

  it('does not discover models dynamically or expose catalog endpoint IDs', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { container } = renderWorkspace();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('fal-ai/');
  });

  it('persists model selection and resets controls to each mode-specific catalog default', () => {
    const view = renderWorkspace();
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'hailuo-2-3-standard' } });
    expect(useAppStore.getState().falVideoModel).toBe('hailuo-2-3-standard');
    expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveDisplayValue('6');
    fireEvent.change(screen.getByRole('combobox', { name: 'Duration' }), { target: { value: '1' } });

    useAppStore.getState().setFalVideoModel('veo-3-1-fast');
    view.rerender(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );
    expect(screen.getByRole('combobox', { name: 'Aspect ratio' })).toHaveDisplayValue('auto');
    expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveDisplayValue('8s');
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('requires exactly one image reference before upload and keeps its preview removable', async () => {
    const { container } = renderWorkspace('image');
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Animate this portrait' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one reference image');
    expect(uploadFalFilesMock).not.toHaveBeenCalled();

    const file = new File(['image'], 'portrait.png', { type: 'image/png' });
    const secondFile = new File(['image'], 'second.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file, secondFile] } });
    expect(screen.getByRole('alert')).toHaveTextContent('up to 1 reference image');
    expect(uploadFalFilesMock).not.toHaveBeenCalled();
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(screen.getByAltText('Reference 1')).toHaveAttribute('src', 'blob:reference-preview');
    expect(screen.getByRole('button', { name: 'Remove reference 1' })).toBeInTheDocument();
  });

  it('rejects unsupported image MIME types before upload', () => {
    const { container } = renderWorkspace('image');
    const gif = new File(['gif'], 'animation.gif', { type: 'image/gif' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [gif] } });
    expect(screen.getByRole('alert')).toHaveTextContent('PNG, JPEG, WebP, or AVIF');
    expect(screen.queryByAltText('Reference 1')).toBeNull();
    expect(uploadFalFilesMock).not.toHaveBeenCalled();
  });

  it('uploads once, submits once, and inserts a complete queued job snapshot', async () => {
    uploadFalFilesMock.mockResolvedValue(['https://v3.fal.media/files/input/reference.png']);
    const { container } = renderWorkspace('image');
    const file = new File(['image'], 'portrait.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: '  Animate this portrait  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    expect(uploadFalFilesMock).toHaveBeenCalledWith('fal-key-secret', [file], { signal: expect.any(AbortSignal) });
    expect(submitFalJobMock).toHaveBeenCalledWith({
      apiKey: 'fal-key-secret',
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'image',
      prompt: 'Animate this portrait',
      uploadUrls: ['https://v3.fal.media/files/input/reference.png'],
      values: expect.objectContaining({ aspect_ratio: 'auto', duration: '8s', resolution: '720p', generate_audio: true }),
    }, { signal: expect.any(AbortSignal) });
    expect(useFalJobsStore.getState().jobs).toEqual([{
      id: 'request_submit01',
      requestId: 'request_submit01',
      state: 'queued',
      logs: [],
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'image',
      prompt: 'Animate this portrait',
      createdAt: NOW,
      updatedAt: NOW,
      pollAttempt: 0,
    }]);
    expect(screen.getByAltText('Reference 1')).toBeInTheDocument();
  });

  it('keeps the selected reference removable after an upload failure', async () => {
    uploadFalFilesMock.mockRejectedValue(new Error('provider details'));
    const { container } = renderWorkspace('image');
    const file = new File(['image'], 'portrait.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Animate this portrait' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('fal could not start this job');
    expect(screen.getByAltText('Reference 1')).toBeInTheDocument();
    expect(submitFalJobMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference 1' }));
    expect(screen.queryByAltText('Reference 1')).toBeNull();
  });

  it('disables duplicate submission and reconciles a stale completion after unmount', async () => {
    const pending = deferred<{ requestId: string }>();
    submitFalJobMock.mockReturnValue(pending.promise);
    const view = renderWorkspace();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    const submit = screen.getByRole('button', { name: 'Generate video' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    const signal = submitFalJobMock.mock.calls[0][1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(false);
    await act(async () => {
      pending.resolve({ requestId: 'request_stale01' });
      await pending.promise;
    });
    expect(cancelFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledWith({
      apiKey: 'fal-key-secret',
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'text',
      requestId: 'request_stale01',
    });
    expect(useFalJobsStore.getState().jobs).toEqual([]);
  });

  it('reconciles a stale billed submit after changing models without storing it', async () => {
    const pending = deferred<{ requestId: string }>();
    submitFalJobMock.mockReturnValue(pending.promise);
    renderWorkspace();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    const signal = submitFalJobMock.mock.calls[0][1].signal as AbortSignal;

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'veo-3-1' },
    });
    expect(signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled();
    await act(async () => {
      pending.resolve({ requestId: 'request_stale_model' });
      await pending.promise;
    });

    expect(submitFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledWith({
      apiKey: 'fal-key-secret',
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'text',
      requestId: 'request_stale_model',
    });
    expect(useFalJobsStore.getState().jobs).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reconciles a stale billed submit after Back without storing it or showing stale UI', async () => {
    const pending = deferred<{ requestId: string }>();
    submitFalJobMock.mockReturnValue(pending.promise);
    const onBack = vi.fn();
    renderWorkspace('text', { onBack });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    const signal = submitFalJobMock.mock.calls[0][1].signal as AbortSignal;

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);
    await act(async () => {
      pending.resolve({ requestId: 'request_stale_back' });
      await pending.promise;
    });

    expect(submitFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledOnce();
    expect(useFalJobsStore.getState().jobs).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('queues exactly once when mounted under StrictMode', async () => {
    render(
      <StrictMode>
        <FalGenerationWorkspace inputMode="text" onBack={() => undefined} onOpenConnections={() => undefined} />
      </StrictMode>
    );
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    expect(uploadFalFilesMock).toHaveBeenCalledOnce();
    expect(uploadFalFilesMock).toHaveBeenCalledWith('fal-key-secret', [], { signal: expect.any(AbortSignal) });
    expect(submitFalJobMock).toHaveBeenCalledWith(expect.objectContaining({ uploadUrls: [] }), { signal: expect.any(AbortSignal) });
    expect(useFalJobsStore.getState().jobs).toHaveLength(1);
  });

  it('reconciles an in-flight billed submission when input mode changes', async () => {
    const pending = deferred<{ requestId: string }>();
    submitFalJobMock.mockReturnValue(pending.promise);
    const view = renderWorkspace();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    const signal = submitFalJobMock.mock.calls[0][1].signal as AbortSignal;

    view.rerender(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );
    expect(signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled();
    view.rerender(
      <FalGenerationWorkspace inputMode="text" onBack={() => undefined} onOpenConnections={() => undefined} />
    );
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled();
    await act(async () => {
      pending.resolve({ requestId: 'request_wrongmode1' });
      await pending.promise;
    });
    expect(cancelFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledWith({
      apiKey: 'fal-key-secret',
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'text',
      requestId: 'request_wrongmode1',
    });
    expect(useFalJobsStore.getState().jobs).toEqual([]);
  });

  it('does not resubmit a stale transport failure when no request ID can be reconciled', async () => {
    const pending = deferred<{ requestId: string }>();
    submitFalJobMock.mockReturnValue(pending.promise);
    renderWorkspace();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'veo-3-1' },
    });
    await act(async () => {
      // Without provider idempotency, a transport failure cannot reveal an accepted request ID.
      // The safe behavior is to neither retry nor invent a job that cannot be polled or cancelled.
      pending.reject(new TypeError('connection closed after send'));
      await pending.promise.catch(() => undefined);
    });

    expect(submitFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).not.toHaveBeenCalled();
    expect(useFalJobsStore.getState().jobs).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens connections for a missing key without uploading or submitting', () => {
    useAppStore.setState({ falApiKey: '' });
    const onOpenConnections = vi.fn();
    renderWorkspace('text', { onOpenConnections });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    expect(onOpenConnections).toHaveBeenCalledOnce();
    expect(uploadFalFilesMock).not.toHaveBeenCalled();
    expect(submitFalJobMock).not.toHaveBeenCalled();
  });

  it.each([
    ['queued', 'Queued'],
    ['running', 'Running'],
    ['success', 'Completed'],
    ['fail', 'Failed'],
    ['timed_out', 'Timed out'],
    ['cancelled', 'Cancelled'],
  ] as Array<[FalTaskState, string]>)('renders a distinct safe %s state', (state, label) => {
    useFalJobsStore.getState().upsertJob(makeJob(state, {
      error: state === 'fail' ? '<img src=x onerror=alert(1)> fal-key-secret' : state === 'timed_out' ? 'Polling stopped. The fal job may still complete upstream.' : undefined,
      resultUrl: state === 'success' ? SAFE_VIDEO_URL : undefined,
      mimeType: state === 'success' ? 'video/mp4' : undefined,
    }));
    const { container } = renderWorkspace();
    expect(screen.getByText(label)).toBeInTheDocument();
    if (state === 'timed_out') expect(screen.getByText(/may still complete upstream/i)).toBeInTheDocument();
    if (state === 'fail') {
      expect(container.querySelector('img')).toBeNull();
      expect(screen.queryByText(/fal-key-secret/)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /Cancel request/i }) !== null).toBe(state === 'queued' || state === 'running');
  });

  it('renders strict fal.media video output with download action but rejects an unsafe URL', () => {
    useFalJobsStore.getState().upsertJob(makeJob('success', {
      id: 'request_success_safe',
      requestId: 'request_success_safe',
      resultUrl: SAFE_VIDEO_URL,
      mimeType: 'video/mp4',
    }));
    useFalJobsStore.getState().upsertJob(makeJob('success', {
      id: 'request_success_bad',
      requestId: 'request_success_bad',
      resultUrl: 'https://evil.example/video.mp4',
      mimeType: 'video/mp4',
      updatedAt: NOW - 1,
    }));
    const { container } = renderWorkspace();
    expect(container.querySelector('video')?.getAttribute('src')).toBe(SAFE_VIDEO_URL);
    expect(container.querySelector('a[download]')).toHaveAttribute('href', SAFE_VIDEO_URL);
    expect(container.innerHTML).not.toContain('evil.example');
  });

  it('renders a safe fal.media video when MIME metadata is omitted but rejects a supplied non-video MIME', () => {
    useFalJobsStore.getState().upsertJob(makeJob('success', {
      id: 'request_success_missing_mime',
      requestId: 'request_success_missing_mime',
      resultUrl: SAFE_VIDEO_URL,
      mimeType: undefined,
    }));
    useFalJobsStore.getState().upsertJob(makeJob('success', {
      id: 'request_success_invalid_mime',
      requestId: 'request_success_invalid_mime',
      resultUrl: 'https://v3.fal.media/files/tiger/not-video.mp4',
      mimeType: 'image/png',
      updatedAt: NOW - 1,
    }));

    const { container } = renderWorkspace();

    expect(container.querySelector('video')?.getAttribute('src')).toBe(SAFE_VIDEO_URL);
    expect(container.querySelector('a[download]')).toHaveAttribute('href', SAFE_VIDEO_URL);
    expect(container.innerHTML).not.toContain('not-video.mp4');
  });

  it('cancels an active job exactly once and replaces it with a full cancelled snapshot', async () => {
    const job = makeJob('running');
    useFalJobsStore.getState().upsertJob(job);
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: `Cancel request ${job.requestId}` }));
    fireEvent.click(screen.getByRole('button', { name: `Cancel request ${job.requestId}` }));
    await waitFor(() => expect(cancelFalJobMock).toHaveBeenCalledOnce());
    expect(cancelFalJobMock).toHaveBeenCalledWith({
      apiKey: 'fal-key-secret',
      modelId: job.modelId,
      mediaType: job.mediaType,
      inputMode: job.inputMode,
      requestId: job.requestId,
    }, { signal: expect.any(AbortSignal) });
    expect(useFalJobsStore.getState().jobs[0]).toEqual({ ...job, state: 'cancelled', updatedAt: NOW });
    expect(submitFalJobMock).not.toHaveBeenCalled();
  });

  it('keeps a job active and reports a stable safe cancellation error on failure', async () => {
    cancelFalJobMock.mockRejectedValue(new Error('fal-key-secret raw provider body'));
    const job = makeJob('queued');
    useFalJobsStore.getState().upsertJob(job);
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: `Cancel request ${job.requestId}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('fal could not cancel this job. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('fal-key-secret');
    expect(useFalJobsStore.getState().jobs[0]).toEqual(job);
  });

  it.each([
    ['text', 'text-to-video'],
    ['image', 'image-to-video'],
  ] as const)('fills the %s prompt from the Gemini example model', async (inputMode, featureId) => {
    useAppStore.setState({ apiKey: 'gemini_test_key' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ prompt: 'A slow dolly across a rain-slick street at night' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace(inputMode);

    fireEvent.click(screen.getByRole('button', { name: 'Gen Example' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Prompt')).toHaveValue('A slow dolly across a rain-slick street at night')
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/example', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      featureId,
      apiKey: 'gemini_test_key',
    });
  });

  it('offers the example button with no Gemini key and surfaces the route\'s error', async () => {
    // The shared tier can serve keyless visitors, so the button is always
    // available; when nothing can serve it the route says what to connect.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Connect a Gemini API key to generate example prompts.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Gen Example' }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Connect a Gemini API key to generate example prompts.');
  });

  it('derives a semantic download slug for a submitted job from the connected Gemini key', async () => {
    useAppStore.setState({ apiKey: 'gemini_test_key' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: 'neon-tiger-in-the-rain' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: '  A neon tiger prowling through the rain  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    await waitFor(() =>
      expect(useFalJobsStore.getState().jobs[0]?.slug).toBe('neon-tiger-in-the-rain')
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/slug', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      prompt: 'A neon tiger prowling through the rain',
      apiKey: 'gemini_test_key',
    });
  });

  it('falls back to the prompt when the slug route cannot name the job', async () => {
    // No Gemini key and no shared tier: the route answers with its own
    // deterministic slug, which this stub declines to provide.
    useAppStore.setState({ apiKey: '' });
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A neon tiger in the rain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith('/api/slug', expect.objectContaining({ method: 'POST' }));
    expect(useFalJobsStore.getState().jobs[0]?.slug).toBeUndefined();

    useFalJobsStore.getState().upsertJob(makeJob('success', {
      id: 'request_submit01',
      requestId: 'request_submit01',
      prompt: 'A neon tiger in the rain',
      resultUrl: SAFE_VIDEO_URL,
      mimeType: 'video/mp4',
    }));
    expect(await screen.findByRole('link', { name: /Download video/ }))
      .toHaveAttribute('download', 'a-neon-tiger-in-the-rain.mp4');
  });

  it('downloads a completed fal video as a blob named after its slug', async () => {
    useFalJobsStore.getState().upsertJob(makeJob('success', {
      resultUrl: SAFE_VIDEO_URL,
      mimeType: 'video/mp4',
      slug: 'neon-tiger-in-the-rain',
    }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['video'], { type: 'video/mp4' }), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:fal-video');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderWorkspace();
    const link = screen.getByRole('link', { name: /Download video/ });
    expect(link).toHaveAttribute('download', 'neon-tiger-in-the-rain.mp4');
    fireEvent.click(link);

    await waitFor(() => expect(clickSpy).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(SAFE_VIDEO_URL, { signal: undefined });
    const downloadLink = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(downloadLink.href).toBe('blob:fal-video');
    expect(downloadLink.download).toBe('neon-tiger-in-the-rain.mp4');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fal-video');
  });

  it('redacts encoded credential variants from provider errors and logs', () => {
    useAppStore.setState({ falApiKey: 'id:secret' });
    useFalJobsStore.getState().upsertJob(makeJob('fail', {
      error: 'Provider returned id%3Asecret',
      logs: ['Debug credential id%3Asecret'],
    }));
    const { container } = renderWorkspace();
    expect(container.textContent).not.toContain('id%3Asecret');
    expect(screen.getByText('fal could not complete this job.')).toBeInTheDocument();
    expect(screen.getByText('fal reported an update.')).toBeInTheDocument();
  });
});
