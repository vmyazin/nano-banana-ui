# Replacing a reference is one visible step

Status: Approved design
Date: 2026-09-07

## Context

Issue 09: once a reference is attached, `From library` disappears. The only way
forward is a delete icon that exists solely on hover, unlabelled, in the
thumbnail's corner. Swapping a frame means first discovering that.

Both halves are in the code. All four workspaces gate the picker on
`references.length < maxInputImages`, so filling the last slot removes the only
visible route to the library. And `ReferenceStack`'s remove button carries
`opacity-0 … group-hover/ref:opacity-100` — labelled for assistive tech, invisible
to everyone else until the pointer lands on it.

## Goals

- A filled slot offers a visible, named way to change what is in it.
- Removing is a persistent labelled control, not a hover-revealed icon.
- Swapping is one step, not "discover the bin, delete, then find the library
  again".

## Non-goals

- No change to how references are converted or uploaded; `prepareReferences`
  stays the only way image bytes enter the draft.
- No change to the drop/paste/upload affordance, or to the top-level
  `From library` tile while slots remain free.
- The hover zoom button stays as it is. It is not the reported problem and it
  already has a keyboard path.

## Design

**Replace belongs to the slot, not to the set.** With two frames on screen,
"replace" has to say *which*, and only the slot knows. So each thumbnail carries
its own `Replace` beside its own `Remove`, and the top-level tile keeps its
existing job — adding, while there is room.

`ReferenceStack` takes an optional `replaceLimit`. Given one, each slot renders a
compact `StoredImagePicker` in replace mode; omitted, no slot offers Replace,
which is right for a workspace with no library to pick from.

**Routing the target.** The pick happens four components away, inside whichever
of the two library grids the user is looking at, and both already call
`addReferences`. Threading an index through `LibraryOverlay`, `GalleryGrid`,
`AccountLibrary` and `CloudAssetGrid` would touch every one of them to carry
something only the originating slot knows. Instead the draft store holds a
`replaceTarget`, set as the overlay opens and cleared however it closes — so a
cancelled pick cannot leak into the next ordinary add.

`addReferences` honours it: the first entry takes that slot, the count cannot
change, so the limit does not apply. A target that no longer exists — the slot
was removed while the picker was open — falls back to appending.

The cloud path needs the same exemption: `addAccountAssetAsReference` refuses
when the stack is full, which would block every swap. Both of its guards now
stand down while a replacement is pending, since the slot is already spoken for.

## Scope and implementation boundary

Lives in `store/useDraftStore.ts`, `components/ReferenceStack.tsx`,
`components/StoredImagePicker.tsx`, `lib/account/reference.ts`, and one prop in
each of the four workspaces.

Must not modify: `lib/draft/ingest.ts`, `lib/image/convert.ts`,
`components/LibraryOverlay.tsx`, `components/GalleryGrid.tsx`,
`components/account/CloudAssetGrid.tsx`, or any submission path.

## Acceptance

- A filled slot shows `Replace` and `Remove`, both named and both at full
  opacity without hovering.
- `Replace` opens the library directly; no delete first.
- The swap lands in that slot, leaves the others and the order alone, and
  releases the preview URL it displaced.
- Cancelling the picker leaves the next ordinary add appending as before.
- A workspace given no `replaceLimit` offers no Replace.
