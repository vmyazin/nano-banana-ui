# Result action row — a finished result can go somewhere

Status: Approved design
Date: 2026-09-06

## Context

A finished image offers exactly one action: `Download image`. Nothing says "use
this as a reference" or "use as first frame". So every handoff in a multi-clip
job runs through the Library: generate → open Library → pick the source tab →
find the item → `Use image`. A four-keyframe, three-clip job pays that toll
twelve times to produce twelve seconds of film.

The app already understands that output becomes input in exactly one place —
`Continue from last frame` in `LastFrameActions` — which makes its absence
everywhere else more conspicuous, not less. That button also proves the
mechanism: `useSeedFrameStore` is a hand-off tray, deliberately a store rather
than a prop because switching a workspace into image-to-video remounts it and
would drop the file mid-flight.

So this is not a new capability. It is the existing capability, offered where
the result already is instead of only after a round trip through a modal.

## Goals

- One action row on every finished result, rendered in the panel that already
  shows it.
- Image results: **Use as reference**, **Use as first frame**.
- Video results: **Use as reference** (its closing frame), **Add to timeline**,
  alongside the `Continue from last frame` that already exists.
- Reuse the established chokepoints rather than adding a fifth: `prepareReferences`
  for anything entering the draft, `useSeedFrameStore` for the workspace handoff,
  `useTimelineStore.addClip` for placement.
- Cover all three `ResultStack` call sites at once by putting the row inside
  `ResultStack`, per the standing rule that image result panels compose it
  rather than laying out cards inline.

## Non-goals

- **`Use as last frame` is deferred.** Frame slots are positional —
  `frameSlotLabel(index)` makes `references[0]` the first frame and
  `references[1]` the last — so seeding only a last frame means holding index 1
  with index 0 empty, which `useDraftStore` cannot represent. Doing it properly
  needs a two-slot draft model and changes to three video workspaces. The common
  ordering (first frame, then last) needs none of that and is served by
  `Use as first frame` plus an ordinary second pick. Tracked as a follow-up.
- No change to how references are converted or uploaded. Size gates stay after
  `prepareReferences`, never before it.
- No change to `useDraftStore` or `useSeedFrameStore` shape.
- No change to the Library overlay, its grids, or the render/export pipeline.
- No new modal. The point of the change is to remove modal traffic.

## Design

### Where bytes come from

A result is addressed by URL, not by a Blob in hand, so each action begins by
resolving one:

- an image result is fetched from its `src`;
- a video result yields its **closing** frame via `extractLastFrame`, matching
  what `LastFrameActions` and the gallery's poster already mean by "the frame of
  this clip". A clip's opening frame is never what a follow-on shot wants.

Extraction is the expensive step, so the row caches the resolved Blob per source
URL: using two actions on the same result, or retrying after a failure,
refetches nothing. This mirrors `LastFrameActions.ensureFrame`.

### Where bytes go

| Action | Path |
| --- | --- |
| Use as reference | `prepareReferences` → `useDraftStore.addReferences` |
| Use as first frame | `useSeedFrameStore.setSeedFrame` → navigate to image-to-video, which claims the tray on mount |
| Add to timeline | gallery record → `useTimelineStore.addClip` |

`Use as first frame` needs no store change: the existing single-slot tray is
exactly a first frame, and `ProviderVideoWorkspace` / `KieGenerationWorkspace` /
`FalGenerationWorkspace` already claim it on mount when the input mode is not
text.

### Navigation

Two of the actions move the user to a different workspace, which only
`app/page.tsx` can do — it owns the nuqs URL state. `VideoWorkspace` already
threads exactly this need down as `onContinueFromFrame={() => onInputModeChange('image')}`,
so the row takes the same shape of optional callback rather than inventing a
navigation store. A caller that passes nothing simply does not offer the action,
which is what keeps the row honest in panels where the destination is unreachable.

### Failure reporting

Toasts, not an inline alert. Both result grids sit behind the two tabs of one
picker, and an alert rendered above a scrolled list is invisible at the moment
it is written — which reads as a button that does nothing. `CloudAssetGrid` was
already corrected for this; the row follows it.

## Scope and implementation boundary

Lives in:

- `lib/result-handoff.ts` (new) — Blob resolution per result kind and the two
  draft-facing actions.
- `components/ResultActions.tsx` (new) — the row itself.
- `components/ResultStack.tsx` — renders the row under each card.
- `components/account/CloudJobPanel.tsx` — the video branch's row.
- `components/VideoWorkspace.tsx`, `app/page.tsx` — navigation callbacks only.

Must not modify:

- `lib/draft/ingest.ts`, `lib/image/convert.ts`, `lib/image/download-format.ts`
- `store/useDraftStore.ts`, `store/useSeedFrameStore.ts`, `store/useGalleryStore.ts`
- `components/LibraryOverlay.tsx`, `components/GalleryGrid.tsx`,
  `components/account/CloudAssetGrid.tsx`
- `lib/timeline/render/**`, `lib/timeline/acquire.ts`
- `components/LastFrameActions.tsx` — its save/copy/continue row stays as it is;
  the new row sits alongside it rather than absorbing it this pass.

## Acceptance

- A finished image in the image workspace offers `Use as reference` and
  `Use as first frame`; the first lands in the reference stack without opening
  the Library, the second switches to image-to-video with the frame already in place.
- A finished cloud video offers `Add to timeline`, and the clip is placed and
  resolvable in the timeline workspace.
- No action is offered whose destination the current panel cannot reach.
- A failed extraction reports in a toast and leaves the draft untouched.
