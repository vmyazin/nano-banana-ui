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
