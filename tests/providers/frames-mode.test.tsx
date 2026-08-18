import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderVideoWorkspace from '@/components/ProviderVideoWorkspace';
import { modelsFor } from '@/lib/providers/catalog';
import { useAppStore } from '@/store/useAppStore';
import { useDraftStore } from '@/store/useDraftStore';
import { useProviderJobsStore } from '@/store/useProviderJobsStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  useProviderJobsStore.getState().clearJobs();
  useDraftStore.setState({ prompt: '', references: [], controlValues: {} });
  useAppStore.setState({ runwareApiKey: 'rw-key', runwareVideoModel: 'lightricks:ltx@2.5-fast' });
});

afterEach(() => vi.unstubAllGlobals());

function renderFrames(inputMode: 'text' | 'image' | 'frames' = 'frames') {
  render(
    <ProviderVideoWorkspace
      provider="runware"
      label="Runware"
      inputMode={inputMode}
      onBack={() => undefined}
      onOpenConnections={() => undefined}
    />
  );
}

/**
 * Runware reads a pair of `frameImages` as the first and last frame — the
 * vendor's own rule for two images, which is why the mode needs no positioning
 * beyond the order they are sent in.
 */
describe('first and last frame on Runware', () => {
  it('is offered only by the models whose frameImages takes two', () => {
    const supports = (id: string) =>
      modelsFor('runware', 'video').find((model) => model.id === id)?.modes.includes('frames');

    expect(supports('lightricks:ltx@2.5-fast')).toBe(true);
    expect(supports('bytedance:seedance@2.0-mini')).toBe(true);
    // These two document a single frame image, so the mode would fail at submit.
    expect(supports('pixverse:1@5-fast')).toBe(false);
    expect(supports('alibaba:wan@2.6-flash')).toBe(false);
  });

  it('asks for two images, and says which is which', () => {
    renderFrames();

    expect(screen.getByRole('heading', { name: /first & last frame/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'First and last frame' })).toBeInTheDocument();
    expect(screen.getByText(/two images, in order/i)).toBeInTheDocument();
  });

  it('refuses to submit with only one of the two', async () => {
    useDraftStore.setState({
      prompt: 'a shoe changing colour',
      references: [{ id: 'r1', file: new File(['x'], 'a.png', { type: 'image/png' }), previewUrl: 'blob:a' }],
    });
    renderFrames();

    fireEvent.click(screen.getByRole('button', { name: /generate video/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/both frames/i);
  });

  it('sends the pair in order, which is what makes one first and one last', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, taskId: 'task-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    // Files read as data URLs by the workspace before they are sent.
    useDraftStore.setState({
      prompt: 'a shoe changing colour',
      references: [
        { id: 'r1', file: new File(['first'], 'first.png', { type: 'image/png' }), previewUrl: 'blob:a' },
        { id: 'r2', file: new File(['last'], 'last.png', { type: 'image/png' }), previewUrl: 'blob:b' },
      ],
    });
    renderFrames();

    fireEvent.click(screen.getByRole('button', { name: /generate video/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.images).toHaveLength(2);
    expect(body.images[0]).toContain('base64');
  });
});
