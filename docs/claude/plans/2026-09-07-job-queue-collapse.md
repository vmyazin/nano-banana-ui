# Plan — the job queue collapses to a count

Spec: `docs/claude/specs/2026-09-07-job-queue-collapse-design.md`
Date: 2026-09-07

## File map

| Path | Target | Change |
| --- | --- | --- |
| `components/account/JobQueueOverlay.tsx` | after the `shown` filter | Pill when nothing is active; card unchanged otherwise |
| `components/account/AccountConsole.tsx` | `filter` state, results container | Seed `attention` from `#jobs`; `id="jobs"` to land on |
| `lib/account/use-library.ts` | the post-fetch write | `applyJobs` back into the session store |
| `tests/account/job-queue-overlay.test.tsx` | 3 cases | Rewrite to the new contract; add count + singular + expanded |
| `tests/account/job-queue-deeplink.test.tsx` | new | The link opens on the attention filter |

## Do not modify

- `lib/account/job-status.ts`, `store/useJobQueueStore.ts`
- `components/account/CloudJobList.tsx`
- Any job route, or `cloud/`

## Tasks

- [x] **1. Collapse.** Pill with a count when `!shown.some(isActiveJob)`, linking
      to `/account#jobs`. Verify: `npx vitest run tests/account/job-queue-overlay.test.tsx`
- [x] **2. Landing.** Seed the console filter from `#jobs` in the `useState`
      initializer — not an effect, which the repo lints against and which would
      show the wrong panel first. Verify: `npx eslint components/account/AccountConsole.tsx`
- [x] **3. One number.** `useAccountLibrary` writes jobs back through
      `applyJobs` so settling one updates the count at once.
- [x] **4. Full check.** `npx vitest run && npx tsc --noEmit && npx eslint … && npx next build`
- [x] **5. Smoke test** on port 3115 / worker 8815, against two stuck jobs seeded
      into local D1 to reproduce the reported state exactly.

## Note

`AccountLibrary` was edited first by mistake — it renders only inside the
Library overlay, never on `/account`, which is `AccountConsole`. Reverted.
