'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Library, X } from 'lucide-react';

import GalleryGrid from '@/components/GalleryGrid';
import { useGalleryStore } from '@/store/useGalleryStore';

interface LibraryOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LibraryOverlay({ open, onOpenChange }: LibraryOverlayProps) {
  const records = useGalleryStore((state) => state.records);
  const storageError = useGalleryStore((state) => state.storageError);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
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
            className="glass-card relative max-h-[90vh] w-full max-w-4xl overflow-y-auto p-6 outline-none sm:p-7"
          >
            <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[var(--neon-cyan)] to-transparent" />

            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-lg border border-[var(--border)] p-1.5 text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
            >
              <X size={18} />
            </button>

            <div className="mb-5 flex items-center gap-3 pr-10">
              <div className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--neon-cyan)]/10 p-2.5">
                <Library className="text-[var(--neon-cyan)]" size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="display text-xl font-semibold text-[var(--foreground)]">Library</h2>
                <p className="text-sm text-[var(--foreground-muted)]">
                  Results kept in this browser, outliving the provider links they came from
                </p>
              </div>
            </div>

            {storageError && (
              <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {storageError}
              </p>
            )}

            <GalleryGrid onUsedReference={close} />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--foreground-subtle)]">
                {records.length} result{records.length === 1 ? '' : 's'} · {formatBytes(stored)} stored
                {quota ? ` · ${formatBytes(quota.quota - quota.usage)} free in this browser` : ''}
              </p>
              {records.length > 0 && (
                <button
                  type="button"
                  onClick={() => void useGalleryStore.getState().clear()}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Clear library
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
