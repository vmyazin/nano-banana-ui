import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VideoWorkspace from '../components/VideoWorkspace';
import { useAppStore } from '../store/useAppStore';
import { useFalJobsStore } from '../store/useFalJobsStore';

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

describe('VideoWorkspace provider selection', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('preserves fal provider, model, and jobs while changing modes or providers', () => {
    useAppStore.setState({ videoEngine: 'fal', falVideoModel: 'sora-2-pro' });
    useFalJobsStore.getState().upsertJob({
      id: 'request_keep01',
      requestId: 'request_keep01',
      state: 'queued',
      logs: [],
      modelId: 'sora-2-pro',
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

    expect(useAppStore.getState()).toMatchObject({ videoEngine: 'fal', falVideoModel: 'sora-2-pro' });
    expect(useFalJobsStore.getState().jobs).toHaveLength(1);
    expect(useFalJobsStore.getState().jobs[0].requestId).toBe('request_keep01');
  });
});
