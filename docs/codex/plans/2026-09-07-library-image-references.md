# Library image reference MIME repair plan

## Follow-up decision — 2026-09-07

The server-only implementation boundary is superseded by the spec follow-up: include the narrow Library metadata precheck exception, retaining strict Blob validation and all prepareReferences/owner guards.

## File map

- cloud/src/assets.ts:57-100 — preserve capture-validated MIME in D1.
- cloud/src/media.ts:32-54 — supported stored MIME fallback for generic legacy metadata.
- cloud/tests/bucket.ts:3-25 — model metadata-less multipart completion separately from stored object metadata.
- cloud/tests/workflow.test.ts:1-77 and focused media tests — regression coverage for new capture and legacy reads.
- lib/account/reference.ts:31-58 and tests/account/reference.test.ts — allow generic image records to reach strict downloaded-image validation.
- scripts/seed-account-demo.mjs:34-62 — assert full, range, and imported content response types.
- docs/codex/account-development.md — document capture type and legacy recovery invariants.
- .claude/launch.json — isolated web 3117 / Worker 8817 scenario.
- docs/codex/specs/2026-09-07-library-image-references.md — acceptance source.

Do not modify: frontend reference conversion or insertion, provider adapters, authentication, size/quota limits, database schema, production configuration, unrelated files, or the main checkout.

## Tasks

- [x] Create codex/library-image-references worktree; read account-development routing and trace capture through download.
- [x] Add focused regressions and observe their expected failures before implementation. Verify with cloud Vitest.
- [x] Implement capture MIME persistence and legacy response fallback; run affected tests and cloud typecheck.
- [x] Review the final diff independently; check owner/range and unsupported-type behavior.
- [x] Seed only local fixtures, make local fixture database MIME generic, and smoke-test Library and result reference actions at http://localhost:3117.
- [x] Record verification and prepare local review link.
- [x] User approved commit and deployment on 2026-09-07; both web and account Worker changes are required for rollout.

## Local setup

From the worktree:

```sh
pnpm install --frozen-lockfile --prefer-offline
pnpm --dir cloud install --frozen-lockfile
cp ../../../.env.local .env.local
cp ../../../next-env.d.ts .
cp ../../../public/thumbnails/*.jpg public/thumbnails/
cp cloud/.dev.vars.example cloud/.dev.vars
# Set DEV_FAKE_GENERATION=1 in cloud/.dev.vars, retaining local-only defaults.
ACCOUNT_WORKER_PORT=8817 npm run dev -- --port 3117
ACCOUNT_DEMO_ORIGIN=http://localhost:3117 node scripts/seed-account-demo.mjs
```

This session's bundled pnpm installed packages but exited 1 for ignored package build scripts. No dependency or lockfile changes were needed. Direct bundled Node runs work; prepend its directory to PATH so Turbopack can spawn Node. The runtime is /Users/vm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Initial missing-PATH Turbopack failure was resolved by restarting with that PATH and removing this worktree's generated .next cache.

## Verification record

Before fix: local seeded account assets were marked application/octet-stream in local D1 only. /account → Use as reference reproduced “Choose an image to use as a reference.” Full local seed passed before the MIME mutation. After fix: the same legacy record succeeds from both /account and Studio → Library, showing “Added as a reference” and Upload 1/Upload 2 in the editing draft.

- RED: cloud workflow tests had two expected failures (generic persisted MIME and generic legacy download header); frontend reference tests had two expected failures (legacy metadata blocked before fetch).
- GREEN: full cloud suite 149/149 across 19 files; frontend account/result-handoff/result-actions suites 156/156 across 26 files.
- Root and cloud TypeScript pass. Targeted ESLint and git diff --check pass.
- Enhanced account seed passes full, ranged, and imported PNG Content-Type assertions against legacy rows.
- Production build passes. It reports a nonblocking file-tracing warning through next.config.ts → legacy auth → timeline render, outside this fix.
- Independent Sol Medium review found no serious issues.
- Result-card UI smoke passed: completed Runware-shaped local fixture retained application/octet-stream in D1; its content endpoint returned image/png and Result → Use as reference showed “Added as a reference.” The fixture reused only the local saved PNG because the optional fake Workflow stalled during its wait; that test job was locally cancelled and its reservation released. No live provider was called.

Review: http://localhost:3117/?feature=image-editing (use the local test account if needed). Localhost sign-off and commit/deploy approval received on 2026-09-07. Deploy the account Worker and push the approved commit to main, then verify production and stop the local web 3117 / Worker 8817 services. No migration is required.
