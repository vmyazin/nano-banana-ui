'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Library, X } from 'lucide-react';

import GalleryGrid from '@/components/GalleryGrid';
import PromptLibraryList from '@/components/PromptLibraryList';
import { useGalleryStore } from '@/store/useGalleryStore';

interface LibraryOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export default function LibraryOverlay({ open, onOpenChange }: LibraryOverlayProps) {
  const records = useGalleryStore((state) => state.records);
  const storageError = useGalleryStore((state) => state.storageError);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [tab, setTab] = useState<'results' | 'prompts'>('results');
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    void useGalleryStore.getState().hydrate();
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined && estimate.quota !== undefined) {
        setQuota({ usage: estimate.usage, quota: estimate.quota });
      }
    });
  }, [open]);

  // ApiKeyConfig predates these; a panel this size should not trap you inside it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const stored = records.reduce((total, record) => total + record.bytes, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-4 md:p-6"
          onClick={close}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Library"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="dialog-panel relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden outline-none"
          >
            <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <Library className="mt-0.5 shrink-0 text-[var(--neon-cyan)]" size={18} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Library</h2>
                <p className="text-[0.9375rem] text-[var(--foreground-muted)]">
                  Results kept in this browser, outliving the provider links they came from
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
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

            {storageError && (
              <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[0.9375rem] text-red-200">
                {storageError}
              </p>
            )}

            {tab === 'results' ? (
              <GalleryGrid onUsedReference={close} />
            ) : (
              <PromptLibraryList onInserted={close} />
            )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3.5 sm:px-6">
              <p className="text-[0.9375rem] text-[var(--foreground-muted)]">
                {records.length} result{records.length === 1 ? '' : 's'} · {formatBytes(stored)} stored
                {quota ? ` · ${formatBytes(quota.quota - quota.usage)} free in this browser` : ''}
              </p>
              {records.length > 0 && (
                <button
                  type="button"
                  onClick={() => void useGalleryStore.getState().clear()}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  Clear library
                </button>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
