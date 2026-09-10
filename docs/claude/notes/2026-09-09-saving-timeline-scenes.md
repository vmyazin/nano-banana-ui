# Note: a timeline scene cannot be saved

Status: Observation, not an approved design
Date: 2026-09-09

## The gap

Two things could be meant by "save a scene", and the app does one of them.

**The exported video can be saved.** When a render finishes,
`components/TimelineExportPanel.tsx` offers a "Save to library" button that
pins the MP4 into the gallery through `useGalleryStore.record` — the single
chokepoint every kept result goes through. It is deliberately manual: writing
every export back automatically would double the storage cost of a render
against a budget the pinning rules already strain.

**The scene itself cannot.** A scene — which clips, in what order, trimmed
where, at what output format — has no library at all:

- **One slot, not a collection.** `store/useTimelineStore.ts` persists a single
  `timeline` to `localStorage` under `scene-assembly-timeline`. There is no
  list, no second scene, and beginning one destroys the last.
- **A name nobody can set or read.** `Timeline` already carries `id`, `name`,
  `createdAt` and `updatedAt`, and `emptyTimeline()` defaults the name to
  "Untitled timeline". Nothing in the UI ever reads it. The data model is
  shaped like a saved document and used as a scratch buffer.
- **Clearing is close to permanent.** `TimelineWorkspace` calls `clear()`, and
  the undo history is deliberately never persisted, so a reload after clearing
  loses the arrangement for good.
- **Signed-in accounts do not help.** The Worker stores jobs, media and spend;
  it has no notion of a timeline, so a scene does not follow anyone to a second
  device.

## Why this one stands out

Every other artifact in this app is regenerable and is recorded automatically:
an image or a clip can be made again from its prompt, and both land in the
library without being asked. A composition is the only thing here made by hand,
the only thing that cannot be reproduced from a prompt, and the only thing with
no library. The asymmetry, not the missing button, is the argument.

The storage objection that justified manual export saving does not carry over.
A scene is clip references and trim points — kilobytes, not megabytes.

## The real design question: media lifetime

A scene points at gallery records by id, and `lib/gallery/eviction` reclaims
unpinned records to stay under budget. So a saved scene can come back with its
clips missing, which is worse than not saving it: it promises something the
library cannot keep. Any design has to answer that first. The pieces already
exist — `lib/timeline/repair.ts` and the restore-on-mount path in
`TimelineWorkspace` — so the choice is roughly:

1. **Pin what a saved scene references**, the way an export is pinned, and let
   the pin count against the budget. Honest, and it makes the cost of keeping a
   scene visible where it is paid.
2. **Save references only and repair on open**, telling the person plainly which
   clips are gone rather than failing silently.
3. **Some of both**: pin on save, repair on open for scenes saved earlier.

Whichever it is, it is the decision worth making before any UI, because it
decides what "saved" is allowed to mean.

## Not decided here

Whether scenes belong in the existing library beside media, or in a list of
their own; whether a scene syncs to an account; and whether the current single
working timeline becomes "the open scene" or stays a separate scratch slot.
