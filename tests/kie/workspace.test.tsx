import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import KieGenerationWorkspace from '../../components/KieGenerationWorkspace';
import { useAppStore } from '../../store/useAppStore';
import { useKieJobsStore } from '../../store/useKieJobsStore';

const { submitKieJobMock, uploadKieFilesMock } = vi.hoisted(() => ({
  submitKieJobMock: vi.fn(),
  uploadKieFilesMock: vi.fn(),
}));

vi.mock('../../lib/kie/browser', () => ({
  submitKieJob: submitKieJobMock,
  uploadKieFiles: uploadKieFilesMock,
}));

describe('Kie generation workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadKieFilesMock.mockResolvedValue([]);
    submitKieJobMock.mockResolvedValue({ taskId: 'task_test', protocol: 'market' });
    useAppStore.setState({
      apiKey: 'gemini_test_key',
      kieApiKey: 'kie_test_key',
      kieImageModel: 'nano-banana-pro',
      kieVideoModel: 'veo-3-1',
    });
    useKieJobsStore.getState().clearJobs();
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the compatible video model and its documented dynamic controls', () => {
    render(
      <KieGenerationWorkspace
        mediaType="video"
        inputMode="text"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: 'Text to video' })).toBeTruthy();
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('veo-3-1');
    expect((screen.getByLabelText('Generation mode') as HTMLSelectElement).selectedOptions[0].textContent).toBe('TEXT 2 VIDEO');
    expect(screen.getByText(/temporary Kie URLs/i)).toBeTruthy();
    const searchInput = screen.getByLabelText('Search compatible models');
    expect(searchInput.className).toContain('flex-1');
    expect(searchInput.parentElement?.className).toContain('flex');
    expect(screen.getByText(/Cinematic text-to-video and image-to-video/i).className).not.toContain('border');
  });

  it('renders a completed video as a native preview with an immediate download action', () => {
    useKieJobsStore.getState().upsertJob({
      id: 'video_task_1',
      taskId: 'video_task_1',
      protocol: 'veo',
      state: 'success',
      resultUrls: ['https://temp.kie.ai/video.mp4'],
      modelId: 'veo-3-1',
      mediaType: 'video',
      inputMode: 'text',
      prompt: 'A quiet ocean',
      createdAt: 1,
      updatedAt: 2,
      pollAttempt: 1,
    });
    const { container } = render(
      <KieGenerationWorkspace
        mediaType="video"
        inputMode="text"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://temp.kie.ai/video.mp4');
    expect((container.querySelector('a[download]') as HTMLAnchorElement).href).toBe('https://temp.kie.ai/video.mp4');
  });

  it('uses the saved Gemini key to generate an example prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt: 'A luminous glass city above the clouds' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(
      <KieGenerationWorkspace
        mediaType="image"
        inputMode="text"
        exampleFeatureId="text-to-image"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gen Example' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe(
        'A luminous glass city above the clouds'
      );
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/example', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      featureId: 'text-to-image',
      apiKey: 'gemini_test_key',
    });
  });

  it('keeps reference file selection outside shared model controls', () => {
    const { container } = render(
      <KieGenerationWorkspace
        mediaType="image"
        inputMode="image"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs).toHaveLength(1);
    expect(fileInputs[0].className).toContain('hidden');
    expect(screen.getByRole('button', { name: /upload image or paste from clipboard/i })).toBeTruthy();
  });

  it('submits shared control values with their declared types', async () => {
    useAppStore.setState({ kieImageModel: 'flux-2-pro' });

    render(
      <KieGenerationWorkspace
        mediaType="image"
        inputMode="text"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A glass forest' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Seed' }), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('radio', { name: '2K' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));

    await waitFor(() => expect(submitKieJobMock).toHaveBeenCalledOnce());
    expect(submitKieJobMock).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({ seed: 42, resolution: '2K' }),
    }));
    expect(uploadKieFilesMock).toHaveBeenCalledWith('kie_test_key', []);
  });

  it.each([
    {
      mediaType: 'image' as const,
      modelState: { kieImageModel: 'nano-banana-pro' },
      choices: ['1K', '2K', '4K'],
      selected: '1K',
      next: '2K',
    },
    {
      mediaType: 'video' as const,
      modelState: { kieVideoModel: 'kling-3-0' },
      choices: ['480p', '720p', '1080p'],
      selected: '720p',
      next: '1080p',
    },
  ])('renders $mediaType resolution as horizontal toggles', ({ mediaType, modelState, choices, selected, next }) => {
    useAppStore.setState(modelState);

    render(
      <KieGenerationWorkspace
        mediaType={mediaType}
        inputMode="text"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    const resolution = screen.getByRole('radiogroup', { name: 'Resolution' });

    expect(resolution.className).toContain('flex');
    expect(within(resolution).getAllByRole('radio').map((choice) => choice.textContent)).toEqual(choices);
    expect(screen.queryByRole('combobox', { name: 'Resolution' })).toBeNull();
    expect(screen.getByRole('radio', { name: selected }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: next }));

    expect(screen.getByRole('radio', { name: next }).getAttribute('aria-checked')).toBe('true');
  });
});
