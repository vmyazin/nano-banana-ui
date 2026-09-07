# Plan — result action row

Spec: `docs/claude/specs/2026-09-06-result-action-row-design.md`
Date: 2026-09-06

## File map

| Path | Target | Change |
| --- | --- | --- |
| `lib/result-handoff.ts` | new | Blob resolution + draft-facing actions |
| `components/ResultActions.tsx` | new | The row |
| `components/ResultStack.tsx` | `115:149` (download button → lightbox) | Render the row under each card; new optional props |
| `components/account/CloudJobPanel.tsx` | `62:63` (video branch) | Row on the finished clip |
| `components/VideoWorkspace.tsx` | `204:232` (three workspace branches) | Thread the first-frame callback |
| `app/page.tsx` | `276:300` (GenerationInterface render) | Give the image workspace a route to image-to-video |
| `components/GenerationInterface.tsx` | prop + `ResultStack` render | Accept and forward the callback |
| `tests/result-actions.test.tsx` | new | Row behaviour |
| `tests/result-handoff.test.ts` | new | Blob resolution and guards |

## Do not modify

- `lib/draft/ingest.ts`, `lib/image/convert.ts`, `lib/image/download-format.ts`
- `store/useDraftStore.ts`, `store/useSeedFrameStore.ts`, `store/useGalleryStore.ts`
- `components/LibraryOverlay.tsx`, `components/GalleryGrid.tsx`, `components/account/CloudAssetGrid.tsx`
- `components/LastFrameActions.tsx`
- `lib/timeline/render/**`, `lib/timeline/acquire.ts`

## Tasks

- [ ] **1. `lib/result-handoff.ts`.** `resolveResultBlob(src, kind)` — fetch for an
      image, `extractLastFrame` for a video. `sendResultToDraft(...)` running the
      blob through `prepareReferences` into `addReferences`.
      `sendResultToFirstFrame(...)` writing `setSeedFrame`. Verify: `npx vitest run tests/result-handoff.test.ts`
- [ ] **2. `components/ResultActions.tsx`.** Kind-aware row, per-URL blob cache,
      one in-flight action at a time, toast on failure. Actions appear only when
      their destination is reachable. Verify: `npx vitest run tests/result-actions.test.tsx`
- [ ] **3. Wire `ResultStack`.** New optional props forwarded to the row, rendered
      under the download button. Verify: `npx tsc --noEmit`
- [ ] **4. Wire `CloudJobPanel`** video branch and the navigation callbacks in
      `VideoWorkspace`, `GenerationInterface`, `app/page.tsx`.
      Verify: `npx tsc --noEmit && npx eslint <changed files>`
- [ ] **5. Full check.** `npx vitest run && npx next build`
- [ ] **6. Smoke test** on port 3107 / worker 8807, then hand over the localhost link.
