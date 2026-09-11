# Edit video
Status: Approved design

## Follow-up decision — 2026-09-11: one source preview
Remove the duplicate “Original for comparison” section from the result column. The source remains visible in `VideoSourceInput`; the result column shows generated output only. Keep cloud result selection tied to the submitted job and account epoch without retaining a second copy of the source file.

## Follow-up decision — 2026-09-11: real transformation verification
Live API verification exposed source constraints absent from the initial fixture smoke: each dimension must be 300–6000 pixels, the ratio must be 0.4–2.5, and ByteDance additionally requires at least 407,696 source pixels for Seedance 2.5 r2v. `VideoSourceInput.select` now checks these before accepting the file; the seeded source is 1280×720. Preserve `additionalDetails.responseContent` in Runware errors, and show a failed browser job's provider task ID for lookup. Cloud edits use the durable job ID as Runware's task UUID so a failed submission remains diagnosable without a repeat paid request.

The synthetic smoke does not satisfy provider verification. Local background edits must transfer owned source bytes to Runware storage because a remote provider cannot fetch localhost capabilities. Bound this local transfer to 12 MB total; production keeps private, scoped HTTPS input URLs. Expose fake generation in the execution notice. Verify an actual user-selected clip with the configured provider and inspect its result before claiming transformation success. Changes stay within the existing edit adapter, input lifecycle, session capability and execution notice; no deployment or unrelated provider changes.

## Context and goals
Add an Edit video mode to the existing video workspace for Runware Seedance 2.5: one source clip selected from device or either library, optional replacement images, editable prompt shortcuts, source preview and generated result. Reuse existing background and browser job tracking, reference preparation, library and spend capture.

## Non-goals
No masks, trimming, extension, motion transfer, new providers, timeline changes or deployment before localhost sign-off.

## Scope and implementation boundary
`ProviderVideoWorkspace` owns the form through the existing layout and prompt components. A dedicated source input owns file inspection and library selection. `lib/providers/video-edit.ts` owns edit constraints and `runware.ts` translates semantic edit requests to inputs.video, settings.operation=edit and duration=auto, with resolution only. Existing model IDs stay intact; edit capabilities and edit rates are per mode. Browser uploads go directly to Runware mediaStorage; account uploads use existing scoped Worker upload capabilities. CloudJobRequest adds sourceVideoId, held by the same job-input lifecycle and owner checks as images. Never store account job state in guest stores.

## Acceptance
Device and library video selection; image references remain optional and use @ImageN. Only compatible providers/models offer edit. Source duration and aspect are inherited. No paid resubmission after an uncertain edit submission. Video upload errors are visible; owner changes invalidate in-flight account work. Cloud validation rejects wrong media roles and unsupported modes before dispatch. Existing modes remain unchanged. Local fake editing returns seeded video bytes without credentials; contract tests verify the real outbound request separately.

## Sources (read 2026-09-11)
- https://runware.ai/docs/models/bytedance-seedance-2-5/guides/editing
- https://runware.ai/docs/models/bytedance-seedance-2-5
- https://runware.ai/docs/platform/media-storage

The editing guide lists 480p/720p; expose those conservative tiers despite the general model reference also listing 1080p. Video-to-video rates differ from generation: $0.131/s at 480p, $0.295/s at 720p. Source file size cap is an application bound, not a claimed vendor maximum.
