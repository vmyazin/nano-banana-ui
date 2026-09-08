# Plan — an uploaded image is kept

Spec: `docs/claude/specs/2026-09-07-keep-uploads-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `lib/gallery/keep-upload.ts` | New: `keepUploadedImages`, `uploadRecordId` |
| `components/GenerationInterface.tsx` | Keep after its `addReferences` |
| `components/ProviderVideoWorkspace.tsx` | Same |
| `components/FalGenerationWorkspace.tsx` | Same |
| `components/KieGenerationWorkspace.tsx` | Same |
| `components/LibraryOverlay.tsx` | Keep what the picker's own upload adds |
| `tests/gallery/keep-upload.test.ts` | New |

## Deliberately not hooked

`useDraftStore.addReferences` itself, and the paths that reach it carrying bytes
already stored: `GalleryGrid.sendAsReference`, `lib/result-handoff.ts`,
`lib/account/reference.ts`, and each workspace's seed-frame claim.

## Do not modify

- `lib/account/import.ts`, `lib/draft/ingest.ts`, `store/useGalleryStore.ts`
- Anything under `cloud/` — the imports API already accepts this shape

## Tasks

- [x] **1. Decide the two product questions** before writing anything: automatic
      vs opt-in, and cloud-only vs local-and-cloud. Both spend something.
- [x] **2. The module**, with a content-derived id so re-attaching is free.
- [x] **3. Hook the five upload sites**, and no others.
- [x] **4. Tests**, including the signed-out-then-signed-in case that explains
      why a locally-held copy still re-attempts the import.
- [x] **5. Full check.** vitest 1814, tsc, eslint, next build — all exit 0.
- [x] **6. Smoke test** on 3129, against the Worker's own database: one asset at
      138,574 bytes, import `completed`, and a second upload of the same file
      leaving the counts and `upload_attempt` unchanged.
