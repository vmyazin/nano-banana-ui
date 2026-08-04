# fal.ai Provider Design

## Goal

Add fal.ai as a bring-your-own-key provider for all six existing image workflows and for both video workflows. Keep the existing Kie.ai integration stable while introducing a curated, verified fal model catalog and durable queue handling.

## Scope

### Images

Use Nano Banana 2 for every existing image feature:

- Text to image
- Image editing
- Multi-image composition
- Search-grounded visualization
- Social-media thumbnails
- Style transfer

Text-only requests use `fal-ai/nano-banana-2`. Requests with reference images use `fal-ai/nano-banana-2/edit`. The adapter maps the existing aspect ratio, 1K/2K/4K resolution, and web-search settings to fal inputs. Reference images are uploaded to fal CDN before queue submission.

### Video

Add a searchable static catalog with verified text-to-video and image-to-video endpoint pairs for nine family/tier choices:

- Veo 3.1 Standard and Veo 3.1 Fast
- Seedance 2.0 Standard and Seedance 2.0 Fast
- Kling 3 Standard and Kling 3 Pro
- Sora 2 Standard and Sora 2 Pro
- Wan 2.7

Each choice has one text-to-video endpoint and one image-to-video endpoint, for 18 explicitly mapped endpoints. The app will not accept arbitrary fal endpoint IDs or dynamically render unverified marketplace schemas.

## Architecture

Use a hybrid provider-adapter design:

1. Preserve the existing Kie catalog, transport, queue, and polling behavior.
2. Add fal-specific catalog, input mapping, output normalization, client transport, and job state modules.
3. Extract only neutral UI pieces needed by both providers, such as provider selection, typed model controls, and queued-result presentation.
4. Extend the existing image engine registry with fal.
5. Extend the Video workspace with a persisted Kie/fal provider choice and render the appropriate provider workspace.

The main fal modules are:

- `lib/fal/catalog.ts`: typed static image/video model definitions, compatible modes, endpoint IDs, fields, defaults, validation, payload builders, and output extractors.
- `lib/fal/client.ts`: browser calls for upload, submit, status, result, and cancellation, plus normalized public errors.
- `lib/fal/server.ts`: credential forwarding, allow-list resolution, request validation, upstream parsing, and secret-safe error handling.
- `store/useFalJobsStore.ts`: tab-local fal video job state. Persist only provider/model preferences and the fal key in the existing app store.
- Next.js fal routes: short-lived proxy operations for key validation, CDN upload, queue submission, status, result, and cancellation.

## BYOK and Security

The user supplies a fal API key in the API connections dialog. The key is persisted only in browser local storage, consistent with the existing provider model. It is sent to the app's own Next.js routes only when a fal operation needs it. The server attaches `Authorization: Key <user-key>` to the upstream request and never logs, stores, or returns the key.

The API connections dialog validates a candidate key through fal's authenticated model-pricing API. This verifies authorization without starting a billable inference request.

Proxy routes accept catalog IDs and request IDs, never arbitrary target URLs. The server resolves all upstream hosts and paths from its own allow-listed catalog. It rejects unknown catalog entries, malformed request IDs, missing credentials, and unsupported operations before making an upstream request.

Queue submissions include `X-Fal-Store-IO: 0` so fal does not retain JSON input/output history. The UI explains that reference uploads and generated media use public, temporary fal CDN URLs. Users should download completed work promptly.

## Image Flow

1. The user connects a fal key and selects `fal.ai · Nano Banana 2` from the existing engine selector.
2. The current feature controls remain visible according to engine capabilities: reference images, aspect ratio, resolution, and web search.
3. Reference files upload to fal CDN through the BYOK route. Local selections remain available if upload or submission fails.
4. The client chooses the generation or edit catalog variant, builds the verified input, and submits it to fal's queue.
5. The browser polls through short server requests with bounded backoff.
6. When complete, the adapter extracts the image URL and content type for the existing preview and download UI.

Image generation can await the browser-side queue helper inside the current TanStack Query mutation. No long-running Next.js request waits for inference.

## Video Flow

1. The Video workspace exposes a Kie.ai/fal.ai provider selector while retaining the current text-to-video and image-to-video mode switch.
2. With fal selected, the model picker searches only catalog families compatible with the active mode.
3. The controls panel renders only the selected endpoint's typed, verified fields and defaults.
4. Image-to-video references upload to fal CDN before submission.
5. The job is submitted to fal's durable queue and stored in a tab-local fal job store.
6. The result panel shows queued, running, completed, failed, timed-out, or cancelled state, including safe logs or a request ID when useful.
7. A pending job can be cancelled. Completed video is previewed from the fal CDN URL and can be downloaded.

A page refresh clears the local job view, matching the current Kie behavior; it does not cancel fal's durable upstream request.

## Error Handling

Normalize provider responses into actionable messages:

- `401` or `403`: invalid/revoked key or missing model access; direct the user to API connections.
- Credit or payment rejection: explain that the fal account needs credits.
- `422`: surface the safe model validation message beside the controls when possible.
- `429`: report rate limiting and do not silently resubmit.
- Upload failure: preserve the local reference so the user can retry.
- Temporary status-network failure: retry polling with bounded backoff.
- Fifteen-minute local timeout: stop polling without cancelling the durable request.
- Provider failure: show a sanitized message and the request ID for support.
- Cancellation: mark the job cancelled and never auto-resubmit it.

fal may perform its documented internal queue retries. The app itself will not create a second billable request automatically.

## State and Compatibility

Extend the persisted app store with:

- `falApiKey`
- `videoEngine` (`kie` or `fal`)
- `falVideoModel`, storing one of the nine curated family/tier IDs

Extend `EngineId` with `fal`. Existing persisted users continue to default safely when a stored engine or model is absent or incompatible with the active feature. Gemini-only example-prompt and filename helpers remain optional conveniences and do not block fal generation.

## Testing

Implementation follows test-driven development.

- Catalog tests cover every advertised family, compatible mode, endpoint, default, field constraint, payload mapping, and output extractor.
- Queue-client tests cover submit, queued, running, completed, cancellation, bounded polling, local timeout, provider failure, and normalized errors.
- Server-route tests cover key validation, upload forwarding, BYOK authorization, catalog allow-list enforcement, malformed inputs, upstream status propagation, and secret-safe errors.
- Image integration tests cover fal availability in all six modes, generation/edit endpoint selection, reference upload mapping, resolution/aspect ratio/web-search mapping, and result rendering.
- Video integration tests cover provider persistence, catalog search/filtering, mode compatibility, verified controls, job transitions, cancellation, and video results.
- Existing tests, lint, and the production build must pass before completion.

## Documentation

Update the README provider matrix, setup instructions, usage steps, architecture tree, security notes, and fal documentation links. Describe the curated model set without claiming live marketplace coverage. Note fal CDN retention and public-URL behavior.

## Out of Scope

- Dynamic marketplace discovery or arbitrary fal endpoint IDs
- Runtime OpenAPI form generation
- Video-to-video, reference-to-video, first/last-frame, or extension workflows beyond the existing text/image video modes
- Server-owned shared `FAL_KEY`
- Server-side job persistence, webhooks, or cross-device job history
- Refactoring Kie transport/catalog code into a new generic provider framework
