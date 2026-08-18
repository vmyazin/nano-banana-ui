import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderVideoWorkspace from '@/components/ProviderVideoWorkspace';
import { useAppStore } from '@/store/useAppStore';
import { useDraftStore } from '@/store/useDraftStore';
import { useProviderJobsStore } from '@/store/useProviderJobsStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function reference(id: string) {
  return { id, file: new File([id], `${id}.png`, { type: 'image/png' }), previewUrl: `blob:${id}` };
}

beforeEach(() => {
  useProviderJobsStore.getState().clearJobs();
  useAppStore.setState({ runwareApiKey: 'rw-key', runwareVideoModel: 'lightricks:ltx@2.5-fast' });
  useDraftStore.setState({ prompt: 'a shoe changing colour', references: [], controlValues: {} });
});

afterEach(() => vi.unstubAllGlobals());

function renderFrames(mode: 'image' | 'frames' = 'frames') {
  render(
    <ProviderVideoWorkspace
      provider="runware"
      label="Runware"
      inputMode={mode}
      onBack={() => undefined}
      onOpenConnections={() => undefined}
    />
  );
}

const order = () => useDraftStore.getState().references.map((entry) => entry.id);

/**
 * Order is the whole of what makes one image the opening frame and the other
 * the closing one, so picking them the wrong way round is otherwise a
 * two-file re-upload.
 */
describe('swapping the first and last frame', () => {
  it('exchanges the two, and the labels follow', () => {
    useDraftStore.setState({ references: [reference('a'), reference('b')] });
    renderFrames();

    expect(order()).toEqual(['a', 'b']);
    expect(screen.getByAltText('First frame')).toHaveAttribute('src', 'blob:a');

    fireEvent.click(screen.getByRole('button', { name: /swap first and last/i }));

    expect(order()).toEqual(['b', 'a']);
    expect(screen.getByAltText('First frame')).toHaveAttribute('src', 'blob:b');
    expect(screen.getByAltText('Last frame')).toHaveAttribute('src', 'blob:a');
  });

  it('is only offered once both frames are there', () => {
    useDraftStore.setState({ references: [reference('a')] });
    renderFrames();

    expect(screen.queryByRole('button', { name: /swap first and last/i })).not.toBeInTheDocument();
  });

  it('stays out of the way in a mode where order means nothing', () => {
    useDraftStore.setState({ references: [reference('a'), reference('b')] });
    renderFrames('image');

    expect(screen.queryByRole('button', { name: /swap first and last/i })).not.toBeInTheDocument();
  });

  it('names each frame in its remove control too', () => {
    useDraftStore.setState({ references: [reference('a'), reference('b')] });
    renderFrames();

    expect(screen.getByRole('button', { name: 'Remove first frame' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove last frame' })).toBeInTheDocument();
  });
});
