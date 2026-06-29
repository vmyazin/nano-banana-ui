'use client';

import { motion } from 'framer-motion';
import { Feature, FEATURES } from '@/types';
import { Sparkles, Zap } from 'lucide-react';

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
    <div className="w-full space-y-8 sm:space-y-10">
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <p className="eyebrow">Capabilities</p>
        <h2 className="display text-3xl sm:text-4xl md:text-5xl font-semibold text-[var(--foreground)]">
          Choose your feature
        </h2>
        <p className="text-base sm:text-lg text-[var(--foreground-muted)] leading-relaxed">
          Powerful AI image generation and editing modes, powered by Google Gemini.
        </p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6"
      >
        {FEATURES.map((feature) => {
          const isSelected = selectedFeature?.id === feature.id;
          const isSpecial = feature.category === 'special';

          return (
            <motion.button
              key={feature.id}
              variants={itemVariants}
              onClick={() => onFeatureSelect(feature)}
              className={`glass-card p-5 sm:p-6 text-left relative overflow-hidden group cursor-pointer ${
                isSelected ? 'border-[var(--neon-cyan)]/60 shadow-[var(--glow-cyan)]' : ''
              }`}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.99 }}
            >
              {/* Badges row */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[0.7rem] font-medium px-2.5 py-1 rounded-full border ${
                    feature.modelType === 'pro'
                      ? 'border-[var(--neon-purple)]/40 text-[var(--neon-purple)] bg-[var(--neon-purple)]/10'
                      : 'border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
                  }`}
                >
                  <Zap size={12} />
                  {feature.modelType === 'pro' ? 'Gemini 3 Pro' : 'Flash 2.5'}
                </span>

                {isSpecial && (
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold px-2.5 py-1 rounded-full bg-[var(--banana-yellow)] text-black">
                    <Sparkles size={12} />
                    Special
                  </span>
                )}
              </div>

              {/* Thumbnail */}
              <div className="mt-4 mb-5 aspect-video rounded-xl bg-[var(--background-elevated)] border border-[var(--border)] relative overflow-hidden">
                <img
                  src={feature.thumbnail}
                  alt={feature.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>

              <div className="space-y-2.5">
                <h3 className="display text-lg sm:text-xl font-semibold text-[var(--foreground)]">
                  {feature.name}
                </h3>
                <p className="text-sm sm:text-[0.95rem] text-[var(--foreground-muted)] line-clamp-3 leading-relaxed">
                  {feature.description}
                </p>

                {(feature.requiresImage || feature.maxImages) && (
                  <div className="flex flex-wrap gap-2 pt-1">
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
                  </div>
                )}
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute bottom-4 right-4 w-7 h-7 rounded-full bg-[var(--neon-cyan)] flex items-center justify-center"
                >
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
