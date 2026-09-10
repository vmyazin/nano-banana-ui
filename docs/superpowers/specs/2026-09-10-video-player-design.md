# In-house video player

Status: Approved design
Date: 2026-09-10

## Context

Every clip in the app is a bare `<video controls>`: `GalleryGrid`, `ProviderVideoWorkspace`,
`FalGenerationWorkspace`, `KieGenerationWorkspace`, `CloudAssetGrid`, `CloudJobPanel`, and the
thumbnail in `BrowserImportDialog`. The browser draws its own control bar in each one, so the
moment a generation lands — the moment the product is meant to feel finished — the frame is
wrapped in grey OS chrome that differs between Chrome, Safari and Firefox and shares nothing with
`DESIGN.md`.

That is the whole motivation. It was weighed against three other candidate reasons and they were
explicitly rejected as drivers, which is why the non-goals below are as short as they are: there
is no request for frame-stepping, in/out marks, or speed control.

One transport already exists, in `components/TimelinePreview.tsx`: play, mute, scrubber, elapsed
readout, driven from `usePlayheadStore` across two `<video>` slots. It is the right visual
starting point and it also has the disease in miniature — its scrubber is
`<input type="range" className="w-full">`, and `app/globals.css` excludes `[type='range']` from
the app's input styling, so a raw OS slider sits in the middle of the one hand-built bar in the
product. No styled range exists anywhere yet.

### Why not a library

Considered and rejected: Media Chrome, Vidstack, Plyr, Video.js v10.

- **The sources are progressive files.** `video/mp4`, `video/webm`, `video/quicktime`,
  `video/x-matroska` from provider CDNs and `blob:` URLs (`lib/media-download.ts`,
  `lib/account/import.ts`). No HLS, DASH, DRM, live, ads or captions anywhere in the repo. That
  machinery is what player libraries are for and what makes them large; none of it applies.
- **The styling is the entire job, and no library removes it.** Plyr and Video.js ship an
  opinionated skin to override; Media Chrome and Vidstack ship unstyled primitives to skin. In
  the second case the same design work happens and a dependency is carried on top of it.
- **The field is mid-consolidation.** Plyr, Vidstack and Media Chrome are being folded into
  Video.js v10 at Mux, still beta as of this writing with GA targeted mid-2026 and migration
  guides for all three on the roadmap. Adopting any of the three today is adopting a migration.
- **The honest cost of building** is the fiddly part a library would have tested for us:
  keyboard, ARIA, the Fullscreen API, buffered ranges, Safari's inline behaviour. Keeping
  `<input type="range">` as the scrubber recovers most of it from the platform — arrow-key
  seeking, `Home`/`End`, and correct `slider` ARIA are free there, and are the reason the
  scrubber must not become a `div` with pointer handlers.

## Goals

1. One player, recognisably the same instrument at every size, styled from `DESIGN.md`.
2. Two densities from one component, because a gallery cell is ~180px and a result panel ~520px:
   a volume slider and a time readout are unusable at the former.
3. `TimelinePreview` shares the *look* while keeping all of its own logic.
4. Callers stop re-deriving playback behaviour. The poster trick, viewport-gated preload,
   `playsInline` and hover-to-preview become properties of the player, not of each call site.

## Non-goals

No frame-stepping, in/out marks, playback speed, picture-in-picture, captions, chapters, or a
keyboard-shortcut overlay. No HLS/DASH/adaptive streaming. No change to `TimelinePreview`'s
slot-swapping logic or to `usePlayheadStore`. No change to the download, filename or spend
pipelines. The player does not absorb `ImageLightbox`, which stays image-only.

## Scope and implementation boundary

Lives in:

- `components/video/Transport.tsx` (new)
- `components/video/VideoPlayer.tsx` (new)
- `lib/media/use-media-state.ts` (new)
- `app/globals.css` — one appended block for the styled range
- `components/TimelinePreview.tsx` — its control row only, replaced by `<Transport>`
- The seven call sites, each swapping `<video>` for `<VideoPlayer>`
- `tests/media/hover-play-adoption.test.ts` — inverted (see Testing)

Do not modify:

- `lib/media/use-hover-play.ts` — the player calls it; its behaviour is settled and its contract
  with the DOM node is what the state model below is built around.
- `usePlayheadStore`, `lib/timeline/*`, and everything in `TimelinePreview` above its control row.
- `lib/media-download.ts`, `lib/account/asset-name.ts`, `lib/image/*`, `lib/spend/*`.
- `components/ImageLightbox.tsx`.

## Architecture

Three units, because a single component cannot serve `TimelinePreview`: that component drives two
`<video>` slots off a shared clock and can never hand its time state to something that owns one
element.

**`Transport`** — the bar, purely presentational. Values in, callbacks out; it has never heard of
a `<video>`. Density is its own property, measured from its own width, which is what makes "one
player, two densities" a decision made in one file rather than at seven call sites.

**`VideoPlayer`** — owns one `<video>`, mirrors its events, renders `<Transport>`. What every call
site uses.

**`TimelinePreview`** — keeps its logic, renders `<Transport>` in place of its hand-rolled row. It
remains the documented exception to the player and stops being an exception to the look.

### Interfaces

```tsx
interface TransportProps {
  playing: boolean;
  time: number;                  // seconds
  duration: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  hasAudio?: boolean;            // false hides volume entirely
  volume?: { level: number; muted: boolean };
  onVolume?: (next: { level: number; muted: boolean }) => void;
  onFullscreen?: () => void;     // omitted → no fullscreen button
  trackOverlay?: ReactNode;      // painted over the scrub track
  label?: string;
  density?: 'auto' | 'full' | 'compact';
}

interface VideoPlayerProps {
  src: string;
  label?: string;                // accessible name; omit → aria-hidden decorative
  fit?: 'contain' | 'cover';     // default 'contain'
  transport?: 'auto' | 'none';
  crossOrigin?: boolean;
  hasAudio?: boolean;
  className?: string;
  ref?: Ref<HTMLVideoElement>;
}
```

`trackOverlay` is first-class rather than an afterthought because two consumers need the same
real estate for different marks: `TimelinePreview` draws cut positions there today, and the
player wants buffered ranges.

The compact/full switch is one exported constant in `Transport` (`COMPACT_MAX_PX`), set from the
design exploration, compared against the bar's own measured width. It is a constant and not a
prop so that the answer to "is this too narrow for a volume slider" is given once; a prop would
let two grids disagree about it.

`VideoPlayer` always renders `Transport` at `density="auto"`. Only a direct consumer —
`TimelinePreview`, which knows it sits under a large frame — pins a density.

`hasAudio` defaults to showing the volume control. A muted-by-default guess would be wrong more
often than right, and whether an arbitrary provider `mp4` carries an audio track cannot be read
reliably across browsers. Only a caller that *knows* — as `TimelinePreview` knows from
`exportHasSound` — passes `false`. This follows the precedent already set there: a control that
cannot change anything is noise, and its absence is itself the answer.

`volume` and `onVolume` are supplied whenever `hasAudio` is not `false`; `Transport` renders no
volume control when either is missing, so a consumer cannot half-wire it into a dead button.

`crossOrigin` stays an explicit per-caller opt-in, never a default, because it is a trap in both
directions. `CloudAssetGrid` needs it for canvas reads; setting it against a provider CDN that
sends no CORS headers fails the load outright and the clip never paints.

`transport="none"` exists for exactly one caller: the thumbnail in `BrowserImportDialog` is
`aria-hidden` with no controls at all. It is not a player and must not grow a bar — it wants the
player's frame, poster and hover-preview only.

### What the player absorbs

These are copy-pasted across call sites today, each with its own comment explaining itself:

- **The `#t=0.1` poster fragment**, duplicated in `GalleryGrid` and `CloudAssetGrid` with
  near-identical rationale. `preload="none"` never fetches enough to paint a frame, and metadata
  alone still leaves Safari on a blank rectangle, so the source carries a fragment and the
  element seeks there. Stated once, as "the player paints its opening frame".
- **Viewport-gated preload.** `CloudAssetGrid`'s `ClipPlayer` wires an `IntersectionObserver` so
  a library page does not pull every clip's header at once. Every grid wants this; one has it.
  The `src` swap is what re-runs the load — a `preload` raised after the fact is only advisory,
  so that detail moves with it.
- **`playsInline`**, present on some elements and missing from others. Its absence is a real iOS
  bug where the clip takes over the screen, so the player sets it always.
- **`useHoverPlay`**, which callers stop knowing about.

## State model

**The element is the source of truth; React state only mirrors it.** `lib/media/use-media-state.ts`
subscribes to `play`, `pause`, `timeupdate`, `durationchange`, `volumechange`, `progress` and
`ended`. Pressing play calls `element.play()` and sets no state — the `play` event does that.

This is a rule rather than a preference, for three reasons that each produce a visible bug when
it is broken:

1. `useHoverPlay` mutates `muted` and `loop` on the DOM node directly. Parallel React state
   disagrees with it immediately, which is the failure that made native controls feel broken in
   the first place.
2. `play()` can be refused by autoplay policy — `useHoverPlay` already catches that. Optimistic
   state paints a pause icon over a clip that never started.
3. It keeps one clock. Two would drift, and the drift shows up as a scrubber that stutters
   against the frame.

Scrubbing is the single deliberate exception. While the thumb is held the range shows the user's
value and seeks on change; on release it returns to mirroring. Without the hold, an arriving
`timeupdate` fights the thumb and drags it backwards under the pointer. `TimelinePreview` already
needs this and calls it `shownTime`.

Fullscreen goes through the Fullscreen API on the player's **container**, not through a portaled
overlay like `ImageLightbox`, because portaling remounts the `<video>` and restarts the clip from
zero mid-watch. Container rather than element, so our bar is what appears in fullscreen. iOS
Safari fullscreens only the element and shows its own controls there; that is a documented
divergence, not something to fight.

## Appearance

The bar's visual treatment is chosen through the repo's existing convention rather than described
here: `design-explorations/video-player.html` with three or four treatments at both densities,
against `design-explorations/_brand.md`, plus its manifest. The brief from that file is *"The
Illuminated Workbench" — controls read as precise instruments*, which rules against a glowing
neon strip and toward one restrained cyan signal.

What is fixed regardless of the pick:

- The scrubber is `<input type="range">`, restyled through one `globals.css` block
  (`.transport-range` and its `::-webkit-slider-thumb` / `::-moz-range-thumb` / track
  pseudo-elements) with an inline `--pct` custom property driving the fill. It must not become a
  `div` with pointer handlers — that discards the keyboard and ARIA behaviour that is the main
  reason not to take a library.
- Focus takes the same cyan ring as the app's other fields, so a scrubber focuses like a text
  input rather than like a foreign widget.
- **Full** density sits below the frame, as `TimelinePreview`'s row does today. **Compact**
  overlays the frame's lower edge on a scrim, revealed on hover or keyboard focus, pinned visible
  on touch where there is no hover, and not faded under `prefers-reduced-motion`.

## Consequences

Losing native controls also loses the `⋮` menu, whose Download bypasses the `downloadFilenameBase`
and `lib/account/asset-name.ts` pipeline and hands out a raw CDN URL under a meaningless name.
Every surface here already renders its own download button, so nothing a viewer relied on is
removed. Picture-in-picture and cast go with it, and neither was ever asked for.

## Testing

jsdom implements no media element: `play()` is undefined, `duration` is `NaN`, and `timeupdate`
never fires. The repo already knows this (`lib/timeline/filmstrip.ts`). So the split is:

- **`Transport`** is props in, callbacks out, and fully testable: both densities via a stubbed
  `ResizeObserver`, keyboard seeking on the range, `hasAudio={false}` hiding volume,
  `trackOverlay` rendering, and the accessible name.
- **`VideoPlayer`** gets the test that matters: stub `play`/`pause` on
  `HTMLMediaElement.prototype`, dispatch synthetic media events at the element, and assert the UI
  followed *the element*. That puts the source-of-truth rule under test instead of in a comment.
- **The adoption test inverts.** `tests/media/hover-play-adoption.test.ts` keeps a
  hand-maintained list of seven files and asserts each spreads `hoverPlay`. It becomes: no
  component outside `components/video/` and `TimelinePreview.tsx` renders a bare `<video>`. That
  is a stronger invariant with no list to forget, and a new surface can no longer skip the player
  silently.
- **A real-browser smoke test is required**, because none of the above proves playback works.
  Per the session workflow: worktree, non-default port, then the localhost links for the gallery
  and a provider result page handed over for sign-off.

## Rollout

Four commits in one worktree. A new player at seven call sites in one change is miserable to
bisect.

1. Design exploration, and the pick.
2. `Transport` + `use-media-state` + the `globals.css` block + unit tests. Nothing renders it yet.
3. `TimelinePreview` adopts `Transport`. Deliberately the first consumer: it exercises the
   decoration slot and forced-full density, and it already has tests that would catch a
   regression.
4. `VideoPlayer`, then the seven call sites, then the inverted adoption test.
