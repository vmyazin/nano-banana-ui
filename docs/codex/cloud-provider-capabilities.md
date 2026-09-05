# Cloud generation provider capability record

Status: implementation in progress. Reviewed 2026-09-04. This records evidence and gaps; it is not a claim that every provider is enabled.

## Follow-up implementation status — 2026-09-05

This supersedes the implementation gaps in the initial table below. All eight engines now have Worker adapters: fal/Kie/Runware/Atlas use persisted handles; Comet uses video handles or synchronous image results; Gemini/Cloudflare/Pollinations stage synchronous outputs. All studio image/video workspaces use the shared account submit and results boundary. Production enablement still defaults off, and credentialed verification, maximum output sizes and retention remain outstanding.

The installed Google SDK documents `httpOptions.retryOptions.attempts: 1` as disabling retries. A mocked HTTP 503 test confirms one network call. Reference MIME is preserved; total inline inputs are capped at 12 MB before acceptance, and inline base64 outputs at 24 MB to bound Worker memory. These are app limits, not vendor guarantees. A result that reached R2 before its D1 commit can be recovered without repeating generation. A response lost before R2 remains ambiguous. Pollinations streams its response instead of making a base64 copy.

Current [Pollinations authentication docs](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/docs/apidocs-recipes.md) require a bearer key on generation endpoints. Account execution uses the encrypted key and `gen.pollinations.ai/image`; the original guest endpoint remains unchanged. Its public model metadata returned 403 from this environment, so live service verification is unresolved. Current [Comet image docs](https://apidoc.cometapi.com/api/image/openai/images) return `output_format`; the shared parser now preserves JPEG/WebP instead of labelling every base64 result PNG. [Comet video status](https://apidoc.cometapi.com/api/video/seedance/query) provides a task ID and expiring result URL. The existing catalog model IDs are retained; no model migration was included.

## Recovery contract

A client submission token deduplicates our intake, not the vendor's paid request. Persist submission intent before making the vendor call; persist its task handle immediately after acceptance. A lost acceptance response is ambiguous unless the vendor supplies a documented reconciliation mechanism. Never infer deduplication from a task UUID alone. Polling and copying existing results can retry; paid submission cannot.

| Provider | Existing reusable boundary | Recovery evidence | Remaining enablement work |
|---|---|---|---|
| fal | lib/fal/server.ts submitFalTask / getFalTask; lib/fal/catalog.ts | Queue returns request ID, status and result APIs. Existing submit transport caches its first response so SDK retry machinery cannot make another network submission. | Text adapter implemented behind configuration; references, credentialed checks and per-model byte limits remain. Cancellation best effort, not a refund promise. |
| Kie market / Veo | lib/kie/client.ts createKieTask / getKieTask; lib/kie/catalog.ts | Task ID supports later status lookup. Market result metadata contains output URLs; copy promptly because URLs expire. No verified submission-idempotency guarantee. | Text adapter implemented behind configuration. Reference staging, live Market/Veo checks and bounds remain. |
| Runware | lib/providers/runware.ts | Async task polling uses taskUUID. Correlation does not by itself prove deduplication. | Factor sync image loop into async submission/polling; validate recovery of a caller-generated ID and live output hosts. |
| Atlas | lib/providers/atlas.ts | Predictions have IDs and separate status endpoints. Existing image adapter wraps submission and polling together. | Extract submission and polling boundary without changing guest behavior; validate native payloads and output hosts. |
| Comet | lib/providers/comet.ts | Current image API returns URL/base64 synchronously; video integration uses job IDs. | Split protocols, persist synchronous results before retryable saving, verify provider-specific video contract. |
| Gemini | lib/engines/gemini.ts | Current generateContent call returns inline bytes; no recoverable job handle in this integration. | Verify SDK retry controls; stage returned bytes once. Lost response must remain ambiguous. |
| Cloudflare FLUX | lib/engines/cloudflare.ts | Existing Workers AI endpoint returns image bytes/base64 synchronously. | Stage output durably and bound request/output sizes; no automatic chargeable replay. |
| Pollinations | lib/engines/pollinations.ts | Existing image request is synchronous. | Verify current service contract before enabling, including authentication, retention and limits. |

Sources: [fal queue](https://fal.ai/docs/documentation/model-apis/inference/queue), [Kie task details](https://docs.kie.ai/market/common/get-task-detail), [Runware polling](https://runware.ai/docs/platform/task-polling), [Atlas predictions](https://www.atlascloud.ai/docs/predictions), [Comet images](https://apidoc.cometapi.com/api/image/openai/images), [Gemini generateContent](https://ai.google.dev/api/generate-content), [Cloudflare FLUX](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell).

## Current implementation limits

Production native providers default off. `CLOUD_GENERATION_PROVIDERS` explicitly enables reviewed adapters; currently only `fal` and `kie` exist. Do not set this in production until the remaining verification is complete. Local fixture execution is separately compile-time gated and never calls vendors.

The initial ledger reserves 64 MB per image job or 256 MB per video job, limits each account to three active jobs, and rejects intake that would exceed its one-billion-byte allowance. These reservation values are **engineering placeholders, not verified maximum vendor outputs**. Current capture bounds each output at one billion bytes and each job at eight outputs, but aggregate overflow accounting and operational global caps remain required before production enablement. A full account retains access to existing assets. Unknown acceptance retains its reservation until explicitly reconciled; automatically expiring it could admit more work while an accepted vendor generation is still running.

The current capture worker streams multipart uploads and commits deterministic owner/job object keys, then inserts metadata and accounts bytes atomically. Replaying a completion cannot duplicate usage or resurrect a tombstoned asset. Orphan and input cleanup, user deletion, explicit imports and scoped direct uploads/downloads remain outstanding.

## Runtime verification

Cloud Worker imports the existing fal/Kie catalogs and transport functions directly. Typechecking and Wrangler production dry-run resolve those imports successfully; no browser state or plaintext-key return endpoint was introduced. Contract tests exercise native Kie HTTP submission/status and fal's one-network-attempt behavior. These mock tests do not substitute for credentialed generation.
# Follow-up verification — 2026-09-05

Runware image/video cloud adapters now reuse the native request builders with async delivery and saved UUID polling. Official [task polling](https://runware.ai/docs/platform/task-polling) and [CLI delivery examples](https://runware.ai/docs/platform/cli) document this contract. UUID correlation is not treated as permission to resubmit after a lost response. Atlas image/video use the shared prediction submit and poll paths; its [current prediction envelope](https://www.atlascloud.ai/docs/predictions) uses `data.status=completed` and `data.outputs`. The shared parser accepts that alongside the older flat `succeeded/output` shape. Both providers remain configuration-gated pending credentialed model/output-host/limit verification. Native paid requests were not made in this milestone.
