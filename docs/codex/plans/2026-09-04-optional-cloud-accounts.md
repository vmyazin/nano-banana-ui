# Optional accounts and durable cloud generation — implementation plan

## Follow-up decision — 2026-09-04

The user approved the implementation plan, selected sign-in/sign-up as the first milestone, then authorized implementation of all steps and incremental commits. This overrides the original task order and the earlier no-commit condition. Account access must live on dedicated /sign-in and /sign-up pages with no new account calls to action in the existing layout; this supersedes guest promotional messaging in the studio. Shipping still requires localhost review and explicit sign-off.


Date: 2026-09-04
Status: Approved; implementation in progress
Acceptance source: ../specs/2026-09-04-optional-cloud-accounts-design.md

## File map

### Follow-up implementation boundary — remaining native adapters (2026-09-04)

Extend `lib/providers/runware.ts:75-205` with shared image submission and media polling; `lib/providers/atlas.ts:42-160` with reusable image submission and current prediction envelope parsing. Add `cloud/src/provider-adapters/aggregators.ts` for catalog-validated Runware/Atlas jobs and connect it through `cloud/src/providers.ts`. Reuse owner/revision resolution from the queued adapter. Tests cover native payloads, current and legacy response formats, invalid settings and single-attempt submission. Do not modify guest route semantics, provider model catalogs or existing layout in this milestone. Verify both typechecks, provider suites and Worker bundle.

Existing ranges measured in the planning worktree; refresh before edits:

| Target | Responsibility |
|---|---|
| store/useAppStore.ts:1-216 | Keep guest keys; expose account connection metadata separately |
| store/useGalleryStore.ts:1-219 | Local capture/import/cache integration |
| lib/gallery/storage.ts:1-73 | Preserve local contract; share suitable metadata types |
| lib/fal/server.ts:1-376 | Inspect reusable provider transport/input validation |
| lib/kie/browser.ts:1-88 | Guest/account request branching boundary |
| lib/providers/browser.ts:1-66 | Aggregator request branching boundary |
| lib/auth/accounts.ts:1-137, db.ts:1-83, guard.ts:1-66 | Inspect legacy gate; keep isolated |
| components/ApiKeyConfig.tsx:1-769 | Explicit cloud connection save and masked status |
| components/GalleryGrid.tsx:1-316 | Account library, save state and quota feedback |
| lib/spend/capture.ts:1-253 | Idempotent account result/spend integration |
| package.json:1-44 | One-command local service orchestration and focused test commands |
| docs/deployment.md:1-99 | Hosting, callback, binding, secrets and local divergences |
| cloud/** (new) | Worker, workflows, migrations, adapters and tests |
| lib/account/** (new) | Shared contracts, account client and cloud library client |
| store/useAccountStore.ts, store/useAccountJobsStore.ts (new) | Account session and job UI state |
| components/AccountMenu.tsx, AccountBenefits.tsx, StorageUsage.tsx (new) | Focused account controls |
| docs/codex/cloud-provider-capabilities.md (new) | Verified per-provider support and limits |
| scripts/dev-account-services.mjs (new), .dev.vars.example | Local bootstrap/emulation |
| AGENTS.md and existing mirrored instruction file | Route future account work to approved docs |

Workspace submit handlers must be located through the code graph during task 1, then their exact file/ranges appended before editing them. This is an explicit discovery prerequisite, not permission to rewrite all workspaces.

Do not modify: timeline rendering/encoding; image conversion algorithms; provider rates/catalog contents unrelated to capability metadata; prompt/layout animation components; existing guest auth requirements; unrelated main-checkout changes. Do not enable AUTH_ADMIN_EMAIL for the public app.

## Tasks

Follow-up lifecycle boundary (2026-09-05): add `cloud/src/lifecycle.ts`, `cleanup.ts`, migration 0006 and dedicated AccountDeletion control under account pages. DELETE profile revokes all sessions/connections and removes account metadata atomically, leaving only an owner-ID cleanup tombstone for the private R2 prefix. Queue ordinary asset object deletion persistently; scheduled cleanup retries failures and rescans deleted-account prefixes for late writes for 24 hours. Extend the fixed gateway allowlist, including Pollinations connection removal. Guest browser stores/layout remain unchanged. Verify cross-account denial, session/key erasure, failed and late object cleanup, and guest data preservation.

Milestone record (2026-09-05): enforce permanent library limits at capture/promotion with a 24-hour temporary overflow journal, bounded aggregate output, global job/input caps, expiry cleanup and explicit download deadlines. Saving known results remains possible if provider execution is disabled. Terminal job transitions and quota release are idempotent. Verification: 67 Worker tests, 15 focused account UI/client tests, both typechecks and focused lint passed; local seed verified real R2 staging, metadata reads and private ranged download after migration bootstrap. Full model-byte verification and broader orphan/account cleanup remain open.

Follow-up quota boundary (2026-09-05): `cloud/src/assets.ts:8-12,54-98` enforces library capacity when recording/promoting each result; `cloud/src/retention.ts` and migration 0005 track temporary overflow for 24 hours, permit private downloads, promote after space is freed, and clean expired files. Limit aggregate captured output to 1 GB per job and active jobs globally to 100 (three per account). `generation-runner.ts`, job routes/contracts and shared account result/library components expose storage-full and expiry explicitly. Existing reservation estimates remain placeholders until live model verification. Never delete a permanent asset to fit a new result; never rerun generation while retrying a save. Verify competing captures, partial outputs, expiry, promotion/deletion races and quota release.

Milestone record (2026-09-05): all native adapter boundaries are implemented behind explicit production configuration; common image and aggregator video workspaces now use account submission. Synchronous output staging/recovery, Gemini single-attempt transport, typed image MIME and Pollinations account-key support are covered. The original provider model IDs and guest transports remain available. Validation: 1,494 application tests, 59 Worker tests, both typechecks, lint (two existing warnings), Next production build and Worker dry-run passed. Browser smoke generated and saved a simulated Gemini image through the common workspace, using a dummy encrypted key. These checks do not complete credentialed provider acceptance, quota overflow, library/import/spend integration, deletion/cleanup or external service setup.

Follow-up provider contract decision (2026-09-05): current official Pollinations API docs require a bearer key for generation. Account execution uses an encrypted Pollinations key and `gen.pollinations.ai/image`; guest execution retains its existing classic endpoint. Extend `lib/engines/pollinations.ts:15-50` with reusable response transport, `vault.ts`/AccountConnections with account provider support and the synchronous adapter with streamed capture. Hide the existing free badge for Pollinations in account mode and show provider usage copy; no global account CTA. Live public model catalog returned HTTP 403 here, so credentialed contract smoke remains required before enabling production coverage.

Follow-up Comet boundary (2026-09-05): extend the existing cloud aggregator adapter with Comet's shared `/v1/videos` submit/status and synchronous image transport. `lib/providers/comet.ts:43-50,95-98,177-183` preserves documented `output_format` MIME and uses portable base64 decoding. Reuse bounded staging/recovery and private inline references; do not invent model IDs or change catalog coverage. Verify Comet payload/status fixtures, base64 result recovery and existing guest adapter tests.

Follow-up common image boundary (2026-09-05): `components/GenerationInterface.tsx:235-286,418-451,631-714,892-899,1202-1241` branches account submission ahead of guest mutation/key checks and reuses CloudExecutionNotice/CloudJobPanel. Move its existing feature prompt expansion into `lib/image/feature-prompt.ts` so guest and account payloads share exact wording. `lib/account/models.ts` holds fixed model IDs without importing server adapters into the browser. Do not change guest mutation success/capture logic, global navigation or feature layout. Verify image workspace guest suites plus account submission isolation and local fixture completion.

Follow-up synchronous boundary (2026-09-05): `lib/engines/gemini.ts:14-78` exposes single-attempt SDK configuration and actual reference/output MIME; `cloud/src/provider-adapters/synchronous.ts` reuses Gemini and Cloudflare transports; `cloud/src/provider-adapters/media.ts` owns bounded private reference reads and base64 staging/recovery. `generation-runner.ts` may recover a persisted synchronous output before treating submission as ambiguous. `jobs.ts` limits inline input totals before acceptance. No model upgrades, guest retry changes or new provider SDKs. Verify mocked HTTP attempt count, MIME fidelity, R2-success/D1-failure replay, Worker bundle and existing engine tests.

Milestone record (2026-09-05): Runware/Atlas now have catalog-validated durable image/video adapters, and the shared aggregator video workspace submits account jobs without writing guest job stores. Cloud video results reuse LastFrameActions. Atlas's shared parser supports its documented current envelope and legacy fixtures. Verification: 50 Worker tests; 121 provider/account UI tests; both typechecks; focused lint; Worker production dry-run. Local browser smoke confirmed guest key gating, account-encrypted-key messaging and explicit browser fallback. Real provider requests and external setup remain pending; providers stay configuration-gated.

Follow-up workspace boundary (2026-09-05): `components/ProviderVideoWorkspace.tsx:150-242,472-545,583-592,796-897` gets the shared account submit/gate/results branch. `components/account/CloudJobPanel.tsx` reuses existing `LastFrameActions` for saved videos; Kie/fal pass their existing continuation callback. Guest stores and polling retain their current behavior. Verify provider workspace suites and account tests, then local browser smoke.

- [ ] 1. Verify provider execution boundaries. Create docs/codex/cloud-provider-capabilities.md using current official vendor docs and existing adapters. List every engine/model family, runtime dependencies, output size/retention bounds, idempotency/reconciliation/cancellation support. Append exact workspace handler ranges to this plan. Specify reservation, overflow, temporary-input, and concurrency caps backed by supported limits. Verify: pnpm exec tsc --noEmit for any compatibility spike, and provider contract tests introduced in cloud/tests/providers. Do not advertise background support for unchecked adapters.

- [ ] 2. Scaffold local cloud foundation. Create cloud/wrangler.jsonc, cloud/src/index.ts, cloud/migrations/, scripts/dev-account-services.mjs, .dev.vars.example and named port entries in .claude/launch.json. Update package.json with dev orchestration and test:cloud. Bootstrap local schema on first use; keep production migrations explicit. Verify: npm run dev from wiped local service state, then curl http://localhost:8791/health; no Google/cloud/provider account required. Choose ports after checking for collisions.

- [ ] 3. Implement Google/session boundary. Create cloud/src/auth/, lib/account/client.ts, store/useAccountStore.ts, components/AccountMenu.tsx and app/api/account/[...path]/route.ts. Add D1 users/sessions migration and a production-disabled dev identity. Verify: pnpm test:cloud -- auth; cover invalid OAuth state, rejected token audience, session revocation, cookie forwarding, origin/CSRF checks and account isolation. Keep legacy lib/auth untouched unless a documented collision requires a targeted change.

- [ ] 4. Add encrypted connections. Create cloud/src/connections/ and migrations, modify ApiKeyConfig at the cloud-save boundary. Store ciphertext and encryption version; masked reads only. Verify: pnpm test:cloud -- connections; cover cross-account denial, ciphertext tampering, key rotation, removal during jobs and absence of plaintext in responses/logs. Verify guest connection entry still works.

- [ ] 5. Add durable job intake and quota ledger. Create cloud/src/jobs/, cloud/src/quota/, corresponding migrations and lib/account/contracts.ts. Persist idempotency keys, immutable payload digests, reservation/dispatch intent in one transaction. Add scheduled reconciliation. Verify: pnpm test:cloud -- jobs quota; race two final-space submissions, replay a token with changed input, and simulate crash before workflow dispatch. Acceptance must survive a failed dispatch call.

- [ ] 6. Deliver fal/Kie background vertical slice. Create cloud/src/workflows/generation.ts and cloud/src/providers/ adapters; reuse compatible validation/transport without importing browser state. Add account job store and branch the mapped submit handlers. Verify: pnpm test:cloud -- workflow providers; simulate provider acceptance followed by lost response/DB write, transient status errors, credential revocation and browser closure. Chargeable submission must not inherit default automatic retries.

- [ ] 7. Add private asset capture and lifecycle. Create cloud/src/assets/, cloud/src/uploads/ and paginated lib/account/library.ts. Implement streamed R2 writes, owner-checked read access, temporary input cleanup and deletion reconciliation. Verify: pnpm test:cloud -- assets; interrupt a transfer, repeat completion, simulate R2 success/D1 failure, quota overrun, account deletion and late completion. Existing saved assets must remain available at full quota.

- [ ] 8. Integrate library and guest messaging. Modify GalleryGrid, useGalleryStore and mapped workspace headers. Create AccountBenefits and StorageUsage. Add explicit import, partitioned caches, cloud deletion semantics and idempotent spend capture. Verify: pnpm test -- tests/account; browser smoke guest generation, Google/dev sign-in, opt-in import, autosave states, sign-out/account switch and cross-device library access. Reuse existing shared prompt/layout/result components.

- [ ] 9. Expand verified provider coverage. Implement remaining adapters identified in task 1. Keep an explicit support matrix; synchronous providers need their own crash/ambiguity handling. Verify each adapter's contract suite and credentialed end-to-end smoke when credentials are available. A narrower launch requires an explicit scope decision and honest UI; fal/Kie alone does not satisfy all-provider coverage.

- [ ] 10. Configure external services with the user. Using the browser, create the Google OAuth client/consent configuration, exact production and development callbacks, Cloudflare D1/R2/Workflow resources and restricted secrets. User handles authentication and any required billing consent. Update docs/deployment.md with repeatable steps and local divergences, excluding secret values. Verify migrations and bindings in an isolated environment, real Google login, one provider job with the tab closed, and later download. Production configuration is not a substitute for local smoke testing.

- [ ] 11. Complete release verification and documentation. Run pnpm test, pnpm test:cloud, pnpm lint and pnpm build. Update README security/account claims and AGENTS routing/mirror. Smoke affected pages on the registered localhost port and provide the review link. Stop before shipping until explicit user sign-off; commit/push only when requested, rebase onto current origin/main before an authorized push, and remove worktree/servers only after work is safely retained.

## Worktree setup

This planning worktree is .claude/worktrees/account-cloud-plan on codex/account-cloud-plan. Documentation-only planning needs neither dependencies nor a dev server. For implementation in a fresh worktree, from its root:

```sh
ln -s ../../../node_modules node_modules
cp ../../../.env.local .env.local
cp ../../../next-env.d.ts .
cp ../../../public/thumbnails/*.jpg public/thumbnails/ 2>/dev/null || true
```

Cloud dependencies may require a worktree-local install rather than changing the shared node_modules symlink. Keep service state and local variables gitignored. Never read or print copied secret contents during setup.

## Planning verification

Check document links, requirement coverage, scope consistency and whitespace with git diff --check. No application tests are necessary for this documentation-only change. Do not commit merely to satisfy the generic workflow; the repository explicitly requires a user request before committing.

## Milestone record — sign-in foundation

Implemented dedicated sign-in/sign-up pages, same-origin account gateway, Google OAuth with oauth4webapi, hashed revocable D1 sessions, development-only local identity, local zero-seed bootstrap, and separate Worker dependency lockfile. No existing studio markup changed. API and real Google configuration await external setup.

Validation: 127 application test files / 1,485 tests passed; 15 cloud auth tests passed; root and Worker typechecks passed; lint passed with two existing warnings; production build passed with existing legacy database tracing warning; Wrangler deploy dry-run succeeded. Browser smoke verified signup, persisted session, signout and a 390px mobile viewport. ES2018 TypeScript target resolves pre-existing dotAll-regex test errors revealed by typechecking; worktree-local Turbopack root prevents another checkout's dependencies being used.

The auth portion of task 3 is implemented, with real Google smoke remaining. Task 2 has D1/Worker local emulation; R2/Workflows follow next. Latest instructions authorize incremental commits, but no push/deployment.

## Milestone record — encrypted connections

Implemented masked connection listing, authenticated encryption with versioned keys, owner-scoped deletion and revision-aware resolution. Account pages reuse provider registry labels, the existing confirmation dialog, and a shared accent surface. Verified 19 cloud tests, both typechecks and focused lint; local browser smoke saved and removed a dummy connection through D1. Real key/provider validation is still pending.

## Milestone record — durable storage foundation

Implemented local R2/Workflows bindings, idempotent job intake with atomic quota reservations, dispatch reconciliation, non-retrying submission, resumable polling/saving, streamed multipart capture, owner-scoped paginated library access, byte-range downloads and deletion tombstones. Dedicated account pages reuse ResultStack and ConfirmDialog with a shared accented AccountSurface; existing studio layout remains unchanged.

Validation: 31 cloud tests passed (including quota races, ambiguous acceptance, replay and storage recovery), root and Worker typechecks and focused lint passed, Next production build and Wrangler dry-run passed. The checked-in local seed completed a Workflow, saved its fixture in R2 and verified an authenticated download. Browser smoke displayed the saved job and private asset. Native providers remain deliberately disabled pending their integration; this milestone does not complete provider coverage, imports, global cleanup or external setup.

## Milestone record — native queue adapter boundary

Added cloud/src/provider-adapters/queued.ts to reuse existing fal/Kie transports and catalogs. Encrypted connections resolve by owner and saved revision at execution time. Intake validates model/settings before submission; text-only adapters remain explicitly disabled unless CLOUD_GENERATION_PROVIDERS is configured. This is partial task 6, not all-provider launch coverage. Capability evidence and remaining limits are recorded in ../cloud-provider-capabilities.md.

Verification: 37 cloud tests pass, including native Kie submit/status, revoked connection rejection and a fal SDK upstream failure making exactly one network request. Worker typecheck and production bundle dry-run pass. Real provider calls were not made.

## Milestone record — private input staging and direct media

Implemented cloud/src/uploads.ts, media.ts and range.ts plus migration 0004. Native fal/Kie adapters can consume persisted references; immutable request references attach in the quota/intake transaction. Media capabilities scope access to one upload, active-job input, or saved asset. Account library file transfers now bypass Vercel's body/response limits. Added the reusable lib/account/client.ts transport boundary. No studio submission handlers changed in this milestone.

Validation: 42 cloud tests passed, including cross-owner denial, concurrent temporary quota reservations, byte limits, immutable ready uploads, active-input retention and revoked downloads. Root typecheck and existing account gateway tests passed; Wrangler production bundle succeeded. Real local seed verified direct upload and deletion plus private ranged download; browser displayed the library image. Pinned Wrangler after reproducing its reported newer proxy crash; local cron now runs through the dev supervisor.

Still required: account-aware studio submission, library/import integration, aggregate output limits and cleanup beyond input staging, all-provider coverage, real OAuth/provider configuration and release verification. Existing task checkboxes remain incomplete until the whole task's acceptance criteria are met.

## Follow-up implementation boundary — shared account execution

Next edits are limited to app/providers.tsx:1-44 (invisible session provider); components/KieGenerationWorkspace.tsx:73-410 and 596-693 (account submit branch/result rail); components/FalGenerationWorkspace.tsx:254-290,486-605,847-877 (same boundary); components/ApiKeyConfig.tsx:203-240,485-545 (saved-account section inside the existing dialog); and components/account, lib/account, store/useAccountStore.ts (shared execution/isolation code). Main app/page.tsx, guest job stores and existing provider polling components remain unchanged. Account submissions must never be inserted into a guest persisted job store. Verification: account store/hook tests, workspace guest suites, both typechecks and browser smoke.

## Milestone record — account-aware Kie/fal workspaces

Added the invisible session provider and memory-only owner-scoped account store, the reusable useCloudWorkspace submission hook, CloudExecutionNotice, CloudJobPanel/CloudJobList, and a shared account download helper. Kie image/video and fal video branches submit durable jobs without sending saved keys to the browser or inserting cloud jobs into guest stores. ConnectionGate/ConnectKeyCallout gained a storage description option; the existing key dialog focuses the saved-account field and labels browser-only keys separately. No global account CTA or app/page.tsx change was introduced.

Validation: full application suite passed (129 files / 1,491 tests), full lint passed with its two pre-existing warnings, production build passed with the existing legacy DB tracing warning, 43 cloud tests passed. Later focused account coverage adds delayed-session invalidation alongside token reuse, double-click coalescing, account switching, quota errors and guest-store isolation. Local browser smoke saved a dummy encrypted key, submitted a simulated image through the studio, navigated away while Generating, found it Saved in the account library, then signed out and verified account content disappeared. The fixture mode cannot run in production and made no vendor call.

Remaining scope is unchanged: common image and aggregator video workspaces, all native provider adapters, account library/import/spend integration, output quota/cleanup policy, external Google/Cloudflare setup and release sign-off are still required.

### 2026-09-05 account lifecycle verification

Account deletion and queued object cleanup implemented and locally verified: 72 Worker tests, 16 account client tests, both typechecks and focused lint pass. Browser deletion of the fixture account returned to guest state; recreation had zero bytes and no saved connections. Production setup and credentialed provider checks remain pending.

### 2026-09-05 library reuse implementation boundary

Task 8 integration uses `components/LibraryOverlay.tsx:1-220` to expose cloud and browser sources only inside the existing library. `components/account/AccountLibrary.tsx:1-100`, new `CloudAssetGrid.tsx` and `lib/account/use-library.ts` share owner-scoped pagination, deletion, downloads and reference selection. `lib/account/reference.ts` uses the existing prepareReferences/addReferences boundary and rejects account switches during downloads. Do not modify guest GalleryStorage, gallery persistence, existing global navigation or provider layouts. Verify with account and gallery tests, both typechecks, lint and the local existing-library/reference-picker flow.

### 2026-09-05 cancellation and import boundaries

Queued cancellation is confined to `cloud/src/jobs.ts`, `job-routes.ts`, `generation-runner.ts` and the gateway route allowlist. Only a queued, unsubmitted job can cancel, atomically releasing its reservation once. If submission wins, keep tracking the job and return an explicit conflict. Do not claim that already accepted vendor work was cancelled. Verify cancellation/replay, ownership and submission races in Worker and gateway tests.

Explicit browser-library imports use new `cloud/src/imports.ts`, migration 0007, schema/Worker wiring, then account-page import controls. Reserve permanent quota before direct R2 upload, journal a stable import ID and immutable metadata digest, resume interrupted transfers and finalize bytes exactly once. Completed/deleted import IDs cannot resurrect an asset. Expire abandoned reservations after 24 hours. Preserve all guest originals; no implicit history upload, provider calls or spend entries for imports. Verify image/video transfers, changed-payload replay, quota competition, expiry and account-deletion races. External setup remains pending.

### 2026-09-05 shared library and queued cancellation verification

Shared cloud library/picker and queued cancellation implemented. Independent parent checks: 78 Worker tests, 16 focused library/reference tests, six gateway tests, three job-state UI tests, root TypeScript and focused lint passed. Local browser verified cloud/browser separation, nested confirmation and choosing a cloud image into a video draft. Local seed passed private R2 staging/download/range checks after its deadline was corrected. Imports, cloud spend and external setup remain pending.

### 2026-09-05 account spend and import UI boundaries

Persistent account spend lives in migration 0008 and `cloud/src/spend.ts`, consuming immutable confirmed job results and sharing the canonical `lib/spend/resolve.ts` functions through a pure account entry builder. Generation save failures can still have a confirmed provider cost; ledger failures never interrupt saving. A bounded scheduled reconciler repairs missed entries. Tombstones prevent deleted entries from reappearing after reconciliation. Keep guest ledger storage separate and retain exact/estimated/unknown labels; account Pollinations/Cloudflare credentials do not imply free usage.

Account-page key and asset import controls use `AccountSurface` and the existing app/gallery stores as read-only sources. All selections start unchecked. The key import uses atomic if-absent writes so another device's saved connection cannot be overwritten. Asset uploads use stable import intent IDs and direct scoped Worker URLs. No history, key or file uploads occur simply because someone signed in. Parent assembly wires these controls only under the signed-in account pages, plus import/spend gateway routes and bounded metadata sizes.

### 2026-09-05 import recovery, ingress, and tracking follow-up

Import recovery now assigns a distinct object key and fenced attempt number after an interrupted upload. A stale transfer cannot overwrite or finalize the replacement, and superseded objects enter repeated cleanup. Bounded attempts and explicit terminal restart preserve stable IDs for uncertain responses. Metadata requests have streamed body ceilings and atomic owner/global rate budgets in migration 0009; capability file bodies remain streamed. Worker invocation URL logging is disabled because capability URLs contain secrets.

Needs-attention jobs now offer an explicit Stop tracking action. Its atomic state transition releases capacity once and races safely with resume. This does not cancel provider work, delete existing assets, or extend temporary-file deadlines. Spend views share the existing report components, retain loaded-history scope while paginating, and preserve the browser ledger during account-service outages. Destructive account callbacks reject stale owner/epoch scopes before sending requests.

Independent verification: full root suite passed 1,540 tests in 137 files; Worker suite passed 116 tests in 16 files; both typechecks, production build and Worker deployment dry-run passed. Root lint has zero errors and two existing warnings. The subsequent spend fallback/session regression suite passed ten tests and root TypeScript passed again. Fresh local D1/R2/Workflow state bootstrapped all nine migrations and the seed completed generation, private/ranged downloads, and an idempotent fixture import. Browser smoke verified unchecked explicit key import, masked saved credentials, and account library/source rendering. Real Google login, native provider billing/recovery tests, production bindings, measured model reservations, backup recovery exercise, and user localhost release sign-off remain open; these local checks do not satisfy those external acceptance criteria.

### 2026-09-05 final local integration and independent review

The Sol high review identified initial-import attempt-cap bypass, cleanup failure propagation, and orphaned terminal-job output. All are fixed. Migration 0010 journals a bounded oldest-first terminal-output sweep after a 24-hour grace with repeated late-write checks; live asset-backed files remain protected. Cleanup failures preserve retry metadata and cannot block other scheduled subsystems. New job intake blocks unresolved temporary overflow and includes retained terminal output in the global bound even after Stop tracking releases its active slot.

Final parent checks passed: 1,542 application tests in 137 files, 126 Worker tests, root and Worker TypeScript, full lint (zero errors, two existing warnings), Next production build, Worker production bundle dry-run, and the local seed with all ten migrations. Browser checks covered account sign-in/session, cloud/browser spend selection, explicit unchecked dummy-key import, masked listing, account-key removal preserving the browser original, and fixture cleanup. The earlier deletion, library, contextual image-reference and navigation-during-generation smoke checks remain applicable. See [security review](../account-security-review.md) for controls and external launch gates.

Local implementation is ready for review. Tasks 1/9 retain credentialed provider and measured-limit acceptance work; task 10 requires actual Google/Cloudflare setup with user login; task 11 retains production-like OAuth/provider/backup verification and explicit localhost release sign-off. No push or deployment has been performed.

### 2026-09-05 external setup preflight

Read-only CLI checks confirmed existing Cloudflare OAuth authentication with two accessible accounts. D1 and R2 inventories in both accounts contain no resources with the planned Scene Assembly names. The checked-in D1 binding remains a placeholder. Google Cloud CLI also has an active identity, but an accessible-project search for Scene Assembly/Nano Banana names and IDs returned no matches; that does not prove there is no suitable project under another name.

The next external action depends on user selection of the Cloudflare owning account and Google identity/project. Those choices were requested explicitly; do not infer ownership from whichever CLI identity happens to be active. No cloud resources, OAuth clients, secrets, billing settings, deployments, or production data were changed during this preflight. Existing authentication may avoid a fresh login once ownership is confirmed; the localhost release sign-off is still separately outstanding.
