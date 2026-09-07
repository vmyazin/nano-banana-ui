# Replace offers the same two sources as the first upload

Status: Approved design
Date: 2026-09-07

## Context

SA-06: the Replace button opens the native file picker. To substitute another
image from the ones already uploaded you have to remove the reference and start
again — which, before SA-01 was fixed, also reset the output size. The ask is
that Replace offer the same choice as the first upload: the library as well as
the disk.

### What reproduction actually found

The behaviour on `main` is the mirror of the report. Replace opens the picker
dialog — `Choose from library` — and that dialog offers **only** stored images.
There is no file input inside it. On a profile with nothing stored yet it reads
`No stored images yet.` and offers no way forward at all, so replacing an image
with one from disk was not merely awkward, it was impossible without removing
the reference first.

The likely explanation is that the report predates `c0b1935`, which introduced
the per-slot Replace; before it, the only route to a filled slot was the
remove-then-upload flow, which is the native picker the report describes.

Both readings agree on the destination, and it is the report's own: Replace must
offer both sources. The direction the gap runs does not change the fix.

## Design

The picker dialog gains an **Upload from device** control in `pick-image` mode.
That one change serves both entry points, because both open the same dialog: the
empty state's `From library` button and every slot's `Replace`. It also removes
the dead end, rather than adding a second control beside Replace that would make
three buttons per slot at two frames and fourteen references.

Bytes enter through `prepareReferences`, the ingest chokepoint every other
reference already uses, and then `addReferences`, which honours the slot
`Replace` recorded on the draft. So one call both adds and swaps, and the
existing replace semantics — first file takes the slot, the rest are released —
are inherited rather than reimplemented.

Consistency note: picking a *stored* image already bypasses per-workspace size
caps, since `GalleryGrid.sendAsReference` goes straight through
`prepareReferences`. The device path is treated identically, so this is
consistent with the existing picker rather than weaker than it.

## Non-goals

- No device upload in the clip picker. The timeline drawer already carries its
  own `Add files from your device` beside `Add from library`.
- No drag-and-drop or paste inside the dialog. The empty state has both, and the
  report asks for the choice, not a second drop target.
- No change to what Replace records, or to how `addReferences` swaps.

## Scope and implementation boundary

`components/LibraryOverlay.tsx` only: the upload control, its handler, and the
dialog's name.

Must not modify: `lib/draft/ingest.ts`, `store/useDraftStore.ts`'s replace
branch, `components/ReferenceStack.tsx`, `components/StoredImagePicker.tsx`.

## Acceptance

- Replace opens a dialog offering both a stored image and an upload.
- Uploading there swaps the recorded slot rather than appending, and closes the
  dialog the way choosing a stored image does.
- A non-image file is refused without touching the draft.
- An empty library is no longer a dead end.

## Note on the dialog's name

It was `Choose from library`, which four test files asserted. A dialog that now
takes an upload cannot claim to be only the library, so it is `Choose an image`
and those assertions moved with it. The rename is the point, not collateral: the
name is what tells a reader the second source exists.
