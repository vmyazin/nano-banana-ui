# Data manifest — video-player.html

Every data-bound element drawn in the four transport variants, with where its value comes from
and whether the product can actually supply it today.

**Where the values come from:** the bar's inputs are split between two very different sources,
and that split is the main thing this manifest exists to make visible. Playback values
(`currentTime`, `duration`, `volume`, `buffered`) are read off the **live `HTMLVideoElement`** by
`lib/media/use-media-state.ts`, so they are reliable wherever a clip loads at all. Identity values
(title, provider) come from the **gallery record** in IndexedDB, sampled here from the fixture the
repo ships, `scripts/seed-browser-gallery.js` — 12 records, 10 images + 2 videos
(`arcade-dolly-4s` / fal, `skylight-rain-push` / kie), both `video/webm` at `4:3`.

This is why the transport can show a duration that the timeline rail cannot: the rail reads
`GalleryRecord.durationSeconds`, which **0 of 12** seeded records carry, while the bar reads the
element.

Classes: ✅ Real (reliably populated) · ⚠️ Sometimes (often absent) · ❌ Aspirational (no data today)

| Element (variant) | Field path | Class | Count / note |
| --- | --- | --- | --- |
| Elapsed time (`0:01`) | `HTMLVideoElement.currentTime` via `useMediaState` | ✅ Real | Always available once the element exists; `0` before first play |
| Total duration (`0:04`) | `HTMLVideoElement.duration` via `useMediaState` | ⚠️ Sometimes | `NaN` until `durationchange` fires, and `Infinity` for an unbounded source. Both must render as unknown — the spec requires `readDuration` to collapse them to `0`, and A/B/D hide the readout rather than print `NaN` |
| Scrub position / fill `--pct` (all) | `currentTime ÷ duration` | ⚠️ Sometimes | Derived, so it inherits the duration gap above: with duration unknown the track renders empty at `max=0` rather than full |
| Play/pause icon state (all) | `HTMLVideoElement.paused` via the `play`/`pause` events | ✅ Real | The spec forbids deriving it from a click, so it is exactly as real as the element |
| Volume level (D only) | `HTMLVideoElement.volume` | ✅ Real | Defaults to `1`. **D is the only variant drawing a level**; A/B show a mute toggle reading `.muted` |
| Mute state (A, B, D) | `HTMLVideoElement.muted` | ✅ Real | Also written directly by `useHoverPlay`, which is why `useMediaState` must mirror `volumechange` |
| Whether audio exists at all | `VideoPlayer` prop `hasAudio` | ❌ Aspirational | **No reliable cross-browser way to detect an audio track.** Not drawn as absent in any variant, so all four over-promise slightly: a silent provider clip still shows a volume control. `TimelinePreview` is the only caller that can pass `false`, from `exportHasSound` |
| Buffered ranges (not drawn) | `HTMLVideoElement.buffered` | ⚠️ Sometimes | Deliberately absent from all four previews. A `blob:` URL already in memory reports one range covering the whole clip, and some browsers report none — both mean "nothing useful to draw", so the spec paints nothing rather than a second full bar |
| Cut markers on the track (A) | `sequence.segments[].start ÷ sequence.total` | ✅ Real | Timeline-only, via `trackOverlay`. Drawn in A at 38% / 71% to show the slot exists; a single-clip timeline has none |
| Clip title (stage labels) | `GalleryRecord.slug` → `.prompt` fallback (`titleOf`) | ✅ Real | 12/12 seeded carry `slug`; `prompt` is required, so the fallback never empties |
| Provider label (stage labels) | `GalleryRecord.provider` | ✅ Real | 12/12. `fal` and `kie` for the two video fixtures |
| The frame behind the bar | `GalleryRecord.blob` → `URL.createObjectURL` | ✅ Real | 12/12 when `kept: true`, which the fixture sets. Stood in here with the fixture's own gradient colours (`#7e22ce`→`#22d3ee`, `#0c4a6e`→`#e0f2fe`) rather than an embedded clip |
| Poster / opening frame | `src` + `#t=0.1` seek | ⚠️ Sometimes | Needs a decodable source and enough of a fetch to paint. `posterBlob` exists on the record but **0 of 12** seeded records carry it, which is why the player seeks instead of using a poster attribute |
| Fullscreen button (A, B, D) | `document.fullscreenEnabled` | ⚠️ Sometimes | Absent in an iframe without `allow="fullscreen"`, and iOS Safari only fullscreens the element. The spec omits the button when no handler is passed |

## Gaps to resolve at implementation

1. **`hasAudio` cannot be detected**, so every variant as drawn shows a volume control on clips
   that may be silent. Options: leave it (a mute toggle on silent audio is harmless), or probe
   `webkitAudioDecodedByteCount` / `mozHasAudio` / `audioTracks` and accept that Chrome answers
   for none of them. The spec's current answer is to show it and let only informed callers opt out.
2. **Duration is unknown on first paint.** Variants A, B and D all reserve space for a readout
   that is briefly absent, so each needs a stable-width placeholder or the bar reflows the moment
   metadata lands.
