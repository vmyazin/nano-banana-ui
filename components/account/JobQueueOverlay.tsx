'use client';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useAccountStore } from '@/store/useAccountStore';
import { useJobQueueStore } from '@/store/useJobQueueStore';
import { jobSummary } from '@/lib/account/job-label';
import { JOB_STATE_LABELS, JOB_STATE_TONES, isActiveJob, needsAttention } from '@/lib/account/job-status';

const LIMIT = 5;

/** A standing answer to "is anything still running?" for background jobs, which
 *  by design outlive the page that started them — the workspace rail that
 *  reported them is one navigation away from being gone.
 *
 *  Awareness only: cancel, resume and stop-tracking live in CloudJobList on
 *  /account, where they have the confirmation they need. Desktop only for now;
 *  a fixed corner card is the wrong shape for a phone.
 */
export default function JobQueueOverlay() {
  const jobs = useAccountStore(state => state.jobs);
  const dismissed = useJobQueueStore(state => state.dismissed);
  const dismiss = useJobQueueStore(state => state.dismiss);
  // Finished work leaves on its own; only what still needs a person is kept, and
  // only until they say they have seen it.
  const shown = jobs.filter(job => !dismissed.includes(job.id) && (isActiveJob(job) || needsAttention(job)));
  if (!shown.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Job queue"
      className="fixed bottom-4 right-4 z-40 hidden w-72 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] p-3.5 shadow-lg md:block"
    >
      <Link href="/account" className="display text-sm font-semibold hover:text-[var(--neon-cyan)]">
        Job Queue
      </Link>
      <ul className="mt-2 space-y-1.5">
        {shown.slice(0, LIMIT).map(job => (
          <li key={job.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-[var(--foreground-muted)]">{jobSummary(job.request)}</span>
            <span className="flex shrink-0 items-center gap-1">
              <span className={JOB_STATE_TONES[job.state]}>
                {job.state === 'failed' && job.errorCode === 'tracking_stopped' ? 'Tracking stopped' : JOB_STATE_LABELS[job.state]}
              </span>
              {needsAttention(job) && (
                <button
                  type="button"
                  onClick={() => dismiss(job.id)}
                  aria-label={`Dismiss ${jobSummary(job.request)}`}
                  title="Hide from this list. The job is not cancelled."
                  className="text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {shown.length > LIMIT && (
        <Link href="/account" className="mt-2 block text-xs text-[var(--foreground-muted)] underline underline-offset-2">
          +{shown.length - LIMIT} more
        </Link>
      )}
    </div>
  );
}
