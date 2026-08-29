# Shared stored-image picker — design

Status: Approved design
Date: 2026-08-29

## Context

The contextual image-only Library picker is currently wired directly into the fal
first-and-last-frame workspace. The same draft-reference store and image-input pattern are
used by fal image-to-video, Kie image modes, Runware/Atlas/Comet video modes, and the main
image-generation workspace, but those surfaces still offer only local upload/drop/paste.

## Goals

- Extract the **From library** tile, open state, contextual Library overlay, and active
  reference limit into one reusable component.
- Make it available beside every generation dropzone that accepts image references:
  fal, Kie, Runware/Atlas/Comet, and the main image-generation workspace.
- Keep stored-image filtering, immediate add-and-close behavior, responsive stacking, and
  provider-specific reference limits consistent everywhere.
- Preserve existing local upload, drag/drop, paste, frame extraction, previews, and removal.

## Non-goals

- Timeline clip imports, which accept videos rather than draft image references.
- Media repair, which restores a missing record rather than choosing a generation input.
- Stored video selection or extracting a stored video's poster/last frame in the Library.
- Changing gallery persistence, draft-reference semantics, or provider submission paths.

## Scope and implementation boundary

- Add `components/StoredImagePicker.tsx` as the sole owner of the tile and contextual
  `LibraryOverlay` state.
- Replace fal's local Library state/tile/overlay with the shared component.
- Compose the shared component beside the existing drop controls in
  `KieGenerationWorkspace`, `ProviderVideoWorkspace`, and `GenerationInterface`.
- Extend focused tests for the shared component and the four integration surfaces.
- Do not change `GalleryGrid`, `LibraryOverlay`, gallery storage, draft store, provider API
  adapters, upload code, or submission payloads unless a failing integration test proves a
  minimal compatibility change is required.

## Acceptance

- Every generation workflow that accepts images exposes **From library** while a reference
  slot is available.
- Opening it shows only durable stored images.
- **Use image** fills the next draft-reference slot and closes the dialog.
- The picker uses the current feature/model limit and disappears at capacity; removing a
  reference restores it.
- The global Library and all existing local-source behaviors remain unchanged.
