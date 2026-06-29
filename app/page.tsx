'use client';

import { Suspense, useEffect, useState } from 'react';
import { useQueryState } from 'nuqs';
import { motion } from 'framer-motion';
import { Key, Check } from 'lucide-react';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import FeatureSelector from '@/components/FeatureSelector';
import GenerationInterface from '@/components/GenerationInterface';
import { Feature, FEATURES } from '@/types';
import { useAppStore } from '@/store/useAppStore';

function Studio() {
  // API key lives in the persisted Zustand store (single source of truth).
  const apiKey = useAppStore((s) => s.apiKey);
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);
  const hasKey = hasHydrated && !!apiKey;

  // View is driven by the URL (?feature=<id>) so it deep-links, supports
  // browser back/forward, and survives a refresh.
  const [featureId, setFeatureId] = useQueryState('feature', { history: 'push' });
  const selectedFeature: Feature | null =
    FEATURES.find((f) => f.id === featureId) ?? null;
  const selectFeature = (feature: Feature) => setFeatureId(feature.id);
  const clearFeature = () => setFeatureId(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Header — sticky, hairline border, backdrop blur (Linear/Vercel nav) */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(8,8,11,0.72)] backdrop-blur-xl">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-3.5 md:py-4">
          <div className="flex items-center justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 min-w-0"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-[var(--banana-yellow)] to-orange-500 flex items-center justify-center text-base sm:text-lg flex-shrink-0 shadow-[0_2px_12px_-2px_rgba(255,237,78,0.4)]">
                🍌
              </div>
              <div className="min-w-0 flex items-center gap-2.5">
                <h1 className="display text-base sm:text-lg font-semibold text-[var(--foreground)] truncate">
                  Nano Banana Pro
                </h1>
                <span className="hidden md:inline-block h-3.5 w-px bg-[var(--border-hover)]" />
                <span className="hidden md:inline eyebrow">Gemini Image Studio</span>
              </div>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              onClick={() => setKeyDialogOpen(true)}
              className={`${hasKey ? 'btn-secondary' : 'btn-primary'} text-sm flex-shrink-0`}
              title={hasKey ? 'Update your API key' : 'Add your Gemini API key'}
            >
              {hasKey ? (
                <>
                  <Check size={15} className="text-emerald-400" />
                  <span className="hidden sm:inline">API&nbsp;Key</span>
                  <span className="sm:hidden">Key</span>
                </>
              ) : (
                <>
                  <Key size={15} />
                  <span className="hidden sm:inline">Add&nbsp;API&nbsp;Key</span>
                  <span className="sm:hidden">Add&nbsp;Key</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </header>

      {/* API Key dialog (controlled by the header CTA) */}
      <ApiKeyConfig
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
      />

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-6 sm:py-8 md:py-10">
        {!selectedFeature ? (
          <div className="w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-10 sm:space-y-12 md:space-y-14"
            >
              {/* Hero Section */}
              <div className="text-center space-y-5 sm:space-y-6 md:space-y-8 py-4 sm:py-6 md:py-8">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="pill"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--neon-cyan)]" />
                  Professional AI Image Generation
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 }}
                  className="display text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-semibold px-4"
                >
                  <span className="gradient-text">Create stunning images</span>
                  <br />
                  <span className="text-[var(--foreground)]">with AI power</span>
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-base sm:text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto px-4 leading-relaxed"
                >
                  Harness Google's Gemini to generate, edit, and transform images with
                  precise control — from text-to-image to viral social thumbnails.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="flex flex-wrap gap-2.5 justify-center pt-1"
                >
                  <span className="pill">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Gemini 2.5 Flash
                  </span>
                  <span className="pill">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--neon-purple)]" />
                    Gemini 3 Pro
                  </span>
                  <span className="pill">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--banana-yellow)]" />
                    Up to 4K Quality
                  </span>
                </motion.div>
              </div>

              {/* Feature Selector */}
              <FeatureSelector
                selectedFeature={selectedFeature}
                onFeatureSelect={selectFeature}
              />
            </motion.div>
          </div>
        ) : (
          <GenerationInterface
            feature={selectedFeature}
            apiKey={apiKey}
            onBack={clearFeature}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 mt-10 sm:mt-12 md:mt-16">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-8 sm:py-10 md:py-12">
          <div className="flex flex-col items-center justify-center gap-6 sm:gap-8 text-center">
            <div className="text-center space-y-2">
              <p className="text-sm sm:text-base text-[var(--foreground-muted)]">
                Based on the original{' '}
                <a
                  href="https://github.com/hoodini/nano-banana-ui"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--neon-cyan)] hover:text-[var(--neon-purple)] font-bold transition-colors hover:underline"
                >
                  Nano Banana UI
                </a>
                {' '}by Yuval Avidani
              </p>
              <p className="text-xs sm:text-sm text-[var(--foreground-muted)]">
                A significantly reworked fork — not affiliated with or endorsed by the original author
              </p>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
              <a
                href="https://ai.google.dev/gemini-api/docs/image-generation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-[var(--background-glass)] border border-white/10 hover:border-[var(--neon-cyan)] text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)] transition-all hover:shadow-[var(--glow-cyan)]"
              >
                📚 API Docs
              </a>
              <a
                href="https://github.com/hoodini/nano-banana-ui"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-[var(--background-glass)] border border-white/10 hover:border-[var(--neon-purple)] text-[var(--foreground-muted)] hover:text-[var(--neon-purple)] transition-all hover:shadow-[var(--glow-purple)]"
              >
                💻 GitHub
              </a>
              <a
                href="https://linktr.ee/yuvai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-[var(--background-glass)] border border-white/10 hover:border-[var(--banana-yellow)] text-[var(--foreground-muted)] hover:text-[var(--banana-yellow)] transition-all hover:shadow-[0_0_20px_rgba(255,237,78,0.3)]"
              >
                🔗 LinkTree
              </a>
            </div>
          </div>

          {/* Powered by section */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-[var(--foreground-muted)]">
              Powered by <span className="font-semibold text-[var(--neon-cyan)]">Google Gemini 2.5 Flash</span> & <span className="font-semibold text-[var(--neon-purple)]">Gemini 3 Pro</span> Image Generation
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  // Suspense boundary required because Studio reads the URL via nuqs/useSearchParams.
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}
