# Data manifest — /account console exploration (round 2)

Companion to `account-page.html`. One row per data-bound element across the four rail variants.

**Counting basis:** the live dataset is a remote Cloudflare D1 + R2 store (`cloud/`); it is not
reachable from this machine and `cloud/.wrangler` holds no local state. Classes come from the
authoritative shapes — `lib/account/contracts.ts`, `store/useAccountStore.ts`,
`lib/account/use-library.ts` and `cloud/migrations/*.sql` — where `NOT NULL` / non-optional means
**always populated** and nullable / optional means **sometimes**. Rows marked ❌ have no column and
no API field anywhere; those counts are 0 for any account.

## Shared by all four variants

| Element | Field path | Class | Count / note |
| --- | --- | --- | --- |
| Display name | `session.account.name` | ✅ Real | `account_users.name NOT NULL` |
| Email | `session.account.email` | ✅ Real | `account_users.email NOT NULL` |
| Avatar (initials fallback drawn) | `session.account.picture` | ⚠️ Sometimes | Nullable, added in `0011_account_avatar.sql`; null for every account created before it. `AccountAvatar` already falls back to initials |
| Storage used / limit / reserved | `storage.usedBytes`, `.limitBytes`, `.reservedBytes` | ✅ Real | all `NOT NULL` on `account_storage` |
| Percent used, bytes free | derived | ✅ Real | arithmetic on the three above |
| Job state + label | `job.state` → `JOB_STATE_LABELS` | ✅ Real | `NOT NULL DEFAULT 'queued'` |
| Job prompt / provider / media type | `job.request.*` | ✅ Real | `request_json NOT NULL`; all three required on `CloudJobRequest` |
| Attention copy ("temporarily available…") | `job.errorCode` | ⚠️ Sometimes | Nullable; set only for `needs_attention` / `failed`. Exact strings already exist in `CloudJobList` |
| Asset thumbnail / video | `/api/account/assets/{id}/content` | ✅ Real | Route exists; gradient stand-ins here because no live account was sampled |
| Asset title | `asset.metadata.prompt` | ⚠️ Sometimes | Falls back to `'Untitled result'` in `CloudAssetGrid`; imported browser records can carry an empty prompt |
| Asset provider · kind · size | `metadata.provider`, `asset.kind`, `asset.bytes` | ✅ Real | all `NOT NULL` |
| "Temporary" badge | `asset.expiresAt` | ⚠️ Sometimes | Optional; only for quota-overflow rows in `account_asset_retention`. Rare by design |
| Connection label + hint | `connection.provider` → `ENGINES`, `connection.hint` | ✅ Real | both `NOT NULL`, unique per user |
| Importable browser keys / files | `useAppStore` keys, `useGalleryStore.records` | ✅ Real | Already computed by `AccountKeyImport` / `AccountAssetImport`, including "Already saved" and "Account ID required" |
| Import byte total ("96.4 MB") | derived | ✅ Real | `AccountAssetImport` already sums `selectedBytes`; this sums all eligible |
| Spend total / runs / exact % | `SpendTotals` via the `/spend` resolvers | ✅ Real | `account_spend` + `lib/spend/rollup` — **but not fetched on this route today**; /account only links out |
| Wordmark, "Back to studio", eyebrow, panel copy | static | ✅ Real | verbatim from `AccountPageShell` and the panel components |

## Variant-specific

| Element | Variant | Class | Count / note |
| --- | --- | --- | --- |
| Asset total ("24", "All 24") | A B C D | ⚠️ Sometimes | The assets endpoint is cursor-paged and returns **no total**. Either add a count to `/storage` or reword to "on this page" |
| Per-provider dot colour | A | ❌ Aspirational | `ENGINES` has no colour field. Add one or drop the dots |
| Nav counts ("Jobs 3 · 1 !", "Connections 3") | B | ✅ Real | Jobs and connections both arrive whole, not paged — these are safe |
| Nav count "Import from browser 10" | B | ✅ Real | Local stores, counted client-side |
| Filter counts (Images 18 / Video 6) | A B C | ⚠️ Sometimes | Same paging problem as the asset total; correct only for the loaded page unless a count endpoint is added. **A now carries these pills too** |
| Filter counts (Needs attention 1 / Temporary 1) | A C | ✅ Real | Jobs are unpaged, and `expiresAt` is on every loaded asset |
| Filter *behaviour* (pills actually narrowing the grid) | A C | ❌ Aspirational | No filter param exists on the assets endpoint and no client-side filter state exists. Client-side filtering only ever filters the loaded page — server-side needs a query param |
| Inspector: model | C | ✅ Real | `asset.metadata.modelId` — required on `CloudJobRequest`, **shown nowhere in the product today** |
| Inspector: input mode + reference count | C | ✅ Real | `metadata.inputMode`, `metadata.referenceIds.length` — both required, both currently unsurfaced |
| Inspector: control values ("Aspect 16:9") | C | ⚠️ Sometimes | `metadata.values` is `Record<string, string \| number \| boolean>` and always present, but its **keys vary per provider and model** — rendering needs a label lookup against the engine's control schema, or it prints raw keys |
| Inspector: saved-at ("31 minutes ago") | C | ✅ Real | `asset.createdAt NOT NULL`; the relative formatter does not exist yet |
| Inspector: retention row | C | ⚠️ Sometimes | `asset.expiresAt`, as above |
| Inspector: empty / no-selection state | C | ❌ Aspirational | No selection model exists. The idle state drawn here (account summary) is a design invention, not a data gap |
| Capacity band figures | D | ✅ Real | Same three storage fields as the rail — the duplication is a design choice, not a second source |

## Gaps to resolve before implementing

1. **Spend on /account** (A, C, D rails and B's nav) — real data, wrong route. Wire the canonical
   resolvers per `docs/codex/account-development.md`, or cut the figure and keep the link.
2. **Asset and media-type totals** (all four) — the paged endpoint returns no total; add a count or
   reword every "24" and "Images 18" on the page.
3. **Filtering** (A, C) — the pills are new behaviour, not just new chrome. Decide client-side
   (filters the loaded page only, cheap, subtly wrong) or a query param on the assets endpoint
   (correct, needs Worker work). `Needs attention` reads from jobs, not assets, so it is a different
   query from the other three.
4. **`metadata.values` rendering** (C) — needs a per-engine label lookup before it can be shown, or
   the inspector prints provider-internal keys.
5. **Selection model** (C) — nothing persists a selected asset; the inspector's idle state, keyboard
   behaviour and tablet fallback are all new work. Largest build of the four.
6. **Routing** (B) — five nav destinations need URLs, back behaviour and empty states this page has
   never had.
7. **Provider colours** (A) — add a field to `ENGINES` or drop the dots.
