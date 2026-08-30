# Runware character-reference video models

**Status:** Research complete

**Reviewed:** 2026-08-30

**Scope:** Runware video models that accept uploaded character images as identity references, plus the integration boundary for this application.

## Executive summary

Runware supports true character-reference video generation through `inputs.referenceImages`. This is materially different from `inputs.frameImages`:

- `frameImages` anchors an image to a position in the output timeline, normally the first frame or the first and last frames.
- `referenceImages` tells the model which character, product, location, or style to preserve while it generates a new scene.

The application currently sends every uploaded video image through `inputs.frameImages`, so adding new catalog entries alone will not enable character consistency. The adapter, model metadata, and video input-mode UI must represent reference images explicitly.

Recommended rollout:

1. Add **Wan3.0** as the default character-reference model.
2. Add **Gemini Omni Flash 1.1** for short, high-resolution clips.
3. Add **Seedance 2.5** as the premium option for long or reference-heavy productions.
4. Defer Kling Elements and SkyReels reference groups until the app has structured, named character assets.

## Recommended models

Prices below are the rates published in Runware's documentation on 2026-08-30 and should be treated as display copy rather than permanent constants.

| Model | AIR | Reference images | Output and duration | Published price | Recommended role |
| --- | --- | ---: | --- | --- | --- |
| Wan3.0 | `alibaba:wan@3.0` | Up to 10 | 480p, 720p, or 1080p; 2–30 seconds; native audio; five common aspect families | $0.05/s at 480p, $0.10/s at 720p, $0.20/s at 1080p | Default and best-value general-purpose option |
| Gemini Omni Flash 1.1 | `google:gemini@omni-flash-1.1` | Up to 7 | 360p, 720p, 1080p, or 4K; 3–10 seconds; 16:9 or 9:16 | $0.036/s at 360p, $0.10/s at 720p, $0.16/s at 1080p, $0.32/s at 4K | Short clips and high-resolution delivery |
| Seedance 2.5 | `bytedance:seedance@2.5` | Up to 30 | 480p, 720p, or 1080p dimensions; 4–30 seconds; native audio; image, video, and audio references | $0.1025/s at 480p, $0.2304/s at 720p, $0.56862/s at 1080p | Premium, long-form, multi-character, and reference-heavy work |
| MiniMax H3 | `minimax:h3@0` | Up to 9 | 768p or 1440p; 5–15 seconds; native audio; optional motion-reference videos | $0.08/s at 768p, $0.13/s at 1440p | High-resolution identity and motion-transfer alternative |
| HappyHorse 1.1 | `alibaba:happyhorse@1.1` | Up to 9 | 720p or 1080p; 3–15 seconds; supports a reference cast plus an optional opening-frame anchor | $0.14/s at 720p, $0.18/s at 1080p | Explicit multi-character casting and multi-shot continuity |

Wan3.0 also has a faster sibling, `alibaba:wan@3.0-prime`, with the same ten-reference workflow. Its published rates are $0.068/s at 480p, $0.14/s at 720p, and $0.28/s at 1080p. The standard model should be the default unless lower latency is worth the premium.

### Why Wan3.0 should ship first

Wan3.0 has the simplest request shape for this application, broad duration and aspect-ratio coverage, and low per-second pricing. Runware explicitly documents `referenceImages` as identity guidance: the reference does not become the opening frame, and the model instead carries the person or product into a new scene. Runware recommends three to five views when a character must remain stable across angles or across a series.

Example request body:

```json
{
  "taskType": "videoInference",
  "taskUUID": "<uuid-v4>",
  "model": "alibaba:wan@3.0",
  "positivePrompt": "The woman from Image 1 walks through a sunlit market, keeping her face, hair, clothing, and proportions consistent.",
  "width": 1280,
  "height": 720,
  "duration": 6,
  "deliveryMethod": "async",
  "includeCost": true,
  "inputs": {
    "referenceImages": [
      "<front-view-data-uri-or-media-uuid>",
      "<three-quarter-view-data-uri-or-media-uuid>",
      "<profile-view-data-uri-or-media-uuid>"
    ]
  }
}
```

### Other flat-reference models

Gemini Omni Flash 1.1, Seedance 2.5, MiniMax H3, and HappyHorse 1.1 also accept a flat string array in `inputs.referenceImages`. They therefore fit the same initial UI and adapter abstraction.

Important model-specific differences:

- Wan3.0 prompts address references as `Image 1`, `Image 2`, and so on.
- Seedance 2.5 commonly addresses references as `@Image1`, `@Image2`, and so on.
- Gemini Omni Flash 1.1 and MiniMax H3 do not allow `frameImages` and `referenceImages` in the same request.
- HappyHorse 1.1 can combine its reference cast with one first-frame image, but this combined workflow should wait until the basic reference-only mode is proven.

## Structured models for a later phase

### Kling VIDEO 3.0 Pro

Kling represents a reusable character or object as an `inputs.elements` entry. An image-based element has an ID, description, frontal image, and up to three additional views. Prompts refer to the element rather than relying only on array order.

This is attractive for a future character library because the application could persist an element ID and reuse it across jobs. It is not a good fit for the first implementation because it needs named/grouped character records and a richer payload than `string[]`.

### SkyReels V4

SkyReels accepts up to three tagged reference groups, with one to five images in each group. Tags such as `@actor1` connect each group to the prompt. This is useful for multiple characters or a character-plus-style workflow, but likewise requires grouping and naming UI.

### P-Video-Replace and P-Video-Animate

Pruna's P-Video models use character images with a source video. Replace recasts a character already present in a clip; Animate transfers motion from a driver video to a still character. They are transformation tools, not the initial prompt-plus-character workflow, and should be considered when the application adds video-to-video editing.

## Application gap analysis

### Current behavior

The current Runware adapter builds a `videoInference` task and sends all provided images as:

```ts
task.inputs = { frameImages: frames };
```

Relevant code:

- `lib/providers/runware.ts`, `runwareCreateVideo`
- `lib/providers/types.ts`, `ProviderMode`, `ProviderModel`, and `VideoRequest`
- `lib/providers/catalog.ts`, `RUNWARE_MODELS`
- `components/VideoWorkspace.tsx`, video input-mode cards
- `components/ProviderVideoWorkspace.tsx`, model filtering and image picker
- `app/api/providers/video/route.ts`, request validation and adapter dispatch

Because `frameImages` means timeline anchors, none of the existing uploaded-image flows expresses “use these images as this character's identity.”

### Recommended capability model

Add a dedicated `reference` video mode and describe the model's accepted image inputs in provider metadata. A capability-shaped structure will scale better than another provider-specific conditional:

```ts
export type ProviderMode = 'text' | 'image' | 'frames' | 'reference';

interface ProviderVideoInputs {
  frameImages?: {
    max: number;
  };
  referenceImages?: {
    max: number;
    promptSyntax?: 'image-index' | 'at-image-index';
    canCombineWithFrameImages?: boolean;
  };
}
```

The server should resolve the Runware input field from trusted catalog metadata. It should not accept an arbitrary field name supplied by the browser.

At submission time, the adapter behavior becomes conceptually:

```ts
if (request.inputMode === 'reference' && images.length > 0) {
  task.inputs = { referenceImages: images };
} else if (images.length > 0) {
  task.inputs = { frameImages: images };
}
```

### UI behavior

Add a **Character references** card alongside Text to video, Image to video, and First & last frame. Show it only when the active provider has models advertising reference-image support.

Within that mode:

- Label the picker **Add character views**, not **First frame**.
- Explain that front, three-quarter, and profile views improve consistency.
- Preserve image order and display the corresponding prompt token (`Image 1` or `@Image1`) on each thumbnail.
- Enforce the selected model's reference limit.
- Filter the model menu to reference-capable models.
- Keep reference mode separate from frame mode for the first release, even where a model technically supports combining them.

### Duration metadata

The current catalog represents duration as a fixed whitelist. The recommended models mostly accept integer ranges. Add range support instead of populating dozens of arbitrary options:

```ts
duration?:
  | { type: 'options'; values: number[] }
  | { type: 'range'; min: number; max: number; default: number };
```

This preserves the exact whitelist behavior required by existing models while correctly representing Wan3.0, Gemini Omni Flash 1.1, Seedance 2.5, MiniMax H3, and HappyHorse 1.1.

## Media handling

Runware accepts URLs, base64 strings, data URIs, and Media Storage UUIDs for the recommended models. The application's existing `fileAsDataUrl` path is therefore sufficient for an MVP.

However, base64-encoding many references into every JSON request scales poorly. The production path should:

1. Upload a selected character image once through Runware's `mediaStorage` task.
2. Store the returned `mediaUUID` alongside the library asset for that Runware account/key.
3. Submit UUIDs in future `referenceImages` arrays.
4. Delete stored media when the user explicitly removes the reusable asset, subject to the desired retention policy.

For the first release, cap the UI at three to five reference images even when a model allows more. That covers the useful front/three-quarter/profile workflow while containing request size and keeping character-to-image assignment understandable.

## Verification plan

Documentation confirms that these fields are accepted, but it does not establish which model gives the best visual identity fidelity for this application's content. Before selecting the permanent default, run a controlled comparison:

1. Prepare one fixed three-view character pack: front, three-quarter, and profile.
2. Use the same 6-second 720p prompt with Wan3.0, Gemini Omni Flash 1.1, and Seedance 2.5.
3. Generate three seeds per model.
4. Score face, hair, clothing, body proportions, hands, and silhouette separately.
5. Repeat with one prompt containing a camera turn and one containing multiple cuts.
6. Record generation latency and actual returned `cost` alongside the visual scores.

The documentation supports Wan3.0 as the initial default on capability and cost. The controlled comparison should decide whether its observed consistency is strong enough or whether Gemini Omni Flash 1.1 should become the quality default.

## Primary sources

- [Wan3.0 image inputs](https://runware.ai/docs/models/alibaba-wan3-0/guides/image-inputs)
- [Wan3.0 API reference](https://runware.ai/docs/models/alibaba-wan3-0)
- [Wan3.0 Prime API reference](https://runware.ai/docs/models/alibaba-wan3-0-prime)
- [Gemini Omni Flash 1.1 API reference](https://runware.ai/docs/models/google-gemini-omni-flash-1-1)
- [Seedance 2.5 API reference](https://runware.ai/docs/models/bytedance-seedance-2-5)
- [Seedance 2.5 motion and performance references](https://runware.ai/docs/models/bytedance-seedance-2-5/guides/motion-control)
- [MiniMax H3 API reference](https://runware.ai/docs/models/minimax-h3)
- [HappyHorse 1.1 multi-character casting](https://runware.ai/docs/models/alibaba-happyhorse-1-1/guides/multi-character-casting)
- [Kling VIDEO 3.0 Pro API reference](https://runware.ai/docs/models/klingai-video-3-0-pro)
- [SkyReels V4 API reference](https://runware.ai/docs/models/skywork-skyreels-v4)
- [P-Video-Replace guide](https://runware.ai/docs/models/prunaai-p-video-replace/guides)
- [P-Video-Animate guide](https://runware.ai/docs/models/prunaai-p-video-animate/guides)
- [Runware Media Storage](https://runware.ai/docs/platform/media-storage)
