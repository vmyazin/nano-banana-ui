# Automatic retry for failed generations

Status: Approved design
Date: 2026-09-03

## Context

A generation that fails at submission leaves a red sentence under the Generate
button — most often `<provider> is temporarily unavailable. Please try again.`
Kie, fal, Runware, Atlas and Comet all go away for seconds at a time, and the
only thing the person watching can do about it is press the button again. Every
workspace made them do that by hand.

## Goals

- A failed submission is sent again on its own after 10 seconds, up to 5 times.
- The countdown is visible, and cancellable from a small control beside it.
- The same behaviour in every generation workspace — all models, all providers.
- Only failures that never reached a decision are retried.

## Non-goals

- Retrying a *job* that the provider accepted and then failed (`state: 'fail'`).
  That work was billed and its failure is the provider's answer, not an outage.
- Backoff curves, jitter, or per-provider delays. One number, visible on screen.
- Retrying downloads, uploads outside a submission, credit reads, or example
  prompts.

## Behaviour

- Delay: 10s between attempts. Budget: 5 automatic attempts after the manual one.
- The budget starts over on a deliberate press of Generate and on a run that
  succeeds; a Kie model change also drops the queued attempt, because it belongs
  to the settings that failed.
- Cancelling drops the queued attempt but keeps the budget spent — the failure
  message stays on screen.
- Retryable: statuses 0 (never left the machine), 408, 425, 429, 500, 502, 503,
  504. Everything else — invalid key, no credits, content policy, rejected
  controls — fails identically five more times, and a retry would only bury the
  sentence explaining why.

## Known tradeoff

A submission that fails with no task ID cannot be reconciled: a 5xx the provider
actually accepted can be billed twice by the retry. No provider here offers an
idempotency key. The tradeoff is taken deliberately — the alternative is a person
re-pressing the button through an outage — and it is why the retryable set stops
at statuses where the request plausibly never reached a decision.

## Scope and implementation boundary

- `lib/providers/auto-retry.ts` — `useAutoRetry`, `isRetryableFailure`, the delay
  and the limit. The only place either number lives.
- `lib/providers/route-error.ts` — `RouteError`/`routeStatus`, so a status
  survives the client boundary.
- `components/RetryCountdown.tsx` and `components/SubmissionError.tsx` — the
  countdown row and the failure box that carries it.
- The four workspaces wire it: `GenerationInterface`, `KieGenerationWorkspace`,
  `FalGenerationWorkspace`, `ProviderVideoWorkspace`.

Must not touch: poll/queue modules (`lib/*/queue.ts`, the job providers), the
server routes, or any provider catalog.
