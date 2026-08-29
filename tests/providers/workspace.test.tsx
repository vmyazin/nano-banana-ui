import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderVideoWorkspace from '@/components/ProviderVideoWorkspace';
import { useAppStore } from '@/store/useAppStore';
import { useDraftStore } from '@/store/useDraftStore';
import { useProviderJobsStore } from '@/store/useProviderJobsStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderWorkspace(props: Partial<Parameters<typeof ProviderVideoWorkspace>[0]> = {}) {
  const onOpenConnections = vi.fn();
  render(
    <ProviderVideoWorkspace
      provider="runware"
      label="Runware"
      inputMode="text"
      onBack={() => undefined}
      onOpenConnections={onOpenConnections}
      {...props}
    />
  );
  return { onOpenConnections };
}

describe('ProviderVideoWorkspace', () => {
  beforeEach(() => {
    useProviderJobsStore.getState().clearJobs();
    useDraftStore.setState({ prompt: '', references: [], controlValues: {} });
    useAppStore.setState({ runwareApiKey: '', runwareVideoModel: 'lightricks:ltx@2.5-fast' });
  });

  it('carries the header, model, prompt and result panels the other workspaces have', () => {
    renderWorkspace();

    expect(screen.getByRole('button', { name: '← Back' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Text to video' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Runware key' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search compatible models')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gen Example/ })).toBeInTheDocument();
    expect(screen.getByText('Your generated video will appear here.')).toBeInTheDocument();
  });

  it('offers the shared stored-image picker in image-input modes', () => {
    renderWorkspace({ inputMode: 'image' });

    expect(screen.getByRole('button', { name: 'From library' })).toBeInTheDocument();
  });

  it('offers only the controls the selected model publishes', () => {
    renderWorkspace();

    // LTX-2.5 Fast: eight lengths, and every tier in both orientations.
    expect([...screen.getByRole('combobox', { name: 'Duration' }).querySelectorAll('option')].map((o) => o.textContent))
      .toEqual(['6 seconds', '8 seconds', '10 seconds', '12 seconds', '14 seconds', '16 seconds', '18 seconds', '20 seconds']);
    expect([...screen.getByRole('combobox', { name: /Output size/ }).querySelectorAll('option')].map((o) => o.textContent))
      .toEqual(['720p · 16:9', '720p · 9:16', '1080p · 16:9', '1080p · 9:16', '2K · 16:9', '2K · 9:16', '4K · 16:9', '4K · 9:16']);
  });

  it('sends you to connections instead of spending a request without a key', () => {
    const { onOpenConnections } = renderWorkspace();
    useDraftStore.setState({ prompt: 'a drifting nebula' });

    fireEvent.click(screen.getByRole('button', { name: /Generate video/ }));

    expect(onOpenConnections).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Connect your Runware key');
  });

  it('shares the draft prompt with the other workspaces', () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'a slow push-in' } });

    expect(useDraftStore.getState().prompt).toBe('a slow push-in');
  });

  it('filters the model list from the search box', () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText('Search compatible models'), { target: { value: 'pixverse' } });

    const options = [...screen.getByRole('combobox', { name: 'Model' }).querySelectorAll('option')];
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('PixVerse V5 Fast');
  });
});
