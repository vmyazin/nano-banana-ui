# Edit video implementation

## Release approval — 2026-09-11
The user approved the implementation after real browser and cloud generations, archival download, and the final layout/style adjustments. Proceed with commit, rebase, deployment and worktree cleanup under the repository workflow.
Final release checks: all 183 app test files (2,103 tests) and all 21 Worker test files (168 tests) pass. The earlier account UI timeouts did not recur. Worker typecheck and diff whitespace checks pass; production build and UI smoke verification are recorded below.

## Follow-up decision — 2026-09-11
Cloud verification completed with an explicitly user-selected source video and replacement image: one real background edit finished and saved a five-second MP4 (4,192,127 bytes), with a reported cost of $0.6601472 and elapsed time about 5:48. Visually verified the replacement at the start and end, then downloaded the output for the user's archive. No user media or screenshots are included in this repository; this supersedes the earlier limitation that live background completion was unverified.

Live-run follow-up: source validation now covers 300–6000 px dimensions, a 0.4–2.5 ratio, and the upstream 407,696-pixel minimum. The 180 px test clip failed Runware validation; a 640×360 copy passed that check but failed ByteDance's pixel minimum (`getTaskDetails` for `51e7889c-8489-420a-8e2a-c43ecad33595`). A 1280×720 copy was submitted in-browser at the user's request. Added regression tests for both undersized clips and upstream error detail, durable UUIDs for cloud edit diagnostics, and failed browser task IDs. Final targeted verification: 9 UI/provider tests and 5 Worker edit tests pass; root typecheck, targeted lint and production build pass.

Real provider verification supersedes the original fixture-only smoke acceptance. Additional file targets: `cloud/src/provider-adapters/media.ts:35-60`, `aggregators.ts:95-132`, `jobs.ts:74-95`, `providers.ts:10-15`, `index.ts:61`, `lib/providers/runware.ts:230`, `store/useAccountStore.ts:6-10`, `lib/account/useCloudWorkspace.ts:73`, and `components/account/CloudExecutionNotice.tsx:11-14`.

- [x] Transfer local owned video bytes through Runware storage, with a 12 MB intake bound and terminal cleanup. Verify `node node_modules/vitest/vitest.mjs run tests/video-edit.test.ts` in `cloud/`.
- [x] Identify fake generation in the execution notice; verify `tests/account/execution-notice.test.tsx`.
- [x] Disable the local fake adapter, use a real connection, submit the selected winter edit once, and visually compare the source and output.

Completed real verification in-browser (user-requested execution mode): the 1280×720 source produced a four-second 480p winter edit in 7:19, reported cost $0.507. Visually inspected the output at 0:00 and 0:03: snow-covered ground, snowflakes and a blue winter background replace the color-bar scene while the geometric forms remain recognizable. Result video UUID: `6fdb1f63-d35f-49b8-ace0-4b9637352ca0`. The app's result player and download are available on the local preview. This verifies the real in-browser path; background source transfer has contract coverage but a completed live background edit has not been verified.

Follow-up verification: all 168 Worker tests and 10 targeted UI/provider tests pass; root and Worker typechecks and targeted lint pass. A broader account UI run encountered timeouts on unrelated account screens and was stopped; do not report that run as passing. Simulation is disabled in the local vars. The user selected the four-second winter scene test, but the account still has only the seeded dummy key and the browser has no Runware key. The connection dialog is open and a real key has been requested; no real transformation has been submitted yet.

The requested karaoke cat-to-kangaroo JPG replaces the initial vector thumbnail in `public/thumbnails/edit-video.jpg`; the Edit video card uses this generated illustration.

## File map (original line ranges)
- lib/providers/types.ts:18-183, catalog.ts:109-165, runware.ts:130-179, browser.ts:34-51: capability, request and upload contract.
- app/api/providers/video/route.ts:26-174: validation and dispatch.
- components/VideoWorkspace.tsx:46-131, ProviderVideoWorkspace.tsx:179-1040: mode, source input, prompt and result.
- components/LibraryOverlay.tsx:23-330, GalleryGrid.tsx:25-345, account/AccountLibrary.tsx:13-60, account/CloudAssetGrid.tsx:24-118: reuse existing grids for source selection.
- lib/account/contracts.ts:1-12, client.ts:19-34, useCloudWorkspace.ts:10-58: source upload and guarded submission.
- cloud/src/uploads.ts:1-40, jobs.ts:71-119, providers.ts:19-59, provider-adapters/aggregators.ts:19-111: role validation, retention and edit dispatch.
- lib/spend/resolve.ts and cloud/src/spend.ts: mode-specific pricing.
- New lib/providers/video-edit.ts, components/VideoSourceInput.tsx and tests.

## Do not modify
Main checkout hunks, credentials, production provider enablement, migrations, timeline placement/rendering, non-Runware adapters' behavior.

## Tasks
- [x] Implement capability and browser/Worker request validation; verify `pnpm test -- tests/providers` and `pnpm --dir cloud test`.
- [x] Implement source upload and library selection, owner guards and UI; verify targeted component tests and `pnpm exec tsc --noEmit`.
- [x] Add mode-specific spend and local seeded video fixture; verify spend and upload lifecycle tests.
- [x] Run lint, Worker typecheck, production build and browser smoke at http://localhost:3151/?workspace=video&videoMode=edit. Provide actual route after verifying URL state.
- [ ] User localhost sign-off; commit/push only when authorized; remove worktree after shipping.

## Local wiring
Run inside `.claude/worktrees/edit-video`: `pnpm --ignore-workspace install --frozen-lockfile --prefer-offline` (the parent has an untracked pnpm workspace); `pnpm --dir cloud install --frozen-lockfile`; `cp ../../../.env.local .env.local`; `cp ../../../next-env.d.ts .`; `cp ../../../public/thumbnails/*.jpg public/thumbnails/`; `cp cloud/.dev.vars.example cloud/.dev.vars`. Launch with `ACCOUNT_WORKER_PORT=8851 DEV_FAKE_GENERATION=1 npm run dev -- --port 3151`.

Set `DEV_FAKE_GENERATION=1` inside `cloud/.dev.vars` too: Wrangler's vars file overrides the launch environment. Run `node scripts/seed-edit-account.mjs` for a local fixture and fake Runware connection. Fake generation returns a synthetic four-second test clip, not a provider transformation. Real edits require a real key.

## Verification
Root suite: 183 files / 2099 tests passed. Worker suite: 21 files / 166 tests passed. Targeted final workspace/result tests, lint, both typechecks, and production build passed. Browser smoke covered cloud library selection, device upload, source preview, and fake job completion with playable original/result comparison. The JPG responds with HTTP 200 and `image/jpeg`. No paid transformation was run. Local review and shipping authorization remain pending; no commit was requested.
