# Video Timeline (slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third workspace where any video in the library can be arranged into an order and exported as one continuous, silent video file — rendered in the browser by default, or on the server by explicit choice.

**Architecture:** The timeline stores references to `GalleryRecord` ids, never media; the gallery stays the single source of truth for bytes. Acquisition guarantees each referenced clip has real, pinned bytes. Rendering goes through a `RenderEngine` port with two implementations (browser WebCodecs, server ffmpeg), mirroring how `GalleryStorage` is a port with two implementations.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, zustand + `zustand/persist`, nuqs for URL state, Tailwind v4, vitest + jsdom + Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-16-video-timeline-design.md` — read it alongside this plan. Where they disagree, the spec wins and this plan is wrong.

## Global Constraints

Every task's requirements implicitly include this section.

- **Package manager is pnpm only.** Never run `npm` or `yarn`. `pnpm-lock.yaml` is the only lockfile.
- **Exports are silent.** No audio is decoded, encoded, or muxed. The server graph passes `-an`. Every rendering-capable export state tells the user the export carries no sound.
- **The timeline stores no media.** Only `GalleryRecord.id` references plus placement data.
- **Adding a clip pins its record.** If the record already has bytes, call `setPinned(id, true)` explicitly — "has a blob" never means "is safe."
- **Export re-resolves every clip** through `acquireClipMedia` before rendering. Add-time validation is not sufficient.
- **The poster is the last frame**, stored via the existing `extractLastFrameFromBlob`, matching what `GalleryGrid`'s Keep stores.
- **`lib/video-frame.ts` must not be modified.** `frameAt(blob, seconds)` is slice 2.
- **Tests live in `tests/timeline/`**, using relative imports (`../../lib/...`), matching `tests/gallery/`.
- **Verification commands:** `pnpm test`, `pnpm lint`, `pnpm build`.
- **Do not commit** unless the human asks. Each task's final step stages files and states the commit message; run `git add` and stop there unless told otherwise.

## File map

**Create:**

| Path | Responsibility |
| --- | --- |
| `store/useTimelineStore.ts` | Timeline state: clips, output, persistence. Pure/synchronous — no gallery calls. |
| `lib/timeline/derive-output.ts` | `deriveOutputFormat` — pure |
| `lib/timeline/probe.ts` | `probeDimensions` (video element), `probeFramerate` (demuxer, Task 8) |
| `lib/timeline/acquire.ts` | `acquireClipMedia` — bytes, pinning, unavailability reasons |
| `lib/timeline/render/port.ts` | `RenderEngine`, `RenderRequest`, `RenderProgress`, `fitRect`, `selectRenderEngine` |
| `lib/timeline/render/webcodecs.ts` | Browser engine |
| `lib/timeline/render/server.ts` | Server engine client |
| `lib/timeline/render/ffmpeg-args.ts` | Pure argv builder |
| `app/api/timeline/render/route.ts` | Job create / status / result |
| `lib/timeline/jobs.ts` | Server-side job registry, queue, temp dirs |
| `components/TimelineWorkspace.tsx` | Shell; picks layout by width |
| `components/TimelineList.tsx` | Vertical layout (all widths — the foundation) |
| `components/TimelineTrack.tsx` | Horizontal track (`lg`+ enhancement) |
| `components/TimelineClipDrawer.tsx` | Library rail |
| `components/TimelinePreview.tsx` | Playlist preview |
| `components/TimelineExportPanel.tsx` | Five export states |
| `tests/timeline/*.test.ts(x)` | Per-module tests |

**Modify — only as stated:**

| Path | Target | Permitted change |
| --- | --- | --- |
| `app/page.tsx` | `:54`, `:108-125`, `:200` | `activeWorkspace` becomes three-way; third nav item; render `TimelineWorkspace` |
| `lib/gallery/storage.ts` | `GalleryRecord`, `:8-46` | Add optional `width`, `height`, `durationSeconds`, `fps` |
| `store/useGalleryStore.ts` | `GalleryState`, `:15-33` | Add one action to write probed dimension fields |

**Do not modify:**

```
lib/video-frame.ts
lib/gallery/eviction.ts
lib/gallery/capture.ts
lib/gallery/idb-storage.ts
lib/gallery/memory-storage.ts
components/GalleryGrid.tsx
components/MediaCard.tsx
components/LastFrameActions.tsx
components/FalGenerationWorkspace.tsx
components/KieGenerationWorkspace.tsx
components/GenerationInterface.tsx
components/VideoWorkspace.tsx
lib/fal/**  lib/kie/**  lib/engines/**  lib/micro-ai/**  lib/drop/**
lib/auth/**            (used, never changed)
store/useDraftStore.ts  store/useSeedFrameStore.ts  store/useAppStore.ts
scripts/deploy-production.sh
```

> `components/MediaCard.tsx` is the **picker** card used by the feature and video-mode grids, not a result card. Do not reach for it by name.

---

### Task 1: Choose the demux/mux dependency

Gates Task 8 only. Everything before it proceeds without this decision.

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `docs/superpowers/plans/2026-08-16-video-timeline-dependency-note.md`

**Interfaces:**
- Consumes: nothing
- Produces: a chosen package name + version that Task 8 imports; a `demuxToSamples`-shaped capability confirmed to exist in it

- [ ] **Step 1: Evaluate the candidates**

Check `mediabunny` and (`mp4box.js` + `mp4-muxer`) against these, recording each answer with evidence:

| Criterion | Requirement |
| --- | --- |
| Licence | MIT or Apache-2.0 |
| Last release | Within 12 months |
| Distribution | JavaScript, **not** a wasm blob |
| Bundle | Tree-shakeable ESM |
| Capability | MP4 demux to encoded chunks **and** MP4 mux from encoded chunks |
| Framerate | Exposes sample count or per-sample timestamps (needed for `probeFramerate`) |

```bash
pnpm view mediabunny version license repository.url time.modified
pnpm view mp4box version license time.modified
pnpm view mp4-muxer version license time.modified
```

- [ ] **Step 2: Write the decision note**

Create `docs/superpowers/plans/2026-08-16-video-timeline-dependency-note.md` recording the table above with actual values, the choice, and the reason. This is the evidence the spec asked for and refused to assume.

- [ ] **Step 3: Install**

```bash
pnpm add <chosen-package>
```

- [ ] **Step 4: Verify the lockfile stayed reproducible**

Run: `pnpm install --frozen-lockfile && pnpm build`
Expected: both succeed. If `--frozen-lockfile` fails, the lockfile was not committed with the manifest.

- [ ] **Step 5: Stage**

```bash
git add package.json pnpm-lock.yaml docs/superpowers/plans/2026-08-16-video-timeline-dependency-note.md
# message: chore: add <package> for timeline demux and mux
```

---

### Task 2: Timeline store

**Files:**
- Create: `store/useTimelineStore.ts`
- Test: `tests/timeline/store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `TimelineClip { id: string; recordId: string; fit: 'contain' | 'cover' }`
  - `TimelineOutput { width: number; height: number; fps: number; auto: boolean }`
  - `Timeline { id, name, clips, output, createdAt, updatedAt }`
  - `useTimelineStore` with `addClip(recordId) → string`, `removeClip(clipId)`, `moveClip(clipId, toIndex)`, `setFit(clipId, fit)`, `setOutput(partial)`, `matchClips()`, `clear()`

The store is **synchronous and pure**. It never calls the gallery. Acquisition and pinning are the caller's job (Task 5), which keeps this file testable without a storage double.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/timeline/store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useTimelineStore } from '../../store/useTimelineStore';

const ids = () => useTimelineStore.getState().timeline.clips.map((c) => c.recordId);

describe('useTimelineStore', () => {
  beforeEach(() => useTimelineStore.getState().clear());

  it('appends clips in the order they are added', () => {
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('b');
    expect(ids()).toEqual(['a', 'b']);
  });

  it('gives each placement its own id so one record can appear twice', () => {
    const first = useTimelineStore.getState().addClip('a');
    const second = useTimelineStore.getState().addClip('a');
    expect(first).not.toBe(second);
    expect(ids()).toEqual(['a', 'a']);
  });

  it('removes by placement id, not by record id', () => {
    const first = useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().removeClip(first);
    expect(useTimelineStore.getState().timeline.clips).toHaveLength(1);
  });

  it('moves a clip to an index without depending on a stale from-index', () => {
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('b');
    const c = useTimelineStore.getState().addClip('c');
    useTimelineStore.getState().moveClip(c, 0);
    expect(ids()).toEqual(['c', 'a', 'b']);
  });

  it('clamps an out-of-range move instead of dropping the clip', () => {
    const a = useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().addClip('b');
    useTimelineStore.getState().moveClip(a, 99);
    expect(ids()).toEqual(['b', 'a']);
  });

  it('ignores a move for an unknown clip id', () => {
    useTimelineStore.getState().addClip('a');
    useTimelineStore.getState().moveClip('nope', 0);
    expect(ids()).toEqual(['a']);
  });

  it('freezes auto the moment the user edits the output, and matchClips thaws it', () => {
    useTimelineStore.getState().setOutput({ fps: 24 });
    expect(useTimelineStore.getState().timeline.output.auto).toBe(false);
    useTimelineStore.getState().matchClips();
    expect(useTimelineStore.getState().timeline.output.auto).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/timeline/store.test.ts`
Expected: FAIL — cannot resolve `../../store/useTimelineStore`.

- [ ] **Step 3: Implement**

```ts
// store/useTimelineStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TimelineClip {
  /** This placement. The same record may appear more than once. */
  id: string;
  recordId: string;
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

const DEFAULT_OUTPUT: TimelineOutput = { width: 1920, height: 1080, fps: 30, auto: true };

let placementCounter = 0;
function placementId() {
  placementCounter += 1;
  return `clip-${Date.now()}-${placementCounter}`;
}

function emptyTimeline(): Timeline {
  const now = Date.now();
  return {
    id: `timeline-${now}`,
    name: 'Untitled timeline',
    clips: [],
    output: { ...DEFAULT_OUTPUT },
    createdAt: now,
    updatedAt: now,
  };
}

interface TimelineState {
  timeline: Timeline;
  addClip: (recordId: string) => string;
  removeClip: (clipId: string) => void;
  /**
   * Id-based, not index-based: two drag surfaces plus async state updates make a
   * stale `from` index the easy bug to write and the hard one to reproduce.
   */
  moveClip: (clipId: string, toIndex: number) => void;
  setFit: (clipId: string, fit: 'contain' | 'cover') => void;
  /** Any user edit freezes the derived format. */
  setOutput: (patch: Partial<Omit<TimelineOutput, 'auto'>>) => void;
  /** Applies a derived format without unfreezing; used by the auto recompute. */
  applyDerivedOutput: (output: Omit<TimelineOutput, 'auto'>) => void;
  /** "I fiddled and want the automatic answer back." */
  matchClips: () => void;
  clear: () => void;
}

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set) => {
      const edit = (change: (timeline: Timeline) => Timeline) =>
        set((state) => ({ timeline: { ...change(state.timeline), updatedAt: Date.now() } }));

      return {
        timeline: emptyTimeline(),

        addClip: (recordId) => {
          const id = placementId();
          edit((timeline) => ({
            ...timeline,
            clips: [...timeline.clips, { id, recordId, fit: 'contain' }],
          }));
          return id;
        },

        removeClip: (clipId) =>
          edit((timeline) => ({
            ...timeline,
            clips: timeline.clips.filter((clip) => clip.id !== clipId),
          })),

        moveClip: (clipId, toIndex) =>
          edit((timeline) => {
            const from = timeline.clips.findIndex((clip) => clip.id === clipId);
            if (from === -1) return timeline;
            const clips = [...timeline.clips];
            const [moved] = clips.splice(from, 1);
            clips.splice(Math.max(0, Math.min(toIndex, clips.length)), 0, moved);
            return { ...timeline, clips };
          }),

        setFit: (clipId, fit) =>
          edit((timeline) => ({
            ...timeline,
            clips: timeline.clips.map((clip) => (clip.id === clipId ? { ...clip, fit } : clip)),
          })),

        setOutput: (patch) =>
          edit((timeline) => ({
            ...timeline,
            output: { ...timeline.output, ...patch, auto: false },
          })),

        applyDerivedOutput: (output) =>
          edit((timeline) =>
            timeline.output.auto ? { ...timeline, output: { ...output, auto: true } } : timeline
          ),

        matchClips: () =>
          edit((timeline) => ({ ...timeline, output: { ...timeline.output, auto: true } })),

        clear: () => set({ timeline: emptyTimeline() }),
      };
    },
    {
      name: 'scene-assembly-timeline',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/timeline/store.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Stage**

```bash
git add store/useTimelineStore.ts tests/timeline/store.test.ts
# message: feat: add the timeline store
```

---

### Task 3: Derived output format

**Files:**
- Create: `lib/timeline/derive-output.ts`
- Test: `tests/timeline/derive-output.test.ts`

**Interfaces:**
- Consumes: `TimelineOutput` from Task 2
- Produces: `ClipDimensions { width, height, durationSeconds, fps? }`; `deriveOutputFormat(clips: ClipDimensions[]) → Omit<TimelineOutput, 'auto'>`

`fps` is optional and best-effort — Task 5 supplies dimensions without it, Task 8 starts supplying it. A clip with no `fps` does not vote.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/timeline/derive-output.test.ts
import { describe, expect, it } from 'vitest';

import { deriveOutputFormat, type ClipDimensions } from '../../lib/timeline/derive-output';

const clip = (o: Partial<ClipDimensions> = {}): ClipDimensions => ({
  width: 1920, height: 1080, durationSeconds: 5, ...o,
});

describe('deriveOutputFormat', () => {
  it('falls back to 1920x1080 at 30fps for an empty timeline', () => {
    expect(deriveOutputFormat([])).toEqual({ width: 1920, height: 1080, fps: 30 });
  });

  it('picks the aspect ratio most clips share', () => {
    const result = deriveOutputFormat([
      clip({ width: 1920, height: 1080 }),
      clip({ width: 1280, height: 720 }),
      clip({ width: 1080, height: 1920 }),
    ]);
    expect(result.width / result.height).toBeCloseTo(16 / 9);
  });

  it('breaks an aspect tie by total duration, not clip count', () => {
    const result = deriveOutputFormat([
      clip({ width: 1920, height: 1080, durationSeconds: 2 }),
      clip({ width: 1080, height: 1920, durationSeconds: 30 }),
    ]);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
  });

  it('takes the largest resolution at the winning aspect', () => {
    const result = deriveOutputFormat([
      clip({ width: 1280, height: 720 }),
      clip({ width: 3840, height: 2160 }),
    ]);
    expect(result).toMatchObject({ width: 3840, height: 2160 });
  });

  it('takes the most common framerate so an all-Veo timeline stays at 24', () => {
    const result = deriveOutputFormat([clip({ fps: 24 }), clip({ fps: 24 }), clip({ fps: 30 })]);
    expect(result.fps).toBe(24);
  });

  it('defaults to 30 when no clip reports a framerate', () => {
    expect(deriveOutputFormat([clip(), clip()]).fps).toBe(30);
  });

  it('ignores clips with no framerate rather than counting them as a vote', () => {
    const result = deriveOutputFormat([clip({ fps: 24 }), clip(), clip()]);
    expect(result.fps).toBe(24);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/timeline/derive-output.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/timeline/derive-output.ts
import type { TimelineOutput } from '@/store/useTimelineStore';

export interface ClipDimensions {
  width: number;
  height: number;
  durationSeconds: number;
  /** Best-effort: only the demuxer can report it, and only for clips it can read. */
  fps?: number;
}

export type DerivedOutput = Omit<TimelineOutput, 'auto'>;

const FALLBACK: DerivedOutput = { width: 1920, height: 1080, fps: 30 };

/** Two decimals is enough to separate 16:9 from 4:3 without splitting 1918x1080 off. */
function aspectKey(clip: ClipDimensions) {
  return (clip.width / clip.height).toFixed(2);
}

/** The key with the most total duration; count is not the tiebreak, seconds are. */
function heaviest<T>(items: T[], key: (item: T) => string, weight: (item: T) => number) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(key(item), (totals.get(key(item)) ?? 0) + weight(item));
  }
  let best: string | null = null;
  let bestWeight = -Infinity;
  for (const [candidate, total] of totals) {
    if (total > bestWeight) {
      best = candidate;
      bestWeight = total;
    }
  }
  return best;
}

export function deriveOutputFormat(clips: ClipDimensions[]): DerivedOutput {
  const usable = clips.filter((clip) => clip.width > 0 && clip.height > 0);
  if (usable.length === 0) return { ...FALLBACK };

  const aspect = heaviest(usable, aspectKey, (clip) => clip.durationSeconds);
  const atAspect = usable.filter((clip) => aspectKey(clip) === aspect);

  const largest = atAspect.reduce((best, clip) =>
    clip.width * clip.height > best.width * best.height ? clip : best
  );

  const rated = usable.filter((clip) => typeof clip.fps === 'number' && clip.fps > 0);
  const fps = rated.length
    ? Number(heaviest(rated, (clip) => String(clip.fps), (clip) => clip.durationSeconds))
    : FALLBACK.fps;

  return { width: largest.width, height: largest.height, fps };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/timeline/derive-output.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Stage**

```bash
git add lib/timeline/derive-output.ts tests/timeline/derive-output.test.ts
# message: feat: derive a timeline output format from its clips
```

---

### Task 4: Render port, fit maths, engine selection

**Files:**
- Create: `lib/timeline/render/port.ts`
- Test: `tests/timeline/render-port.test.ts`

**Interfaces:**
- Consumes: `DerivedOutput` (Task 3), `TimelineOutput` (Task 2)
- Produces:
  - `RenderRequest { output: TimelineOutput; clips: Array<{ media: Blob; fit: 'contain' | 'cover' }> }`
  - `RenderProgress { phase: 'preparing' | 'encoding' | 'muxing' | 'uploading'; completed: number | null }`
  - `RenderEngine { id: 'webcodecs' | 'server'; unavailableReason(req); render(req, opts) }`
  - `fitRect(source, output, fit) → { x, y, width, height }`
  - `selectRenderEngine(engines, request) → Promise<{ chosen: RenderEngine | null; rejected: Array<{ id; reason }> }>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/timeline/render-port.test.ts
import { describe, expect, it } from 'vitest';

import {
  fitRect,
  selectRenderEngine,
  type RenderEngine,
  type RenderRequest,
} from '../../lib/timeline/render/port';

const request = { output: { width: 1920, height: 1080, fps: 30, auto: true }, clips: [] };

function engine(id: 'webcodecs' | 'server', reason: string | null): RenderEngine {
  return {
    id,
    unavailableReason: async () => reason,
    render: async () => new Blob(),
  };
}

describe('fitRect', () => {
  it('fills the frame exactly when the aspects match', () => {
    expect(fitRect({ width: 1280, height: 720 }, { width: 1920, height: 1080 }, 'contain'))
      .toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('letterboxes a vertical clip into a landscape frame, centred', () => {
    const r = fitRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, 'contain');
    expect(r).toEqual({ x: 656, y: 0, width: 608, height: 1080 });
  });

  it('overflows both axes when covering, so no bars are visible', () => {
    const r = fitRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, 'cover');
    expect(r.width).toBeGreaterThanOrEqual(1920);
    expect(r.height).toBeGreaterThanOrEqual(1080);
    expect(r.x).toBe(0);
  });
});

describe('selectRenderEngine', () => {
  it('prefers the browser engine when it can run', async () => {
    const result = await selectRenderEngine(
      [engine('webcodecs', null), engine('server', null)], request as RenderRequest);
    expect(result.chosen?.id).toBe('webcodecs');
    expect(result.rejected).toEqual([]);
  });

  it('falls through to the server and keeps the browser reason for the UI', async () => {
    const result = await selectRenderEngine(
      [engine('webcodecs', 'Safari cannot encode H.264 here'), engine('server', null)],
      request as RenderRequest);
    expect(result.chosen?.id).toBe('server');
    expect(result.rejected).toEqual([
      { id: 'webcodecs', reason: 'Safari cannot encode H.264 here' },
    ]);
  });

  it('chooses nothing and reports every reason when neither can run', async () => {
    const result = await selectRenderEngine(
      [engine('webcodecs', 'no WebCodecs'), engine('server', 'not configured')],
      request as RenderRequest);
    expect(result.chosen).toBeNull();
    expect(result.rejected).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/timeline/render-port.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/timeline/render/port.ts
import type { TimelineOutput } from '@/store/useTimelineStore';

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

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/**
 * Where a source frame lands inside the output frame. Shared by both engines so
 * a letterboxed clip sits in the same place whichever one rendered it.
 */
export function fitRect(source: Size, output: Size, fit: 'contain' | 'cover'): Rect {
  const scale =
    fit === 'contain'
      ? Math.min(output.width / source.width, output.height / source.height)
      : Math.max(output.width / source.width, output.height / source.height);

  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  return {
    x: Math.round((output.width - width) / 2),
    y: Math.round((output.height - height) / 2),
    width,
    height,
  };
}

export interface EngineSelection {
  chosen: RenderEngine | null;
  /** Kept so the UI can explain rather than fail generically. */
  rejected: Array<{ id: RenderEngine['id']; reason: string }>;
}

/** First engine that can run wins; order the array by preference (browser first). */
export async function selectRenderEngine(
  engines: RenderEngine[],
  request: RenderRequest
): Promise<EngineSelection> {
  const rejected: EngineSelection['rejected'] = [];

  for (const engine of engines) {
    const reason = await engine.unavailableReason(request);
    if (reason === null) return { chosen: engine, rejected };
    rejected.push({ id: engine.id, reason });
  }

  return { chosen: null, rejected };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/timeline/render-port.test.ts`
Expected: PASS, 6 tests. If the letterbox test's expected `x` is off by a pixel, fix the *test* to match the rounding, not the maths — centring an odd remainder is arbitrary either way.

- [ ] **Step 5: Stage**

```bash
git add lib/timeline/render/port.ts tests/timeline/render-port.test.ts
# message: feat: add the render engine port and fit maths
```

---

### Task 5: Probing and acquisition

**Files:**
- Create: `lib/timeline/probe.ts`, `lib/timeline/acquire.ts`
- Modify: `lib/gallery/storage.ts` (`GalleryRecord`), `store/useGalleryStore.ts` (one new action)
- Test: `tests/timeline/acquire.test.ts`

**Interfaces:**
- Consumes: `ClipDimensions` (Task 3); `fetchResultBlob` from `lib/gallery/capture.ts`; `extractLastFrameFromBlob` from `lib/video-frame.ts`; `useGalleryStore`'s `keep`, `setPinned`
- Produces:
  - `probeDimensions(blob) → Promise<{ width, height, durationSeconds }>`
  - `UnavailableReason = 'missing' | 'expired' | 'unreachable' | 'no-source'`
  - `ClipMedia { status: 'ready'; blob: Blob; dimensions: ClipDimensions }`
  - `Unavailable { status: 'unavailable'; reason: UnavailableReason; message: string }`
  - `acquireClipMedia(recordId, opts?) → Promise<ClipMedia | Unavailable>`
  - `acquireAll(recordIds, opts?) → Promise<Array<ClipMedia | Unavailable>>` (concurrency 3)
  - `useGalleryStore.setDimensions(id, dims)`

- [ ] **Step 1: Extend the gallery record and store**

```ts
// lib/gallery/storage.ts — inside GalleryRecord, alongside `bytes`
  /** Probed once by the timeline; optional, so no IndexedDB migration is needed. */
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** Best-effort — only a demuxer can report it. */
  fps?: number;
```

```ts
// store/useGalleryStore.ts — add to GalleryState and the create() body
  setDimensions: (
    id: string,
    dims: { width?: number; height?: number; durationSeconds?: number; fps?: number }
  ) => Promise<void>;
```

```ts
  setDimensions: async (id, dims) => {
    const existing = get().records.find((record) => record.id === id);
    if (!existing) return;

    const updated: GalleryRecord = { ...existing, ...dims };
    try {
      await galleryStorage().put(updated);
    } catch {
      // Dimensions are a cache. Failing to persist them must not fail the add.
      return;
    }
    set((state) => ({
      records: state.records.map((record) => (record.id === id ? updated : record)),
    }));
  },
```

> Go through the store, never `galleryStorage().put()` directly — a direct write leaves the in-memory `records` index stale.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/timeline/acquire.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { acquireClipMedia } from '../../lib/timeline/acquire';

// jsdom cannot decode video; the probe is a seam the same way SeekableVideo is
// in tests/video-frame.test.ts.
vi.mock('../../lib/timeline/probe', () => ({
  probeDimensions: vi.fn(async () => ({ width: 1920, height: 1080, durationSeconds: 5 })),
}));
vi.mock('../../lib/video-frame', () => ({
  extractLastFrameFromBlob: vi.fn(async () => new Blob(['poster'])),
}));

const video = (o: Partial<GalleryRecord> = {}): GalleryRecord => ({
  id: 'clip', kind: 'video', createdAt: 1, prompt: 'a neon tiger', provider: 'fal',
  controlValues: {}, mimeType: 'video/mp4', bytes: 0, ...o,
});

describe('acquireClipMedia', () => {
  beforeEach(() => {
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    vi.unstubAllGlobals();
  });

  it('reports missing for a record that is no longer in the library', async () => {
    const result = await acquireClipMedia('gone');
    expect(result).toMatchObject({ status: 'unavailable', reason: 'missing' });
  });

  it('re-pins a record that already holds bytes, because bytes are not safety', async () => {
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: false, bytes: 1 })],
    });
    const result = await acquireClipMedia('clip');
    expect(result.status).toBe('ready');
    expect(useGalleryStore.getState().records[0].pinned).toBe(true);
  });

  it('probes a record kept before this feature existed, so old clips can vote', async () => {
    useGalleryStore.setState({
      records: [video({ blob: new Blob(['x']), pinned: true, bytes: 1 })],
    });
    const result = await acquireClipMedia('clip');
    expect(result).toMatchObject({ status: 'ready', dimensions: { width: 1920 } });
    expect(useGalleryStore.getState().records[0].width).toBe(1920);
  });

  it('downloads and keeps a record that is only a URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['bytes']), {
      status: 200, headers: { 'Content-Type': 'video/mp4' },
    })));
    useGalleryStore.setState({
      records: [video({ sourceUrl: 'https://cdn.example.com/a.mp4' })],
    });

    const result = await acquireClipMedia('clip');

    expect(result.status).toBe('ready');
    const [record] = useGalleryStore.getState().records;
    expect(record.pinned).toBe(true);
    expect(record.blob).toBeDefined();
    expect(record.posterBlob).toBeDefined();
  });

  it('reports expired when the provider URL is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    useGalleryStore.setState({
      records: [video({ sourceUrl: 'https://cdn.example.com/a.mp4' })],
    });
    expect(await acquireClipMedia('clip')).toMatchObject({
      status: 'unavailable', reason: 'expired',
    });
  });

  it('reports no-source for a record with neither bytes nor a usable URL', async () => {
    useGalleryStore.setState({ records: [video()] });
    expect(await acquireClipMedia('clip')).toMatchObject({
      status: 'unavailable', reason: 'no-source',
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test tests/timeline/acquire.test.ts`
Expected: FAIL — cannot resolve `lib/timeline/acquire`.

- [ ] **Step 4: Implement the probe**

```ts
// lib/timeline/probe.ts
/**
 * Dimensions from a video element, the same object-URL trick lib/video-frame.ts
 * uses: a blob: URL is same-origin, so nothing is tainted and no crossOrigin
 * attribute is needed. Framerate is not here — HTMLVideoElement cannot report it,
 * and the demuxer that can arrives with the browser engine.
 */
const PROBE_TIMEOUT_MS = 15_000;

export interface ProbedDimensions {
  width: number;
  height: number;
  durationSeconds: number;
}

export function probeDimensions(blob: Blob): Promise<ProbedDimensions> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const settle = (finish: () => void) => () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      URL.revokeObjectURL(objectUrl);
      finish();
    };
    const onLoaded = settle(() =>
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
      })
    );
    const onError = settle(() => reject(new Error('Unable to read this video.')));

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    const timer = setTimeout(onError, PROBE_TIMEOUT_MS);
    video.src = objectUrl;
  });
}
```

- [ ] **Step 5: Implement acquisition**

```ts
// lib/timeline/acquire.ts
import { fetchResultBlob } from '@/lib/gallery/capture';
import { isDownloadableMediaUrl } from '@/lib/media-download';
import { extractLastFrameFromBlob } from '@/lib/video-frame';
import { probeDimensions } from '@/lib/timeline/probe';
import type { ClipDimensions } from '@/lib/timeline/derive-output';
import { useGalleryStore } from '@/store/useGalleryStore';

export type UnavailableReason = 'missing' | 'expired' | 'unreachable' | 'no-source';

export interface ClipMedia {
  status: 'ready';
  blob: Blob;
  dimensions: ClipDimensions;
}

export interface Unavailable {
  status: 'unavailable';
  reason: UnavailableReason;
  message: string;
}

const MESSAGES: Record<UnavailableReason, string> = {
  missing: 'This clip is no longer in your library.',
  expired: "This clip's source has expired and the file was never kept.",
  unreachable: 'This clip could not be downloaded. Check your connection.',
  'no-source': 'This clip has no file and no source to download it from.',
};

const unavailable = (reason: UnavailableReason): Unavailable => ({
  status: 'unavailable',
  reason,
  message: MESSAGES[reason],
});

/**
 * Cached dimensions when we have them, freshly probed otherwise. Old records —
 * anything kept before the timeline existed — have bytes but no dimensions, and
 * without this they would give deriveOutputFormat nothing to vote with.
 */
async function dimensionsFor(recordId: string, blob: Blob): Promise<ClipDimensions> {
  const record = useGalleryStore.getState().records.find((r) => r.id === recordId);
  if (record?.width && record.height) {
    return {
      width: record.width,
      height: record.height,
      durationSeconds: record.durationSeconds ?? 0,
      fps: record.fps,
    };
  }

  const probed = await probeDimensions(blob);
  await useGalleryStore.getState().setDimensions(recordId, probed);
  return probed;
}

export async function acquireClipMedia(
  recordId: string,
  options: { signal?: AbortSignal } = {}
): Promise<ClipMedia | Unavailable> {
  const store = useGalleryStore.getState();
  const record = store.records.find((candidate) => candidate.id === recordId);

  // 1. The reference dangles: removed, cleared, or evicted by the count ceiling.
  if (!record) return unavailable('missing');

  // 2. Bytes in hand. Pin regardless — eviction reclaims unpinned bytes, and the
  //    library lets the user unpin at any time, so a blob is not safety.
  if (record.blob) {
    if (!record.pinned) await store.setPinned(recordId, true);
    return { status: 'ready', blob: record.blob, dimensions: await dimensionsFor(recordId, record.blob) };
  }

  // 3. A URL that may or may not still resolve.
  if (record.sourceUrl && isDownloadableMediaUrl(record.sourceUrl)) {
    let blob: Blob;
    try {
      blob = await fetchResultBlob(record.sourceUrl, 'video', { signal: options.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return unavailable(/not be fetched/.test(String(error)) ? 'expired' : 'unreachable');
    }

    // The poster is the *last* frame, matching what GalleryGrid's Keep stores —
    // "Use as reference" depends on it being the end of the clip.
    const poster = await extractLastFrameFromBlob(blob).catch(() => undefined);
    await store.keep(recordId, blob, poster);
    return { status: 'ready', blob, dimensions: await dimensionsFor(recordId, blob) };
  }

  return unavailable('no-source');
}

/** Bounded fan-out so a multi-select neither spikes memory nor hammers the CDN. */
export async function acquireAll(
  recordIds: string[],
  options: { signal?: AbortSignal } = {}
): Promise<Array<ClipMedia | Unavailable>> {
  const results: Array<ClipMedia | Unavailable> = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < recordIds.length) {
      const index = cursor++;
      results[index] = await acquireClipMedia(recordIds[index], options);
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, recordIds.length) }, worker));
  return results;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test tests/timeline/acquire.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Confirm nothing else regressed**

Run: `pnpm test && pnpm lint`
Expected: the full suite passes. `tests/gallery/store.test.ts` exercises the store you just extended — if it fails, `setDimensions` broke an existing invariant.

- [ ] **Step 8: Stage**

```bash
git add lib/timeline/probe.ts lib/timeline/acquire.ts lib/gallery/storage.ts \
        store/useGalleryStore.ts tests/timeline/acquire.test.ts
# message: feat: acquire and pin real bytes for timeline clips
```

---

### Task 6: Timeline workspace shell and vertical list

The vertical list works at every width and is the foundation; the horizontal track (Task 7) is the enhancement. Building them in this order means the designated scope cut stays available.

**Files:**
- Create: `components/TimelineWorkspace.tsx`, `components/TimelineList.tsx`, `components/TimelineClipDrawer.tsx`, `components/TimelinePreview.tsx`
- Test: `tests/timeline/workspace.test.tsx`

**Interfaces:**
- Consumes: `useTimelineStore` (Task 2), `deriveOutputFormat` (Task 3), `acquireClipMedia`/`acquireAll` (Task 5), `useGalleryStore`
- Produces: `TimelineWorkspace` (default export, props `{ onExit: () => void; onOpenConnections: () => void }`), matching how `VideoWorkspace` is called from `app/page.tsx`

- [ ] **Step 1: Build the components**

`TimelineWorkspace` owns:
- Hydrating the gallery (`useGalleryStore().hydrate()`) as `LibraryOverlay` does.
- A `clipStates: Record<string, ClipMedia | Unavailable | { status: 'loading' }>` map keyed by placement id.
- Adding: call `useTimelineStore().addClip(recordId)`, then `acquireClipMedia`, then store the result. On `unavailable`, keep the placement and show the reason.
- Recomputing the derived format whenever ready dimensions change, via `applyDerivedOutput` (a no-op when the user has frozen it).
- A storage readout: sum `bytes` across gallery records against `DEFAULT_GALLERY_BUDGET.maxBytes`.
- Layout choice: one `matchMedia('(min-width: 1024px)')` read on mount plus a `change` listener. No hydration guard is needed — Task 9 loads this with `ssr: false`, so it never renders on the server.

`TimelineList` renders each clip as a row: drag handle, poster (`record.posterBlob`), title (`record.slug ?? record.prompt`), duration, a contain/cover control, and Remove. An `unavailable` row shows `message` and Remove only. Reordering calls `moveClip(clip.id, index)` — never index arithmetic in the component.

`TimelineClipDrawer` lists `records.filter((r) => r.kind === 'video')` newest-first, each with poster, title, and an Add button. `GalleryGrid`'s card is inline markup, not an extracted component; copy the visual treatment, do not import `MediaCard` (that is the picker card).

`TimelinePreview` plays the ready clips in order by swapping `src` on `ended`, with a sequence-wide position readout. Label it "Preview" and state that it does not show letterboxing or exact cut timing.

- [ ] **Step 2: Write the tests**

```tsx
// tests/timeline/workspace.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryGalleryStorage } from '../../lib/gallery/memory-storage';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { configureGalleryStorage, useGalleryStore } from '../../store/useGalleryStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import TimelineWorkspace from '../../components/TimelineWorkspace';

vi.mock('../../lib/timeline/acquire', () => ({
  acquireClipMedia: vi.fn(async (id: string) =>
    id === 'dead'
      ? { status: 'unavailable', reason: 'expired', message: 'This clip’s source has expired and the file was never kept.' }
      : { status: 'ready', blob: new Blob(['v']), dimensions: { width: 1920, height: 1080, durationSeconds: 4 } }
  ),
  acquireAll: vi.fn(async () => []),
}));

const video = (o: Partial<GalleryRecord> = {}): GalleryRecord => ({
  id: 'clip', kind: 'video', createdAt: 1, prompt: 'a neon tiger', slug: 'neon-tiger',
  provider: 'fal', controlValues: {}, mimeType: 'video/mp4', bytes: 0, ...o,
});

function renderWorkspace() {
  return render(<TimelineWorkspace onExit={() => {}} onOpenConnections={() => {}} />);
}

describe('TimelineWorkspace', () => {
  beforeEach(() => {
    configureGalleryStorage(createMemoryGalleryStorage());
    useGalleryStore.setState({ records: [video(), video({ id: 'dead', slug: 'rooftop' })], hydrated: true, storageError: null });
    useTimelineStore.getState().clear();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
  });

  it('starts empty and says so', () => {
    renderWorkspace();
    expect(screen.getByText(/no clips yet/i)).toBeInTheDocument();
  });

  it('adds a clip from the drawer and shows it in the sequence', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);
    await waitFor(() => expect(screen.getByText('neon-tiger')).toBeInTheDocument());
  });

  it('keeps an expired clip in place and explains why, rather than dropping it', async () => {
    renderWorkspace();
    await userEvent.click(screen.getAllByRole('button', { name: /add/i })[1]);
    await waitFor(() => expect(screen.getByText(/source has expired/i)).toBeInTheDocument());
  });

  it('offers the vertical list below the lg breakpoint', () => {
    renderWorkspace();
    expect(screen.getByTestId('timeline-list')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-track')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test tests/timeline/workspace.test.tsx`
Expected: PASS, 4 tests. Adjust the query strings to the copy you actually wrote — do not weaken the assertions to `getAllByRole('button')[n]` guesses where a name query works.

- [ ] **Step 4: Stage**

```bash
git add components/TimelineWorkspace.tsx components/TimelineList.tsx \
        components/TimelineClipDrawer.tsx components/TimelinePreview.tsx \
        tests/timeline/workspace.test.tsx
# message: feat: add the timeline workspace and its vertical layout
```

---

### Task 7: Horizontal track for wide screens

**Files:**
- Create: `components/TimelineTrack.tsx`
- Modify: `components/TimelineWorkspace.tsx` (mount `TimelineTrack` at `lg`+)
- Test: `tests/timeline/track.test.tsx`

**Interfaces:**
- Consumes: `useTimelineStore`, the `clipStates` map from Task 6
- Produces: `TimelineTrack` with props `{ clipStates }`, `data-testid="timeline-track"`

- [ ] **Step 1: Build the track**

Clip blocks sized `flex-grow` proportional to `durationSeconds` (minimum width so a 1s clip stays clickable), horizontal scroll on overflow, drag to reorder calling `moveClip(clipId, index)`. An unavailable clip renders in the error treatment with its reason as a title attribute and a Remove control. Exactly one of track/list is mounted — never both hidden by CSS, which would double the drag listeners over the same clips.

- [ ] **Step 2: Write the test**

```tsx
// tests/timeline/track.test.tsx — same setup block as workspace.test.tsx, but:
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));

  it('mounts the track and not the list at lg and above', () => {
    renderWorkspace();
    expect(screen.getByTestId('timeline-track')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-list')).not.toBeInTheDocument();
  });

  it('sizes clip blocks in proportion to their duration', async () => {
    // add two clips whose mocked durations differ, then compare flex-grow
  });
```

- [ ] **Step 3: Run**

Run: `pnpm test tests/timeline/track.test.tsx`
Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add components/TimelineTrack.tsx components/TimelineWorkspace.tsx tests/timeline/track.test.tsx
# message: feat: add the wide-screen timeline track
```

---

### Task 8: Browser render engine

**Files:**
- Create: `lib/timeline/render/webcodecs.ts`
- Modify: `lib/timeline/probe.ts` (add `probeFramerate`)
- Test: `tests/timeline/webcodecs-availability.test.ts`

**Interfaces:**
- Consumes: `RenderEngine`, `RenderRequest`, `fitRect` (Task 4); the Task 1 dependency
- Produces: `createWebCodecsEngine() → RenderEngine`; `probeFramerate(blob) → Promise<number | undefined>`

Only availability is unit-tested. The pipeline itself cannot run in jsdom and will not be faked into looking tested — it is verified in a browser at the smoke-test gate.

- [ ] **Step 1: Implement `probeFramerate`**

Open the clip with the Task 1 demuxer, read the video track's sample count and duration, return `samples / seconds` rounded to the nearest sensible rate. Return `undefined` on any failure — it is best-effort, and a clip that cannot answer simply does not vote in `deriveOutputFormat`.

- [ ] **Step 2: Implement the engine**

```ts
// lib/timeline/render/webcodecs.ts (shape; fill in with the Task 1 dependency's API)
import { fitRect, type RenderEngine, type RenderRequest } from '@/lib/timeline/render/port';

const NO_WEBCODECS = 'This browser cannot encode video. Try Chrome or Edge.';
const NO_H264 = 'This browser cannot encode H.264 at this size.';

export function createWebCodecsEngine(): RenderEngine {
  return {
    id: 'webcodecs',

    async unavailableReason(request: RenderRequest) {
      if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
        return NO_WEBCODECS;
      }
      const support = await VideoEncoder.isConfigSupported({
        codec: 'avc1.640028',
        width: request.output.width,
        height: request.output.height,
        framerate: request.output.fps,
      }).catch(() => null);
      return support?.supported ? null : NO_H264;
    },

    async render(request, { signal, onProgress }) {
      // Per clip: demux -> VideoDecoder -> for each output timestamp take the
      // nearest at-or-before frame -> draw into fitRect on an OffscreenCanvas
      // -> VideoEncoder -> mux. Video only; no audio track (silent by design).
      //
      // Two non-negotiables:
      //  * Drain against encoder.encodeQueueSize / decoder.decodeQueueSize before
      //    feeding more, or a long timeline exhausts memory.
      //  * Offset each clip's timestamps by the running timeline position so the
      //    muxed output is monotonic across boundaries.
      //  * Check signal.aborted between frames; close decoder and encoder on abort.
      throw new Error('not implemented');
    },
  };
}
```

- [ ] **Step 3: Write the availability tests**

```ts
// tests/timeline/webcodecs-availability.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebCodecsEngine } from '../../lib/timeline/render/webcodecs';

const request = { output: { width: 1920, height: 1080, fps: 30, auto: true }, clips: [] };

afterEach(() => vi.unstubAllGlobals());

describe('the browser engine reports why it cannot run', () => {
  it('names the missing API when WebCodecs is absent', async () => {
    const reason = await createWebCodecsEngine().unavailableReason(request as never);
    expect(reason).toMatch(/cannot encode video/i);
  });

  it('names the codec when WebCodecs exists but H.264 is unsupported', async () => {
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: false }) });
    expect(await createWebCodecsEngine().unavailableReason(request as never)).toMatch(/H\.264/);
  });

  it('reports available when the config is supported', async () => {
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: true }) });
    expect(await createWebCodecsEngine().unavailableReason(request as never)).toBeNull();
  });
});
```

- [ ] **Step 4: Run**

Run: `pnpm test tests/timeline/webcodecs-availability.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Stage**

```bash
git add lib/timeline/render/webcodecs.ts lib/timeline/probe.ts \
        tests/timeline/webcodecs-availability.test.ts
# message: feat: add the browser render engine
```

---

### Task 9: Navigation, export panel, first working export

This is the task that produces a usable feature. It is also where the browser pipeline gets its first real exercise, which is why the smoke test is a step, not an afterthought.

**Files:**
- Create: `components/TimelineExportPanel.tsx`
- Modify: `app/page.tsx:54`, `:108-125`, `:200`
- Test: `tests/timeline/export-panel.test.tsx`

**Interfaces:**
- Consumes: `selectRenderEngine` (Task 4), `createWebCodecsEngine` (Task 8), `acquireClipMedia` (Task 5)
- Produces: `TimelineExportPanel` with props `{ engines: RenderEngine[]; clipStates }`

- [ ] **Step 1: Wire navigation**

In `app/page.tsx`: widen `activeWorkspace` at `:54` to `'image' | 'video' | 'timeline'`, add the third nav button in the group at `:108`, extend `selectWorkspace`, and branch at `:200`. Load the workspace lazily:

```tsx
// alongside the GenerationInterface dynamic() at app/page.tsx:23
const TimelineWorkspace = dynamic(() => import('@/components/TimelineWorkspace'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <div className="loading-spinner" />
    </div>
  ),
});
```

- [ ] **Step 2: Build the export panel — five states**

| State | Copy |
| --- | --- |
| Browser can render | `Export {duration} · silent · in your browser` |
| Browser cannot, server can | The browser's rejection reason, then a separate button: total upload bytes + "deleted after download" |
| Neither | Disabled; name which engine is missing and why |
| Rendering | Phase, progress, Cancel |
| Clips unavailable | Disabled; "{n} clips can't be exported" and which |

Export **re-resolves every clip** through `acquireClipMedia` before building the `RenderRequest`. Ready clips resolve instantly, so the happy path costs nothing and anything that vanished since add time is caught before a byte is encoded. Every rendering-capable state says the export carries no sound.

- [ ] **Step 3: Write the tests**

```tsx
// tests/timeline/export-panel.test.tsx
// Cover, with a stub RenderEngine (never the real one):
//  - "in your browser" and the word "silent" when the browser engine is available
//  - the browser's rejection reason plus a distinct server button when it is not
//  - disabled with both reasons when neither engine can run
//  - disabled naming the count when any clip is unavailable
//  - Cancel aborts: the engine's render receives a signal that fires
```

- [ ] **Step 4: Run the full suite**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass.

- [ ] **Step 5: Smoke-test in a real browser — required, not optional**

Per AGENTS.md, work in a worktree on a non-default port:

```bash
git worktree add .claude/worktrees/video-timeline main
cd .claude/worktrees/video-timeline && pnpm install
pnpm dev --port 3021
```

Verify by hand, because none of this can be verified in jsdom:
1. `http://localhost:3021/?workspace=timeline` loads and the nav shows three items.
2. The nav is not broken at 375px, 768px, and 1024px widths. **Confirm the `lg` cut is the right one** — the spec calls 1024px a starting value, not a fact.
3. Add two clips of different aspect ratios; the derived format matches the majority and the minority letterboxes.
4. Export. The file plays end to end, clips appear in order, and it is silent.
5. Old clips kept before this feature still report dimensions (Task 5, Step 2's third test in real conditions).

Hand the human the localhost link and get an explicit go-ahead before shipping.

- [ ] **Step 6: Stage**

```bash
git add components/TimelineExportPanel.tsx app/page.tsx tests/timeline/export-panel.test.tsx
# message: feat: add the timeline workspace to the nav and export in the browser
```

---

### Task 10: Server render — argv builder and job registry

**Files:**
- Create: `lib/timeline/render/ffmpeg-args.ts`, `lib/timeline/jobs.ts`
- Test: `tests/timeline/ffmpeg-args.test.ts`

**Interfaces:**
- Consumes: `TimelineOutput`, `fitRect` semantics (Task 4)
- Produces:
  - `buildFfmpegArgs({ inputs, output, outputPath }) → string[]`
  - `createJob()`, `getJob(id)`, `enqueue(id, run)`, `sweepAbandoned()` from `lib/timeline/jobs.ts`

- [ ] **Step 1: Write the failing argv tests**

```ts
// tests/timeline/ffmpeg-args.test.ts
import { describe, expect, it } from 'vitest';

import { buildFfmpegArgs } from '../../lib/timeline/render/ffmpeg-args';

const base = {
  inputs: [
    { path: '/tmp/j/0.mp4', fit: 'contain' as const },
    { path: '/tmp/j/1.mp4', fit: 'cover' as const },
  ],
  output: { width: 1920, height: 1080, fps: 30, auto: true },
  outputPath: '/tmp/j/out.mp4',
};

describe('buildFfmpegArgs', () => {
  it('passes every input in timeline order', () => {
    const args = buildFfmpegArgs(base);
    expect(args.filter((a) => a === '-i')).toHaveLength(2);
    expect(args.indexOf('/tmp/j/0.mp4')).toBeLessThan(args.indexOf('/tmp/j/1.mp4'));
  });

  it('letterboxes a contain input with scale then pad', () => {
    const graph = buildFfmpegArgs(base)[buildFfmpegArgs(base).indexOf('-filter_complex') + 1];
    expect(graph).toContain('force_original_aspect_ratio=decrease');
    expect(graph).toContain('pad=1920:1080');
  });

  it('crops a cover input instead of padding it', () => {
    const graph = buildFfmpegArgs(base)[buildFfmpegArgs(base).indexOf('-filter_complex') + 1];
    expect(graph).toContain('force_original_aspect_ratio=increase');
    expect(graph).toContain('crop=1920:1080');
  });

  it('normalises every input to the output framerate before concatenating', () => {
    const graph = buildFfmpegArgs(base)[buildFfmpegArgs(base).indexOf('-filter_complex') + 1];
    expect(graph).toContain('fps=30');
    expect(graph).toContain('concat=n=2:v=1:a=0');
  });

  it('is silent by design — audio is slice 4', () => {
    expect(buildFfmpegArgs(base)).toContain('-an');
  });

  it('writes to the given output path last', () => {
    const args = buildFfmpegArgs(base);
    expect(args[args.length - 1]).toBe('/tmp/j/out.mp4');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/timeline/ffmpeg-args.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the argv builder**

```ts
// lib/timeline/render/ffmpeg-args.ts
import type { TimelineOutput } from '@/store/useTimelineStore';

export interface FfmpegInput {
  path: string;
  fit: 'contain' | 'cover';
}

/**
 * Pure: builds the argv, runs nothing. That is what makes the filter graph
 * testable without a binary, and it is the only way this graph is verified
 * until a real render happens at the smoke-test gate.
 *
 * `-an` is deliberate. Audio is slice 4 for both engines at once — letting the
 * server keep sound while the browser drops it would make the two produce
 * different files from the same timeline.
 */
export function buildFfmpegArgs(args: {
  inputs: FfmpegInput[];
  output: TimelineOutput;
  outputPath: string;
}): string[] {
  const { inputs, output, outputPath } = args;
  const { width, height, fps } = output;

  const inputArgs = inputs.flatMap((input) => ['-i', input.path]);

  const chains = inputs.map((input, index) =>
    input.fit === 'contain'
      ? `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${index}]`
      : `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps}[v${index}]`
  );

  const concatInputs = inputs.map((_, index) => `[v${index}]`).join('');
  const graph = [...chains, `${concatInputs}concat=n=${inputs.length}:v=1:a=0[out]`].join(';');

  return [
    '-y',
    ...inputArgs,
    '-filter_complex', graph,
    '-map', '[out]',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/timeline/ffmpeg-args.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Implement the job registry**

`lib/timeline/jobs.ts`: an in-process `Map` of `{ id, sessionToken, phase, completed, tempDir, outputPath, error }`. Ids from `crypto.randomUUID()`. One job runs at a time with at most two queued; a fourth call to `enqueue` throws a `TooBusy` error. `sweepAbandoned()` removes temp directories for jobs untouched for 30 minutes. Removal happens on success, failure, and cancellation.

- [ ] **Step 6: Stage**

```bash
git add lib/timeline/render/ffmpeg-args.ts lib/timeline/jobs.ts tests/timeline/ffmpeg-args.test.ts
# message: feat: add the ffmpeg argv builder and render job registry
```

---

### Task 11: Server render route and client engine

**Files:**
- Create: `app/api/timeline/render/route.ts`, `lib/timeline/render/server.ts`
- Modify: `components/TimelineExportPanel.tsx` (add the server engine to `engines`), `.env.example`
- Test: `tests/timeline/render-route.test.ts`

**Interfaces:**
- Consumes: `buildFfmpegArgs`, `lib/timeline/jobs.ts` (Task 10); `requireApprovedAccount`, `isGateFailure` from `lib/auth/guard.ts`
- Produces: `createServerEngine() → RenderEngine`

- [ ] **Step 1: Implement the route — both gates**

```ts
// app/api/timeline/render/route.ts (shape)
import { NextResponse } from 'next/server';
import { isGateFailure, requireApprovedAccount } from '@/lib/auth/guard';

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function ffmpegPath() {
  return (process.env.TIMELINE_FFMPEG_PATH ?? '').trim();
}

export async function POST(request: Request) {
  // Gate 1: the binary must be configured. Checked FIRST and answered with 404,
  // because isGateEnabled() is false whenever AUTH_ADMIN_EMAIL is unset — a public
  // checkout would otherwise expose an unauthenticated ffmpeg endpoint.
  if (!ffmpegPath()) return new NextResponse(null, { status: 404 });

  // Gate 2: the guard, whose stated purpose is routes that spend the owner's
  // money or bandwidth.
  const gate = requireApprovedAccount(request);
  if (isGateFailure(gate)) return gate.response;

  // Then: enforce our own byte ceiling (never inherit the proxy's), stream the
  // multipart body to a per-job temp dir, enqueue, return { jobId }.
}
```

Follow `app/api/fetch-image/route.ts` for the guard call shape — it is the only existing route using it.

`GET` with `?id=` returns status; `GET` with `?id=&result=1` returns the file. The result is **not** deleted on first read — a dropped connection must not cost a multi-minute render. When the gate is enabled, a job's status and result are readable only by the session that created it.

- [ ] **Step 2: Document the deployment requirements**

Add to `.env.example` with the reasons inline:

```bash
# Absolute path to ffmpeg. Unset disables server-side timeline rendering entirely
# (the route 404s). A path, not a boolean, so the deployment states which binary
# it is spending CPU on and no PATH lookup happens inside a route.
TIMELINE_FFMPEG_PATH=

# Reverse-proxy note: nginx's client_max_body_size defaults to 1 MB, which rejects
# essentially every real clip upload with a 413 long before proxy_read_timeout
# matters. Raise it on the server block that fronts this app.
```

- [ ] **Step 3: Write the route tests**

```ts
// tests/timeline/render-route.test.ts
// Follow tests/drop/fetch-image-route.test.ts for the request-construction pattern.
// Cover:
//  - 404 when TIMELINE_FFMPEG_PATH is unset, even with a valid session
//  - 401 when the gate is enabled and no session cookie is present
//  - 413 when the declared body exceeds MAX_UPLOAD_BYTES
//  - a job id on success, and that GET status returns that job's phase
//  - a second session cannot read the first session's job status
```

- [ ] **Step 4: Implement the client engine**

`createServerEngine()`: `unavailableReason` probes the route and returns `'Server rendering is not available here.'` on 404, `'Sign in to use server rendering.'` on 401, `null` otherwise. `render` uploads (phase `uploading`), polls status, downloads the result. A 413 surfaces as `'This timeline is too large to upload.'` with the byte count — distinct from both other messages.

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass.

- [ ] **Step 6: Smoke-test the server path**

With `TIMELINE_FFMPEG_PATH` set to a real binary in the worktree's `.env.local`: export a two-clip timeline through the server engine, confirm the file plays, is silent, and that the job's temp directory is gone afterwards. Then unset the variable and confirm the panel reports the server as unconfigured rather than failing at click time.

- [ ] **Step 7: Stage**

```bash
git add app/api/timeline/render/route.ts lib/timeline/render/server.ts \
        components/TimelineExportPanel.tsx .env.example tests/timeline/render-route.test.ts
# message: feat: render timelines on the server behind the access gate
```

---

## Self-review

**Spec coverage.** §1 → Task 2 + Task 5 (pinning). §2 → Task 3 + Tasks 5/8 (probing split). §3 → Task 5. §4 → Task 4. §5 → Task 8. §6 → Tasks 10–11. §7 → Tasks 6, 7, 9. §8 → Task 9. Error handling → Tasks 5, 9, 11. Testing → every task. The three "to resolve at plan time" items land in Task 1 (dependency), Task 9 Step 5 (breakpoint), and Task 6 Step 1 (`GalleryGrid` card — resolved by copying the treatment, not importing `MediaCard`).

**Known gaps, stated rather than hidden.** Tasks 7, 9 Step 3, 10 Step 5, and 11 Steps 1/3/4 describe behaviour and list test cases without full implementations. That is deliberate for markup and I/O plumbing whose shape depends on the Task 1 dependency and on components written in Task 6 — but an executor of those tasks should expect to design, not transcribe. Every task whose output is *logic* (2, 3, 4, 5, 10) has complete code and complete tests.

**Type consistency.** `TimelineClip`/`TimelineOutput`/`Timeline` (Task 2) are consumed unchanged in 3, 4, 6, 7, 10. `ClipDimensions` (Task 3) is what `acquireClipMedia` returns in `dimensions` (Task 5) and what `deriveOutputFormat` accepts. `RenderEngine`/`RenderRequest`/`RenderProgress` (Task 4) are implemented by Tasks 8 and 11 and consumed by Task 9. `moveClip(clipId, toIndex)` is id-based in Task 2 and called that way in Tasks 6 and 7.

## Scope cut, if needed

If slice 1 overruns, **drop Task 7** — the vertical list works at every width and the proportional track is the enhancement. Never cut the durability rules (Task 5's pinning and re-resolution) or the error states in Task 9; those are what stop the feature from losing people's work silently.
