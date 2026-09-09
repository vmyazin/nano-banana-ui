# Data manifest — Variant A, "Fixed NLE shell" (implemented)

Reference: `timeline-editor-A.reference.html` · Implemented 2026-09-09

Every data-bound element in the reference, what backs it, and the decision taken for the
gaps. Counts come from `scripts/seed-browser-gallery.js` (the fixture the repo ships: 12
records, 10 images + 2 videos) plus the field optionality declared in
`lib/gallery/storage.ts` — there is no server-side dataset to query, because the library
lives in each browser's IndexedDB.

Classes: ✅ Real · ⚠️ Sometimes · ❌ Aspirational

| Element | Field path | Class | Count | Decision |
| --- | --- | --- | --- | --- |
| Clip title (rail + block) | `slug` → `prompt` fallback | ✅ | 12/12 | Bind as-is |
| Rail duration | `durationSeconds` | ⚠️ | 0/12 seeded | **Probe and persist.** `useRailDimensions` probes any row with bytes and no duration, then writes through the same `setDimensions` acquisition uses. The line is always drawn — `formatDuration` renders an em dash for an unknown length — so a row never changes height when the value lands |
| Rail thumbnail | `posterBlob` | ⚠️ | 0/12 seeded | **Derive from the filmstrip cache.** No poster → `useDerivedThumbnail` requests the record's strip (`lib/timeline/filmstrip.ts`, cached by record id) and takes its first frame. Undecodable sources keep the icon tile |
| Filmstrip on a block | decoded from `ClipMedia.blob` | ⚠️ | needs a decodable source | Existing fallback kept (the block's still, then "No preview") |
| Block width / ruler / totals | `ClipMedia.dimensions` + `buildTrackLayout` | ✅ | ready clips | Bind as-is |
| Output W×H / fps / auto | `timeline.output` | ✅ | always | Bind as-is |
| Keep audio | `output.keepAudio` | ✅ | always | Bind as-is |
| Export label | derived duration + sound | ✅ | — | Bind as-is |
| Storage meter | `records.bytes` ÷ `DEFAULT_GALLERY_BUDGET` | ✅ | always | Bind as-is; lives in the track band's head |
| Undurable / undecodable warnings | `ClipMedia.durable`, `.decodable` | ⚠️ | situational | Existing behaviour kept — situational by design |
| Splitter height | — | ❌ | no stored geometry | **localStorage** (`scene-assembly:timeline-track-height`), clamped to the viewport on read and on resize; `useTimelineStore`'s persisted shape is the user's project and stays untouched |
| Audio lane / waveform | — | ❌ | 0 sources | Not in Variant A |
| Per-clip volume, speed, selection | — | ❌ | not in the store | Not in Variant A |

## Decisions taken with the user

1. **Route** — the editor moved to its own `/timeline` route rather than a branch of the studio
   page. `?workspace=timeline` is `router.replace`'d there so existing links keep working.
2. **Header** — after first building a custom 52px editor bar, the decision was to reuse the
   studio's real header. It is extracted to `components/StudioHeader.tsx`, owning the three
   dialogs it opens (Library, ⌘K, API keys). On `/timeline` it runs full-bleed and drops the
   generation chime. A workspace asking for a provider-focused key dialog now goes through
   `store/useConnectionsDialog.ts` instead of a prop drilled down from the page.
3. **Project controls** — split by what they are about. Undo and New head the **right column**,
   above the output format and the export, which are the other controls that act on the piece
   as a whole. The **storage meter** stays in the track band's head, next to the clips it is
   about: filling that budget is what evicts an unpinned file and turns a clip on this timeline
   into a missing one. Neither takes a toolbar row of its own, so the shell stays three bands.

## Deliberate deviations from the reference

- **"Renders in this browser. No upload."** — drawn under Export in the reference, not built.
  `TimelineExportPanel` swaps between seven states (rendering, unavailable, server fallback…)
  and already names the engine in its button and its fallback copy; a static caption would
  contradict the server branch.
- **Two cards in the right column, not one panel with a rule.** The export panel owns its own
  surface and decides what it looks like per state; folding it into a shared card would take
  that away.
- **Rail rows run ~66px, not the reference's ~46px.** Real titles are prompt-derived and longer
  than the reference's fixtures, so they clamp to two legible lines rather than truncating to
  one. The reference also drew rows with no controls on them; the real row keeps its delete and
  add buttons (compact 32px in the shell, 40px touch targets in the document layout).
- **Type is at the app's token scale**, not the 4-up comparison page's ~11% downscale.

## Defects found and fixed while diffing

- `TimelinePreview` rebuilt **every** clip's object URL whenever any one clip resolved, revoking
  the URL the video element was still loading. Restoring a saved timeline did this once per
  clip, so the preview came back black (`readyState: 0`) with `ERR_FILE_NOT_FOUND` for a blob
  that had just been valid. URLs are now keyed by placement id *and* blob identity (so a
  repaired clip still gets a fresh one) and only what actually left is revoked.
- The rail probe and the strip decode originally raced acquisition for the same blobs. Both now
  skip records already on the timeline and defer past the mount.
- `p-0` on the rail's icon buttons never won against `.btn-secondary`'s own padding, squeezing
  the icon to 2.8px. Overridden inline.

## Still open (not in scope, observed)

- `scripts/seed-browser-gallery.js` writes `kept: true`, but the eviction-protection field on
  `GalleryRecord` is `pinned` — every seeded fixture is evictable, which is the path that turns
  a timeline clip into `missing`.
- The filmstrip decoder's `releaseVideo()` (`removeAttribute('src')` then `load()`) logs one
  `ERR_FILE_NOT_FOUND` per decode in Chromium. Cosmetic console noise; nothing renders wrong.
