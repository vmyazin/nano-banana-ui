'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen view of a single result.
 *
 * Portaled to <body> so it escapes the z-10 stacking context of <main> and
 * covers the header and footer, and shared by every workspace that shows an
 * image: a result is worth looking at closely wherever it was generated.
 */
export default function ImageLightbox({
  src,
  open,
  onClose,
  onDownload,
  alt = 'Generated image, full size',
}: {
  src: string | null | undefined;
  open: boolean;
  onClose: () => void;
  /** Offers a download from inside the overlay when the caller has one. */
  onDownload?: () => void;
  alt?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md sm:p-5"
        >
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-4 top-4 rounded-lg border border-[var(--border)] p-2 text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
          >
            <X size={22} />
          </button>
          <motion.img
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2 }}
            src={src}
            alt={alt}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
          {onDownload && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDownload();
              }}
              className="btn-secondary absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2"
            >
              <Download size={18} />
              Download
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
