# PiAPI integration plan

Acceptance source: ../specs/2026-09-07-piapi-provider.md

## File map

- lib/providers/{piapi,types,catalog,index,browser}.ts:1-700 — adapter and metadata.
- lib/engines/{registry,docs}.ts:1-200; store/useAppStore.ts:1-270 — provider registration.
- components/{ProviderLogo,ProviderSelector,VideoWorkspace,ProviderVideoWorkspace,GenerationInterface,ApiKeyConfig}.tsx:1-1300 — existing UI integration.
- app/api/{generate,providers/video}/route.ts:1-250 — trusted request routing.
- lib/account/{contracts,key-import,job-label}.ts:1-120; cloud/src/{vault,providers}.ts:1-150; cloud/src/provider-adapters/aggregators.ts:1-150 — cloud tasks and keys.
- lib/spend/{resolve,capture,account,palette}.ts:1-280; lib/gallery/record-job.ts:1-100 — spend and media.
- public/providers/piapi.webp — official logo.
- tests/providers/piapi.test.ts; tests/spend/; cloud/tests/aggregators.test.ts — contracts and regressions.

Do not modify: other provider payloads, existing ledger records, deployment
secrets, unrelated temp/ and test-assets/ files, production enablement list.

## Tasks

- [x] Implement and test PiAPI request, upload, status and error contracts.
- [x] Register branding, connections, selections and controls in existing UI.
- [x] Connect cloud tasks, account keys, spend and library metadata.
- [x] Run app/Worker tests, typechecks, lint and production build.
- [x] Smoke-test provider selection, key dialog and settings on desktop/mobile locally; verify result parsing with mocked contract tests. Record real-provider verification limitations.

## Verification record — 2026-09-07

- App and Worker test suites, both TypeScript projects, changed-file ESLint and
  Next production build pass (final totals recorded in the task response).
- Browser smoke against the already-running localhost:3097 server: PiAPI provider
  selection and official logo; connection card focuses PiAPI; Veo audio changes an
  8-second estimate from $0.48 to $0.72; Kling exposes 3–15 seconds and numbered
  references; Nano Banana exposes 1K/2K/4K. Mobile width 390 has no horizontal
  overflow. The temporary dummy key was cleared and viewport reset afterward.
- Mocked transport tests cover uploads, hosted references, payment ambiguity,
  task statuses, finished image/video URLs, route settings and cloud task IDs.
- No real PiAPI credentials or paid generations were used. Production background
  enablement still requires a credentialed run of each model and reference mode,
  plus confirmation of actual output hosts. No commit, push or deployment made.

## Follow-up — Free-plan reference remediation

- [x] Verify Free plan, saved account key and balance in Brave without exporting credentials.
- [x] Prepare PiAPI enablement in cloud/wrangler.jsonc and remove unconditional
  background-generation advice from lib/providers/piapi.ts; update regression tests.
- [x] Validate Worker tests/typecheck and Wrangler dry-run; run targeted app tests.
  Passed: 154 Worker tests, 20 PiAPI tests, Worker TypeScript, targeted ESLint,
  diff whitespace checks and Wrangler 4.113 deployment dry-run.
- [x] Obtain deployment and paid-check approval (two test jobs, maximum $0.36).
- [x] Deploy the prepared Worker, verify PiAPI availability, and attempt the
  Nano Banana hosted-reference check in Brave; record the inconclusive result.
- [x] Kling check initially deferred; completed after the pre-network fault was proven and fixed (see corrected live run).
- [x] Leave enabled only after successful checks; otherwise restore the original
  provider list and record the actual failure. Do not repeat ambiguous tasks.

Brave findings: production account already has a PiAPI connection, PiAPI billing
shows Free plan and 0.44 credits, and the original draft remains in browser mode.

### Live attempt — 2026-09-07 local / 2026-09-08 UTC

- User approved Worker deployment and up to $0.36 for two checks. Enabled version:
  `923024c8-4664-4f34-b5b7-a9d0cef33a6b`. Brave confirmed background availability.
- At the user's request, attached `lone-traveler-desert-sunset-last-frame.png`
  from their open image folder. Submitted one Nano Banana 2 job, 1K, 16:9,
  warmer-lighting edit. Local job: `f60aef19-876c-43c6-9342-f67ea7817509`.
- Worker stored the reference and created one input capability, but the job
  became `needs_attention` / `submission_ambiguous` after 5.649 seconds with
  no provider task ID or result. This does not establish whether PiAPI's fetcher
  accepts the extensionless URL. No repeated submission was made.
- PiAPI history showed only an earlier finished Nano Banana job from 18:39 UTC,
  hours before this test. Balance was 5.44000 credits after a user-performed $5
  top-up; no new task or deduction was visible. Confirmed new spend: none;
  submission remains unresolved, so do not claim a guaranteed zero charge.
- Original video draft unchanged. Kling, tab-close autosave, output-host and
  spend-capture checks remain unverified. The generic workflow error hides the
  underlying adapter failure; further diagnosis needs safe submission-stage
  diagnostics rather than another paid attempt.


- Restored the original provider list and deployed rollback version
  `7e8c06f6-85cd-4deb-9ef6-dc4845c231fc`. Configuration regression tests pass.
  PiAPI background remains gated. Upload error copy is corrected locally and in
  the Worker bundle; no frontend push/deployment or commit was performed.

## Follow-up decision — 2026-09-08: non-billable diagnostics

User requested continued diagnosis. Temporarily extend the authenticated GET of
the specific unresolved PiAPI job in `cloud/src/job-routes.ts:30-45`, delegated to
`cloud/src/piapi-diagnostic.ts`, to test credential resolution and a GET-only
PiAPI task lookup. Return only status/type metadata, never keys, tokens, URLs,
vendor bodies or personal data. Keep provider enablement off. Remove the probe
and redeploy after diagnosis. Do not modify vault encryption, unrelated jobs,
frontend routing, or submit another paid task. Verify with Worker typecheck and
GET-only/owner-guard regression checks before deployment.

### Diagnosis and revised decision — 2026-09-08 UTC

Workerd reproduced `TypeError: Invalid redirect value` for `redirect: error`;
this runtime accepts only follow/manual. PiAPI transport threw before network
submission. The temporary owner-scoped GET probe likewise failed before the fix,
then returned HTTP 200/code 200/completed for an existing vendor task with manual
redirect handling, proving the saved key works from the Worker.

Fix boundary: `lib/providers/piapi.ts:18-40` uses manual redirects and rejects
HTTP 3xx plus browser opaque redirects before response parsing. Paid redirects
remain ambiguous (409), never automatically retried. Five regression cases cover
redirect rejection and preventing key forwarding/second submissions.
The temporary probe and route hooks are removed. The original job was never
submitted to PiAPI; resume the authorized two checks within $0.36 after enabling
the fixed Worker. This supersedes the prior stop-on-ambiguity for that original
pre-network runtime failure only. Other ambiguous requests must still not retry.

### Corrected live run — 2026-09-08 UTC

- Final enabled Worker: `6c15cd87-781b-49e5-8a2e-08924a16404a`.
- Nano Banana 2, 1K, auto-selected 9:16 matching the uploaded desert image:
  app job `7c8661b9-5a30-44fc-913b-0c531884ceee`, vendor task
  `84c5c5e0-6034-40d9-9661-20f06f15cf4b`. Saved after leaving the image
  workspace; one asset from `img.theapi.app`, exactly one $0.06 estimated
  ledger entry. PiAPI history independently reports $0.06000.
- Kling Omni reference mode, 3 seconds, 720p, audio off, same desert reference:
  app job `be63fc31-85b3-4c0c-b815-0eda0d054e68`, vendor task
  `a2cff4be-d20a-4e4a-b395-a0bb8feb10df`. PiAPI accepted the task at
  01:59:07 UTC and reports $0.30000. Submission tab was closed while it ran.
- Verification: 154 Worker tests and 25 PiAPI tests pass, Worker TypeScript and
  targeted ESLint pass. The original error reproduces directly in Miniflare
  with Workers compatibility date 2026-07-20. No unrelated provider uses
  `redirect: error` in the cloud/shared-provider paths.
- The original pre-network failure remains as a historical needs-attention job;
  no automated state reset or paid replay of that record was performed.

- Final outcome: Kling reached `saved`, output host `storage.theapi.app`,
  1,876,663 bytes, exactly one estimated $0.30 spend entry. A fresh Brave account
  tab shows its download control. Nano Banana saved 914,246 bytes. Both jobs
  released their reservations. Vendor history independently lists $0.06/$0.30;
  total authorized test cost is $0.36. PiAPI remains enabled.
- No Veo task was submitted. No frontend deployment, commit, push, subscription
  change or agent-performed top-up occurred. No temporary diagnostic code remains.
