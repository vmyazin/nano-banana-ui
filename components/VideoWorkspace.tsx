'use client';

import { Clapperboard, ImagePlus, Type } from 'lucide-react';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import type { KieInputMode } from '@/lib/kie/types';

interface VideoWorkspaceProps {
  inputMode: KieInputMode;
  onInputModeChange: (mode: KieInputMode) => void;
  onExit: () => void;
  onOpenConnections: () => void;
}

export default function VideoWorkspace({
  inputMode,
  onInputModeChange,
  onExit,
  onOpenConnections,
}: VideoWorkspaceProps) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="glass-card p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow mb-1 flex items-center gap-1.5 text-[var(--neon-purple)]">
              <Clapperboard size={13} /> Kie.ai video workspace
            </p>
            <h2 className="display text-2xl font-semibold sm:text-3xl">Create motion from an idea or image</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
              Choose a supported text-to-video or image-to-video model. Tasks keep running while you explore this tab.
            </p>
          </div>
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-1">
            <button
              type="button"
              onClick={() => onInputModeChange('text')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${inputMode === 'text' ? 'bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
            >
              <Type size={15} /> Text to video
            </button>
            <button
              type="button"
              onClick={() => onInputModeChange('image')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${inputMode === 'image' ? 'bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
            >
              <ImagePlus size={15} /> Image to video
            </button>
          </div>
        </div>
      </section>

      <KieGenerationWorkspace
        mediaType="video"
        inputMode={inputMode}
        exampleFeatureId={`${inputMode}-to-video`}
        onBack={onExit}
        onOpenConnections={onOpenConnections}
      />
    </div>
  );
}
