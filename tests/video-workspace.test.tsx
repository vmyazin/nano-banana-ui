import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VideoWorkspace from '../components/VideoWorkspace';
import { useAppStore } from '../store/useAppStore';
import { useFalJobsStore } from '../store/useFalJobsStore';

const { cancelFalJobMock, submitFalJobMock, uploadFalFilesMock } = vi.hoisted(() => ({
  cancelFalJobMock: vi.fn(),
  submitFalJobMock: vi.fn(),
  uploadFalFilesMock: vi.fn(),
}));

vi.mock('../lib/fal/browser', () => ({
  cancelFalJob: cancelFalJobMock,
  submitFalJob: submitFalJobMock,
  uploadFalFiles: uploadFalFilesMock,
}));

vi.mock('../components/KieGenerationWorkspace', () => ({
  default: ({
    inputMode,
    onBack,
    onOpenConnections,
  }: {
    inputMode: 'text' | 'image';
    onBack: () => void;
    onOpenConnections: () => void;
  }) => (
    <div data-testid="kie-workspace">
      Kie workspace: {inputMode}
      <button type="button" onClick={onBack}>Kie back</button>
      <button type="button" onClick={onOpenConnections}>Kie connections</button>
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('VideoWorkspace provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    uploadFalFilesMock.mockResolvedValue([]);
    submitFalJobMock.mockResolvedValue({ requestId: 'request_submit01' });
    cancelFalJobMock.mockResolvedValue(undefined);
    useAppStore.setState({
      falApiKey: '',
      videoEngine: 'kie',
      falVideoModel: 'veo-3-1-fast',
    });
    useFalJobsStore.getState().clearJobs();
  });

  it('keeps Kie as the persisted default and renders exactly two accessible providers', () => {
    render(
      <VideoWorkspace
        inputMode="text"
        onInputModeChange={() => undefined}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    const providers = screen.getByRole('radiogroup', { name: 'Video provider' });
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      expect.stringContaining('Kie.ai'),
      expect.stringContaining('fal.ai'),
    ]);
    expect(screen.getByRole('radio', { name: /Kie\.ai/i })).toHaveAttribute('aria-checked', 'true');
    expect(providers.compareDocumentPosition(screen.getByTestId('kie-workspace'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('supports arrow-key provider selection with a single roving tab stop', () => {
    render(
      <VideoWorkspace
        inputMode="text"
        onInputModeChange={() => undefined}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );
    const kie = screen.getByRole('radio', { name: /Kie\.ai/i });
    const fal = screen.getByRole('radio', { name: /fal\.ai/i });
    expect(kie).toHaveAttribute('tabindex', '0');
    expect(fal).toHaveAttribute('tabindex', '-1');
    kie.focus();
    fireEvent.keyDown(kie, { key: 'ArrowRight' });
    expect(fal).toHaveAttribute('aria-checked', 'true');
    expect(fal).toHaveFocus();
    expect(useAppStore.getState().videoEngine).toBe('fal');
  });

  it('persists provider changes and forwards navigation callbacks to the active workspace', () => {
    const onExit = vi.fn();
    const onOpenConnections = vi.fn();
    render(
      <VideoWorkspace
        inputMode="text"
        onInputModeChange={() => undefined}
        onExit={onExit}
        onOpenConnections={onOpenConnections}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /fal\.ai/i }));
    expect(useAppStore.getState().videoEngine).toBe('fal');
    expect(screen.queryByText(/Kie\.ai video workspace/i)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Text to video with fal.ai' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: /Connect fal key/i }));
    expect(onExit).toHaveBeenCalledOnce();
    expect(onOpenConnections).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('radio', { name: /Kie\.ai/i }));
    expect(useAppStore.getState().videoEngine).toBe('kie');
    fireEvent.click(screen.getByRole('button', { name: 'Kie back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kie connections' }));
    expect(onExit).toHaveBeenCalledTimes(2);
    expect(onOpenConnections).toHaveBeenCalledTimes(2);
  });

  it('cancels a stale billed fal submit exactly once when switching providers', async () => {
    const pending = deferred<{ requestId: string }>();
    submitFalJobMock.mockReturnValue(pending.promise);
    useAppStore.setState({
      falApiKey: 'fal-key-secret',
      videoEngine: 'fal',
      falVideoModel: 'veo-3-1-fast',
    });
    render(
      <VideoWorkspace
        inputMode="text"
        onInputModeChange={() => undefined}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A moonlit ocean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    await waitFor(() => expect(submitFalJobMock).toHaveBeenCalledOnce());
    const signal = submitFalJobMock.mock.calls[0][1].signal as AbortSignal;

    fireEvent.click(screen.getByRole('radio', { name: /Kie\.ai/i }));
    expect(signal.aborted).toBe(false);
    expect(screen.getByTestId('kie-workspace')).toBeInTheDocument();
    await act(async () => {
      pending.resolve({ requestId: 'request_stale_provider' });
      await pending.promise;
    });

    expect(submitFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledOnce();
    expect(cancelFalJobMock).toHaveBeenCalledWith({
      apiKey: 'fal-key-secret',
      modelId: 'veo-3-1-fast',
      mediaType: 'video',
      inputMode: 'text',
      requestId: 'request_stale_provider',
    });
    expect(useFalJobsStore.getState().jobs).toEqual([]);
  });

  it('preserves fal provider, model, and jobs while changing modes or providers', () => {
    useAppStore.setState({ videoEngine: 'fal', falVideoModel: 'hailuo-2-3-pro' });
    useFalJobsStore.getState().upsertJob({
      id: 'request_keep01',
      requestId: 'request_keep01',
      state: 'queued',
      logs: [],
      modelId: 'hailuo-2-3-pro',
      mediaType: 'video',
      inputMode: 'text',
      prompt: 'Keep running',
      createdAt: 1,
      updatedAt: 1,
      pollAttempt: 0,
    });
    const onInputModeChange = vi.fn();
    const view = render(
      <VideoWorkspace
        inputMode="text"
        onInputModeChange={onInputModeChange}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Image to video' }));
    expect(onInputModeChange).toHaveBeenCalledWith('image');
    view.rerender(
      <VideoWorkspace
        inputMode="image"
        onInputModeChange={onInputModeChange}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Kie\.ai/i }));
    fireEvent.click(screen.getByRole('radio', { name: /fal\.ai/i }));

    expect(useAppStore.getState()).toMatchObject({ videoEngine: 'fal', falVideoModel: 'hailuo-2-3-pro' });
    expect(useFalJobsStore.getState().jobs).toHaveLength(1);
    expect(useFalJobsStore.getState().jobs[0].requestId).toBe('request_keep01');
  });

  it('offers first-and-last-frame only on fal, and leaves the mode on Kie', () => {
    const onInputModeChange = vi.fn();
    const view = render(
      <VideoWorkspace
        inputMode="text"
        onInputModeChange={onInputModeChange}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );
    expect(screen.queryByRole('button', { name: 'First & last frame' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /fal\.ai/i }));
    fireEvent.click(screen.getByRole('button', { name: 'First & last frame' }));
    expect(onInputModeChange).toHaveBeenCalledWith('frames');

    // Kie has no frames models, so it falls back to image-to-video on the way out.
    view.rerender(
      <VideoWorkspace
        inputMode="frames"
        onInputModeChange={onInputModeChange}
        onExit={() => undefined}
        onOpenConnections={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Kie\.ai/i }));
    expect(onInputModeChange).toHaveBeenLastCalledWith('image');
    expect(screen.getByTestId('kie-workspace')).toHaveTextContent('Kie workspace: image');
  });
});
