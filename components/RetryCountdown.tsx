'use client';

import { RotateCw, X } from 'lucide-react';
import { AUTO_RETRY_LIMIT, type PendingRetry } from '@/lib/providers/auto-retry';

interface RetryCountdownProps {
  /** Rendered only while an automatic attempt is queued. */
  retry?: PendingRetry | null;
  onCancel?: () => void;
}

/**
 * The one-line countdown to the attempt a workspace is about to make on its
 * own, with the control that calls it off. Deliberately small: the failure
 * above it is the message, this is the footnote.
 */
export default function RetryCountdown({ retry, onCancel }: RetryCountdownProps) {
  if (!retry) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-red-500/20 pt-2">
      <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-xs text-red-200/80">
        <RotateCw size={12} />
        Retrying in {retry.secondsRemaining}s · attempt {retry.attempt} of {AUTO_RETRY_LIMIT}
      </span>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel automatic retry"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-500/30 px-1.5 py-0.5 text-[0.6875rem] font-medium text-red-200 transition-colors hover:bg-red-500/15 hover:text-red-100"
      >
        <X size={11} /> Cancel
      </button>
    </div>
  );
}
