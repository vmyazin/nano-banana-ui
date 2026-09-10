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

## Gap decisions — resolved 2026-09-10, variant B chosen

Every ⚠️ and ❌ row above has a decision; none is a silent null-check.

| Gap | Class | Decision | Why |
| --- | --- | --- | --- |
| `hasAudio` — is there an audio track? | ❌ Aspirational | **Show the control always.** Only `TimelinePreview` passes `hasAudio={false}`, from `exportHasSound` | Probing would make the control's *presence* browser-dependent (Chrome supports none of the vendor properties), which is the inconsistency this change exists to remove. A mute toggle on a silent clip is harmless |
| `duration` unknown on first paint | ⚠️ Sometimes | **Designed placeholder.** `0:00 / –:–` in `tabular-nums` at reserved width from first paint | Hiding it reflows the bar mid-load, worst on the grid cells where it is least wanted. The element stays designed rather than absent |
| Cut markers on an overlaid bar | ✅ Real (timeline only) | **1px × 10px ticks at `rgba(236,245,245,.75)`** over the track, via `trackOverlay` | Cyan ticks vanish against the played portion of the track, which is itself cyan — a cut already passed would become invisible |
| Buffered ranges | ⚠️ Sometimes | **Cut from the build.** Deliberately drawn in no variant | A `blob:` URL already in memory reports one range covering the whole clip and some browsers report none; both mean nothing useful to draw, and painting it would read as a second progress fill |
| Poster / opening frame (`posterBlob` 0/12) | ⚠️ Sometimes | **Derive it.** The player appends `#t=0.1` and lets the element seek | Reaches 100% of records without a stored poster, which is why no seeded record needs one |
| Fullscreen availability | ⚠️ Sometimes | **Designed absence.** The button renders only when a handler is passed; iOS falls back to `webkitEnterFullscreen` | A control that cannot work is noise, and its absence is itself the answer — the precedent `TimelinePreview` already sets for its mute button |

### One deliberate deviation from the exploration

The exploration drew B's bar **always visible at both densities**. The build reveals the full-density
bar on hover or focus and keeps only the compact bar always visible. Recorded here because it is a
knowing departure from the reference: on a large result frame the viewer is judging the framing of
the image, so the scrim must be off it at rest, while in a 180px cell the bar is the affordance
that says the clip is playable. `video-player-B.reference.html` therefore depicts the full bar in
its **revealed** state, which is the state parity is diffed against.
