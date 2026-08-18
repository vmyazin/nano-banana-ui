// components/FeatureSelector.tsx
'use client';

import { motion } from 'framer-motion';
import { Feature, FEATURES } from '@/types';
import { enginesForFeature } from '@/lib/engines/registry';
import { Sparkles, Zap } from 'lucide-react';
import MediaCard from '@/components/MediaCard';

interface FeatureSelectorProps {
  selectedFeature: Feature | null;
  onFeatureSelect: (feature: Feature) => void;
}

export default function FeatureSelector({ selectedFeature, onFeatureSelect }: FeatureSelectorProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="feature-selector w-full">
      {/* Three across from the tablet breakpoint (md, 768px) rather than xl:
          at the compact card size three tracks clear ~215px each at 768px,
          which is wider than the thumbnail needs to stay readable. */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4"
      >
        {FEATURES.map((feature) => {
          const isSelected = selectedFeature?.id === feature.id;
          const isSpecial = feature.category === 'special';
          const engines = enginesForFeature(feature);
          const hasFreeEngine = engines.some((e) => e.free);
          // Providers beyond Gemini that can also run this mode, surfaced as a
          // "+N" on the model badge.
          const extraEngineCount = engines.filter((e) => e.id !== 'gemini').length;

          return (
            <MediaCard
              key={feature.id}
              variants={itemVariants}
              onClick={() => onFeatureSelect(feature)}
              selected={isSelected}
              title={feature.name}
              description={feature.description}
              thumbnail={feature.thumbnail}
              thumbnailAlt={feature.name}
              badges={
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`whitespace-nowrap inline-flex items-center gap-1.5 text-[0.7rem] font-medium px-2.5 py-1 rounded-full border ${
                        feature.modelType === 'pro'
                          ? 'border-[var(--neon-purple)]/40 text-[var(--neon-purple)] bg-[var(--neon-purple)]/10'
                          : 'border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
                      }`}
                    >
                      <Zap size={12} />
                      {feature.modelType === 'pro' ? 'Gemini 3 Pro' : 'Flash 2.5'}
                      {extraEngineCount > 0 && (
                        <span
                          className="opacity-70"
                          title={`${extraEngineCount} more ${extraEngineCount === 1 ? 'provider supports' : 'providers support'} this mode`}
                        >
                          +{extraEngineCount}
                        </span>
                      )}
                    </span>

                    {hasFreeEngine && (
                      <span className="whitespace-nowrap inline-flex items-center text-[0.7rem] font-medium px-2.5 py-1 rounded-full border border-emerald-400/40 text-emerald-400 bg-emerald-400/10">
                        Free option
                      </span>
                    )}
                  </div>

                  {isSpecial && (
                    <span className="whitespace-nowrap inline-flex items-center gap-1.5 text-[0.7rem] font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-accent)] text-black">
                      <Sparkles size={12} />
                      Special
                    </span>
                  )}
                </>
              }
              meta={
                (feature.requiresImage || feature.maxImages) && (
                  <>
                    {feature.requiresImage && (
                      <span className="text-[0.7rem] px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">
                        Requires Image{feature.requiresMultipleImages ? 's' : ''}
                      </span>
                    )}
                    {feature.maxImages && (
                      <span className="text-[0.7rem] px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">
                        Up to {feature.maxImages} images
                      </span>
                    )}
                  </>
                )
              }
            />
          );
        })}
      </motion.div>
    </div>
  );
}
