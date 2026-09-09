# Data manifest — timeline-editor.html

Every data-bound element drawn in the four variants, with where its value comes from and
whether the product can actually supply it today.

**Where the counts come from:** there is no server-side dataset to sample — the library lives in
each browser's IndexedDB. Counts are taken from the fixture the repo ships,
`scripts/seed-browser-gallery.js` (12 records: 10 images + 2 videos), plus the field
optionality declared in `lib/gallery/storage.ts` and `store/useTimelineStore.ts`.

Classes: ✅ Real (reliably populated) · ⚠️ Sometimes (often absent) · ❌ Aspirational (no data today)

| Element (variant) | Field path | Class | Count / note |
| --- | --- | --- | --- |
| Clip title, rail + block ("a quiet ocean at dusk") | `GalleryRecord.slug` → `.prompt` fallback (`titleOf`) | ✅ Real | 12/12 seeded carry `slug`; `prompt` is required, so the fallback never empties |
| Rail duration ("0:08") | `GalleryRecord.durationSeconds` | ⚠️ Sometimes | 0/12 seeded. Optional, written only after the timeline probes the file; the rail already hides the line when absent |
| Rail + block thumbnail | `GalleryRecord.posterBlob` via `posterImage()` | ⚠️ Sometimes | 0/12 seeded. Only derived for a kept video at download time; block falls back to "No preview" |
| Filmstrip stills across a block (A, C, D) | decoded at runtime from `ClipMedia.blob` (`TimelineFilmstrip`) | ⚠️ Sometimes | Needs a decodable source; `state.decodable === false` is a real branch and keeps the single still instead |
| Block width = trimmed duration | `ClipMedia.dimensions.durationSeconds` + `resolveTrim` | ✅ Real | For `status: 'ready'` clips. Un-ready clips draw at `UNTIMED_BLOCK_WIDTH`, which the variants do not show |
| Ruler ticks / total "0:42" | `buildTrackLayout` → `rulerTicks` | ✅ Real | Derived from the same scale the real track uses |
| Playhead position, "0:14 / 0:42" | `usePlayheadStore.time` | ✅ Real | |
| Output "1920 × 1080 @ 30 fps" + `auto` pill | `timeline.output` (`DEFAULT_OUTPUT`) | ✅ Real | Always present; defaults 1920×1080@30, `auto: true` |
| "Keep audio" | `timeline.output.keepAudio` | ✅ Real | Defaults `true` |
| Export button "Export 42s · with audio" | `formatCompactDuration(totalDuration)` + `soundLabel` | ✅ Real | |
| Storage "412 MB of 2.0 GB stored" + meter | `records.bytes` ÷ `DEFAULT_GALLERY_BUDGET.maxBytes` | ✅ Real | `bytes` is set on every record |
| Undurable clip warning (C, amber block) | `ClipMedia.durable === false`, `state.warning` | ⚠️ Sometimes | Situational by design — only for a clip that could not be saved |
| Provider label "fal" (D inspector) | `GalleryRecord.provider` | ✅ Real | 12/12 seeded |
| Source duration "source 0:11" (D inspector) | `ClipMedia.dimensions.durationSeconds` | ✅ Real | For ready clips only |
| Trim In / Out numeric fields (D inspector) | `TimelineClip.trimStart` / `trimEnd` via `resolveTrim` | ✅ Real | Values exist; **the numeric input does not** — trimming today is a drag handle plus arrow keys, so this is a new control over real data |
| Sound available at all | `ClipMedia.hasAudio` | ⚠️ Sometimes | `undefined` when the probe cannot answer; the code deliberately assumes audio in that case |
| Zoom "100%" and fit control | `useTrackZoom` | ✅ Real | |
| Project name "Untitled timeline" (C top bar) | `Timeline.name` | ⚠️ Sometimes | Field exists and persists, but nothing in the UI ever writes it — shown as editable is aspirational |
| **Audio lane + waveform (C)** | — | ❌ Aspirational | Nothing decodes audio anywhere in `lib/timeline/`; 0 sources of waveform data |
| **Per-clip volume slider (D)** | — | ❌ Aspirational | `useTimelineStore.ts` marks `gain?` / `muted?` as "slice 4"; not implemented |
| **Per-clip speed 1.00× (D)** | — | ❌ Aspirational | No field, and no render-engine support in `lib/timeline/render/` |
| **Clip selection / "Clip 1 of 5 selected" (D)** | — | ❌ Aspirational | Blocks are focusable (`tabIndex`), not selectable; no selected-id anywhere in the store |
| **Multi-lane model V1 / A1 (C)** | — | ❌ Aspirational | `Timeline.clips` is a flat ordered array; a lane index does not exist |
| **Timeline / dock height persistence (A, B)** | — | ❌ Aspirational | No stored panel geometry; would need a new persisted field or localStorage key |
| **Transport ⏮ / ⏭ clip-step buttons (C, D)** | — | ❌ Aspirational | `usePlayheadStore` has `seek`, but no "jump to next cut" action exists yet |

## Notes for the implement phase

1. **Thumbnails and durations are the two gaps that will make any of these look emptier than the
   mock.** Both are `⚠️` for the same reason: they are filled in by a probe/download that may not
   have run. Decide per surface whether to (a) probe eagerly on rail render, (b) show the existing
   empty-state line, or (c) reserve the space so the layout does not jump when they arrive.
2. **Variant C cannot ship its audio lane as drawn.** Either scope it out, or scope in waveform
   decoding + `gain`/`muted` first; an empty lane is a promise the editor does not keep.
3. **Variant D depends on one new concept:** a selected clip id. That is a small store addition, but
   it is a prerequisite, not a detail — every inspector field hangs off it.
4. **Unrelated data bug spotted while sampling:** `scripts/seed-browser-gallery.js` writes
   `kept: true` on each record, but the eviction-protection field on `GalleryRecord` is `pinned`.
   Seeded fixtures are therefore all evictable, which is exactly the path that turns a timeline clip
   into `missing`. Worth a one-line fix in the seed script.
