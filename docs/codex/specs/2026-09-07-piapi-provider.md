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

## Follow-up decision — 2026-09-07: hosted-reference enablement

User requested remediation after Free-plan uploads failed. Prepare PiAPI in the
Worker provider list for a controlled production check using the already-saved
account connection. This supersedes the original deployment non-goal only after
explicit approval of the production change and paid tests. Production remains
unchanged while approval is pending. No subscription upgrade, anonymous hosting,
credential export, or automatic paid retry is included.

Boundary: cloud/wrangler.jsonc provider variable, its configuration regression
test, and lib/providers/piapi.ts upload error wording. The existing signed input
URLs and durable adapter remain unchanged. Verify Nano Banana 2 at 1K ($0.06)
then Kling Omni at 720p, 3 seconds, no audio ($0.30) using a neutral test fixture.
Stop on ambiguity; remove PiAPI from enablement if the hosted-reference path fails.
The currently selected 5-second audio job costs $0.75, above the observed $0.44
balance. No top-up or change to the user's existing draft is authorized.

### Follow-up outcome — 2026-09-07 local

User granted the requested deployment and $0.36 test authorization and requested
a reference from their folder. The first background submission returned no task
ID and entered needs-attention; signed reference creation succeeded but provider
acceptance and image fetching remain unproven. Stop-on-ambiguity applies: defer
Kling and restore the provider gate. See the plan for the job and deployment
record. No new subscription, top-up, or repeat paid attempt was performed by
the agent. Further diagnostics are a follow-up, not a reason to auto-retry.

## Follow-up decision — 2026-09-08: non-billable diagnostics

User requested continued diagnosis. Temporarily extend the authenticated GET of
the specific unresolved PiAPI job in `cloud/src/job-routes.ts:30-45`, delegated to
`cloud/src/piapi-diagnostic.ts`, to test credential resolution and a GET-only
PiAPI task lookup. Return only status/type metadata, never keys, tokens, URLs,
vendor bodies or personal data. Keep provider enablement off. Remove the probe
and redeploy after diagnosis. Do not modify vault encryption, unrelated jobs,
frontend routing, or submit another paid task. Verify with Worker typecheck and
GET-only/owner-guard regression checks before deployment.

### Diagnosis and revised decision — 2026-09-08 UTC

Workerd reproduced `TypeError: Invalid redirect value` for `redirect: error`;
this runtime accepts only follow/manual. PiAPI transport threw before network
submission. The temporary owner-scoped GET probe likewise failed before the fix,
then returned HTTP 200/code 200/completed for an existing vendor task with manual
redirect handling, proving the saved key works from the Worker.

Fix boundary: `lib/providers/piapi.ts:18-40` uses manual redirects and rejects
HTTP 3xx plus browser opaque redirects before response parsing. Paid redirects
remain ambiguous (409), never automatically retried. Five regression cases cover
redirect rejection and preventing key forwarding/second submissions.
The temporary probe and route hooks are removed. The original job was never
submitted to PiAPI; resume the authorized two checks within $0.36 after enabling
the fixed Worker. This supersedes the prior stop-on-ambiguity for that original
pre-network runtime failure only. Other ambiguous requests must still not retry.

### Acceptance outcome — 2026-09-08 UTC

Nano Banana 2 and Kling Omni reference jobs both saved successfully using signed
Worker URLs on the Free PiAPI plan, with one asset and one spend entry each and
released reservations. Total test cost: $0.36. PiAPI stays enabled; Veo remains
unverified live. Guest references still require Creator or higher.
