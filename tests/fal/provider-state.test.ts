import { beforeEach, describe, expect, it } from 'vitest';
import { ENGINES, enginesForFeature } from '../../lib/engines/registry';
import { useAppStore } from '../../store/useAppStore';
import { FEATURES } from '../../types';

const STORAGE_KEY = 'scene-assembly-store';

describe('fal provider state', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      falApiKey: '',
      videoEngine: 'kie',
      falVideoModel: 'veo-3-1-fast',
    });
  });

  it('offers fal for all six image features', () => {
    expect(ENGINES.find((engine) => engine.id === 'fal')).toMatchObject({
      supportsInputImages: true,
      supportsGoogleSearch: true,
      supportsAspectRatio: true,
      supportsImageSize: true,
    });
    for (const feature of FEATURES) {
      expect(enginesForFeature(feature).map((engine) => engine.id)).toContain('fal');
    }
  });

  it('updates the BYOK key, video provider, and selected fal model', () => {
    useAppStore.getState().setFalApiKey('id:secret');
    useAppStore.getState().setVideoEngine('fal');
    useAppStore.getState().setFalVideoModel('hailuo-2-3-pro');
    expect(useAppStore.getState()).toMatchObject({
      falApiKey: 'id:secret',
      videoEngine: 'fal',
      falVideoModel: 'hailuo-2-3-pro',
    });
  });

  it('hydrates snapshots without fal fields using the current defaults', async () => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          apiKey: 'existing-gemini-key',
          engine: 'kie',
          kieApiKey: 'existing-kie-key',
        },
        version: 0,
      })
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState()).toMatchObject({
      apiKey: 'existing-gemini-key',
      engine: 'kie',
      kieApiKey: 'existing-kie-key',
      falApiKey: '',
      videoEngine: 'kie',
      falVideoModel: 'veo-3-1-fast',
    });
  });

  it('persists all fal provider preferences', () => {
    useAppStore.getState().setFalApiKey('persisted-id:secret');
    useAppStore.getState().setVideoEngine('fal');
    useAppStore.getState().setFalVideoModel('hailuo-2-3-pro');

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state).toMatchObject({
      falApiKey: 'persisted-id:secret',
      videoEngine: 'fal',
      falVideoModel: 'hailuo-2-3-pro',
    });
  });
});
