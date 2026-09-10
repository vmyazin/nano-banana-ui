# In-house video player — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace native `<video controls>` at every clip surface with one in-house player styled
from `DESIGN.md`, so the app's own chrome frames a result instead of the browser's.

**Architecture:** Three units. `Transport` is a presentational bar (values in, callbacks out, no
knowledge of `<video>`) that measures its own width to pick a density. `VideoPlayer` owns one
`<video>`, mirrors its media events into React state, and renders `Transport`. `TimelinePreview`
keeps its two-slot playback engine and renders the same `Transport` over its own clock.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vitest + Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-09-10-video-player-design.md` — read it alongside this plan.

## Global Constraints

- **Test ordering is implement-first.** The user's `CLAUDE.md` makes TDD opt-in and they chose
  implement-then-test. Each task builds its deliverable, then adds tests, then commits.
- **No new dependencies.** The whole point of the spec's build-vs-borrow section. `pnpm add` is
  out of scope.
- **No agent attribution in commit messages** — `AGENTS.md` forbids it.
- **The element is the source of truth.** React state mirrors media events and never leads them.
  A click calls `element.play()` and sets nothing; the `play` event sets state.
- **The scrubber stays `<input type="range">`.** Never a `div` with pointer handlers — that
  discards the arrow-key seeking and `slider` ARIA that the platform gives for free, which is the
  main reason the spec declined a library.
- **Do not modify:** `lib/media/use-hover-play.ts`, `usePlayheadStore`, `lib/timeline/*`,
  anything in `TimelinePreview.tsx` above line 524, `lib/media-download.ts`,
  `lib/account/asset-name.ts`, `lib/image/*`, `lib/spend/*`, `components/ImageLightbox.tsx`.
- **Ports:** this worktree runs on `3097` is taken by the main checkout; use `3111` for `next dev`
  and pass it through the dev script so parallel sessions do not collide.

## File map

| Path | Responsibility |
| --- | --- |
| `design-explorations/video-player.html` (create) | 4 bar treatments × 2 densities, for the visual pick |
| `design-explorations/video-player.manifest.md` (create) | Data-provenance table per the repo convention |
| `lib/media/use-media-state.ts` (create) | Mirrors one `HTMLVideoElement`'s events into React state |
| `components/video/Transport.tsx` (create) | The bar. Presentational, density-measuring |
| `components/video/VideoPlayer.tsx` (create) | Owns a `<video>`, wires `use-media-state` + `useHoverPlay` + `Transport` |
| `app/globals.css` (append) | `.transport-range` styled range, one block at end of file |
| `components/TimelinePreview.tsx:524-581` (modify) | Control row only → `<Transport>` |
| `components/GalleryGrid.tsx:255,259` (modify) | → `<VideoPlayer>` |
| `components/ProviderVideoWorkspace.tsx:921-927` (modify) | → `<VideoPlayer>` |
| `components/FalGenerationWorkspace.tsx:208` (modify) | → `<VideoPlayer>` |
| `components/KieGenerationWorkspace.tsx:656` (modify) | → `<VideoPlayer>` |
| `components/account/CloudAssetGrid.tsx:33-43` (modify) | `ClipPlayer` collapses into `<VideoPlayer>` |
| `components/account/CloudJobPanel.tsx:76` (modify) | → `<VideoPlayer>` |
| `components/account/BrowserImportDialog.tsx:64` (modify) | → `<VideoPlayer transport="none">` |
| `tests/video/transport.test.tsx` (create) | Densities, keyboard, volume gating, overlay |
| `tests/video/player.test.tsx` (create) | The event-mirror rule |
| `tests/media/hover-play-adoption.test.ts` (rewrite) | Inverted: no bare `<video>` outside the player |

---

### Task 1: Design exploration and the visual pick

**Files:**
- Create: `design-explorations/video-player.html`
- Create: `design-explorations/video-player.manifest.md`

**Interfaces:**
- Consumes: `design-explorations/_brand.md` (the paper-chrome palette and the "Illuminated
  Workbench" north star), `DESIGN.md` (tokens).
- Produces: the chosen treatment's exact colours, sizes and spacing, which Task 2 implements.

- [ ] **Step 1: Read the convention**

Read `design-explorations/_brand.md` in full, and `design-explorations/timeline-editor.html` for
the established page structure (variant letter badges, "pick this if" / "what works" / "what
risks" decision blocks, light chrome around dark product surfaces).

- [ ] **Step 2: Build the exploration page**

One self-contained HTML file, no build step, no external requests. Four variants, each rendered
at **both** densities against a real dark frame (use a CSS gradient standing in for a video
frame — do not embed or fetch a clip):

- **A — Instrument rail.** Bar below the frame, hairline-separated, mono time readout, thin cyan
  fill on the scrub track, 1px cyan thumb. The literal reading of "precise instruments".
- **B — Floating scrim.** Bar overlaid on a bottom gradient at both densities, so grid and panel
  are identical; larger touch targets.
- **C — Minimal seam.** Scrub track *is* the frame's bottom edge, 3px tall, controls appear only
  on hover as icon-only buttons. Least chrome.
- **D — Console.** Elevated `--canvas-elevated` block with the frame recessed into it, readout and
  volume always present at full density. Heaviest, most explicit.

Each variant needs the compact rendering constrained to a 180px-wide box, so the density
threshold can be judged rather than guessed.

- [ ] **Step 3: Write the manifest**

Follow `design-explorations/timeline-editor.manifest.md`'s table format and its ✅ Real /
⚠️ Sometimes / ❌ Aspirational classes. Every data-bound element in the bar — elapsed time,
duration, buffered ranges, cut markers, volume level — with its field path and whether the
product can supply it today. Notably: `duration` is `NaN` until `durationchange` fires, and
buffered ranges are empty for a `blob:` URL that is already fully in memory, so both need a
stated fallback rendering.

- [ ] **Step 4: Serve it and hand over the link**

```bash
python3 -m http.server 8111 --directory design-explorations
```

Give the user `http://localhost:8111/video-player.html` and **stop for the pick.** Do not start
Task 2 before a variant is chosen — every measurement in Task 2 comes from it.

- [ ] **Step 5: Commit**

```bash
git add design-explorations/video-player.html design-explorations/video-player.manifest.md
git commit -m "design: explore four transport-bar treatments at both densities"
```

---

### Task 2: `use-media-state`, `Transport`, and the styled range

**Files:**
- Create: `lib/media/use-media-state.ts`
- Create: `components/video/Transport.tsx`
- Modify: `app/globals.css` (append one block)
- Test: `tests/video/transport.test.tsx`

**Interfaces:**
- Consumes: the Task 1 pick.
- Produces:

```ts
// lib/media/use-media-state.ts
export interface MediaState {
  playing: boolean;
  time: number;
  duration: number;
  volume: { level: number; muted: boolean };
  buffered: ReadonlyArray<{ start: number; end: number }>;
  ended: boolean;
}
export function useMediaState(ref: RefObject<HTMLVideoElement | null>): MediaState;

// components/video/Transport.tsx
export const COMPACT_MAX_PX = 260;
export interface TransportProps {
  playing: boolean;
  time: number;
  duration: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  hasAudio?: boolean;
  volume?: { level: number; muted: boolean };
  onVolume?: (next: { level: number; muted: boolean }) => void;
  onFullscreen?: () => void;
  trackOverlay?: ReactNode;
  label?: string;
  density?: 'auto' | 'full' | 'compact';
}
export default function Transport(props: TransportProps): JSX.Element;
```

- [ ] **Step 1: Write `use-media-state.ts`**

Subscribe to `play`, `pause`, `timeupdate`, `durationchange`, `volumechange`, `progress`,
`ended`, `loadedmetadata`, `emptied`. Read the element on every event rather than trusting the
event payload, so a state set by `useHoverPlay` mutating `muted` directly is picked up by the
`volumechange` it causes.

Two details that are bugs if missed:

```ts
// `duration` is NaN before metadata and Infinity for an unbounded source.
// Both must read as "unknown" rather than reaching the bar as a number.
const readDuration = (el: HTMLVideoElement) =>
  Number.isFinite(el.duration) ? el.duration : 0;

// The listener set must be re-attached when the element identity changes, not
// only on mount: CloudAssetGrid swaps `src` to trigger a reload, and
// TimelinePreview swaps which slot is active.
```

Also attach a `requestAnimationFrame` loop **only while playing**, because `timeupdate` fires at
roughly 4Hz and a scrubber driven by it visibly steps. Cancel it on pause; never run it while
paused or the tab stays awake for nothing.

- [ ] **Step 2: Write `Transport.tsx`**

Presentational. Density: `density === 'auto'` measures via `ResizeObserver` on the bar's own
wrapper and compares against `COMPACT_MAX_PX`; `'full'` and `'compact'` skip measurement.
Guard for `typeof ResizeObserver === 'undefined'` and default to full — jsdom has none, and a
test that renders nothing is worse than one that renders the wide bar.

The scrub hold, which is the part most likely to be got wrong:

```tsx
const [held, setHeld] = useState<number | null>(null);
const shown = held ?? time;
// While the thumb is held the range shows the viewer's value. Without this an
// arriving timeupdate rewrites `value` mid-drag and hauls the thumb backwards
// under the pointer.
<input
  type="range"
  className="transport-range"
  min={0}
  max={duration || 0}
  step={0.01}
  value={shown}
  style={{ ['--pct' as string]: `${duration ? (shown / duration) * 100 : 0}%` }}
  aria-label={label ? `${label} position` : 'Playback position'}
  onChange={(e) => { const v = Number(e.target.value); setHeld(v); onSeek(v); }}
  onPointerUp={() => setHeld(null)}
  onBlur={() => setHeld(null)}
  onKeyUp={() => setHeld(null)}
/>
```

**Compact is not just a narrower full bar** — it overlays the frame, so it needs reveal rules the
full bar does not:

```tsx
// Revealed on hover or when anything inside it has focus, so a keyboard user is
// not seeking a bar they cannot see. `:focus-within` rather than a focus
// handler: the range, the play button and the volume control all count, and one
// CSS rule beats three listeners.
//
// Pinned visible when the pointer is coarse — there is no hover on touch, so a
// reveal-on-hover bar is simply an absent bar — and never faded under reduced
// motion, which asks for no unrequested movement rather than no visibility.
const scrim = 'transition-opacity motion-reduce:transition-none opacity-0 ' +
  'group-hover:opacity-100 focus-within:opacity-100 ' +
  '[@media(pointer:coarse)]:opacity-100 motion-reduce:opacity-100';
```

The `group` class goes on `VideoPlayer`'s container in Task 4, since the hover target is the
frame, not the bar.

Volume renders only when `hasAudio !== false && volume && onVolume` — all three, so a
half-wired consumer gets no control rather than a dead one. Fullscreen button renders only when
`onFullscreen` is passed. `trackOverlay` is rendered in a `pointer-events-none absolute inset-0`
sibling over the range's wrapper, matching what `TimelinePreview.tsx:566-575` does today.

- [ ] **Step 3: Append the range CSS to `app/globals.css`**

One block at the end of the file. Use the exact colours from the Task 1 pick. Required
pseudo-elements: `.transport-range::-webkit-slider-runnable-track`,
`::-webkit-slider-thumb`, `::-moz-range-track`, `::-moz-range-thumb`. The fill reads `--pct`:

```css
.transport-range {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  /* The track paints the fill itself off --pct, because ::-moz-range-progress
     and ::-webkit-progress-value are not both available on one input. */
}
.transport-range:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0, 255, 249, 0.12);
}
```

Do not touch the existing `input:not([type='checkbox'])...` rule at line 350 — range is already
excluded there deliberately, and the `min-height` it applies would break the thin track.

- [ ] **Step 4: Write `tests/video/transport.test.tsx`**

Real assertions, not smoke:

```tsx
it('hides volume when the media has no audio', () => {
  render(<Transport {...base} hasAudio={false} volume={{level:1,muted:false}} onVolume={()=>{}} />);
  expect(screen.queryByLabelText(/volume/i)).toBeNull();
});

it('hides volume when a consumer passes no handler', () => {
  render(<Transport {...base} volume={{ level: 1, muted: false }} />);
  expect(screen.queryByLabelText(/volume/i)).toBeNull();
});

it('holds the viewer\'s value while scrubbing, ignoring an incoming time', () => {
  const { rerender } = render(<Transport {...base} duration={10} time={2} onSeek={onSeek} />);
  const range = screen.getByLabelText(/position/i);
  fireEvent.change(range, { target: { value: '8' } });
  rerender(<Transport {...base} duration={10} time={2.5} onSeek={onSeek} />);
  expect((range as HTMLInputElement).value).toBe('8');   // not 2.5
  fireEvent.pointerUp(range);
  rerender(<Transport {...base} duration={10} time={2.5} onSeek={onSeek} />);
  expect((range as HTMLInputElement).value).toBe('2.5'); // mirroring resumed
});

it('renders the wide bar when ResizeObserver is unavailable', () => {
  // jsdom ships none. A component that rendered nothing here would make every
  // other test in this file meaningless, so the fallback is full, not empty.
  render(<Transport {...base} hasAudio volume={{level:1,muted:false}} onVolume={()=>{}} />);
  expect(screen.getByLabelText(/volume/i)).toBeInTheDocument();
});

it('renders trackOverlay children over the scrub track', () => {
  render(<Transport {...base} trackOverlay={<span data-testid="cut" />} />);
  expect(screen.getByTestId('cut')).toBeInTheDocument();
});

it('omits the fullscreen button when no handler is given', () => {
  const { rerender } = render(<Transport {...base} />);
  expect(screen.queryByLabelText(/fullscreen/i)).toBeNull();
  rerender(<Transport {...base} onFullscreen={() => {}} />);
  expect(screen.getByLabelText(/fullscreen/i)).toBeInTheDocument();
});

it('reads an unknown duration as zero rather than rendering NaN', () => {
  render(<Transport {...base} duration={0} time={0} />);
  expect(screen.getByLabelText(/position/i)).toHaveAttribute('max', '0');
  expect(document.body.textContent).not.toMatch(/NaN/);
});
```

- [ ] **Step 5: Verify**

```bash
pnpm test -- tests/video/transport.test.tsx
npx tsc --noEmit
pnpm lint
```
Expected: tests pass, no type errors, no lint errors. Nothing renders `Transport` yet, so the app
is unchanged — confirm with `pnpm test` in full that no existing test moved.

- [ ] **Step 6: Commit**

```bash
git add lib/media/use-media-state.ts components/video/Transport.tsx app/globals.css tests/video/transport.test.tsx
git commit -m "feat: add a styled transport bar and a media-state mirror"
```

---

### Task 3: `TimelinePreview` adopts `Transport`

Deliberately the first consumer: it exercises `trackOverlay` and a pinned density, and it already
has tests that will catch a regression in the app's only existing playback engine.

**Files:**
- Modify: `components/TimelinePreview.tsx:524-581` (the control row only)
- Test: existing `tests/` timeline preview coverage must pass unchanged

**Interfaces:**
- Consumes: `Transport` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Find the existing coverage and run it first**

```bash
grep -rl "TimelinePreview\|preview-slot" tests/ && pnpm test -- tests/
```
Record which tests touch the preview and that they pass **before** the edit. A green baseline is
what makes the next step's result meaningful.

- [ ] **Step 2: Replace the control row**

Lines 524-581 become one `<Transport>`. The mapping, all from state that already exists in the
component:

| `Transport` prop | Existing source |
| --- | --- |
| `playing` | `playing` (from `usePlayheadStore`) |
| `time` | `shownTime` (line 220 — already clamped) |
| `duration` | `sequence.total` |
| `onToggle` | `toggle` (line 353) |
| `onSeek` | `(s) => usePlayheadStore.getState().seek(s)` |
| `hasAudio` | `exportHasSound` (line 436) |
| `volume` | `{ level: 1, muted: !soundOn }` |
| `onVolume` | `(next) => setSoundOn(!next.muted)` |
| `density` | `"full"` — it sits under a large frame, never measure |
| `label` | `"Preview"` |
| `trackOverlay` | the existing cut-marker `<div>` from lines 566-575, moved verbatim |
| `onFullscreen` | **omitted** — the preview is not a fullscreen surface |

The preview has one level of volume and a mute toggle, not a slider, which is why `volume.level`
is pinned to `1`: `soundOn` is a boolean session gesture (see the comment at line 174) and
nothing about the export changes with it. Keep the `{playing ? 'Pause (Space)' : 'Play (Space)'}`
title text — the keyboard shortcut is real and lives in `toggleRef` at line 372.

- [ ] **Step 3: Verify the baseline held**

```bash
pnpm test -- tests/
npx tsc --noEmit
```
Expected: the same tests that passed in Step 1 still pass. If a preview test now fails, the
mapping table above is wrong — fix the mapping, do not edit the test.

- [ ] **Step 4: Commit**

```bash
git add components/TimelinePreview.tsx
git commit -m "refactor: render the shared transport in the timeline preview"
```

---

### Task 4: `VideoPlayer`

**Files:**
- Create: `components/video/VideoPlayer.tsx`
- Test: `tests/video/player.test.tsx`

**Interfaces:**
- Consumes: `useMediaState` and `Transport` from Task 2; `useHoverPlay` from
  `lib/media/use-hover-play.ts` **unmodified**. Not `COMPACT_MAX_PX` — `Transport` measures
  itself, so the player passes `density="auto"` and never reads the threshold.
- Produces:

```tsx
export interface VideoPlayerProps {
  src: string;
  label?: string;
  fit?: 'contain' | 'cover';
  transport?: 'auto' | 'none';
  crossOrigin?: boolean;
  hasAudio?: boolean;
  className?: string;
  ref?: Ref<HTMLVideoElement>;
}
export default function VideoPlayer(props: VideoPlayerProps): JSX.Element;
```

- [ ] **Step 1: Implement the element and its absorbed behaviours**

All four move here from the call sites, each with the rationale the call sites currently carry:

```tsx
// Viewport-gated preload, from CloudAssetGrid's ClipPlayer. A library page must
// not pull every clip's header at once. The `src` swap is what re-runs the
// load — a `preload` raised after the fact is only advisory — and jsdom has no
// IntersectionObserver, where a viewer still deserves a poster.
const [shown, setShown] = useState(typeof IntersectionObserver === 'undefined');

// The poster fragment, from GalleryGrid and CloudAssetGrid. preload="none"
// never fetches enough to paint a frame and metadata alone leaves Safari on a
// black rectangle, so the source carries a seek the element honours.
const loaded = shown ? `${src}#t=0.1` : src;
```

`playsInline` is set unconditionally — its absence is the iOS bug where a clip takes over the
screen. `controls` is **never** set: that is the entire point of the change. Forward `ref` with
`useImperativeHandle` or a merged callback ref, because the element is also needed internally.

- [ ] **Step 2: Wire state, hover-play and fullscreen**

`useMediaState(innerRef)` feeds `Transport`. `onToggle` calls `element.play()` / `element.pause()`
and sets **no** state. `onSeek` writes `element.currentTime`. `onVolume` writes `element.muted`
and `element.volume`.

`useHoverPlay()`'s handlers spread onto the `<video>` exactly as they do today. They mutate
`muted` and `loop` on the node, and `useMediaState` sees the resulting `volumechange` — that is
why the mirror is not optional.

Fullscreen requests on the **container** so the custom bar is visible, with the iOS fallback:

```tsx
const enterFullscreen = () => {
  const box = containerRef.current, el = innerRef.current;
  if (box?.requestFullscreen) return void box.requestFullscreen().catch(() => {});
  // iOS Safari fullscreens only the element, and shows its own controls there.
  // A documented divergence, not something to work around.
  (el as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
};
```

`MediaState.buffered` reaches the bar as `trackOverlay` — the same slot `TimelinePreview` uses for
cut markers, which is why it is a `ReactNode` and not a `marks?: number[]`:

```tsx
// A blob: URL that is already fully in memory reports one range covering the
// whole clip, and some browsers report none at all. Both are correct and both
// mean "nothing useful to draw", so an empty or total range paints nothing
// rather than a full bar that looks like a second progress fill.
const overlay = buffered.length && !(buffered.length === 1 && buffered[0].end >= duration)
  ? <>{buffered.map((r, i) => <span key={i} style={{ left: `${r.start/duration*100}%`, width: `${(r.end-r.start)/duration*100}%` }} className="absolute ..." />)}</>
  : undefined;
```

`transport === 'none'` renders no bar and sets `aria-hidden` when `label` is absent — the
`BrowserImportDialog` thumbnail case. Its container still takes the `group` class from Task 2, so
a hover preview works there even with no bar to reveal.

- [ ] **Step 3: Write `tests/video/player.test.tsx`**

jsdom implements no media element, so stub the prototype. This is the test that puts the
source-of-truth rule under test rather than in a comment:

```tsx
beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
});

it('does not claim to be playing until the element says so', () => {
  render(<VideoPlayer src="blob:x" label="Clip" />);
  fireEvent.click(screen.getByLabelText(/play/i));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  // The click set no state. Still shows Play, because no `play` event fired.
  expect(screen.getByLabelText(/play/i)).toBeInTheDocument();
});

it('follows the element when something else starts it', () => {
  render(<VideoPlayer src="blob:x" label="Clip" />);
  const el = document.querySelector('video')!;
  fireEvent(el, new Event('play'));
  expect(screen.getByLabelText(/pause/i)).toBeInTheDocument();
});

it('reads a mute applied directly to the node, as hover-play does', () => {
  render(<VideoPlayer src="blob:x" label="Clip" hasAudio />);
  const el = document.querySelector('video')!;
  // Exactly what useHoverPlay does at lib/media/use-hover-play.ts:74-76.
  el.muted = true;
  fireEvent(el, new Event('volumechange'));
  expect(screen.getByLabelText(/unmute/i)).toBeInTheDocument();
});

it('treats a NaN duration as unknown rather than rendering NaN', () => {
  render(<VideoPlayer src="blob:x" label="Clip" />);
  const el = document.querySelector('video')!;
  // jsdom leaves duration NaN; a real element does too until metadata lands.
  fireEvent(el, new Event('durationchange'));
  expect(document.body.textContent).not.toMatch(/NaN/);
});

it('never sets the controls attribute', () => {
  render(<VideoPlayer src="blob:x" label="Clip" />);
  expect(document.querySelector('video')!.hasAttribute('controls')).toBe(false);
});
it('renders no bar and hides itself when transport is none and unlabelled', () => { /* ... */ });
```

- [ ] **Step 4: Verify**

```bash
pnpm test -- tests/video/
npx tsc --noEmit && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add components/video/VideoPlayer.tsx tests/video/player.test.tsx
git commit -m "feat: add the in-house video player"
```

---

### Task 5: Swap the seven call sites and invert the adoption test

**Files:**
- Modify: `components/GalleryGrid.tsx:255,259`
- Modify: `components/ProviderVideoWorkspace.tsx:921-927`
- Modify: `components/FalGenerationWorkspace.tsx:208`
- Modify: `components/KieGenerationWorkspace.tsx:656`
- Modify: `components/account/CloudAssetGrid.tsx:33-43`
- Modify: `components/account/CloudJobPanel.tsx:76`
- Modify: `components/account/BrowserImportDialog.tsx:64`
- Rewrite: `tests/media/hover-play-adoption.test.ts`

**Interfaces:**
- Consumes: `VideoPlayer` from Task 4.
- Produces: no bare `<video>` outside `components/video/` and `TimelinePreview.tsx`.

- [ ] **Step 1: Swap each site, deleting the behaviour the player now owns**

Per site, the `#t=0.1` fragment, the `preload` juggling, `playsInline`, `controls`, the
`useHoverPlay` import and its spread, and — in `CloudAssetGrid` — the whole `ClipPlayer` function
including its `IntersectionObserver` effect, all come out. The rationale comments come out with
them; they now live in `VideoPlayer`. Keep each site's `className` and `fit`:

| Site | Replacement |
| --- | --- |
| `GalleryGrid` (both) | `<VideoPlayer src={url} label={titleOf(record)} className="h-full w-full" />` |
| `ProviderVideoWorkspace` | `<VideoPlayer src={resultUrl} label="Generated video" className="h-full max-h-[520px] w-full" />` |
| `FalGenerationWorkspace` | `<VideoPlayer src={resultUrl} label="Generated video" className="max-h-[520px] w-full rounded-lg" />` |
| `KieGenerationWorkspace` | `<VideoPlayer src={resultUrl} label="Generated video" className="h-full w-full max-h-[520px]" />` |
| `CloudAssetGrid` | `<VideoPlayer src={src} label={label} crossOrigin className="h-full w-full" />` |
| `CloudJobPanel` | `<VideoPlayer src={`/api/account/assets/${assets[0].id}/content`} label="Saved video" crossOrigin className="w-full rounded-xl" />` |
| `BrowserImportDialog` | `<VideoPlayer src={url} transport="none" fit="contain" className="h-full w-full" />` |

`crossOrigin` goes on the two account surfaces only. Do **not** add it to the provider surfaces:
their CDNs send no CORS headers and the attribute fails the load outright, leaving a clip that
never paints.

- [ ] **Step 2: Rewrite the adoption test**

Replace the hand-maintained seven-file list with the invariant. `tests/media/hover-play-adoption.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Hover-to-preview, the poster frame, viewport-gated preload and `playsInline`
 * are all properties of `VideoPlayer` now, so the rule is no longer "spread the
 * hook" but "go through the player". Stated as an invariant rather than a list
 * of files, because a list has to be remembered and a new surface that forgot
 * it used to pass.
 *
 * TimelinePreview is the one exception: its two slots are driven by the
 * playhead across a shared clock, so it owns its elements and renders only the
 * shared bar.
 */
const ALLOWED = ['components/video/VideoPlayer.tsx', 'components/TimelinePreview.tsx'];

describe('video element adoption', () => {
  it('no component renders a bare <video> outside the player', () => {
    const hits = execSync(
      "grep -rln --include='*.tsx' -e '<video[[:space:]]' components app || true",
      { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
    expect(hits.filter((f) => !ALLOWED.includes(f))).toEqual([]);
  });
});
```

- [ ] **Step 3: Verify the whole suite**

```bash
pnpm test
npx tsc --noEmit && pnpm lint
```
Expected: all pass. Tests that assert on video markup at these sites (`tests/gallery/grid.test.tsx`,
`tests/video-workspace.test.tsx`, `tests/providers/frames-mode.test.tsx`) may query the element
directly — if one fails because it looked for `controls`, that assertion is now wrong and the
test should be updated to assert the player's bar instead.

- [ ] **Step 4: Production build, because Turbopack is the only thing that catches some of this**

```bash
pnpm build
```
Expected: succeeds. The worktree has real `node_modules` (installed, not symlinked) precisely so
this can run — see `AGENTS.md`.

- [ ] **Step 5: Commit**

```bash
git add components/ tests/media/hover-play-adoption.test.ts
git commit -m "refactor: play every clip through the in-house player"
```

---

### Task 6: Real-browser smoke test and sign-off

No test above proves a clip actually plays: jsdom has no media element and `pnpm build` only
type-checks the render. This task is the hard gate from `AGENTS.md` — a UI change that was only
type-checked must never ship.

**Files:** none.

- [ ] **Step 1: Start the dev server on a non-default port**

```bash
PORT=3111 pnpm dev
```

- [ ] **Step 2: Seed a local library, since the gallery reads IndexedDB**

Paste `scripts/seed-browser-gallery.js` into DevTools on `http://localhost:3111` — it cannot run
as a Node script, because IndexedDB is scoped to one origin in one browser profile. The fixture
ships 12 records including 2 videos.

- [ ] **Step 3: Walk the surfaces and check the things tests cannot**

At compact density in the gallery grid, and full density on a provider result page: the bar
appears; play/pause tracks the frame; the scrubber drags without fighting back and seeks; the
poster frame paints rather than a black rectangle; hover-to-preview still starts after ~1s and
still hands over on unmute; fullscreen shows *our* bar; keyboard `Tab` reaches the range and
arrows seek. Then the timeline preview: cut markers still sit on the track, Space still toggles.

- [ ] **Step 4: Hand over the links and wait**

Give the user `http://localhost:3111/` (gallery + a provider page) and the timeline workspace
link, and get an explicit go-ahead. **This is a hard gate** — a push to `main` auto-deploys.

- [ ] **Step 5: Ship after sign-off**

```bash
git fetch && git rebase origin/main   # main moves often
git push -u origin video-player
```

- [ ] **Step 6: Tear down**

Stop the dev server and the exploration's HTTP server, then remove the worktree:

```bash
git worktree remove .claude/worktrees/video-player
```
