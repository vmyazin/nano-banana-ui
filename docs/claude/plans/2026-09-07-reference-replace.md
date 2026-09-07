# Plan — replacing a reference is one visible step

Spec: `docs/claude/specs/2026-09-07-reference-replace-design.md`
Date: 2026-09-07

## File map

| Path | Target | Change |
| --- | --- | --- |
| `store/useDraftStore.ts` | `addReferences`, `reset` | `replaceTarget`, `setReplaceTarget`, in-place swap |
| `components/StoredImagePicker.tsx` | whole file | `replaceIndex` mode; sets/clears the target with the overlay |
| `components/ReferenceStack.tsx` | slot markup | Persistent labelled `Replace` + `Remove`; `replaceLimit` prop |
| `lib/account/reference.ts` | `42:43`, `56` | Both full-stack guards stand down while replacing |
| `components/GenerationInterface.tsx` | `<ReferenceStack>` | `replaceLimit={feature.maxImages \|\| 1}` |
| `components/FalGenerationWorkspace.tsx` | `<ReferenceStack>` | `replaceLimit={maxInputImages}` |
| `components/KieGenerationWorkspace.tsx` | `<ReferenceStack>` | `replaceLimit={maxInputImages}` |
| `components/ProviderVideoWorkspace.tsx` | `<ReferenceStack>` | `replaceLimit={maxInputImages}` |
| `tests/draft/store.test.ts` | append | Swap semantics |
| `tests/reference-stack.test.tsx` | append | Controls visible, named, per slot |

## Do not modify

- `lib/draft/ingest.ts`, `lib/image/convert.ts`
- `components/LibraryOverlay.tsx`, `components/GalleryGrid.tsx`, `components/account/CloudAssetGrid.tsx`
- Any submission path
- The hover zoom button

## Tasks

- [x] **1. Store.** `replaceTarget` honoured by `addReferences`: first entry takes
      the slot, limit ignored, target cleared either way, out-of-range falls back
      to appending. Verify: `npx vitest run tests/draft/store.test.ts`
- [x] **2. Picker.** `replaceIndex` mode — compact "Replace", sets the target on
      open and clears it on every close. Verify: `npx tsc --noEmit`
- [x] **3. Slot controls.** Replace the hover bin with a labelled row.
      Verify: `npx vitest run tests/reference-stack.test.tsx`
- [x] **4. Cloud guard.** Both `addAccountAssetAsReference` limit checks stand
      down while replacing, or every swap from the cloud tab throws.
- [x] **5. Workspaces.** One prop each.
- [x] **6. Full check.** `npx vitest run && npx tsc --noEmit && npx eslint … && npx next build`
- [x] **7. Smoke test** on port 3113 / worker 8813.
