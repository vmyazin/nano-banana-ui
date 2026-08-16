# Drop-zone drag and drop — plan

Spec: `docs/superpowers/specs/2026-08-15-drop-zone-drag-and-drop-design.md`

## File map

| Path | Range | Action |
| --- | --- | --- |
| `lib/drop/dropped-sources.ts` | new | Read a `DataTransfer` into `File[]` |
| `lib/drop/use-file-drop.ts` | new | Drag-state hook + drop handlers |
| `app/api/fetch-image/route.ts` | new | SSRF-guarded URL → image bytes proxy |
| `components/FalGenerationWorkspace.tsx` | ~690-712 | Spread drop props on picker button |
| `components/KieGenerationWorkspace.tsx` | ~437-456 | Same |
| `components/GenerationInterface.tsx` | ~709-731 | Same |
| `tests/drop/dropped-sources.test.ts` | new | DataTransfer parsing |
| `tests/drop/fetch-image-route.test.ts` | new | Proxy guards |
| `tests/drop/private-address.test.ts` | new | Private-range checks |
| `tests/drop/drop-zones.test.tsx` | new | A drop adds a reference in each of the three zones |
| `tests/kie/workspace.test.tsx` | ~229 | Picker label changed, assertion follows it |

Do not modify: `store/useDraftStore.ts`, `app/api/fal/*`, `app/api/kie/*`,
`lib/fal/*`, `lib/kie/*`, `lib/video-frame.ts`, `components/GalleryGrid.tsx`.

## Tasks

- [x] 1. `lib/drop/dropped-sources.ts` — files-first, then `text/uri-list` → `text/html`
      → `text/plain` URL extraction; POST to the proxy; wrap blob in a named `File`.
      Verify: `npx vitest run tests/drop/dropped-sources.test.ts`
- [x] 2. `app/api/fetch-image/route.ts` — protocol allowlist, per-hop DNS + private-range
      check, manual redirects (max 3), content-type allowlist, dual size cap.
      Verify: `npx vitest run tests/drop/fetch-image-route.test.ts`
- [x] 3. `lib/drop/use-file-drop.ts` — drag counter, disabled state, error passthrough.
      Verify: covered via the workspace test in task 5.
- [x] 4. Wire the three zones; highlight on `isDragging`; keep each zone's own error copy.
      Verify: `npx tsc --noEmit && npx eslint`
- [x] 5. Tests: parsing, route guards, and one component-level drop per zone.
      Verify: `npx vitest run`
- [x] 6. Smoke-test in a browser at a non-default port: drop a local file and a
      cross-origin image URL into each zone.
