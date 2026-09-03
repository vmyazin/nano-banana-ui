# Spend dashboard

Status: Approved design
Date: 2026-09-03

## Context

Scene Assembly runs generations against eight engines, and each one reports cost
differently or not at all:

| Engine | What the app knows today | Where |
| --- | --- | --- |
| Runware | Exact USD per task, returned in the response (`includeCost: true`) | `lib/providers/runware.ts`, shown once in a status pill |
| Gemini | Hard-coded per-image estimate by resolution; the response's `usageMetadata` is not read | `components/GenerationInterface.tsx` cost line |
| fal | Nothing per run. A pricing endpoint is called only to validate the key | `lib/fal/server.ts` `validateFalApiKey` |
| Kie | Nothing per run. A credit-balance endpoint is called only to validate the key | `lib/kie/server.ts` `validateKieApiKey` |
| Atlas, Comet | Published rates as display strings on the catalog, many just `metered` | `lib/providers/catalog.ts` `price` |
| Pollinations, Cloudflare | Free | `lib/engines/registry.ts` `free` |
| Micro-AI helper tier | Session-only request count and estimated USD | `store/useMicroAiUsageStore.ts` |

None of it is persisted. Job stores are tab-local by design and gallery records
carry no cost. A person who wants to know what a week of work cost has to open
five vendor dashboards.

Vendor capabilities that shape the design (verified 2026-09-03):

- fal `GET https://api.fal.ai/v1/models/pricing?endpoint_id=…` returns
  `{ prices: [{ endpoint_id, unit_price, unit, currency }] }`. fal
  `POST https://api.fal.ai/v1/models/pricing/estimate` with
  `{ estimate_type: 'unit_price', endpoints: { [endpointId]: { unit_quantity } } }`
  returns `{ total_cost, currency }`. Both accept a regular API key. fal's
  per-request usage history (`/v1/models/usage`) needs an admin key, so it is
  out of reach.
- Kie `GET https://api.kie.ai/api/v1/chat/credit` returns
  `{ code, msg, data: <integer credits> }`. Kie publishes credits at roughly
  $0.005 each. There is no per-task cost field and no history endpoint.
- Gemini 3 Pro Image bills output images at $120 per 1M tokens, with 1K and
  2K images counted as 1120 tokens ($0.134) and 4K as 2000 tokens ($0.24), and
  input at $2 per 1M tokens. `usageMetadata` on the response carries
  `promptTokenCount` and `candidatesTokenCount`.

## Goals

- Keep a durable, local ledger of every finished generation with its cost.
- Label every figure honestly: exact, estimated, or unknown, with the source.
- Show totals, breakdowns by provider and model, a daily chart, and the raw
  ledger on a full page at `/spend`, linked from the studio footer and ⌘K.
- Never let spend capture slow down or fail a generation.

## Non-goals

- Budgets, caps, or warnings. This is a readout, not a gate.
- Server-side or cross-device persistence. The ledger lives in the browser like
  the keys and the library do.
- Pulling history from vendor billing APIs.
- Recording failed, cancelled, or timed-out jobs. Vendors bill successes.
- Reworking the micro-AI usage panel in the connections dialog.

## Design

### Ledger entry

`lib/spend/ledger.ts`:

```ts
export type SpendKind = 'image' | 'video' | 'helper';
export type SpendConfidence = 'exact' | 'estimated' | 'unknown';
export type SpendSource =
  | 'response'        // vendor returned the cost (Runware)
  | 'usage-metadata'  // priced from token counts (Gemini)
  | 'estimate-api'    // vendor estimate endpoint (fal)
  | 'balance-delta'   // credits before minus credits after (Kie)
  | 'catalog-rate'    // published rate times quantity (Atlas, Comet, Gemini fallback, helper)
  | 'free';           // Pollinations, Cloudflare

export interface SpendQuantity {
  unit: 'image' | 'second' | 'video' | 'token' | 'credit';
  value: number;
}

export interface SpendEntry {
  /** `${provider}-${jobId}` when a job id exists, so a re-poll cannot file twice. */
  id: string;
  at: number;
  provider: EngineId | 'micro-ai';
  modelId: string;
  kind: SpendKind;
  inputMode?: string;
  costUsd: number | null;
  confidence: SpendConfidence;
  source: SpendSource;
  quantity?: SpendQuantity;
  /** First 120 characters, for the ledger row. */
  promptExcerpt: string;
  /** Library record this run produced, when one exists. */
  galleryRecordId?: string;
  /** Human note, e.g. "Balance change shared with 2 other Kie jobs." */
  note?: string;
}
```

### Store

`store/useSpendStore.ts` mirrors `usePromptLibraryStore`: zustand `persist` to
localStorage under `scene-assembly-spend`, `skipHydration: true` with
`hasHydrated`, and `partialize` to `{ entries }`. Entries are newest first and
capped at 2,000; the oldest fall off. Actions:

- `record(entry)`: no-op when an entry with the same id exists.
- `remove(id)`.
- `clear()`.

### Rollups

`lib/spend/rollup.ts` is pure and React-free:

- `inRange(entries, range)` where range is `'month' | '30d' | 'all'` and a
  `now` argument, so tests are deterministic.
- `total(entries)` returns `{ costUsd, runs, exactUsd, estimatedUsd, unknownRuns }`.
- `byProvider`, `byModel`, `byKind`, `byDay` each return sorted rows of
  `{ key, label, runs, costUsd }`; `byDay` also splits per provider for the
  stacked chart.
- `toCsv(entries)`.

`lib/spend/format.ts` takes `formatUsd` from `MicroAiUsagePanel` so both share
one formatter; the panel imports it from there.

### Cost resolution

`lib/spend/resolve.ts` exports one resolver per provider. Every resolver
returns `Pick<SpendEntry, 'costUsd' | 'confidence' | 'source' | 'quantity' | 'note'>`,
never throws, and answers `{ costUsd: null, confidence: 'unknown' }` on any
failure. Published rates live in one table, `lib/spend/rates.ts`, with a
comment naming the vendor page and date each number came from.

- **Gemini.** `lib/engines/gemini.ts` returns `usage: { promptTokens, outputTokens }`
  from `usageMetadata` when present, and `app/api/generate/route.ts` passes it
  through as `usage`. The resolver prices tokens from the rate table and
  reports `usage-metadata` / exact. Without usage it prices the resolution from
  the same table (1K and 2K at 1120 tokens, 4K at 2000) plus input images at
  the per-image input figure, and reports `catalog-rate` / estimated. The
  existing cost line in `GenerationInterface` reads its numbers from the rate
  table instead of its local constant.
- **Runware.** The job's `cost` from the response. `response` / exact.
- **Atlas, Comet.** `ProviderModel` gains `rate?: { usd: number; per: 'image' | 'second' | 'video' }`
  beside `price`, filled in for every model whose `price` string already names
  a flat figure. Video multiplies by the resolved duration in seconds. A model
  without a rate records unknown. `catalog-rate` / estimated.
- **fal.** New route `POST /api/fal/estimate` with body
  `{ apiKey, endpointId, unitQuantity }`. The server calls the pricing endpoint
  for the unit (cached in a module-level map for the process lifetime; prices
  do not change within a session) and then the estimate endpoint. It returns
  `{ costUsd, unit }` or `{ costUsd: null }` with status 200 on any vendor
  error. The client derives `unitQuantity` from the variant: 1 for `image` and
  `video` units, the duration control value for `second`; if the unit is
  `second` and no duration control exists, unknown. Called only once the job
  settles as `success`. `estimate-api` / estimated.
- **Kie.** New route `POST /api/kie/credits` with body `{ apiKey }` (never in
  the URL) returning `{ credits }` or `{ credits: null }`. `KieJob` gains
  `creditsBefore?: number`. `KieGenerationWorkspace` reads the balance just
  before submit and stores it on the job; `KieJobsProvider` reads it again on
  `success`. Cost is `(before - after) * KIE_USD_PER_CREDIT`. When other Kie
  jobs reached `success` between this job's `createdAt` and now, the delta is
  divided evenly among them and `note` says so. A negative delta (a top-up in
  between) records unknown. `balance-delta` / estimated.
- **Pollinations, Cloudflare.** `costUsd: 0`, `free` / exact.
- **Helper tasks.** `useMicroAiUsageStore.record` also files a `helper` entry
  with the model id and `catalog-rate` / estimated. The panel is untouched.

### Capture points

Each is a fire-and-forget call to `recordSpend(...)` in `lib/spend/capture.ts`,
which builds the entry and calls the store. Placed exactly where the gallery
already records a finished result, so the two stay in step:

1. `components/GenerationInterface.tsx` `onSuccess` of the generate mutation.
   The mutation result gains `usage` and `cost` from the route response.
2. `components/FalJobsProvider.tsx` `settle`, in the `task.state === 'success'`
   branch beside `recordFinishedJob`.
3. `components/KieJobsProvider.tsx` in the `task.state === 'success'` branch.
4. `components/ProviderVideoWorkspace.tsx` `pollJob`, where `task.state === 'success'`
   patches the job.
5. `store/useMicroAiUsageStore.ts` `record`.

`galleryRecordId` is `${provider}-${job.id}` for job-based paths, matching
`recordFinishedJob`; the Gemini path passes the id the gallery store returns.

### Page

`app/spend/page.tsx`, a client page wrapped in `Suspense` like `Home`. On
mount it rehydrates `useAppStore` and `useSpendStore`. Header: brand wordmark
linking home and a "Back to studio" link, no workspace nav.

1. **Range control**: This month, Last 30 days, All time, as a
   `SegmentedToggleGroup`, synced to `?range=` via nuqs.
2. **Summary tiles**: total, runs, exact vs estimated share, and Kie credits
   when `kieApiKey` is set (fetched once from `/api/kie/credits`).
3. **Daily chart**: inline SVG, one bar per day in range, stacked by provider
   using the provider accent classes already used by `ENGINE_DOCS`. Title
   attributes give each bar's day and total. No chart library.
4. **Breakdowns**: by provider and by model, side by side from `md:` up. Rows
   show label, runs, cost, and a proportional bar.
5. **Ledger**: newest first. Columns: date, provider (logo and label), model,
   kind, prompt excerpt, quantity, cost with a confidence badge whose title is
   the source. A provider filter select. A remove button per row. Rows with a
   `galleryRecordId` show a small library icon; opening the library from here
   is out of scope until the overlay has a URL.
6. **Actions**: Export CSV (a blob download named `scene-assembly-spend-<range>.csv`)
   and Clear ledger behind a confirm.
7. **Storage note**: "Stored in this browser. Estimates use published rates."

Empty state: what gets recorded and a link back to the studio.

Entry points: a "Spend" link in the studio footer beside the engine docs, and a
"View spend" command in `CommandPalette`.

### Error handling

- Resolvers and `recordSpend` never throw into a generation path.
- The two new routes answer 200 with a null figure on vendor errors and 400
  only for a malformed body, following `app/api/kie/validate/route.ts`.
- A localStorage quota error while persisting is swallowed; the in-memory
  ledger stays correct for the session.

### Testing

- `tests/spend/rollup.test.ts`: ranges, totals, groupings, CSV.
- `tests/spend/resolve.test.ts`: one case per provider, including Gemini with
  and without usage, Kie single and shared delta, negative delta, fal per-second
  without a duration.
- `tests/spend/store.test.ts`: idempotent record, cap, clear.
- `tests/fal/routes.test.ts` and `tests/kie/routes.test.ts`: the new routes with
  mocked fetch.
- `tests/spend/page.test.tsx`: empty state; seeded entries render tiles,
  breakdowns, and ledger rows.
- Existing `tests/fal/jobs-provider.test.tsx`, `tests/kie/jobs-provider.test.tsx`,
  `tests/providers/workspace.test.tsx`, and `tests/generation-interface.test.tsx`
  gain an assertion that a spend entry appears on success and not on failure.

## Scope and implementation boundary

Lives in: `lib/spend/*`, `store/useSpendStore.ts`, `app/spend/page.tsx`,
`app/api/fal/estimate/route.ts`, `app/api/kie/credits/route.ts`, and the five
capture call sites named above. Touches `lib/engines/gemini.ts` and
`app/api/generate/route.ts` only to pass `usage` through, `lib/providers/catalog.ts`
and `lib/providers/types.ts` only to add `rate`, `lib/kie/types.ts` only to
add `creditsBefore`, `app/page.tsx` only for the footer link, and
`components/CommandPalette.tsx` only for the command.

Must not touch: job polling cadence, timeout, or terminal-state logic; gallery
capture, eviction, or storage; the connections dialog beyond the shared
`formatUsd` import; any provider request body.
