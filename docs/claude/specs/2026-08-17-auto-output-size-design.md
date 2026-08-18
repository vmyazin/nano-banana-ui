# Auto-select output size from the reference image

Status: Approved design

## Context

Every workspace that takes a reference image also has a size-shaped control —
"Output size" (Runware/Atlas/Comet video), "Aspect ratio" (Gemini image, fal
video, Kie video). Today the control sits at the model's default, so a portrait
photo routinely renders as a 16:9 clip until the user notices and fixes it.

## Goals

- When the user adds a reference image, snap the size control to the published
  option whose aspect ratio is closest to that image.
- Works in all four workspaces that pair references with a size control:
  `GenerationInterface`, `ProviderVideoWorkspace`, `FalGenerationWorkspace`
  (video), `KieGenerationWorkspace` (video).
- The first reference drives the choice (in frames mode that is the first
  frame — it defines the clip's geometry).
- A manual pick made *after* the reference was added sticks; auto-select
  re-fires only when the reference or the model's option list changes.

## Non-goals

- No new UI. The existing selects just change value.
- No matching against vendor preset sizes that publish no measurable ratio
  (e.g. a bare `720p` preset with no width/height in the catalog).
- No auto-selection from video references' own frames beyond what already
  happens (videos are reduced to a last-frame image before they become
  references, so they are covered for free).
- `VideoWorkspace` (Veo) has no size control; out of scope.

## Scope and implementation boundary

- `store/useDraftStore.ts`: `DraftReference` gains measured `width`/`height`;
  measurement is fired from `addReferences` and lands via a new
  `setReferenceDimensions` action. No other store behavior changes.
- New `lib/draft/reference-dimensions.ts` (measurement) and
  `lib/draft/aspect-match.ts` (closest-option math + `useAutoAspect` hook).
- One effect-sized change per workspace file, using each workspace's existing
  value-update path (`applyConfig` / `updateValues` / `updateValue`) so the
  carry-over memory keeps working.
- Must not touch: submission payload builders, catalogs, `ModelControls`.

## Acceptance

- Dropping a 1080×1920 photo into Runware frames mode flips "Output size" to
  the model's 9:16 entry; dropping it into the Gemini image workspace flips
  "Aspect ratio" to `9:16`.
- Changing the select by hand afterwards is not overridden until a new
  reference is added or the model changes.
- A model with no ratio-parsable options is left untouched.
