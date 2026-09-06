# Cloud download filenames — plan

Spec: `docs/superpowers/specs/2026-09-06-cloud-download-names-design.md`

## File map

- create `lib/account/asset-name.ts`
- modify `lib/account/download.ts:1-12`
- modify `lib/account/useCloudWorkspace.ts:40-46` (after `submitAccountJob`)
- modify `components/account/CloudAssetGrid.tsx:105`
- modify `components/account/CloudJobPanel.tsx:6,63`
- create `tests/account/asset-name.test.ts`
- modify `AGENTS.md` (routing bullet)

Do not modify: `lib/download-name.ts`, `lib/media-download.ts`,
`lib/micro-ai/browser.ts`, `app/api/slug/route.ts`, `cloud/**`.

## Tasks

- [x] Task 1 — `lib/account/asset-name.ts` with cache, warm, async and sync
      bases. Verify: `npx vitest run tests/account/asset-name.test.ts`.
- [x] Task 2 — wire `warmAccountSlug` into `useCloudWorkspace.perform`.
      Verify: `npx vitest run tests/account/execution.test.tsx`.
- [x] Task 3 — `downloadAccountAsset` names through the shared modules.
      Verify: `npx vitest run tests/account/asset-name.test.ts` (download case).
- [x] Task 4 — `LastFrameActions` bases in the grid and job panel.
      Verify: `npx tsc --noEmit -p .` and `npx vitest run tests/account`.
- [x] Task 5 — AGENTS.md routing entry; smoke test on ports 3105/8805.
