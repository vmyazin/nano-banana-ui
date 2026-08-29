'use client';

import { useState } from 'react';
import { Library as LibraryIcon } from 'lucide-react';

import LibraryOverlay from '@/components/LibraryOverlay';

interface StoredImagePickerProps {
  referenceLimit: number;
}

/**
 * A shared entry point for adding a stored gallery image to the active draft.
 * The overlay and its local open state live here so generation workspaces only
 * need to provide the reference limit enforced by their selected model.
 */
export default function StoredImagePicker({ referenceLimit }: StoredImagePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="From library"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--neon-cyan)]/30 bg-[var(--neon-cyan)]/5 px-4 py-3.5 text-[var(--foreground-muted)] transition-colors hover:border-[var(--neon-cyan)]/60 hover:bg-[var(--neon-cyan)]/10 hover:text-[var(--neon-cyan)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] sm:w-36 sm:shrink-0"
      >
        <LibraryIcon aria-hidden="true" size={24} />
        <span className="text-sm font-medium">From library</span>
        <span className="text-[0.65rem] text-[var(--foreground-subtle)]">Stored images</span>
      </button>

      <LibraryOverlay
        open={open}
        onOpenChange={setOpen}
        purpose="pick-image"
        referenceLimit={referenceLimit}
      />
    </>
  );
}
