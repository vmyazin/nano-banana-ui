'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Command as CommandIcon, Film, Key, Library as LibraryIcon, Volume2, VolumeX } from 'lucide-react';

import ApiKeyConfig from '@/components/ApiKeyConfig';
import { BrandWordmark } from '@/components/BrandMark';
import { CommandPalette } from '@/components/CommandPalette';
import LibraryOverlay from '@/components/LibraryOverlay';
import { brand } from '@/lib/brand';
import { setChimeEnabled } from '@/lib/notify/chime';
import { useAppStore } from '@/store/useAppStore';
import { useConnectionsDialog } from '@/store/useConnectionsDialog';

interface StudioHeaderProps {
  /** Which workspace reads as current. */
  active: 'image' | 'video' | 'timeline';
  /**
   * How the studio switches workspaces in place. Omitted by routes that reach
   * the studio by navigating instead — the editor has its own page, so its
   * Image and Video pills are links rather than buttons there.
   */
  onSelectWorkspace?: (next: 'image' | 'video') => void;
  /**
   * Run edge to edge instead of the studio's centred column. The editor's
   * panels are full-bleed, and the wordmark has to line up with the clip rail
   * beneath it — the same rule `AccountPageShell` follows for the console.
   */
  fullBleed?: boolean;
  /** The column the studio centres on. Ignored when `fullBleed`. */
  columnWidth?: string;
  /**
   * The generation chime. A studio control: it announces that a *generation*
   * finished, and the editor generates nothing.
   */
  showChime?: boolean;
  /** Workspace-specific controls, rendered before the shared cluster. */
  actions?: ReactNode;
}

/**
 * The app's header, and the three dialogs it opens.
 *
 * It was inline in `app/page.tsx` until the timeline moved to its own route and
 * needed the same chrome. The dialogs came with it rather than staying behind:
 * `LibraryOverlay`, `CommandPalette` and `ApiKeyConfig` are opened *only* from
 * this header, so leaving them on the page would have meant every route that
 * renders the header re-declaring all three — and the library overlay in
 * particular is how clips reach the timeline, so a route without it is a route
 * where the header's Library button quietly does nothing.
 *
 * The one thing that still crosses the boundary is the connections dialog: a
 * workspace missing a key asks for it focused on that provider. That request
 * travels through `useConnectionsDialog` rather than a prop.
 */
export default function StudioHeader({
  active,
  onSelectWorkspace,
  fullBleed = false,
  columnWidth = 'max-w-7xl',
  showChime = true,
  actions,
}: StudioHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const apiKey = useAppStore((s) => s.apiKey);
  const kieApiKey = useAppStore((s) => s.kieApiKey);
  const falApiKey = useAppStore((s) => s.falApiKey);
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const chimeOnComplete = useAppStore((s) => s.chimeOnComplete);
  const hasKey = hasHydrated && !!(apiKey || kieApiKey || falApiKey);

  const keyDialogOpen = useConnectionsDialog((s) => s.open);
  const keyDialogFocus = useConnectionsDialog((s) => s.focusProvider);
  const openConnections = useConnectionsDialog((s) => s.openConnections);
  const setKeyDialogOpen = useConnectionsDialog((s) => s.setOpen);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // ⌘K can aim at either library section; the header button always opens results.
  const [libraryTab, setLibraryTab] = useState<'results' | 'prompts'>('results');
  const openLibrary = (tab: 'results' | 'prompts' = 'results') => {
    setLibraryTab(tab);
    setLibraryOpen(true);
  };

  const pill = 'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm';
  const idle = 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]';

  return (
    <>
      {/* Header — sticky, hairline border, backdrop blur (Linear/Vercel nav) */}
      <header className="sticky top-0 z-50 shrink-0 border-b border-[var(--border)] bg-[hsl(var(--tint-hue)_38%_5%/0.72)] backdrop-blur-xl">
        <div
          className={`w-full px-6 py-3.5 sm:px-8 md:px-12 md:py-4 lg:px-16 ${
            fullBleed ? '' : `${columnWidth} mx-auto`
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              aria-label="Go to Scene Assembly home"
              className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="brand-mark flex min-w-0 items-center gap-2.5"
              >
                <h1 className="flex min-w-0">
                  <span className="sr-only">{brand.name}</span>
                  <BrandWordmark className="h-8 w-auto flex-shrink-0 text-[var(--foreground)] sm:h-9" />
                </h1>
                <span className="hidden h-3.5 w-px bg-[var(--border-hover)] md:inline-block" />
                <span className="eyebrow hidden md:inline">{brand.tagline}</span>
              </motion.div>
            </Link>

            {/* Buttons where the studio swaps a workspace in place, links where
                the destination is a different route — so ⌘-click on Timeline
                opens the editor in a tab, the way every other link here does. */}
            <nav
              aria-label="Workspace"
              className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]/70 p-1"
            >
              {onSelectWorkspace ? (
                <button
                  type="button"
                  onClick={() => onSelectWorkspace('image')}
                  className={`${pill} ${active === 'image' ? 'bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]' : idle}`}
                >
                  Image
                </button>
              ) : (
                <Link href="/" className={`${pill} ${idle}`}>
                  Image
                </Link>
              )}

              {onSelectWorkspace ? (
                <button
                  type="button"
                  onClick={() => onSelectWorkspace('video')}
                  className={`${pill} ${active === 'video' ? 'bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]' : idle}`}
                >
                  Video
                </button>
              ) : (
                <Link href="/?workspace=video" className={`${pill} ${idle}`}>
                  Video
                </Link>
              )}

              {active === 'timeline' ? (
                <span
                  aria-current="page"
                  title="Timeline"
                  className={`${pill} flex items-center gap-1 bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]`}
                >
                  <Film size={13} className="sm:hidden" aria-hidden />
                  <span className="hidden sm:inline">Timeline</span>
                </span>
              ) : (
                <Link href="/timeline" title="Timeline" className={`${pill} ${idle} flex items-center gap-1`}>
                  <Film size={13} className="sm:hidden" aria-hidden />
                  <span className="hidden sm:inline">Timeline</span>
                </Link>
              )}
            </nav>

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex flex-shrink-0 items-center gap-2"
            >
              {actions}

              <button
                onClick={() => openLibrary()}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-2.5 py-2 text-xs text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
                title="Kept results and saved prompts"
              >
                <LibraryIcon size={13} />
                <span className="hidden sm:inline">Library</span>
              </button>

              {showChime && (
                <button
                  onClick={() => setChimeEnabled(!chimeOnComplete)}
                  className="hidden items-center rounded-[9px] border border-[var(--border)] px-2.5 py-2 text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] sm:inline-flex"
                  title={chimeOnComplete ? 'Mute the chime when a generation finishes' : 'Play a chime when a generation finishes'}
                  aria-label={chimeOnComplete ? 'Mute the chime when a generation finishes' : 'Play a chime when a generation finishes'}
                  aria-pressed={chimeOnComplete}
                >
                  {chimeOnComplete ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
              )}

              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-2.5 py-2 text-xs text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)] sm:inline-flex"
                title="Open command menu (⌘K)"
              >
                <CommandIcon size={13} />
                <span className="font-mono">K</span>
              </button>

              <button
                onClick={() => openConnections()}
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

      {/* API Key dialog (controlled by the header CTA, and by any workspace
          that asks for a provider through useConnectionsDialog) */}
      <ApiKeyConfig open={keyDialogOpen} onOpenChange={setKeyDialogOpen} focusProvider={keyDialogFocus} />

      {/* ⌘K command palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenApiKey={() => openConnections()}
        onOpenLibrary={openLibrary}
      />

      {/* Kept results and saved prompts */}
      {/* Keyed on the tab: ⌘K's "Saved prompts" remounts the overlay so it
          lands on that section instead of whatever was last selected. */}
      {/* A clip added from the library has nowhere visible to land unless the
          editor comes forward with it, so this is the one caller that follows
          the clip instead of only closing. Already on /timeline, closing is the
          whole of it — the clip lands on the rail behind the overlay. */}
      <LibraryOverlay
        key={libraryTab}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        initialTab={libraryTab}
        onAddedToTimeline={() => {
          setLibraryOpen(false);
          if (pathname !== '/timeline') router.push('/timeline');
        }}
      />
    </>
  );
}
