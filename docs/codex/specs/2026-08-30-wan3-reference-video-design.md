# WAN 3 character-reference video

> **Follow-up decision — 2026-08-30:** The user approved a shared video-generation
> layout after the live WAN 3 tests. This overrides the original UI boundary only:
> Fal, Kie, and aggregator-provider video workspaces now share one two-column origin,
> with setup sections on the left and Prompt immediately above Result/Jobs on the
> right. Provider request contracts and provider-specific controls remain unchanged.

> **Follow-up decision — 2026-08-30:** All image and video generation forms use
> the Fal prompt behavior through one reusable component: two visible lines at
> rest, content-driven expansion, and internal scrolling after the twelve-line cap.
> Prompt-library editing and non-generation text fields remain outside this scope.

**Status:** Approved design

**Date:** 2026-08-30

## Context

The provider video workspace currently treats every uploaded image as a timeline anchor and sends it to Runware as `inputs.frameImages`. WAN 3 (`alibaba:wan@3.0`) also supports identity-only images through `inputs.referenceImages`; those images guide a character or product into a newly generated scene and must not be confused with first/last frames.

Runware documents a maximum of ten reference images, prompt tokens in array order (`Image 1`, `Image 2`, …), integer durations from 2–30 seconds, and mutually exclusive `frameImages` and `referenceImages`. For this first release, the client accepts at most five character views because data-URI uploads otherwise make browser-to-server requests unnecessarily large.

## Goals

- Add a provider-aware **Character references** video mode and make it available only when the active engine has a compatible model.
- Add WAN 3 to the Runware catalog as the first model advertising reference-image video input.
- Send character views through `inputs.referenceImages` while preserving the existing `frameImages` behavior for image-to-video and first/last-frame modes.
- Represent video image inputs and ranged durations as catalog capabilities so later flat-reference models can be added without provider-specific UI conditionals.
- Validate the requested mode and reference count on the server using trusted catalog metadata.
- Make the UI explain reference ordering and show each selected view's `Image N` prompt token.

## Non-goals

- Reusable or named character libraries, Runware Media Storage UUID persistence, or cross-session reference packs.
- Reference videos, reference audio, documents, URLs, or WAN 3 editing/extension workflows.
- Combining `referenceImages` with `frameImages` in one generation.
- Adding Gemini Omni Flash, Seedance 2.5, MiniMax H3, HappyHorse, Kling elements, or SkyReels reference groups in this release.
- Changing the default video provider or default Runware video model.
- Modifying fal or Kie request contracts to accept the provider-only `reference` mode.

## Scope and implementation boundary

The shared provider contract lives in `lib/providers/types.ts`: `ProviderMode` gains `reference`; `ProviderModel` gains an optional, mode-keyed `videoInputs` capability plus an optional ranged `duration`; and internal `VideoRequest` gains the catalog-resolved input field. `lib/providers/catalog.ts` owns WAN 3 metadata and the helpers that resolve duration and video-input capabilities.

The browser may request only a semantic input mode. `app/api/providers/video/route.ts` resolves the selected catalog model, verifies that it advertises that mode, enforces the capability's maximum, and passes the trusted input field to the adapter. `lib/providers/runware.ts` is the only function that chooses between the resulting `frameImages` and `referenceImages` task keys. It must never accept an arbitrary Runware field name from the browser.

The UI boundary is `components/VideoWorkspace.tsx`, `components/ProviderVideoWorkspace.tsx`, `components/CommandPalette.tsx`, and `app/page.tsx`. These files may add provider-aware mode routing, reference-specific copy/tokens, the five-image client cap, ranged duration controls, and the semantic `inputMode` submission. The provider-only mode must be narrowed back to the existing fal/Kie input types before rendering those workspaces.

No other generation flow, persistent store schema, gallery schema, timeline code, or connection configuration is in scope.

## Acceptance criteria

- With Runware selected, Character references is visible and selecting it filters the model menu to WAN 3.
- With fal, Kie, Atlas, or Comet selected, Character references is unavailable and a deep link falls back to image-to-video.
- Reference mode requires at least one image, accepts at most five in the UI, preserves their order, and labels them `Image 1` through `Image 5`.
- WAN 3 exposes 480p, 720p, and 1080p presets plus an integer duration control bounded to 2–30 seconds.
- A reference-mode request reaches Runware with `inputs.referenceImages`; legacy image/frame requests still use `inputs.frameImages`.
- The server rejects unsupported modes, missing required images, and counts above the model's documented maximum.
- Targeted provider/UI tests, the full test suite, lint, and production build pass before a localhost smoke test.

## Follow-up layout acceptance criteria

- Fal, Kie, Runware, Atlas, and Comet video workspaces render through one shared two-column layout component.
- The left column owns model selection, reference/frame inputs, model controls, the submit action, and validation errors.
- The right column owns Prompt followed immediately by Result or Jobs; prompt placement is not reimplemented by each provider workspace.
- The shared layout collapses to one column without changing the logical order of setup, prompt, and results.
- Provider behavior, submission payloads, job polling, and stored draft state are unchanged.
- The main image generator plus Fal, Kie, Runware, Atlas, and Comet generation forms all render `AutoExpandingPrompt` rather than owning textarea sizing logic.
- Every generation prompt starts at two rows, grows to its content height, and retains Fal's `16.25rem` maximum with vertical scrolling beyond the cap.
