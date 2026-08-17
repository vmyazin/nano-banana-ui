# Additional generation sources: Runware, Atlas Cloud, CometAPI

Status: Approved design

## Context

The app generates images through `/api/generate` (Gemini, Pollinations, Cloudflare)
and video through provider-specific routes and workspaces (Kie, fal). Every
credential is BYOK: the key lives in `localStorage` via `useAppStore`, is posted to
our own route, and the route calls the provider. Nothing is billed to the app.

Three more providers are wanted, in this cost order:

| Provider | Base URL | Auth | Shape |
| --- | --- | --- | --- |
| Runware | `https://api.runware.ai/v1` | `Bearer` | array of tasks, `taskType` + `taskUUID` |
| Atlas Cloud | `https://api.atlascloud.ai/api/v1` | `Bearer` | submit → `prediction_id` → poll |
| CometAPI | `https://api.cometapi.com/v1` | `Bearer` | OpenAI-compatible images, `/v1/videos` for video |

All three contracts below were read from the vendors' own current docs on
2026-08-16 (sources at the bottom). **No model identifier in this design was
guessed** — each one is quoted from a docs page or a live public catalog endpoint.

## Goals

- Runware, Atlas, and Comet as first-class image engines in the existing engine
  picker, keyed by the user's own API key, using the existing generate → gallery →
  download pipeline unchanged.
- The same three as video providers in the existing video workspace.
- Cost visible before spending: each catalog entry carries the vendor's published
  price, and the generate call asks for the actual cost back where the API returns
  one.
- Runware is the default for new users because it is the cheapest of the three for
  both image and video.

## Non-goals

- LLM/chat surfaces. Atlas and Comet both serve text models; this app generates
  media, and the micro-AI tier already covers its own small helper tasks.
- Exhaustive model catalogs. Each provider hosts 100–800 models; this ships a
  curated set per provider plus (where the vendor publishes a public catalog
  endpoint) an optional live refresh. A user who wants an exotic model can paste
  its identifier.
- Server-side keys. These providers follow the BYOK rule the app already has:
  credentials come from the browser, per request, and are never stored by us.
- Audio, 3D, upscaling, LoRA training, and the other task types Runware exposes.

## Verified provider contracts

### Runware — image (synchronous)

```json
POST https://api.runware.ai/v1
[{
  "taskType": "imageInference",
  "taskUUID": "<uuid v4>",
  "model": "runware:z-image@turbo",
  "positivePrompt": "…",
  "width": 1024, "height": 1024,
  "numberResults": 1,
  "includeCost": true,
  "inputs": { "seedImage": "<url|dataURI>", "referenceImages": ["…"] }
}]
→ { "data": [{ "taskType", "taskUUID", "imageUUID", "imageURL", "cost" }] }
→ { "errors": [{ "code", "message", "parameter", "taskUUID" }] }
```

`inputs.referenceImages` accepts 0–4 entries. `strength` requires
`inputs.seedImage`. `width`/`height` must be sent together.

### Runware — video (async + polling)

Same endpoint, `taskType: "videoInference"`, plus `duration` (seconds),
`deliveryMethod: "async"`, and `inputs.frameImages` for image-to-video. The submit
returns immediately; results come from:

```json
[{ "taskType": "getResponse", "taskUUID": "<same uuid>" }]
→ { "data": [{ "status": "processing", "progress": 47 }] }
→ { "data": [{ "status": "success", "videoUUID", "videoURL", "cost" }] }
```

Docs recommend exponential backoff starting at 1–2s.

### Atlas Cloud — image and video (async + polling)

```json
POST https://api.atlascloud.ai/api/v1/model/generateImage
{ "model": "black-forest-labs/flux-schnell", "prompt": "…",
  "image": "", "mask_image": "", "strength": 0.8,
  "size": "1024*1024", "num_images": 1, "seed": -1,
  "enable_base64_output": false, "enable_safety_checker": true,
  "enable_sync_mode": false }
→ { "data": { "id": "<prediction_id>" } }

GET https://api.atlascloud.ai/api/v1/model/prediction/{id}
→ { "id", "status": "queued|processing|succeeded|failed", "output": ["<url>"], "logs" }
```

`POST /model/generateVideo` is the same submit/poll pair; video models take
`image` (image-to-video), `resolution`, `duration`, `aspect_ratio`, `seed`.

Atlas publishes an **unauthenticated** catalog at `GET
https://api.atlascloud.ai/api/v1/models` carrying `model`, `type`
(Text/Image/Video/Audio), `categories` (`TEXT-TO-IMAGE`, `IMAGE-TO-VIDEO`, …),
`price.actual.base_price`, and a per-model JSON schema URL.

### CometAPI — image (OpenAI-compatible) and video

```json
POST https://api.cometapi.com/v1/images/generations
{ "model": "gpt-image-2", "prompt": "…", "n": 1, "size": "1024x1024" }
→ { "data": [{ "b64_json" | "url" }] }
```

GPT image models return `b64_json` and ignore `response_format`. Video is a
multipart submit against a single route for every video family:

```
POST https://api.cometapi.com/v1/videos     (multipart/form-data)
  model=seedance-2-5  prompt=…  seconds=4  size=1280x720
  input_reference=@file            (image-to-video)
→ { "id": "…" }
GET https://api.cometapi.com/v1/videos/{id}
→ { "status": "queued|in_progress|completed|failed|error", "progress", "video_url" }
```

Comet's catalog is public too: `GET https://api.cometapi.com/api/models`.

## Curated models (all quoted from vendor docs / catalogs)

| Provider | Model ID | Kind | Published price |
| --- | --- | --- | --- |
| Runware | `runware:z-image@turbo` | text→image | ~$0.0032 / 1024² |
| Runware | `runware:400@1` | text→image, image→image (FLUX.2 dev) | $0.0077 / 1024² |
| Runware | `runware:108@22` | image→image (Qwen-Image-Edit-Plus) | $0.0166 / 1024² |
| Runware | `lightricks:2@1` | text→video, image→video | $0.24 / 6s @1080p |
| Runware | `bytedance:seedance@2.0-mini` | text→video, image→video | $0.036/s @480p, $0.081/s @720p |
| Runware | `pixverse:1@5-fast` | text→video, image→video | $0.094 / 5s @360p |
| Runware | `alibaba:wan@2.6-flash` | image→video | $0.025 / s @720p |
| Atlas | `black-forest-labs/flux-schnell` | text→image | $0.003 / image |
| Atlas | `z-image/turbo` | text→image | $0.005 / image |
| Atlas | `qwen-image-3.0/text-to-image` | text→image | $0.04 / image |
| Atlas | `qwen-image-3.0/edit` | image→image | $0.04 / image |
| Atlas | `ltx-2.3-quality/text-to-video` | text→video | $0.002 / s |
| Atlas | `bytedance/seedance-v1-pro-fast/image-to-video` | image→video | $0.009 / s |
| Comet | `gpt-image-2` | text→image | metered |
| Comet | `qwen-image` | text→image (n must be 1) | metered |
| Comet | `seedance-2-5`, `doubao-seedance-2-0-mini` | text→video, image→video | metered |
| Comet | `veo3.1-fast`, `veo3.1` | text→video, image→video | metered |
| Comet | `sora-2`, `sora-2-pro` | text→video, image→video | metered |
| Comet | `wan2.7` | text→video, image→video | metered |
| Comet | `viduq3-turbo` | text→video, image→video | metered |
| Comet | `minimax-h3` | text→video, image→video | metered |
| Comet | `happyhorse-1.1` | text→video, image→video | metered |
| Comet | `flux-3` | text→video, image→video | metered |

**2026-08-16 correction:** `bfl:flux@2-dev` and `runware:101@1` were dropped. The
first appears only on Runware's marketing pages — the FLUX.2 [dev] model page
quotes `runware:400@1`, which is what the API takes. The second appeared only in
a docs example with no model page to confirm what it is. Model pages are the
authority; a summary page is not.

Per-model constraints that failed in production and are now catalog data:
clip lengths (LTX-2 Fast takes 6/8/10 only), output sizes (LTX-2 Fast is 16:9
only; Seedance 2.0 Mini and PixVerse V5 Fast publish portrait and square), and
the input-image field (`seedImage` on checkpoints vs required `referenceImages`
on the editing models).

## Scope and implementation boundary

New code lives in:

- `lib/providers/` — `types.ts`, `catalog.ts`, and one adapter per provider, plus
  an `index.ts` registry. Server-only HTTP; no React, no SDKs.
- `app/api/providers/video/route.ts` — create/status for the three new video
  providers.
- `store/useProviderJobsStore.ts` — one job store shared by the three, mirroring
  `useKieJobsStore`.

Existing files change only at their seams:

- `lib/engines/registry.ts` — three new `EngineMeta` entries.
- `app/api/generate/route.ts` — a branch that hands the new engine ids to the
  provider layer.
- `store/useAppStore.ts` — three keys plus per-provider model preferences.
- `components/ApiKeyConfig.tsx` — three credential cards.
- `components/GenerationInterface.tsx` — key gating and the cost line.
- `components/ProviderLogo.tsx`, `lib/engines/docs.ts` — marks and doc links.

Must not touch: the Gemini/Pollinations/Cloudflare engines, the fal and Kie
clients, catalogs, stores or workspaces, the gallery pipeline, or the auth guard.

## Decisions

- **Provider images return URLs; we return bytes.** All three hand back a URL
  (Comet's GPT models hand back base64). The route fetches the URL server-side and
  returns base64 the way every existing engine does, so the gallery, download,
  drop-to-reuse, and library paths keep working untouched. It costs one extra hop
  and keeps ~600 lines of client code unchanged.
- **One job store for all three video providers**, not three. Their contracts are
  the same shape — submit, poll, read a URL — and the differences are confined to
  the adapters.
- **Curated catalogs are checked-in constants, not live fetches, for the default
  set.** A live catalog is a network dependency on first paint and its 400–800
  entries are unusable as a picker. The public catalog endpoints stay available
  for a later "browse all models" surface.

## Sources

- Runware: `https://runware.ai/docs/llms.txt`, `/docs/platform/task-polling`,
  `/docs/platform/task-details`, `/docs/models/alibaba-z-image-turbo`,
  `/docs/models/lightricks-ltx-2-fast`, `/docs/models/alibaba-wan2-6-flash`
- Atlas: `https://atlascloud.ai/docs/models/image`, `/docs/models/video`,
  `https://www.atlascloud.ai/models/black-forest-labs/flux-schnell/llms.txt`,
  `https://www.atlascloud.ai/models/bytedance/seedance-v1-pro-fast/image-to-video/llms.txt`,
  `https://api.atlascloud.ai/api/v1/models`
- Comet: `https://apidoc.cometapi.com/llms.txt`, `/api/image/openai/images.md`,
  `/api/video/seedance/create.md`, `/api/video/seedance/query.md`,
  `/overview/models.md`
