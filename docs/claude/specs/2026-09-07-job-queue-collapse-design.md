# The job queue collapses to a count

Status: Approved design
Date: 2026-09-07

## Context

Issue 16: two entries — "Needs attention" and "Tracking stopped", both from a
previous session — followed the reader across every page for an entire run,
permanently docked bottom-right, overlapping the footer and part of the Timeline.

`JobQueueOverlay` shows every job that `isActiveJob` **or** `needsAttention`.
The second set never resolves on its own, and `useJobQueueStore.dismissed` is
per-tab and unpersisted by design, so a reload rebuilt the list every time. The
result is a standing 288px card that a reader learns to ignore — the worst
possible home for "the provider may have charged for this".

That sentence is not in the card; it lives on the row in `CloudJobList`, on
`/account`. The card only carries the state label. What the card was doing was
keeping the reader aware of something they could not act on from there.

## Goals

- With nothing in flight, the queue is a count, not a list.
- The count leads to the one place those jobs can be resumed, cancelled or
  stopped, and that page arrives showing them.
- Settling a job there updates the count immediately.
- While something is genuinely running, the card keeps its present shape.

## Non-goals

- No change to what a job means, to `needsAttention`, or to any job action.
- No persistence of `dismissed`. It is deliberately a per-tab view state; the
  fix is that the card no longer needs it to stay tolerable.
- No new account surface. `AccountConsole` already lists these jobs behind its
  "Needs attention" filter, with resume, cancel, stop-tracking and remove. The
  gap was that nothing pointed at it.

## Design

**The card earns its size only while there is progress to report.** With no
active job it renders a pill — `N job(s) need(s) attention` — linking to
`/account#jobs`. With something in flight it is unchanged, unresolved rows
included, because then the list is describing something happening now.

**The link arrives on the right panel.** `AccountConsole` holds its filter in
local state defaulting to `all`, so a bare link would land on the asset grid and
make the count a dead end. The filter now initialises to `attention` when the
URL carries `#jobs`, read in the `useState` initializer rather than an effect:
the dashboard renders "Checking your account…" until the session resolves, so
the console only ever mounts in the browser, and a `setState` in an effect would
both cost a cascading render and trip the repo's lint rule.

**One number, one source.** The card counts from `useAccountStore`, which the
session provider polls on a slow heartbeat while nothing is active; the console
reads `useAccountLibrary`. Settling a job refreshed only the second, so the
count kept saying two for up to thirty seconds — the same stale number the
collapse exists to stop showing. `useAccountLibrary` now writes its jobs back
through `applyJobs`, which is owner- and epoch-guarded, so a stale page cannot
write into a newer account.

## Scope and implementation boundary

Lives in `components/account/JobQueueOverlay.tsx`,
`components/account/AccountConsole.tsx` (filter seed and an `id` to land on),
and `lib/account/use-library.ts` (the write-back).

Must not modify: `lib/account/job-status.ts`, `store/useJobQueueStore.ts`,
`components/account/CloudJobList.tsx`, or any job route.

## Acceptance

- Two unresolved jobs and nothing running render one pill, no rows.
- The pill links to `/account#jobs`, which opens on the attention filter with
  those jobs and their actions.
- Removing one there drops the count immediately.
- An active job restores the full card, unresolved rows included.

## Note on superseded tests

Three cases in `tests/account/job-queue-overlay.test.tsx` asserted that
unresolved jobs render as rows while nothing is running — exactly the behaviour
this removes. They are rewritten to the new contract: the count and its wording,
and the two that still concern row rendering now stage an active job so the card
is expanded, which is the only state where rows exist.
