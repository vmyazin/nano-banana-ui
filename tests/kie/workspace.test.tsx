import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import KieGenerationWorkspace from '../../components/KieGenerationWorkspace';
import { useAppStore } from '../../store/useAppStore';
import { useKieJobsStore } from '../../store/useKieJobsStore';

describe('Kie generation workspace', () => {
  beforeEach(() => {
    useAppStore.setState({
      kieApiKey: 'kie_test_key',
      kieImageModel: 'nano-banana-pro',
      kieVideoModel: 'veo-3-1',
    });
    useKieJobsStore.getState().clearJobs();
  });

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
    expect((screen.getByLabelText('Generation mode') as HTMLSelectElement).value).toBe('TEXT_2_VIDEO');
    expect(screen.getByText(/temporary Kie URLs/i)).toBeTruthy();
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
});
