# Plan: automatic retry for failed generations

Spec: `docs/superpowers/specs/2026-09-03-generation-auto-retry-design.md`

## File map

- create `lib/providers/route-error.ts`
- create `lib/providers/auto-retry.ts`
- create `components/RetryCountdown.tsx`, `components/SubmissionError.tsx`
- `lib/kie/browser.ts:parseKieResponse`
- `lib/providers/browser.ts:post`
- `lib/fal/browser.ts:requestFalRoute`
- `components/KieGenerationWorkspace.tsx` — `submit`, `setModel`, Generate button, error slot
- `components/FalGenerationWorkspace.tsx` — `submit`, Generate button, error slot
- `components/ProviderVideoWorkspace.tsx` — `submit`, Generate button, error slot
- `components/GenerationInterface.tsx` — `generateMutation`, `handleGenerate`, error slot

Do not modify: `lib/kie/queue.ts`, `lib/fal/queue.ts`, `components/*JobsProvider.tsx`,
`app/api/**`, any `catalog.ts`.

## Tasks

- [x] Shared `RouteError`/`routeStatus`; every browser client throws with a status.
      Verify: `npx vitest run tests/fal tests/kie tests/providers`
- [x] `useAutoRetry` + `isRetryableFailure`, with the countdown keyed per attempt
      so a new attempt always gets its own timers.
      Verify: `npx vitest run tests/providers/auto-retry.test.tsx`
- [x] `RetryCountdown` + `SubmissionError`; `role="alert"` on the message only.
- [x] Wire all four workspaces; reset on manual press and on success.
      Verify: `npx vitest run tests/providers/auto-retry-adoption.test.ts`
- [x] Behaviour tests per surface (Kie, aggregator, image).
      Verify: `npx vitest run && npx eslint . && npx tsc --noEmit`
