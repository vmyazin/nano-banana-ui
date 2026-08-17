# Video timeline — design

Status: Approved design
Date: 2026-08-16 (revised same day after a stress-test against the codebase)

## Context

The app generates video one clip at a time. fal and Kie both cap a single generation at a
few seconds, so anything longer than a shot has to be assembled out of several runs. The
first half of that loop already exists: `components/LastFrameActions.tsx` extracts the
closing frame of a finished clip and `store/useSeedFrameStore.ts` hands it to the next
image-to-video run, so people already build chains of clips that are meant to be watched
in sequence. There is nowhere to put them. The only way to see the sequence as one video
today is to download each clip and open a desktop editor.

The gallery is the natural source of those clips, but it was built for browsing, not
assembly, and two of its properties shape everything below:

| Property | Where | Consequence for a timeline |
| --- | --- | --- |
| Video records hold no bytes until "keep" | `store/useGalleryStore.ts` | A clip on a timeline may be a URL and nothing else |
| Unpinned records are evicted to reclaim bytes | `lib/gallery/eviction.ts` | A timeline built today can be half-empty tomorrow |
| Provider URLs expire (fal: 7 days) | `lib/gallery/storage.ts` | That URL may already be dead when we reach for it |

## Goals

- A third workspace where any video in the library can be dragged into any order and
  exported as one continuous video file.
- Clips that differ in resolution, aspect ratio, and framerate can sit on the same
  timeline and produce a coherent output.
- Export runs in the browser by default and never uploads without the user choosing to.
  Where the browser cannot encode, the server can, behind the existing access gate.
- A clip whose source has expired is visible as such at the moment it is added, not
  discovered at export.
- The engine and data model are shaped so trim, transitions, and audio extend them rather
  than replace them.

## Non-goals

These are deferred to later slices, each of which gets its own spec referencing the
umbrella section below. They are named here so the slice-1 code leaves room for them and
does not attempt them.

- **Trimming** — per-clip in/out points (slice 2). Also where `frameAt(blob, seconds)`
  lands — see §3.
- **Transitions** — crossfades and dips between clips (slice 3).
- **Audio** — *all of it* (slice 4): source audio already inside the clips, per-clip gain
  and mute, a music bed, mixdown. **Until then, exports are silent from both engines, on
  purpose.** The browser pipeline in §5 is video-only, and letting the server keep audio
  while the browser drops it would make the two engines produce different files from the
  same timeline — the worst kind of divergence, discovered by ear. The server graph
  therefore passes `-an` (§6) and the export panel says the export carries no sound (§7).
  Veo clips have audio; the silence must be stated, never discovered.
- Multiple saved timelines or projects. One timeline exists; the model is shaped so a list
  is an additive change.
- Writing the finished export back into the library. It would double the storage cost of
  every export against a budget the pinning rule below already strains.
- A frame-accurate preview. Slice 1's preview is a playlist, not a render — see §7.
- Resumable or chunked uploads to the server engine.
- Any change to how clips are *generated*. The fal and Kie workspaces are read-only to
  this feature; it consumes their results through the gallery.

## Umbrella architecture — all four slices

Four subsystems, each with one job and a named interface. Slices 2–4 extend these; none of
them should require a new one.

| Subsystem | Home | Job | Interface |
| --- | --- | --- | --- |
| Timeline state | `store/useTimelineStore.ts` | Ordered clip list, output format, persistence | `Timeline`, `TimelineClip` |
| Acquisition | `lib/timeline/acquire.ts` | Guarantee real bytes exist for a clip | `acquireClipMedia(recordId, opts)` |
| Render engine | `lib/timeline/render/` | Timeline → one video file | `RenderEngine` port, two implementations |
| Audio graph | *(slice 4)* | Gain, music bed, mixdown | extends `RenderEngine` |

The load-bearing decision: **the timeline stores no media.** A clip is a reference to a
`GalleryRecord.id` plus placement data. The gallery remains the single source of truth for
bytes, so its eviction, quota, and keep machinery keeps working instead of being
duplicated inside a second store that would drift from it.

`RenderEngine` deliberately mirrors the `GalleryStorage` port in `lib/gallery/storage.ts`:
one interface, several implementations, chosen at runtime by capability. That pattern
exists in this repo because jsdom cannot host the real thing, and the same is true here —
jsdom has no WebCodecs and no media decoding.

## Design

### 1. `store/useTimelineStore.ts` — data model and persistence

```ts
export interface TimelineClip {
  id: string;         // this placement; the same record may appear twice
  recordId: string;   // GalleryRecord.id
  fit: 'contain' | 'cover';
  // slice 2: trimStart?, trimEnd?   slice 4: gain?, muted?
}

export interface TimelineOutput {
  width: number;
  height: number;
  fps: number;
  /** True while the format tracks the clips; false once the user edits it. */
  auto: boolean;
}

export interface Timeline {
  id: string;
  name: string;
  clips: TimelineClip[];
  output: TimelineOutput;
  createdAt: number;
  updatedAt: number;
}
```

Persisted with `zustand/persist` to `localStorage` under `scene-assembly-timeline`,
following `store/useAppStore.ts`. JSON only — there are no blobs in this store, which is
the whole point of referencing records by id.

Reordering lives here as `moveClip(clipId, toIndex)`, **not** in a view. Two layouts
render this store (§7) and they must differ in how a move is expressed, never in what a
move means. Id-based rather than index-based, because two drag surfaces plus async state
updates make a stale `from` index the easy bug to write and the hard one to reproduce.

**Adding a clip pins its gallery record.** `lib/gallery/eviction.ts` evicts unpinned
records to reclaim bytes, so without pinning, a timeline assembled today would be missing
clips after the next few generations pushed the gallery over budget. Pinning is the
existing mechanism for "the user deliberately wants this kept," and `keep()` already pins
as it stores bytes, so for a clip that needs downloading, acquisition (§3) and pinning are
one call. **When the record already holds bytes, acquisition must call
`setPinned(id, true)` explicitly** — bytes without a pin are exactly what eviction
reclaims, and `GalleryGrid` lets the user unpin a kept record at any time, so "has a blob"
must never be read as "is safe."

**Removing a clip does not unpin.** Un-keeping something the user may still want is the
worse of the two errors, and the library already offers explicit removal.

**The cost of that rule, stated rather than hidden.** The same eviction file evicts pinned
records last and *never* to free bytes — the comment there notes that a gallery filled
with pinned records simply stays over budget and is "the user's to remove." A large
timeline can therefore push the gallery past its 500 MB budget, at which point
`useGalleryStore` begins surfacing `QUOTA_MESSAGE` on unrelated saves. The workspace
therefore shows a storage readout (§7) so the user meets an explanation before they meet a
mystery.

A related edge already latent in the codebase and worth knowing here: `MAX_REMOTE_VIDEO_BYTES`
is 512 MB while `DEFAULT_GALLERY_BUDGET.maxBytes` is 500 MB, so a single maximally-large
clip is downloadable but cannot fit the budget at all. Slice 1 does not change either
constant; it must simply not assume a successful download implies a successful keep, and
must report the quota failure against the clip that caused it.

**Pinning is strong, not absolute.** Three ways a pinned clip's record still disappears,
none of which slice 1 may pretend away: the count ceiling (`maxCount: 500`) evicts pinned
records in its second pass once unpinned ones are exhausted; the Library's Remove and
Clear actions delete records regardless of pins, as they should; and the timeline lives in
`localStorage` while the bytes live in IndexedDB, which browsers clear independently under
storage pressure. A `recordId` on the timeline is therefore a reference that can dangle.
The consequences: acquisition needs a `missing` reason (§3) for a record that no longer
resolves at all, and export re-validates every clip rather than trusting the add-time
check (§3).

### 2. `lib/timeline/derive-output.ts` — output format

`deriveOutputFormat(clips) → TimelineOutput`, a pure function over probed clip dimensions:

1. Most common aspect ratio, tie-broken by total duration at that aspect.
2. Largest resolution among clips at that aspect.
3. Most common framerate among clips, tie-broken by total duration; 30 when none report
   one.

It recomputes on every clip change while `auto` is true and freezes the first time the
user edits the format. Frozen is not a one-way door: a "match clips" action sets `auto`
back to true and recomputes, because "I fiddled and want the automatic answer back" is a
one-button ask. Pure and dependency-free, so it is cheap to test hard.

**Source framerate is never needed for correctness — but it is for cadence.** The engine
is timestamp-driven: output frame *N* sits at `N / fps`, and each clip contributes
whichever decoded frame is nearest at-or-before that timestamp. This handles arbitrary
source rates and variable-framerate clips identically, and it is the same mapping slice
2's trimming needs. But the *default* output rate still matters: Veo emits 24fps, and
sampling 24fps sources onto a 30fps grid duplicates frames in an uneven 3:2 pattern —
visible judder on every all-Veo timeline, which is most of them. `HTMLVideoElement` cannot
report framerate, but §5 adds a demuxer anyway, and sample count over duration falls out
of it for free. So the probe reads `videoWidth`, `videoHeight`, and `duration` from a
video element, and framerate from the demuxer — best-effort; a clip whose rate cannot be
read simply does not vote in rule 3.

Probed values are cached as new **optional** fields on `GalleryRecord`
(`width?`, `height?`, `durationSeconds?`, `fps?`). Optional additions need no IndexedDB
migration — but they do need a store mutation to write them; see the scope table, which
names `store/useGalleryStore.ts` for exactly this. Writing through `galleryStorage().put()`
directly would leave the store's in-memory `records` index stale.

### 3. `lib/timeline/acquire.ts` — getting real bytes

`acquireClipMedia(recordId, { signal }) → ClipMedia | Unavailable`, resolving in order:

1. No record with that id → `unavailable` with reason `missing` (removed from the
   Library, cleared, or evicted by the count ceiling — §1's dangling-reference cases).
2. `record.blob` exists → `setPinned(id, true)` if not already pinned (§1), then probe and
   cache any missing dimension fields (§2) before reporting ready. The probe is not
   skippable on this path: every video kept *before* this feature shipped has bytes but no
   `width`, `height`, `durationSeconds`, or `fps`, so an existing library would otherwise
   hand `deriveOutputFormat` a set of clips with nothing to vote with. Same probe as path
   3, minus the download.
3. `record.sourceUrl` passes `isDownloadableMediaUrl` → `fetchResultBlob(url, 'video')`
   from `lib/gallery/capture.ts`, which already bounds the download at
   `MAX_REMOTE_VIDEO_BYTES` and accepts an `AbortSignal`. Probe (§2), take the poster
   frame, then `keep()` — which stores the bytes and pins in one call.
4. Otherwise → `unavailable`, with a distinguishable reason: `expired` (404/410 — the fal
   seven-day case), `unreachable` (network), or `no-source` (never had a URL).

Acquisition also asks `VideoDecoder.isConfigSupported` about the clip's codec — the
demuxer is already open for the framerate probe, so the codec string is in hand. "Your
browser cannot decode this clip" then surfaces at add time next to "expired," instead of
minutes into an export. Best-effort: if the probe cannot answer, render-time detection
(§5's error handling) still catches it.

**Acquisition runs at add time — and again at export.** Arranging a dozen clips and only
then learning that four expired last week is the wrong moment to find out, and adding is
while the user still remembers what the clip was. But add time cannot be the *only* check:
§1 lists the ways a record vanishes after it was added. Pressing Export re-resolves every
clip through `acquireClipMedia` first — records holding bytes resolve instantly, so the
happy path costs nothing, and anything that vanished in between is caught before a byte is
uploaded or encoded.

Adding several clips at once runs at a concurrency of 3, so a multi-select does not spike
memory or hammer the CDN. In-flight fetches abort when the clip is removed or the
workspace closes.

**The poster stays the last frame.** `posterBlob` is not a neutral thumbnail: `GalleryGrid`'s
own Keep stores the *closing* frame via `extractLastFrameFromBlob`, and "Use as reference"
feeds that poster to the next generation — the clip-chaining workflow this whole feature
exists to serve depends on it being the end of the clip. Acquisition therefore stores
exactly what Keep stores, with the same existing function, and the timeline's clip
thumbnails simply render that poster like the gallery does. A first-frame thumbnail — and
the `frameAt(blob, seconds)` generalization of `lib/video-frame.ts` it would need — waits
for slice 2, which needs arbitrary frame sampling for trim handles anyway. Slice 1 does
not touch `lib/video-frame.ts` at all.

### 4. `lib/timeline/render/port.ts` — the engine port

```ts
export interface RenderRequest {
  output: TimelineOutput;
  clips: Array<{ media: Blob; fit: 'contain' | 'cover' }>;
}

export interface RenderProgress {
  phase: 'preparing' | 'encoding' | 'muxing' | 'uploading';
  /** 0..1, or null where the phase cannot report fractions. */
  completed: number | null;
}

export interface RenderEngine {
  readonly id: 'webcodecs' | 'server';
  /** Why this engine cannot run this request here, or null when it can. */
  unavailableReason(request: RenderRequest): Promise<string | null>;
  render(
    request: RenderRequest,
    opts: { signal: AbortSignal; onProgress: (p: RenderProgress) => void }
  ): Promise<Blob>;
}
```

`selectRenderEngine(engines, request)` returns the chosen engine **and** the rejected ones
with their reasons. That second half is what lets the UI say "Safari cannot encode H.264
here" rather than failing generically.

Also here: `fitRect(source, output, fit)`, the contain/cover letterbox maths, pure and
shared by both engines so a letterboxed clip lands in the same place either way.

### 5. `lib/timeline/render/webcodecs.ts` — the browser engine

Availability is decided by `await VideoEncoder.isConfigSupported({...})`, which is
authoritative, rather than by sniffing the user agent. Per-clip *decode* support is probed
earlier, at add time (§3), so by the time this engine runs, both ends of the pipeline have
been vouched for.

Pipeline, per clip: demux → `VideoDecoder` → for each output timestamp select the nearest
at-or-before source frame → draw to an `OffscreenCanvas` using `fitRect` → `VideoEncoder`
→ mux to MP4. Video only — audio tracks are not decoded, not encoded, and not muxed until
slice 4 (see Non-goals); the muxed file has a single video track.

Two failure modes are specific enough to name in the spec, because they are the usual ways
this breaks:

- **Backpressure.** Decoder and encoder queues must be drained against
  `encodeQueueSize` / `decodeQueueSize`. Feeding frames without waiting exhausts memory on
  any timeline long enough to be worth making.
- **Timestamp continuity.** Each clip's frame timestamps are offset by the running
  timeline position so the muxed output is monotonic across clip boundaries.

WebCodecs does not demux or mux, so this needs a dependency. Candidates are `mp4box.js`
plus `mp4-muxer`, or `mediabunny`, which bundles demux, mux, and WebCodecs orchestration.
**The choice, current versions, licence, and maintenance status are to be verified at plan
time and not assumed here.** Constraints on whichever is chosen: JavaScript, not a wasm
blob; tree-shakeable; loaded via dynamic `import()` only when the Timeline workspace opens,
matching how `GenerationInterface` is loaded at `app/page.tsx:23` (the only workspace
currently lazy-loaded — `VideoWorkspace` is a static import, so this is a pattern to
follow, not a universal posture to cite).

`ffmpeg.wasm` was considered and rejected. Its multithreaded build requires
`SharedArrayBuffer`, which requires COOP/COEP headers, which block cross-origin
subresources that do not send CORP — that is every fal and Kie CDN URL the app loads for
previews and last-frame extraction. Enabling it would break existing features to add a new
one. The single-threaded build avoids the headers but loses to the server path on every
axis for a ~32 MB download.

A `MediaRecorder` fallback engine was also considered and rejected: it renders at
wall-clock speed, produces webm at quality we do not control, drops frames under load, and
covers exactly the browsers the server engine already covers, better.

### 6. `lib/timeline/render/server.ts` + `app/api/timeline/render/route.ts`

**Two independent gates, both required.** `requireApprovedAccount` from
`lib/auth/guard.ts` — whose stated purpose is "the routes that spend the app owner's money
or its bandwidth" — *and* `TIMELINE_FFMPEG_PATH`, an env var holding the absolute path to
the ffmpeg binary. Both, because `isGateEnabled()` returns false when `AUTH_ADMIN_EMAIL`
is unset, so the auth gate alone would leave every public checkout of this repo exposing
an unauthenticated ffmpeg endpoint. When `TIMELINE_FFMPEG_PATH` is unset the endpoint 404s
and the client reports the server engine as unconfigured, which is a different message
from "sign in." It is a path rather than a boolean so the deployment states explicitly
which binary it is spending CPU on, and so no `PATH` lookup happens inside a route.

**The render is asynchronous, and that is forced rather than chosen.** Production runs
behind a reverse proxy in front of pm2 (`scripts/deploy-production.sh`), where a typical
60-second `proxy_read_timeout` would kill a multi-minute render mid-encode. So:

1. `POST` — one streamed multipart request uploads the clips and the output format,
   writes them to a per-job temp directory, returns a job id.
2. `GET /status` — the client polls phase and progress.
3. `GET /result` — the finished file. It stays until fetched or swept, not deleted on
   first read: a dropped connection must not cost a multi-minute render.

**The proxy's body limit bites before its read timeout does.** The same reverse proxy that
forces the async shape also caps request bodies — nginx's `client_max_body_size` defaults
to **1 MB**, which rejects essentially every real clip upload with a 413 long before any
timeout matters. The deployment must raise it explicitly (documented next to
`TIMELINE_FFMPEG_PATH`), the route enforces its own ceiling on total upload bytes so the
app's limit never silently becomes "whatever the proxy allows," and the client gives 413
its own message — "upload too large," which is not "sign in" and not "unconfigured."

Job ids are cryptographically random, and when the auth gate is enabled, a job's status
and result are readable only by the session that created it.

One ffmpeg job runs at a time with at most two more queued behind it; a fourth is rejected
with "busy, try again" rather than queued indefinitely. It is the same machine serving the
app, and an unbounded queue on a shared box is a way to take the app down with its own
feature.

Temp directories are removed on success, on failure, on cancellation, and by a sweeper for
jobs abandoned by a client that went away.

The filter graph is `scale` + `pad` (contain) or `scale` + `crop` (cover), then `fps`, then
`concat`, re-encoding to H.264 **with `-an`** — silent by design until slice 4 (see
Non-goals), which is also what keeps this engine's output equivalent to the browser's.
This is where slice 3's `xfade` will slot in, and where slice 4 replaces `-an` with the
audio graph — at which point clips lacking an audio stream need `anullsrc` padding, since
ffmpeg's `concat` refuses a timeline that mixes audio and no-audio inputs. **Argv
construction is a pure function** returning `string[]`, which is what makes the filter
graph testable without spawning a process (§9).

### 7. `components/TimelineWorkspace.tsx` — the workspace

Loaded with `dynamic(..., { ssr: false })` the way `GenerationInterface` is at
`app/page.tsx:23`, reached at `?workspace=timeline`.

**Two layouts over one store**, because a horizontal track and a narrow screen are not
compatible and a squeezed track is worse than a different arrangement:

- **`lg` and up — editor shell.** Library rail left (`TimelineClipDrawer`), preview centre,
  full-width horizontal `TimelineTrack` pinned at the bottom with clip widths proportional
  to duration and horizontal scroll on overflow. The track header carries the output-format
  chip, the storage readout, and Export.
- **Below `lg` — vertical list.** `TimelineList`: clips stacked with drag handles, then
  preview, output format, storage readout, and Export beneath. Per-clip rows have room for
  slice 2's trim fields and slice 4's gain slider inline.

The `lg` cut is a starting value to confirm against the real thing at the smoke-test gate,
not a number to trust from a document.

If slice 1 overruns, the desktop editor shell is the designated cut: the vertical list
works at every width, and the proportional-width track is the enhancement, not the
foundation. Two drag surfaces is the largest optional complexity in this slice and it
should be the first thing to shrink, never the error handling or the durability rules.

**Do not render both layouts and hide one with CSS** — that doubles the DOM and mounts two
sets of drag listeners over the same clips. And no hydration dance is needed to avoid it:
the workspace loads with `dynamic(..., { ssr: false })` (§5), so it never renders on the
server and there is nothing to mismatch. Read the media query on mount and mount exactly
one layout.

`TimelineClipDrawer` renders clips the way `GalleryGrid` renders them, rather than forking
the look, so a clip looks like itself wherever it is met. Two warnings for the implementer:
`GalleryGrid`'s card is inline markup today, not an extracted component, and
`components/MediaCard.tsx` — despite the name — is the *picker* card used by the feature
grid and video-mode grid, not a result card. Do not grab it by name. Whether a thin card
extraction happens first is resolved at plan time by reading, per the final section.

**The preview is a playlist, not a render.** In slice 1 it is a `<video>` that swaps source
at each boundary and tracks a sequence-wide playhead. It does not show letterboxing or
exact cut timing. A true composited preview means running the render pipeline live, which
is slice 3's problem once transitions make it unavoidable. The UI says "preview" and must
not imply "proof."

**Export panel**, five states:

| State | Shows |
| --- | --- |
| Browser can render | `Export 24s · silent · in your browser` |
| Browser cannot, server configured | The reason, then the upload as a deliberate click, with byte count and the deletion promise |
| Neither available | Disabled, naming which is missing and why |
| Rendering | Phase, progress, Cancel |
| Clips unavailable | Disabled, naming how many and which |

Every rendering-capable state also says the export carries no sound (see Non-goals) —
users assembling Veo clips have heard them with audio, and the first silent export must
not be the way they learn.

The finished blob downloads through an anchor. It is not written back into the gallery
(see Non-goals).

### 8. `app/page.tsx` — navigation

`activeWorkspace` at `app/page.tsx:54` becomes a three-way value and the nav group at
`app/page.tsx:108` gains a third item, URL-synced through the existing nuqs `workspace`
param so `?workspace=timeline` is a shareable deep link.

**Flagged for visual verification.** The two most recent commits on `main` are
`feat: compact the interface density` and `revert: restore the top nav to its original
sizing`. That nav has already been contested once, and a third item changes it at every
breakpoint. It must be checked visually at narrow widths before shipping, which the
AGENTS.md smoke-test gate requires regardless.

## Error handling

- **Acquisition** failures degrade the clip, not the timeline. An unavailable clip stays
  in place as a broken placeholder naming its reason with a Remove action. Export is
  disabled while any exist and says how many.
- **Quota** pressure surfaces through the storage readout before it becomes
  `QUOTA_MESSAGE` on an unrelated save.
- **Browser decode failure** names *which clip* failed and offers the server engine as a
  next step rather than dead-ending.
- **Server 401** from the gate reads "sign in to use server render," which is
  distinguishable from the endpoint being unconfigured.
- **Server 413** reads "this timeline is too large to upload," with the byte count and
  the ceiling — distinguishable from both of the above, and the likely first symptom of a
  proxy whose `client_max_body_size` was never raised (§6).
- **Cancellation** aborts the signal, closes decoder and encoder, and on the server
  cancels the job and removes its temp directory.

## Testing

The suite is vitest + jsdom, which has no IndexedDB, no WebCodecs, and no real media
decoding. That is precisely why `GalleryStorage` is a port with an in-memory adapter, and
the same discipline applies here: the testable core is deliberately pure.

- **Pure units** — `deriveOutputFormat`, `selectRenderEngine`, `fitRect`, the timeline
  add/remove/`moveClip` operations, and the output-timestamp → source-frame mapping.
- **Store** — via the existing `configureGalleryStorage` seam, covering the pin-on-add
  rule and that removal does not unpin.
- **Acquisition** — stubbed `fetch`, covering the expired-404 path, the size cap, the
  `missing` reason for a deleted record, and that a record which already holds bytes gets
  re-pinned rather than trusted.
- **Components** — RTL over empty state, a broken clip, and each export-disabled reason
  including its wording.
- **Server argv** — the ffmpeg filter graph asserted as a string, no process spawned.
- **The two engines cannot be unit-tested here and will not be faked into looking tested.**
  Component and store tests run against a stub `RenderEngine`; the real WebCodecs pipeline
  and the real ffmpeg job are verified in a browser under the AGENTS.md smoke-test gate.

## Scope and implementation boundary

**Created:** `store/useTimelineStore.ts`; `lib/timeline/derive-output.ts`,
`lib/timeline/acquire.ts`, `lib/timeline/render/{port,webcodecs,server}.ts`;
`app/api/timeline/render/route.ts`; `components/TimelineWorkspace.tsx`,
`TimelineClipDrawer.tsx`, `TimelineTrack.tsx`, `TimelineList.tsx`, `TimelinePreview.tsx`,
`TimelineExportPanel.tsx`; their tests.

**Modified, and only as described above:**

| File | Permitted change |
| --- | --- |
| `app/page.tsx` | Third workspace value and nav item; nothing else |
| `lib/gallery/storage.ts` | Add optional `width`, `height`, `durationSeconds`, `fps` to `GalleryRecord` |
| `store/useGalleryStore.ts` | One mutation for the probed fields (a `setMediaInfo` action or an extended `keep`) — acquisition must write through the store, never `galleryStorage().put()` directly, or the in-memory index desyncs (§2) |
| `.gitignore` | Already updated for `.superpowers/` |

**Must not be modified:** `components/FalGenerationWorkspace.tsx`,
`components/KieGenerationWorkspace.tsx`, `components/GenerationInterface.tsx`,
`lib/fal/*`, `lib/kie/*`, `lib/engines/*`, `lib/micro-ai/*`, `lib/drop/*`,
`store/useDraftStore.ts`, `store/useSeedFrameStore.ts`, `lib/auth/*` (used, not changed),
`lib/video-frame.ts` (used as-is — `extractLastFrameFromBlob` for posters; the `frameAt`
generalization is slice 2's),
`lib/gallery/eviction.ts` (its rules are consumed as-is; the pinning decision is built
around them, not by changing them), and `scripts/deploy-production.sh`.

## Success criteria

- Video clips can be added from the library, reordered, and removed, and the arrangement
  survives a page reload.
- Clips of differing resolution and aspect on one timeline export as a single playable
  file at the derived output format, letterboxed by default.
- Both engines produce a **silent** file from the same timeline, and the export panel said
  so before the render started.
- A clip whose provider URL has expired is marked unavailable at add time, with its reason,
  and blocks export until removed. A record deleted from the Library after its clip was
  added degrades the same way (`missing`) instead of crashing or exporting stale bytes.
- Export runs in the browser on Chrome/Edge with no upload, and reports progress.
- On a browser without WebCodecs, export is not attempted silently: the UI explains and
  offers the server render as a separate action.
- The server endpoint returns 401 when the gate is enabled and the caller is not approved,
  404 when ffmpeg is not configured, and 413 with a distinct client message when the
  upload exceeds the route's byte ceiling.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass.
- The three-item nav is visually verified at narrow breakpoints against a running app.

## To resolve at plan time

- Which demux/mux dependency, at which version, on what licence and maintenance evidence.
- The exact `lg` breakpoint value, confirmed against the running app.
- Whether `TimelineClipDrawer` reuses `GalleryGrid`'s card markup directly or needs a thin
  extraction first — decided by reading it, not guessed here (and not by reaching for
  `MediaCard.tsx`, which is a picker card — §7).
- The route's upload byte ceiling, and the `client_max_body_size` value the production
  proxy needs — chosen together, documented next to `TIMELINE_FFMPEG_PATH`.
