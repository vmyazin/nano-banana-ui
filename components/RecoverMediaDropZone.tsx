'use client';

import { useId, useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useFileDrop } from '@/lib/drop/use-file-drop';
import { isVideoFile } from '@/lib/video-frame';
import { repairRecordFromFile, type RepairSucceeded } from '@/lib/timeline/repair';

interface RecoverMediaDropZoneProps {
  recordId: string;
  /** Fires only on success, so the caller can re-resolve the clip. */
  onRepaired: (result: RepairSucceeded) => void;
  /** Tighter treatment for the horizontal track's narrow clip blocks. */
  compact?: boolean;
}

/**
 * The one thing the app can do about a dead provider URL: take the file back.
 *
 * Both a button and a drop target, because a clip block in the track is too
 * small to be a comfortable drag destination while a library card is a natural
 * one, and neither affordance alone covers both. The same component serves the
 * library, the vertical list and the track so a repair behaves identically
 * wherever the user meets a broken clip.
 */
export default function RecoverMediaDropZone({
  recordId,
  onRepaired,
  compact = false,
}: RecoverMediaDropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repair = async (files: File[]) => {
    // A multi-file drop on a single clip is ambiguous; the first video wins
    // rather than silently repairing with whichever the browser ordered last.
    const file = files.find(isVideoFile) ?? files[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const result = await repairRecordFromFile(recordId, file);
      if (result.status === 'rejected') {
        // Stays inline: a rejected file leaves the clip broken, so this zone
        // is still on screen to hold the message next to what it refers to.
        setError(result.message);
        return;
      }
      // A mismatch cannot be shown inline — the repair succeeds, the clip
      // flips to ready, and this zone unmounts on the same render, taking any
      // inline notice with it before it could be read. A toast outlives the
      // component, which is also how the rest of the app reports this class of
      // after-the-fact advisory.
      if (result.mismatch) toast.warning(result.mismatch);
      onRepaired(result);
    } finally {
      setBusy(false);
    }
  };

  const { isDragging, dropProps } = useFileDrop({
    onFiles: repair,
    onError: setError,
    disabled: busy,
  });

  return (
    <div
      {...dropProps}
      data-testid="recover-media"
      className={`rounded-md border border-dashed transition-colors ${
        isDragging
          ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
          : 'border-[var(--border-hover)] bg-black/20'
      } ${compact ? 'p-1.5' : 'p-2'}`}
    >
      <label
        htmlFor={inputId}
        className={`flex cursor-pointer items-center justify-center gap-1.5 text-[var(--foreground-muted)] hover:text-[var(--foreground)] ${
          compact ? 'text-[0.65rem]' : 'text-xs'
        }`}
      >
        {busy ? (
          <Loader2 size={compact ? 11 : 13} className="shrink-0 animate-spin" />
        ) : (
          <FileUp size={compact ? 11 : 13} className="shrink-0" />
        )}
        {busy ? 'Restoring…' : compact ? 'Replace file' : 'Replace file — drop it here or browse'}
      </label>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // Reset first: picking the same file twice in a row fires no change
          // event otherwise, which reads as the retry silently doing nothing.
          event.target.value = '';
          if (picked.length > 0) void repair(picked);
        }}
      />

      {error && (
        <p role="alert" className={`mt-1 text-red-300 ${compact ? 'text-[0.6rem]' : 'text-[0.7rem]'}`}>
          {error}
        </p>
      )}

    </div>
  );
}
