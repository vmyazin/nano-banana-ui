'use client';

import { type StaticImageData } from 'next/image';
import { ImagePlus, MoveRight, Type } from 'lucide-react';
import FalGenerationWorkspace from '@/components/FalGenerationWorkspace';
import KieGenerationWorkspace from '@/components/KieGenerationWorkspace';
import MediaCard from '@/components/MediaCard';
import ProviderSelector, { type VideoProvider } from '@/components/ProviderSelector';
import ProviderVideoWorkspace from '@/components/ProviderVideoWorkspace';
import { modelsFor } from '@/lib/providers/catalog';
import { isProviderId } from '@/lib/providers';
import type { ProviderId } from '@/lib/providers/types';

/** Display names for the aggregator providers in the video workspace header. */
const PROVIDER_LABELS: Record<ProviderId, string> = {
  runware: 'Runware',
  atlas: 'Atlas Cloud',
  comet: 'CometAPI',
};
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
  /** Not every provider can bookend a clip between two stills. */
  needsFramesSupport?: boolean;
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
    needsFramesSupport: true,
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
  const activeProvider: ProviderId | null =
    videoEngine === 'runware' || videoEngine === 'atlas' || videoEngine === 'comet'
      ? videoEngine
      : null;
  /**
   * Who can bookend a clip between two stills: fal, and the Runware models
   * whose `frameImages` takes two — the vendor reads a pair as first and last.
   * Kie has no such model, so the card stays hidden there rather than offering
   * a mode that would fail at submit.
   */
  const supportsFrames = (engine: VideoProvider) =>
    engine === 'fal' ||
    (isProviderId(engine) && modelsFor(engine, 'video').some((model) => model.modes.includes('frames')));

  const framesProviders = supportsFrames(videoEngine);
  const modes = MODES.filter((mode) => !mode.needsFramesSupport || framesProviders);
  // A ?videoMode=frames deep link lands on the closest flow the current
  // provider does have, rather than on a mode it cannot run.
  const activeMode: FalInputMode = !framesProviders && inputMode === 'frames' ? 'image' : inputMode;

  const selectEngine = (engine: VideoProvider) => {
    // Only drop out of frames for a provider that genuinely cannot run it —
    // this used to be "anything but fal", which silently downgraded the mode
    // when switching to a provider that can.
    if (!supportsFrames(engine) && inputMode === 'frames') onInputModeChange('image');
    setVideoEngine(engine);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero — same shape as the landing hero: one headline line, then the
          blurb. No eyebrow; the nav's Image/Video toggle already says where
          you are. */}
      <div className="space-y-2 py-0 text-center sm:space-y-2.5 sm:py-1">
        <h2 className="display px-4 text-2xl font-semibold leading-[1.1] text-balance sm:text-3xl md:text-4xl">
          <span className="gradient-text">Create motion</span>{' '}
          <span className="text-[var(--foreground)]">from an idea or image</span>
        </h2>

        {/* States what this tab makes, in the plainest terms. The provider pills
            that used to sit beside it are gone: the selector below names the same
            two providers, and is the control rather than a label. */}
        <div className="flex justify-center px-4">
          <p className="max-w-xl text-[0.8125rem] leading-relaxed text-[var(--foreground-muted)] sm:text-sm">
            Turn a prompt or a still image into a short video clip.
          </p>
        </div>
      </div>

      {/* Input mode — the same card the landing page uses for features, at the
          same widths a 1/2 and 1/3 grid track would give it, so a card is the
          same size wherever you meet it. Laid out as centered flex rather than
          a grid so that hiding the fal-only mode leaves the two remaining cards
          centered instead of parked against the left edge.

          The widths track FeatureSelector's grid: 2-up at sm, all three across
          from md (tablet) up. The subtracted pixels are the row's share of the
          gap — with three items and a 16px gap, 32px of gap spread over three
          tracks is ~11px each; two items with a 16px gap is 8px each. */}
      <div className="flex w-full flex-wrap justify-center gap-3 *:w-full sm:gap-4 sm:*:w-[calc(50%-8px)] md:*:w-[calc(33.333%-11px)]">
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
                  <span className="whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-2.5 py-1 text-[0.7rem] font-medium text-[var(--neon-purple)]">
                    <Icon size={12} />
                    {mode.requires}
                  </span>

                  {mode.needsFramesSupport && (
                    <span className="whitespace-nowrap inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--foreground-muted)]">
                      Not on every provider
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

      {activeProvider ? (
        <ProviderVideoWorkspace
          key={`${activeProvider}-${activeMode}`}
          provider={activeProvider}
          label={PROVIDER_LABELS[activeProvider]}
          // These three have no first-and-last-frame models, so a ?videoMode=frames
          // deep link lands on image-to-video the way Kie already does.
          inputMode={activeMode}
          onBack={onExit}
          onOpenConnections={onOpenConnections}
          onContinueFromFrame={() => onInputModeChange('image')}
        />
      ) : isFal ? (
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
