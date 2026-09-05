# Optional accounts and durable cloud generation — implementation plan

## Follow-up decision — 2026-09-04

The user approved the implementation plan, selected sign-in/sign-up as the first milestone, then authorized implementation of all steps and incremental commits. This overrides the original task order and the earlier no-commit condition. Account access must live on dedicated /sign-in and /sign-up pages with no new account calls to action in the existing layout; this supersedes guest promotional messaging in the studio. Shipping still requires localhost review and explicit sign-off.


Date: 2026-09-04
Status: Approved; implementation in progress
Acceptance source: ../specs/2026-09-04-optional-cloud-accounts-design.md

## File map

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
