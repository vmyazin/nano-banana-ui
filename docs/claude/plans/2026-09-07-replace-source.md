# Plan — Replace offers both sources

Spec: `docs/claude/specs/2026-09-07-replace-source-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `components/LibraryOverlay.tsx` | `uploadFromDevice`, the control, the dialog name |
| `tests/gallery/library-overlay.test.tsx` | Upload, slot swap, non-image refusal |
| `tests/gallery/stored-image-picker.test.tsx`, `tests/fal/workspace.test.tsx` | Dialog-name queries |

## Do not modify

- `lib/draft/ingest.ts`, `store/useDraftStore.ts`'s replace branch
- `components/ReferenceStack.tsx`, `components/StoredImagePicker.tsx`
- The clip picker's sources

## Tasks

- [x] **1. Reproduce.** Attach a reference, press Replace, record what the
      dialog actually offers — it is the mirror of the report, and a dead end
      with an empty library.
- [x] **2. Upload control** in `pick-image`, through `prepareReferences` into
      `addReferences` so the recorded slot is honoured.
- [x] **3. Rename** the dialog, and move the four assertions that named it.
- [x] **4. Tests** for the upload, the swap, and the refusal.
- [x] **5. Full check.** vitest 1804, tsc, eslint, next build — all exit 0.
- [x] **6. Smoke test** on port 3127: Replace → Upload from device → the slot
      holds the new file, count unchanged, dialog closed.
