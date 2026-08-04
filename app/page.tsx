// app/page.tsx
'use client';

import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Check, Command as CommandIcon, Layers } from 'lucide-react';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import FeatureSelector from '@/components/FeatureSelector';
import { CommandPalette } from '@/components/CommandPalette';
import VideoWorkspace from '@/components/VideoWorkspace';
import { Feature, FEATURES } from '@/types';
import { brand } from '@/lib/brand';
import { useAppStore } from '@/store/useAppStore';

// Lazy-load the heavy generation workspace so the landing bundle stays light.
const GenerationInterface = dynamic(() => import('@/components/GenerationInterface'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <div className="loading-spinner" />
    </div>
  ),
});

function Studio() {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // API key lives in the persisted Zustand store (single source of truth).
  const apiKey = useAppStore((s) => s.apiKey);
  const kieApiKey = useAppStore((s) => s.kieApiKey);
  const falApiKey = useAppStore((s) => s.falApiKey);
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);
  const hasKey = hasHydrated && !!(apiKey || kieApiKey || falApiKey);

  // View is driven by the URL (?feature=<id>) so it deep-links, supports
  // browser back/forward, and survives a refresh.
  const [featureId, setFeatureId] = useQueryState('feature', { history: 'push' });
  const [workspace, setWorkspace] = useQueryState('workspace', { history: 'push' });
  const [videoMode, setVideoMode] = useQueryState('videoMode', { history: 'push' });
  const activeWorkspace = workspace === 'video' ? 'video' : 'image';
  const activeVideoMode = videoMode === 'image' ? 'image' : 'text';
  const selectedFeature: Feature | null =
    FEATURES.find((f) => f.id === featureId) ?? null;
  const selectFeature = (feature: Feature) => setFeatureId(feature.id);
  const clearFeature = () => setFeatureId(null);
  const selectWorkspace = (nextWorkspace: 'image' | 'video') => {
    if (nextWorkspace === 'video') {
      void setFeatureId(null);
      void setWorkspace('video');
      return;
    }
    void setWorkspace(null);
  };
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Header — sticky, hairline border, backdrop blur (Linear/Vercel nav) */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(8,8,11,0.72)] backdrop-blur-xl">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-3.5 md:py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              aria-label="Go to Scene Assembly home"
              className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="brand-mark flex items-center gap-2.5 min-w-0"
              >
                <div className="brand-mark-icon w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)] flex items-center justify-center flex-shrink-0 shadow-[0_2px_12px_-2px_rgba(0,245,255,0.35)]">
                  <Layers className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-black" aria-hidden />
                </div>
                <div className="min-w-0 flex items-center gap-2.5">
                  <h1 className="display text-base sm:text-lg font-semibold text-[var(--foreground)] truncate">
                    {brand.name}
                  </h1>
                  <span className="hidden md:inline-block h-3.5 w-px bg-[var(--border-hover)]" />
                  <span className="hidden md:inline eyebrow">{brand.tagline}</span>
                </div>
              </motion.div>
            </Link>

            <nav aria-label="Workspace" className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]/70 p-1">
              <button
                type="button"
                onClick={() => selectWorkspace('image')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${activeWorkspace === 'image' ? 'bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
              >
                Image
              </button>
              <button
                type="button"
                onClick={() => selectWorkspace('video')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${activeWorkspace === 'video' ? 'bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
              >
                Video
              </button>
            </nav>

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--border-hover)] rounded-[9px] px-2.5 py-2 transition-colors"
                title="Open command menu (⌘K)"
              >
                <CommandIcon size={13} />
                <span className="font-mono">K</span>
              </button>

              <button
                onClick={() => setKeyDialogOpen(true)}
                className={`${hasKey ? 'btn-secondary' : 'btn-primary'} text-sm`}
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
              </button>
            </motion.div>
          </div>
        </div>
      </header>

      {/* API Key dialog (controlled by the header CTA) */}
      <ApiKeyConfig
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
      />

      {/* ⌘K command palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenApiKey={() => setKeyDialogOpen(true)}
      />

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-6 sm:py-8 md:py-10">
        <AnimatePresence mode="wait">
          {activeWorkspace === 'video' ? (
            <motion.div
              key={`video-${activeVideoMode}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <VideoWorkspace
                inputMode={activeVideoMode}
                onInputModeChange={(mode) => void setVideoMode(mode === 'text' ? null : 'image')}
                onExit={() => selectWorkspace('image')}
                onOpenConnections={() => setKeyDialogOpen(true)}
              />
            </motion.div>
          ) : !selectedFeature ? (
            <motion.div
              key="picker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full"
            >
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
                  {brand.description}
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
                  {brand.heroBlurb}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="flex flex-wrap gap-2.5 justify-center pt-1"
                >
                  <span className="pill">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Gemini
                  </span>
                  <span className="pill">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--neon-purple)]" />
                    Pollinations
                  </span>
                  <span className="pill">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-accent)]" />
                    Cloudflare
                  </span>
                </motion.div>
              </div>

              {/* Feature Selector */}
              <FeatureSelector
                selectedFeature={selectedFeature}
                onFeatureSelect={selectFeature}
              />
            </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key={selectedFeature.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <GenerationInterface
                feature={selectedFeature}
                apiKey={apiKey}
                onBack={clearFeature}
                onOpenConnections={() => setKeyDialogOpen(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="site-footer relative z-10 border-t border-white/10 mt-10 sm:mt-12 md:mt-16">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-8 sm:py-10 md:py-12">
          <div className="flex flex-col items-center justify-center gap-6 sm:gap-8 text-center">
            <div className="text-center space-y-2">
              <p className="text-sm sm:text-base text-[var(--foreground-muted)]">
                <a
                  href={brand.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--neon-cyan)] hover:text-[var(--neon-purple)] font-bold transition-colors hover:underline"
                >
                  {brand.shortName}
                </a>
                {' '}— maintained by{' '}
                <a
                  href={brand.maintainer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--neon-cyan)] hover:text-[var(--neon-purple)] font-bold transition-colors hover:underline"
                >
                  {brand.maintainer.name}
                </a>
              </p>
              <p className="text-xs sm:text-sm text-[var(--foreground-muted)]">
                {brand.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 md:gap-5">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-[var(--background-glass)] border border-white/10 hover:border-[var(--neon-pink)] text-[var(--foreground-muted)] hover:text-[var(--neon-pink)] transition-all hover:shadow-[0_0_20px_rgba(255,0,110,0.3)]"
              >
                🔑 API Keys &amp; Billing
              </a>
              <a
                href="https://ai.google.dev/gemini-api/docs/image-generation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-[var(--background-glass)] border border-white/10 hover:border-[var(--neon-cyan)] text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)] transition-all hover:shadow-[var(--glow-cyan)]"
              >
                📚 API Docs
              </a>
              <a
                href={brand.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm font-medium px-4 py-2 rounded-lg bg-[var(--background-glass)] border border-white/10 hover:border-[var(--neon-purple)] text-[var(--foreground-muted)] hover:text-[var(--neon-purple)] transition-all hover:shadow-[var(--glow-purple)]"
              >
                💻 GitHub
              </a>
            </div>
          </div>

          {/* Engines available — capability context, not product identity */}
          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-[var(--foreground-muted)]">
              Engines:{' '}
              <span className="font-semibold text-[var(--neon-cyan)]">Gemini</span>
              {', '}
              <span className="font-semibold text-[var(--neon-purple)]">Pollinations</span>
              {', '}
              <span className="font-semibold text-[var(--brand-accent)]">Cloudflare</span>
              {' '}&amp; more
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
