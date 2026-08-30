# Universal image-to-video example prompts

Status: Approved design

## Context

The prompt section's **GenExample** action asks a small language model to write an example for the active generation mode. The current image-to-video brief encourages the model to invent subject motion, while the shared format rule explicitly asks for art style or medium. Because the model cannot see the uploaded image, those instructions produce examples tied to imagined content such as a garden, a single person, or a watercolor. The same generated prompt is then shown for landscapes, portraits, groups, objects, and artwork.

## Goals

- Generate an image-to-video example that can be applied unchanged to any uploaded visual.
- Keep the output cinematic and useful by describing scene-neutral lighting, atmosphere, ambient motion, and camera movement.
- Refer to unknown visual content only with neutral terms such as “the scene” and “the view.”
- Apply the same contract to the shared micro-AI path and the Gemini fallback.
- Preserve the current provider-independent **GenExample** UI and request flow.

## Non-goals

- Do not inspect or caption the uploaded image.
- Do not send uploaded media to the example-prompt model.
- Do not change text-to-video or image-generation example behavior.
- Do not add provider-specific prompt components or API routes.
- Do not make a paid video-generation request as part of verification.

## Scope and implementation boundary

The behavior lives in `lib/example-prompts.ts`, where `metaForFeature('image-to-video')` defines the feature brief consumed by both example-generation backends. `lib/micro-ai/tasks.ts:examplePromptTask` may select a feature-specific output rule so the shared micro model is not asked to invent art style or medium for an unseen upload.

Regression coverage belongs in `tests/micro-ai/tasks.test.ts` and `tests/micro-ai/routes.test.ts`. The implementation must not modify prompt UI components, provider workspaces, upload handling, video-generation adapters, or model catalogs.

## Acceptance criteria

- The image-to-video brief explicitly supports landscapes, individual portraits, groups, objects, and artwork.
- The brief forbids invented subjects, subject counts, objects, settings, clothing, demographics, art styles, and media.
- The brief directs the model to use scene-neutral language and motion.
- The micro-AI task no longer requests art style or medium for image-to-video examples.
- The Gemini fallback receives the same universal contract.
- Existing example-prompt behavior for other feature IDs remains covered and unchanged.
