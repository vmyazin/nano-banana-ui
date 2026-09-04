// components/FeatureSelector.tsx
'use client';

import { motion } from 'framer-motion';
import { Feature, FEATURES } from '@/types';
import { enginesForFeature } from '@/lib/engines/registry';
import { Sparkles } from 'lucide-react';
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
          // The one engine fact worth showing before the click: whether this
          // mode can be run without paying. Only the modes that take no input
          // image can, since neither free engine accepts one.
          const hasFreeEngine = enginesForFeature(feature).some((e) => e.free);

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
              /* No badge row: naming the model here said "Gemini 3 Pro" on
                 every card, which is no help when choosing between them, and
                 the engine picker one step later is where that choice is
                 actually made. What survives is what the user can act on
                 before clicking, and it all fits the one pill row at the
                 card's foot — which `mt-auto` keeps aligned across a row. */
              meta={
                (hasFreeEngine || isSpecial || feature.requiresImage || feature.maxImages) && (
                  <>
                    {isSpecial && (
                      <span className="whitespace-nowrap inline-flex items-center gap-1.5 text-[0.7rem] font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-accent)] text-black">
                        <Sparkles size={12} />
                        Special
                      </span>
                    )}
                    {hasFreeEngine && (
                      <span className="whitespace-nowrap inline-flex items-center text-[0.7rem] font-medium px-2.5 py-1 rounded-full border border-emerald-400/40 text-emerald-400 bg-emerald-400/10">
                        Free option
                      </span>
                    )}
                    {feature.requiresImage && (
                      <span className="whitespace-nowrap text-[0.7rem] px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">
                        Requires Image{feature.requiresMultipleImages ? 's' : ''}
                      </span>
                    )}
                    {feature.maxImages && (
                      <span className="whitespace-nowrap text-[0.7rem] px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">
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
