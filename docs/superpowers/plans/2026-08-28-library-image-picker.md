# Contextual image library picker — implementation plan

Spec: `docs/superpowers/specs/2026-08-28-library-image-picker-design.md`

## File map

| Path | Target | Responsibility |
| --- | --- | --- |
| `components/GalleryGrid.tsx` | lines 47-262 | Add an image-picker presentation that filters to stored images, uses the contextual reference limit, and preserves browse mode |
| `components/LibraryOverlay.tsx` | lines 16-162 | Add the contextual picker purpose, title/content/footer variants, and pass selection configuration to the grid |
| `components/FalGenerationWorkspace.tsx` | lines 232-816, especially the reference section around 680-750 | Own picker-open state, render the responsive sibling controls, and mount the contextual Library |
| `tests/gallery/grid.test.tsx` | lines 1-134 | Cover picker filtering, empty state, reference limit, close callback, and browse-mode regression |
| `tests/gallery/library-overlay.test.tsx` | new | Cover contextual dialog copy, hidden tabs/management, and filtered count |
| `tests/fal/workspace.test.tsx` | lines 56-67 and frame/reference tests around 450-510 | Cover the sibling tile, opening the picker, selecting into the next slot, and hiding controls at capacity |

## Do not modify

- `app/page.tsx` and `components/VideoWorkspace.tsx`
- `store/useDraftStore.ts` and `store/useGalleryStore.ts`
- `lib/gallery/*`, `lib/drop/*`, and `lib/video-frame.ts`
- fal provider upload, queue, job, polling, catalog, and submission code
- Kie, general provider, and image-generation workspaces

## Tasks

- [x] Add failing `GalleryGrid` tests for `mode="pick-image"`: video and link-only image records are absent, an empty durable-image set has picker-specific copy, and **Use image** adds a reference with the supplied limit before invoking `onUsedReference`.
  Verify failure: `node node_modules/vitest/vitest.mjs run tests/gallery/grid.test.tsx`
- [x] Implement the minimal additive `GalleryGrid` picker mode while leaving default browse rendering unchanged.
  Verify: `node node_modules/vitest/vitest.mjs run tests/gallery/grid.test.tsx`
- [x] Add failing contextual `LibraryOverlay` tests for title, single results view, omitted prompts and destructive actions, and durable-image count.
  Verify failure: `node node_modules/vitest/vitest.mjs run tests/gallery/library-overlay.test.tsx`
- [x] Implement `LibraryOverlay purpose="pick-image"` and thread the contextual limit and close callback to `GalleryGrid`.
  Verify: `node node_modules/vitest/vitest.mjs run tests/gallery/library-overlay.test.tsx tests/gallery/grid.test.tsx`
- [x] Add failing fal workspace tests for the **From library** tile, contextual overlay opening, selection filling the next frame slot, and both source controls disappearing at two frames.
  Verify failure: `node node_modules/vitest/vitest.mjs run tests/fal/workspace.test.tsx`
- [x] Implement the responsive sibling source row and locally owned contextual Library state in `FalGenerationWorkspaceSession`.
  Verify: `node node_modules/vitest/vitest.mjs run tests/fal/workspace.test.tsx tests/gallery/library-overlay.test.tsx tests/gallery/grid.test.tsx`
- [x] Run full verification and resolve only regressions caused by this feature.
  Verify: full Vitest suite, `tsc --noEmit`, ESLint, and `git diff --check`.
- [x] Start the app on a non-default port and smoke-test desktop, mobile stacking, keyboard focus/Escape, and the empty Library. Immediate selection/close, next-slot behavior, and full-capacity hiding are covered by the focused browser-like integration test because the fresh localhost origin has no stored gallery records. Hand the localhost URL to the user for explicit sign-off.

## Verification record

- Full Vitest suite: 92 files and 1,138 tests passed after rebasing onto the latest `origin/main`.
- TypeScript: `tsc --noEmit` passed.
- ESLint: all changed source and test files passed. The repository-wide command still reports three pre-existing errors in untouched files (`components/KieGenerationWorkspace.tsx` and `lib/draft/aspect-match.ts`).
- `git diff --check` passed.
- Browser smoke test: desktop sibling layout, mobile stacked layout, contextual empty state, and Escape dismissal passed at `http://localhost:3017/?workspace=video&videoMode=frames`.
