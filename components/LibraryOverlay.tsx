'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Library, X } from 'lucide-react';

import AccountLibrary from '@/components/account/AccountLibrary';
import { useAccountStore } from '@/store/useAccountStore';
import GalleryGrid from '@/components/GalleryGrid';
import PromptLibraryList from '@/components/PromptLibraryList';
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog';
import { useAppStore } from '@/store/useAppStore';
import { useGalleryStore } from '@/store/useGalleryStore';

interface LibraryOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose?: 'browse' | 'pick-image';
  referenceLimit?: number;
  /**
   * Section to land on. Only read on mount — the page remounts this overlay
   * (keyed on the tab) when ⌘K aims at a different section, which is the
   * lint-clean way to reset the tab without a setState-in-effect.
   */
  initialTab?: 'results' | 'prompts';
}

function formatBytes(bytes: number) {
  const units = ['KB', 'MB', 'GB', 'TB'];
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export default function LibraryOverlay({
  open,
  onOpenChange,
  initialTab = 'results',
  purpose = 'browse',
  referenceLimit,
}: LibraryOverlayProps) {
  const account = useAccountStore(state => state.status === 'ready' ? state.session?.account : null);
  const [source, setSource] = useState<'auto' | 'browser' | 'cloud'>('auto');
  const cloud = Boolean(account) && source !== 'browser';
  const records = useGalleryStore((state) => state.records);
  const storageError = useGalleryStore((state) => state.storageError);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [tab, setTab] = useState<'results' | 'prompts'>(initialTab);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isImagePicker = purpose === 'pick-image';

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useAccessibleDialog({ open, onClose: close, dialogRef: panelRef });

  useEffect(() => {
    if (!open) return;
    void useGalleryStore.getState().hydrate();
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined && estimate.quota !== undefined) {
        setQuota({ usage: estimate.usage, quota: estimate.quota });
      }
    });
  }, [open]);

  const convertLibraryImages = useAppStore((state) => state.convertLibraryImages);
  const setConvertLibraryImages = useAppStore((state) => state.setConvertLibraryImages);

  const stored = records.reduce((total, record) => total + record.bytes, 0);
  const storedImages = records.filter((record) => record.kind === 'image' && Boolean(record.blob));
  const dialogTitle = isImagePicker ? 'Choose from library' : 'Library';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-md sm:items-center sm:p-4"
          onClick={close}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="dialog-panel dialog-mobile-sheet dialog-touch-targets relative flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden outline-none sm:max-h-[90vh]"
          >
            <header className="flex items-start gap-3 border-b border-[var(--border)] px-3.5 py-3 sm:px-4">
              <Library className="mt-0.5 shrink-0 text-[var(--neon-cyan)]" size={18} />
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">{dialogTitle}</h2>
                <p id={descriptionId} className="text-[0.9375rem] text-[var(--foreground-muted)]">
                  {isImagePicker
                    ? 'Stored images available as a frame for this clip'
                    : account ? 'Your cloud library and the results stored on this device' : 'Results kept in this browser after the provider links expire'}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              >
                <X size={18} />
              </button>
            </header>

            <div className="dialog-scroll-region min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5 sm:px-4">
            {!isImagePicker && (
              <div role="tablist" aria-label="Library sections" className="mb-4 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
                {(['results', 'prompts'] as const).map((name) => (
                  <button
                    key={name}
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className={`flex-1 rounded-lg px-3 py-2 text-[0.9375rem] capitalize transition-colors ${
                      tab === name
                        ? 'bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)]'
                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {account && (isImagePicker || tab === 'results') && (
              <div role="group" aria-label="Library source" className="mb-4 flex gap-2">
                {(['cloud', 'browser'] as const).map(value => (
                  <button key={value} type="button" aria-pressed={cloud === (value === 'cloud')}
                    onClick={() => setSource(value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${cloud === (value === 'cloud') ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100' : 'border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}>
                    {value === 'cloud' ? 'Cloud account' : 'This browser'}
                  </button>
                ))}
              </div>
            )}

            {!cloud && storageError && (
              <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[0.9375rem] text-red-200">
                {storageError}
              </p>
            )}

            {cloud && account && (isImagePicker || tab === 'results') ? (
              <AccountLibrary key={account.id} ownerId={account.id} mode={isImagePicker ? 'pick-image' : 'browse'} referenceLimit={referenceLimit} onUsedReference={close} />
            ) : isImagePicker ? (
              <GalleryGrid
                mode="pick-image"
                onUsedReference={close}
                referenceLimit={referenceLimit}
              />
            ) : tab === 'results' ? (
              <GalleryGrid onUsedReference={close} />
            ) : (
              <PromptLibraryList onInserted={close} />
            )}
            </div>

            {(!cloud || (!isImagePicker && tab === 'prompts')) && <footer className="dialog-safe-footer flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-3.5 py-3.5 sm:px-4">
              <p className="text-[0.9375rem] text-[var(--foreground-muted)]">
                {isImagePicker ? (
                  <>{storedImages.length} stored image{storedImages.length === 1 ? '' : 's'}</>
                ) : (
                  <>
                    {records.length} result{records.length === 1 ? '' : 's'} · {formatBytes(stored)} stored
                    {quota ? ` · ${formatBytes(quota.quota - quota.usage)} free in this browser` : ''}
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {!isImagePicker && (
                  <label className="flex items-center gap-2 text-[0.8125rem] text-[var(--foreground-muted)]">
                    <input
                      type="checkbox"
                      checked={convertLibraryImages}
                      onChange={(event) => setConvertLibraryImages(event.target.checked)}
                      className="h-4 w-4 accent-[var(--neon-cyan)]"
                    />
                    {/* Opt-out, not opt-in: this is the one conversion that cannot
                        be undone — the original bytes are replaced on disk. */}
                    <span>
                      Store images compressed
                      <span className="ml-1 text-[var(--foreground-subtle)]">(re-encodes PNG)</span>
                    </span>
                  </label>
                )}
                {!isImagePicker && records.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void useGalleryStore.getState().clear()}
                    className="btn-secondary px-3 py-1.5 text-sm"
                  >
                    Clear library
                  </button>
                )}
              </div>
            </footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
