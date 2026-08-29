# Shared stored-image picker — implementation plan

Spec: `docs/codex/specs/2026-08-29-shared-library-image-picker-design.md`

## File map

| Path | Responsibility |
| --- | --- |
| `components/StoredImagePicker.tsx` | Reusable tile, open state, and contextual Library overlay |
| `components/FalGenerationWorkspace.tsx` | Replace local picker wiring and expose it in image and frame modes |
| `components/KieGenerationWorkspace.tsx` | Compose the shared picker beside Kie image inputs |
| `components/ProviderVideoWorkspace.tsx` | Compose it for Runware, Atlas, and Comet image/frame modes |
| `components/GenerationInterface.tsx` | Compose it for image-generation features requiring references |
| `tests/gallery/stored-image-picker.test.tsx` | Shared component selection/close contract |
| `tests/fal/workspace.test.tsx` | fal image-mode integration and existing frame regression |
| `tests/kie/workspace.test.tsx` | Kie integration |
| `tests/providers/workspace.test.tsx` | Shared provider integration |
| `tests/generation-interface.test.tsx` | Main image-generation integration |

## Do not modify

- `components/GalleryGrid.tsx` and `components/LibraryOverlay.tsx`
- `store/useDraftStore.ts`, `store/useGalleryStore.ts`, and `lib/gallery/*`
- provider upload, queue, polling, submission, and API route code
- timeline import and media-repair components

## Tasks

- [x] Add failing shared-component and workspace integration tests.
- [x] Implement `StoredImagePicker` and replace fal-specific wiring.
- [x] Add the shared picker to Kie, Runware/Atlas/Comet, and image generation.
- [x] Run focused and full tests, TypeScript, changed-file ESLint, and `git diff --check`.
- [x] Smoke-test desktop/mobile layout on a non-default local port and hand off for sign-off.
