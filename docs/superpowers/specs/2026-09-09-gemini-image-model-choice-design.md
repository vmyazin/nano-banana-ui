# Gemini image model choice

Status: Approved design
Date: 2026-09-09

## Context

The Gemini engine has always run one fixed model, `gemini-3-pro-image-preview`,
priced at $0.134 for a 1K or 2K image and $0.24 at 4K. Google now publishes two
cheaper siblings on the same API key:

| Model | Id | 1K | 2K | 4K | Search grounding |
| --- | --- | --- | --- | --- | --- |
| Nano Banana Pro | `gemini-3-pro-image-preview` | $0.134 | $0.134 | $0.24 | yes |
| Nano Banana 2 | `gemini-3.1-flash-image` | $0.067 | $0.101 | $0.151 | yes |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | $0.0336 | — | — | no |

Read from https://ai.google.dev/gemini-api/docs/pricing and
https://ai.google.dev/gemini-api/docs/image-generation on 2026-09-09.

A 1K image on Lite costs a quarter of the same image on Pro, and the key that
buys one buys all three. The studio gives no way to spend that quarter: every
other paid engine here (fal, Kie, Runware, Atlas, Comet, PiAPI) opens on a Model
rack listing what the provider serves and what each row costs, and Gemini —
the engine the app opens on — is the only one that does not.

## Goals

- Let a person pick which Gemini image model runs, in the browser and in a
  background cloud job, from the same Model listbox every aggregator uses.
- Show each model's published per-image rate in the picker and in the cost line
  under the Generate button, so the choice can be made on price without leaving
  the app.
- Price the spend ledger per model. A Lite run must not be filed at the Pro rate.
- Name a download after the model that actually made it.
- Keep resolution and search-grounding controls honest per model: Lite offers
  only 1K and cannot ground with Google Search.

## Non-goals

- **The 512px (0.5K) tier.** Google documents it for Flash Image only, and its
  own page spells the parameter three different ways ("512px", "0.5K", "05.K")
  while insisting a rejected value is a hard error. Sending an unverified enum
  on a paid call is not worth $0.02 an image; 1K stays the floor.
- **Renaming the Pro model id.** Google's catalog now lists `gemini-3-pro-image`
  as stable while this app submits `gemini-3-pro-image-preview`. The preview id
  is the one verified against a real key and a real bill, and swapping it is a
  separate change with its own live check.
- **Gemini 2.5 Flash Image.** Superseded by Lite on both price and quality.
- **Per-model aspect ratios.** Flash Image documents 1:4 and 1:8; the studio's
  eight ratios stay as they are for every engine.
- **Video, and the other engines.** Nothing outside the Gemini image path moves.

## Design

### The catalog

`lib/engines/gemini-catalog.ts` holds the three models: id, label, `fileCode`,
the resolutions each accepts, whether it grounds with Google Search, and the
reference-image cap Google documents. It is dependency-free, so the Worker's
validator, the browser picker, and the spend resolvers all read one list.

Rates stay in `lib/spend/rates.ts` per the repo rule that a price lives in one
file naming the page it came from. `GEMINI_IMAGE_RATES` becomes a record keyed
by model id; `geminiTokenCost` and `geminiResolutionCost` take the model id as
their first argument, and a new `geminiRateLabel` renders the picker's From cell.

### Choosing a model

`useAppStore` gains a persisted `geminiImageModel`, defaulting to the Pro
preview id so nobody's cost per image changes without them asking. The
`GenerationInterface` Model card, previously rendered only for the aggregators,
also renders for Gemini, using `ModelListbox` with the same image columns
(From · Refs · Edit).

Two controls narrow to the chosen model:

- Resolution shows only the sizes that model accepts, and a size that does not
  survive the switch falls back to 1K.
- The search-grounding feature filters the rack to models that ground, because
  a Lite row in that mode would promise something the API refuses.

### Where the model id travels

The id is already carried end to end for the aggregators; Gemini simply stops
being a special case:

- `/api/generate` passes it to `geminiGenerate`, which defaults to Pro when a
  request omits it, so an older client keeps working.
- Cloud jobs send it as `modelId`, and `validateSynchronousRequest` accepts any
  id in the catalog, rejecting a resolution or a search flag the chosen model
  does not support. `SINGLE_IMAGE_MODELS.gemini` remains the default for the
  Cloudflare/Pollinations shape it shares.
- `jobModelLabel` and `modelFileCode` look the id up in the catalog before
  falling back to the engine-level name and code.
- `captureImageResult` and `buildAccountSpendEntry` pass it to `resolveGemini`,
  which prices the run from that model's rate block. Usage metadata still wins
  when the response reports it; the estimate is the fallback.

### Testing

Unit tests cover the three rate blocks and the token-versus-estimate branch of
`resolveGemini`, the catalog's coverage of every rate entry, cloud validation
accepting Flash while rejecting 2K on Lite, and the file code and job label per
model. Component tests cover the rack appearing for Gemini, the resolution
options narrowing on Lite, and the cost line following the selection.

## Scope and implementation boundary

Lives in: `lib/engines/gemini-catalog.ts` (new), `lib/engines/gemini.ts`,
`lib/spend/rates.ts`, `lib/spend/resolve.ts`, `lib/spend/capture.ts`,
`lib/spend/account.ts`, `lib/account/job-label.ts`, `lib/download-name.ts`,
`lib/models/listbox-specs.ts`, `store/useAppStore.ts`,
`components/GenerationInterface.tsx`, `app/api/generate/route.ts`,
`cloud/src/provider-adapters/synchronous.ts`, plus tests and README.

Must not touch: the video workspaces, the fal/Kie/aggregator catalogs and their
rates, the timeline, the gallery, account authentication, or the aspect-ratio
tables in `lib/providers/output-size.ts`.
