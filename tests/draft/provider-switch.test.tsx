import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FalGenerationWorkspace from '../../components/FalGenerationWorkspace';
import KieGenerationWorkspace from '../../components/KieGenerationWorkspace';
import { useAppStore } from '../../store/useAppStore';
import { useDraftStore } from '../../store/useDraftStore';
import { useFalJobsStore } from '../../store/useFalJobsStore';
import { useKieJobsStore } from '../../store/useKieJobsStore';

vi.mock('../../lib/fal/browser', () => ({
  cancelFalJob: vi.fn(),
  submitFalJob: vi.fn(),
  uploadFalFiles: vi.fn(),
}));
vi.mock('../../lib/kie/browser', () => ({
  submitKieJob: vi.fn(),
  uploadKieFiles: vi.fn(),
}));

const noop = () => undefined;

/** ModelControls selects carry option indices as their DOM value, not the value itself. */
function choose(name: string, label: string) {
  const select = screen.getByRole('combobox', { name }) as HTMLSelectElement;
  const index = [...select.options].findIndex((option) => option.textContent === label);
  expect(index).toBeGreaterThanOrEqual(0);
  fireEvent.change(select, { target: { value: String(index) } });
}

function renderFal(inputMode: 'text' | 'image' = 'text') {
  return render(
    <FalGenerationWorkspace inputMode={inputMode} onBack={noop} onOpenConnections={noop} />
  );
}

function renderKie(inputMode: 'text' | 'image' = 'text') {
  return render(
    <KieGenerationWorkspace
      mediaType="video"
      inputMode={inputMode}
      onBack={noop}
      onOpenConnections={noop}
    />
  );
}

describe('carrying user input across providers and modes', () => {
  beforeEach(() => {
    let created = 0;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:draft-${++created}`),
      revokeObjectURL: vi.fn(),
    }));
    useAppStore.setState({
      apiKey: '',
      falApiKey: 'fal-key',
      kieApiKey: 'kie-key',
      videoEngine: 'fal',
      falVideoModel: 'veo-3-1-fast',
      kieVideoModel: 'veo-3-1',
    });
    useFalJobsStore.getState().clearJobs();
    useKieJobsStore.getState().clearJobs();
    useDraftStore.getState().reset();
  });

  it('keeps the prompt when swapping fal for Kie', () => {
    const fal = renderFal();
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A neon tiger prowling in the rain' },
    });
    fal.unmount();

    renderKie();

    expect(screen.getByLabelText('Prompt')).toHaveValue('A neon tiger prowling in the rain');
  });

  it('keeps the prompt when swapping text-to-video for image-to-video', () => {
    const text = renderFal('text');
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Hold the camera still' } });
    text.unmount();

    renderFal('image');

    expect(screen.getByLabelText('Prompt')).toHaveValue('Hold the camera still');
  });

  it('carries an aspect ratio the next provider also offers', () => {
    const fal = renderFal();
    choose('Aspect ratio', '9:16');
    expect(useDraftStore.getState().controlValues.aspect_ratio).toBe('9:16');
    fal.unmount();

    renderKie();

    expect(screen.getByRole('combobox', { name: 'Aspect ratio' })).toHaveDisplayValue('9:16');
  });

  it('falls back to the default when the next model cannot express the choice', () => {
    // Kie's Wan offers 21:9; fal's Veo Fast only 16:9 and 9:16.
    useAppStore.setState({ kieVideoModel: 'wan-2-7' });
    const kie = renderKie();
    choose('Aspect ratio', '21:9');
    expect(useDraftStore.getState().controlValues.aspect_ratio).toBe('21:9');
    kie.unmount();

    renderFal();

    expect(screen.getByRole('combobox', { name: 'Aspect ratio' })).toHaveDisplayValue('16:9');
  });

  it('keeps an uploaded reference across the switch, previews intact', async () => {
    const fal = renderFal('image');
    const image = new File(['image'], 'portrait.png', { type: 'image/png' });
    fireEvent.change(fal.container.querySelector('input[type="file"]')!, {
      target: { files: [image] },
    });
    await screen.findByAltText('Reference 1');
    fal.unmount();

    renderKie('image');

    // The preview must still resolve: the draft owns the URL, so unmounting fal
    // cannot have revoked it.
    const preview = await screen.findByAltText('Reference 1');
    expect(preview).toHaveAttribute('src', 'blob:draft-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:draft-1');
  });

  it('drops the extra reference when the next model accepts fewer', async () => {
    useAppStore.setState({ kieImageModel: 'nano-banana-pro' });
    const kie = render(
      <KieGenerationWorkspace mediaType="image" inputMode="image" onBack={noop} onOpenConnections={noop} />
    );
    const files = ['a.png', 'b.png'].map((name) => new File(['i'], name, { type: 'image/png' }));
    fireEvent.change(kie.container.querySelector('input[type="file"]')!, { target: { files } });
    await waitFor(() => expect(useDraftStore.getState().references).toHaveLength(2));
    kie.unmount();

    // fal video takes exactly one reference image.
    renderFal('image');

    await waitFor(() => expect(useDraftStore.getState().references).toHaveLength(1));
    expect(useDraftStore.getState().references[0].file.name).toBe('b.png');
  });
});
