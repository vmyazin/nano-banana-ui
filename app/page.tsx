// app/page.tsx
'use client';

import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Check, Command as CommandIcon, Layers, Library as LibraryIcon, Film } from 'lucide-react';
import ApiKeyConfig from '@/components/ApiKeyConfig';
import LibraryOverlay from '@/components/LibraryOverlay';
import { usePromptLibraryStore } from '@/store/usePromptLibraryStore';
import FeatureSelector from '@/components/FeatureSelector';
import ProviderLogo from '@/components/ProviderLogo';
import { ENGINE_DOCS } from '@/lib/engines/docs';
import { CommandPalette } from '@/components/CommandPalette';
import VideoWorkspace from '@/components/VideoWorkspace';
import { Feature, FEATURES } from '@/types';
import { brand } from '@/lib/brand';
import { useAppStore } from '@/store/useAppStore';

// Lazy-load the heavy generation workspace so the landing bundle stays light.
const GenerationInterface = dynamic(() => import('@/components/GenerationInterface'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <div className="loading-spinner" />
    </div>
  ),
});

// Same pattern: the timeline workspace pulls in WebCodecs/mediabunny-adjacent
// code paths that have no business in the landing bundle.
const TimelineWorkspace = dynamic(() => import('@/components/TimelineWorkspace'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
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
    // Its own call: each persisted store defers hydration to avoid an SSR mismatch.
    void usePromptLibraryStore.persist.rehydrate();
  }, []);
  const hasKey = hasHydrated && !!(apiKey || kieApiKey || falApiKey);

  // View is driven by the URL (?feature=<id>) so it deep-links, supports
  // browser back/forward, and survives a refresh.
  const [featureId, setFeatureId] = useQueryState('feature', { history: 'push' });
  const [workspace, setWorkspace] = useQueryState('workspace', { history: 'push' });
  const [videoMode, setVideoMode] = useQueryState('videoMode', { history: 'push' });
  const activeWorkspace =
    workspace === 'video' ? 'video' : workspace === 'timeline' ? 'timeline' : 'image';
  const activeVideoMode =
    videoMode === 'image' || videoMode === 'frames' || videoMode === 'reference'
      ? videoMode
      : 'text';
  const selectedFeature: Feature | null =
    FEATURES.find((f) => f.id === featureId) ?? null;
  const selectFeature = (feature: Feature) => setFeatureId(feature.id);
  const clearFeature = () => setFeatureId(null);
  const selectWorkspace = (nextWorkspace: 'image' | 'video' | 'timeline') => {
    if (nextWorkspace === 'image') {
      void setWorkspace(null);
      return;
    }
    void setFeatureId(null);
    void setWorkspace(nextWorkspace);
  };
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // ⌘K can aim at either library section; the header button always opens results.
  const [libraryTab, setLibraryTab] = useState<'results' | 'prompts'>('results');
  const openLibrary = (tab: 'results' | 'prompts' = 'results') => {
    setLibraryTab(tab);
    setLibraryOpen(true);
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Header — sticky, hairline border, backdrop blur (Linear/Vercel nav) */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[hsl(var(--tint-hue)_38%_5%/0.72)] backdrop-blur-xl">
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
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${activeWorkspace === 'image' ? 'bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
              >
                Image
              </button>
              <button
                type="button"
                onClick={() => selectWorkspace('video')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${activeWorkspace === 'video' ? 'bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
              >
                Video
              </button>
              <button
                type="button"
                onClick={() => selectWorkspace('timeline')}
                title="Timeline"
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${activeWorkspace === 'timeline' ? 'bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}
              >
                <Film size={13} className="sm:hidden" aria-hidden />
                <span className="hidden sm:inline">Timeline</span>
              </button>
            </nav>

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <button
                onClick={() => openLibrary()}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-2.5 py-2 text-xs text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
                title="Kept results and saved prompts"
              >
                <LibraryIcon size={13} />
                <span className="hidden sm:inline">Library</span>
              </button>

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
                title={hasKey ? 'Update your API keys' : 'Add your API keys'}
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
                    <span className="hidden sm:inline">Add&nbsp;API&nbsp;Keys</span>
                    <span className="sm:hidden">Add&nbsp;Keys</span>
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
        onOpenLibrary={openLibrary}
      />

      {/* Kept results and saved prompts */}
      {/* Keyed on the tab: ⌘K's "Saved prompts" remounts the overlay so it
          lands on that section instead of whatever was last selected. */}
      <LibraryOverlay
        key={libraryTab}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        initialTab={libraryTab}
      />

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-4 sm:py-5 md:py-6">
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
                onInputModeChange={(mode) => void setVideoMode(mode === 'text' ? null : mode)}
                onExit={() => selectWorkspace('image')}
                onOpenConnections={() => setKeyDialogOpen(true)}
              />
            </motion.div>
          ) : activeWorkspace === 'timeline' ? (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <TimelineWorkspace onExit={() => selectWorkspace('image')} />
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
              className="w-full space-y-5 sm:space-y-6"
            >
              {/* Hero — compact: one headline line, then a single meta row.
                  The eyebrow pill is gone on purpose; it repeated the tagline
                  already sitting next to the product name in the nav. */}
              <div className="text-center space-y-2 sm:space-y-2.5 py-0 sm:py-1">
                <motion.h2
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="display text-2xl sm:text-3xl md:text-4xl font-semibold leading-[1.1] px-4 text-balance"
                >
                  <span className="gradient-text">Create stunning images</span>{' '}
                  <span className="text-[var(--foreground)]">with AI power</span>
                </motion.h2>

                {/* Blurb and engines share one row on desktop, stack on mobile. */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 }}
                  className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4"
                >
                  <p className="text-[0.8125rem] sm:text-sm text-[var(--foreground-muted)] max-w-xl leading-relaxed">
                    {brand.heroBlurb}
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="pill">
                      <ProviderLogo provider="gemini" size={13} className="text-emerald-400" />
                      Gemini
                    </span>
                    <span className="pill">
                      <ProviderLogo provider="pollinations" size={13} className="text-[var(--neon-purple)]" />
                      Pollinations
                    </span>
                    <span className="pill">
                      <ProviderLogo provider="cloudflare" size={13} className="text-[var(--brand-accent)]" />
                      Cloudflare
                    </span>
                  </div>
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
      <footer className="site-footer relative z-10 border-t border-[var(--border)] mt-8 sm:mt-10">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-6 sm:py-7">
          <div className="flex flex-col items-center justify-center gap-4 sm:gap-5 text-center">
            <div className="text-center space-y-1.5">
              <p className="text-[0.8125rem] text-[var(--foreground-muted)]">
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
              <p className="text-xs text-[var(--foreground-muted)]">
                {brand.description}
              </p>
            </div>
          </div>

          {/* Engines available — capability context, not product identity.
              Each one links to the docs you'd need to work with it directly. */}
          <div className="mt-6 pt-5 border-t border-[hsl(var(--tint)/0.05)] text-center">
            <p className="eyebrow mb-2">Engine docs</p>
            <ul className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
              {ENGINE_DOCS.map(({ id, label, href, accentClass }) => (
                <li key={id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background-glass)] px-2.5 py-1 font-medium text-[var(--foreground-muted)] transition-colors hover:border-current ${accentClass}`}
                  >
                    <ProviderLogo provider={id} size={13} />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
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
