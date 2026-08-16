'use client';

import { ImagePlus, MoveRight, Type } from 'lucide-react';
import FalGenerationWorkspace from '@/components/FalGenerationWorkspace';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import ProviderLogo from '@/components/ProviderLogo';
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
      {/* Hero — same shape as the landing hero: one headline line, then a
          single row carrying the blurb and the engines behind this workspace.
          No eyebrow; the nav's Image/Video toggle already says where you are. */}
      <div className="space-y-3 py-2 text-center sm:space-y-4 sm:py-3">
        <h2 className="display px-4 text-4xl font-semibold leading-[1.1] text-balance sm:text-5xl md:text-6xl">
          <span className="gradient-text">Create motion</span>{' '}
          <span className="text-[var(--foreground)]">from an idea or image</span>
        </h2>

        <div className="flex flex-col flex-wrap items-center justify-center gap-x-4 gap-y-3 px-4 sm:flex-row">
          <p className="max-w-xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
            Start from a prompt, a single image, or a first and last frame. Tasks keep running while you explore this tab.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="pill">
              <ProviderLogo provider="fal" size={13} className="text-[var(--neon-pink)]" />
              fal.ai
            </span>
            <span className="pill">
              <ProviderLogo provider="kie" size={13} />
              Kie.ai
            </span>
          </div>
        </div>
      </div>

      {/* Input mode — a segmented control, centered under the hero. */}
      <div className="flex justify-center">
        <div className="flex flex-wrap justify-center rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-1">
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
