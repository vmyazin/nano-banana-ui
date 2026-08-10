'use client';

import { Clapperboard, ImagePlus, MoveRight, Type } from 'lucide-react';
import FalGenerationWorkspace from '@/components/FalGenerationWorkspace';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import ProviderSelector, { type VideoProvider } from '@/components/ProviderSelector';
import type { FalInputMode } from '@/lib/fal/types';
import { useAppStore } from '@/store/useAppStore';

interface VideoWorkspaceProps {
  inputMode: FalInputMode;
  onInputModeChange: (mode: FalInputMode) => void;
  onExit: () => void;
  onOpenConnections: () => void;
}

/**
 * First-and-last-frame runs are a fal-only flow, so the third mode is offered
 * only while fal is the selected provider.
 */
const MODES: ReadonlyArray<{
  id: FalInputMode;
  label: string;
  icon: typeof Type;
  falOnly?: boolean;
}> = [
  { id: 'text', label: 'Text to video', icon: Type },
  { id: 'image', label: 'Image to video', icon: ImagePlus },
  { id: 'frames', label: 'First & last frame', icon: MoveRight, falOnly: true },
];

export default function VideoWorkspace({
  inputMode,
  onInputModeChange,
  onExit,
  onOpenConnections,
}: VideoWorkspaceProps) {
  const videoEngine = useAppStore((state) => state.videoEngine);
  const setVideoEngine = useAppStore((state) => state.setVideoEngine);
  const isFal = videoEngine === 'fal';
  const modes = MODES.filter((mode) => !mode.falOnly || isFal);
  // Kie has no first-and-last-frame models, so a ?videoMode=frames deep link
  // lands on the closest flow it does have until fal is selected.
  const activeMode: FalInputMode = !isFal && inputMode === 'frames' ? 'image' : inputMode;

  const selectEngine = (engine: VideoProvider) => {
    if (engine !== 'fal' && inputMode === 'frames') onInputModeChange('image');
    setVideoEngine(engine);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="glass-card p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow mb-1 flex items-center gap-1.5 text-[var(--neon-purple)]">
              <Clapperboard size={13} /> Video workspace
            </p>
            <h2 className="display text-2xl font-semibold sm:text-3xl">Create motion from an idea or image</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
              Start from a prompt, a single image, or a first and last frame. Tasks keep running while you explore this tab.
            </p>
          </div>
          <div className="flex flex-wrap rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-1">
            {modes.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onInputModeChange(mode.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${activeMode === mode.id ? 'bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
                >
                  <Icon size={15} /> {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="glass-card p-4 sm:p-5 md:p-6">
        <ProviderSelector value={videoEngine} onChange={selectEngine} />
      </section>

      {isFal ? (
        <FalGenerationWorkspace
          key={`fal-${activeMode}`}
          inputMode={activeMode}
          onBack={onExit}
          onOpenConnections={onOpenConnections}
          onContinueFromFrame={() => onInputModeChange('image')}
        />
      ) : (
        <KieGenerationWorkspace
          mediaType="video"
          inputMode={activeMode === 'text' ? 'text' : 'image'}
          exampleFeatureId={activeMode === 'text' ? 'text-to-video' : 'image-to-video'}
          onBack={onExit}
          onOpenConnections={onOpenConnections}
          onContinueFromFrame={() => onInputModeChange('image')}
        />
      )}
    </div>
  );
}
