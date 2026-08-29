# Contextual image library picker — design

Status: Approved design
Date: 2026-08-28

## Context

The fal first-and-last-frame flow currently offers one source path: a dashed picker that
accepts a local image, a local video whose last frame can be extracted, or a compatible
dragged source. The app already has a browser-local Library backed by the gallery store,
and its normal results grid can add kept media to the shared draft as a reference.

That global Library is too broad for this job. It mixes images, videos, prompt history,
restoration, downloads, pinning, and deletion; its reference action also uses the app-wide
reference limit instead of the active fal model's limit. The frame picker needs a focused
entry into the same stored collection, not a second asset system.

## Goals

- Add a compact **From library** source tile beside the existing fal frame dropzone on
  wider screens and directly below it on narrow screens.
- Open the existing Library UI in a contextual image-picker variant that shows only
  durable image records with stored bytes.
- Let one click on **Use image** fill the next available frame slot and close the Library.
- Enforce the active fal variant's reference limit through the existing draft-reference
  path.
- Preserve the normal header Library and all existing file-picker and drag/drop behavior.
- Keep the new control and dialog keyboard-accessible, including visible focus and Escape
  dismissal.

## Non-goals

- Adding the Library entry point to image generation, Kie, other video providers, or any
  other dropzone.
- Selecting multiple Library images before applying them.
- Dragging thumbnails from the Library into the source dropzone.
- Using stored videos or their poster frames in this contextual picker.
- Redesigning Library management, gallery persistence, or eviction.
- Changing fal upload, submission, job, or polling behavior.

## Design

### 1. Sibling source tile

Inside the fal reference-image section, the existing dropzone and a new **From library**
button share one responsive source row while the picker has capacity:

- The file/drop target remains flexible and visually primary.
- The Library button is a narrower tile with the same height, quiet cyan border treatment,
  and a Library icon. It is a button, not a drop target.
- On narrow screens, the two controls stack and the Library tile becomes full width.
- When `isPickerFull` hides the file/drop target, it hides the Library tile too. Removing a
  reference restores both controls.

The change lives only in `FalGenerationWorkspaceSession`; the existing file input,
`useFileDrop`, picker copy, and drag state are unchanged.

### 2. Contextual Library variant

`LibraryOverlay` gains an optional purpose with the default preserving today's global
browse experience:

- `purpose="browse"` (default): existing Results/Prompts tabs, management actions, footer,
  and behavior stay unchanged.
- `purpose="pick-image"`: the dialog title becomes **Choose from library**, only the
  results view is shown, and it delegates to the gallery grid's image-selection variant.
  Prompt history and destructive or management actions are omitted. The footer reports
  the filtered image count and does not offer **Clear library**.

The fal workspace renders this contextual overlay locally and owns its open state. This
keeps the feature boundary within the workspace instead of threading temporary picker state
through `app/page.tsx`, `VideoWorkspace`, and the global header Library.

### 3. Image-only selection

`GalleryGrid` gains a selection variant used only by the contextual overlay:

- Filter records to `record.kind === 'image' && record.blob` before rendering.
- Render the familiar preview and identifying metadata, but replace the browse-mode action
  set with one **Use image** action.
- Convert the stored blob to a named `File` using the record slug/title and stored MIME
  type, then call the existing `useDraftStore.addReferences` path with the fal variant's
  `maxInputImages` value.
- After the draft accepts the selection, show a short success toast and invoke the existing
  `onUsedReference` callback, which closes the overlay.

The normal `GalleryGrid` browse variant continues to include videos, posters, pinning,
keeping, settings restoration, downloading, removal, and its existing reference action.

### 4. States and error handling

- **Hydrating:** opening the overlay continues to hydrate the gallery through the existing
  `LibraryOverlay` effect.
- **Empty:** when no durable images are available, show **No stored images yet.** This is
  distinct from the normal Library's general empty state.
- **Storage unavailable:** reuse the existing `storageError` alert and do not make the fal
  workspace itself fail.
- **Capacity reached:** the source row is absent, and the contextual reference limit remains
  a second guard against overfilling.
- **Dismissal:** Escape, backdrop click, and the close button dismiss without changing the
  draft.

## Scope and implementation boundary

Create or modify only:

- `components/FalGenerationWorkspace.tsx`: local Library state, responsive sibling tile,
  contextual overlay, and active reference limit.
- `components/LibraryOverlay.tsx`: additive `browse` / `pick-image` presentation variant.
- `components/GalleryGrid.tsx`: additive stored-image selection variant.
- Focused component tests under `tests/fal/` and `tests/gallery/`.

Do not modify:

- `app/page.tsx` or `components/VideoWorkspace.tsx`.
- `store/useDraftStore.ts` or `store/useGalleryStore.ts`.
- `lib/gallery/*`, `lib/drop/*`, or `lib/video-frame.ts`.
- fal upload, queue, submission, jobs, polling, or catalog code.
- Kie, general provider, or image-generation workspaces.

## Testing

- `GalleryGrid` selection mode filters out videos and image records without stored bytes.
- Its empty state is specific to stored images.
- **Use image** creates one draft reference, uses the supplied contextual limit, and invokes
  the close callback.
- Browse mode retains its existing records and actions.
- The fal frame workspace shows the sibling tile only while a reference slot is available;
  opening it exposes the image-only picker, and selecting a stored image fills the next
  frame slot.
- Keyboard roles and labels cover the source tile, dialog, close control, and selection
  action.
- Full Vitest, TypeScript, and ESLint checks pass before browser smoke testing.

## Acceptance

- In the fal first-and-last-frame flow, the existing dropzone and **From library** tile sit
  side by side on desktop and stack on mobile.
- Opening **From library** shows only durable stored images—not videos, prompt history, or
  Library-management actions.
- Choosing an image fills the next frame slot and closes the overlay immediately.
- After two frames are present, neither source control is shown; removing one restores both.
- The global header Library behaves exactly as before.
