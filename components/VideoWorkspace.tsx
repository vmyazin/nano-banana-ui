'use client';

import { type StaticImageData } from 'next/image';
import { ImagePlus, MoveRight, Type } from 'lucide-react';
import FalGenerationWorkspace from '@/components/FalGenerationWorkspace';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import MediaCard from '@/components/MediaCard';
import ProviderLogo from '@/components/ProviderLogo';
import ProviderSelector, { type VideoProvider } from '@/components/ProviderSelector';
import type { FalInputMode } from '@/lib/fal/types';
import { useAppStore } from '@/store/useAppStore';
import catalogThumbnail from '@/public/thumbnails/neon-cat-catalog-isometric.jpg';
import leapThumbnail from '@/public/thumbnails/neon-cat-leap-cyan-magenta.jpg';
import bookendThumbnail from '@/public/thumbnails/neon-cat-jump-dashboard.jpg';

interface VideoWorkspaceProps {
  inputMode: FalInputMode;
  onInputModeChange: (mode: FalInputMode) => void;
  onExit: () => void;
  onOpenConnections: () => void;
}

/**
 * First-and-last-frame runs are a fal-only flow, so the third mode is offered
 * only while fal is the selected provider.
 *
 * The thumbnails illustrate what each mode does: one cat drawn a dozen ways for
 * the open field a prompt gives you, one cat mid-leap across consecutive frames
 * for a still put into motion, and one cat bookended by a crouch and a landing
 * with the jump between them left as a ghosted arc.
 */
const MODES: ReadonlyArray<{
  id: FalInputMode;
  label: string;
  blurb: string;
  /** What the mode needs before it can run, shown as the card's badge. */
  requires: string;
  icon: typeof Type;
  thumbnail?: StaticImageData;
  falOnly?: boolean;
}> = [
  {
    id: 'text',
    label: 'Text to video',
    blurb: 'Start from a written prompt',
    requires: 'Prompt only',
    icon: Type,
    thumbnail: catalogThumbnail,
  },
  {
    id: 'image',
    label: 'Image to video',
    blurb: 'Put a still frame into motion',
    requires: 'Needs an image',
    icon: ImagePlus,
    thumbnail: leapThumbnail,
  },
  {
    id: 'frames',
    label: 'First & last frame',
    blurb: 'Fill the motion between two stills',
    requires: 'Needs two images',
    icon: MoveRight,
    thumbnail: bookendThumbnail,
    falOnly: true,
  },
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
          {/* One line, so the blurb and the pills read as a single band. The
              starting points it used to list are now the cards below. */}
          <p className="max-w-xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
            Tasks keep running while you explore this tab.
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

      {/* Input mode — the same card the landing page uses for features, at the
          same widths a 1/2 and 1/3 grid track would give it, so a card is the
          same size wherever you meet it. Laid out as centered flex rather than
          a grid so that hiding the fal-only mode leaves the two remaining cards
          centered instead of parked against the left edge. */}
      <div className="flex w-full flex-wrap justify-center gap-5 *:w-full sm:gap-6 md:*:w-[calc(50%-12px)] xl:*:w-[calc(33.333%-16px)]">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <MediaCard
              key={mode.id}
              accent="purple"
              selected={activeMode === mode.id}
              onClick={() => onInputModeChange(mode.id)}
              title={mode.label}
              description={mode.blurb}
              thumbnail={mode.thumbnail}
              badges={
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-2.5 py-1 text-[0.7rem] font-medium text-[var(--neon-purple)]">
                    <Icon size={12} />
                    {mode.requires}
                  </span>

                  {mode.falOnly && (
                    <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--foreground-muted)]">
                      fal.ai only
                    </span>
                  )}
                </>
              }
            />
          );
        })}
      </div>

      {/* Free-standing like the mode grid above, so the two choice rows share
          one left edge instead of one sitting inset inside a panel. */}
      <ProviderSelector value={videoEngine} onChange={selectEngine} />

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
