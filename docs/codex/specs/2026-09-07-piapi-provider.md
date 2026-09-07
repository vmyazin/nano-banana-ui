# PiAPI provider

Status: Approved design

## Context and goals

Add PiAPI as a first-class image/video provider with its official logo, saved
browser/account connection, model selections, generation, result/library/download
flows and published estimated spend. Models: Nano Banana 2, Veo 3.1 Fast and
Kling 3.0 Omni. Use the existing aggregator workspaces and durable task adapter.

## Scope and implementation boundary

`lib/providers/piapi.ts` owns authentication, uploads, task submission and polling.
`lib/providers/catalog.ts` owns the allowlist, controls and rates. Extend engine,
provider, account and store registries, shared generation routing and spend capture.
Reuse ConnectionGate, PromptPanel, ModelControls, ReferenceStack, account jobs,
gallery capture and filenames. Add PiAPI branding to ProviderLogo and selectors.

Nano Banana accepts up to 14 image URLs, 1K/2K/4K and supported aspect ratios.
Veo Fast supports text, one opening image and first/last frames at 720p/1080p,
4/6/8 seconds, portrait/landscape and optional native audio. Do not enable Veo
reference mode because the docs do not clearly include Fast in that capability.
Kling Omni supports text, opening/closing frames expressed through prompt tokens,
and up to five reference images in the existing picker using @image_1 tokens,
3–15 seconds, 720p/1080p, portrait/landscape/square and native audio.

Browser reference uploads use PiAPI's upload API, which requires Creator or above;
account jobs use existing signed reference URLs. Explain that limitation in the
connection UI and upload errors. Never send a paid task twice after an ambiguous
submission. Credentials go only to the fixed API/upload hosts.

## Non-goals

No general PiAPI catalog, video/audio reference uploads, structured multi-shot
editor, changes to other providers' generation behavior, production deployment,
or automatic enabling of cloud PiAPI before real credentialed verification.
Use the current checkout and no superpowers skills, per session instructions.

## Sources checked 2026-09-07

- https://piapi.ai/docs/gemini-api/nano-banana-2.md
- https://piapi.ai/docs/veo31-api/text-to-video.md
- https://piapi.ai/docs/veo31-api/image-to-video.md
- https://piapi.ai/docs/kling-api/kling-3-omni-api.md
- https://piapi.ai/docs/tools/file-upload.md
- https://piapi.ai/piapi_favicon.webp (official brand asset)

The Markdown pages include OpenAPI request schemas. Ignore erroneous arithmetic
in Kling's multi-shot example; use the documented per-second rate table.
