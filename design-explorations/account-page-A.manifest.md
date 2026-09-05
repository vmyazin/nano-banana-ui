# Data manifest — /account variant A ("Full spine")

Reference: `account-page-A.reference.html` · Target: `components/account/AccountDashboard.tsx`

**Counting basis:** the live dataset is a remote Cloudflare D1 + R2 store (`cloud/`), not reachable
from this machine (`cloud/.wrangler` holds no state). Classes are derived from the authoritative
shapes — `lib/account/contracts.ts`, `store/useAccountStore.ts`, `lib/account/use-library.ts`,
`lib/engines/registry.ts` and `cloud/migrations/*.sql` — where `NOT NULL` / non-optional means
always populated, nullable / optional means sometimes, and no column anywhere means 0 of any account.

## Resolved without a decision (the fallback already ships)

| Element | Field path | Class | Resolution |
| --- | --- | --- | --- |
| Display name | `session.account.name` | ✅ Real | bind |
| Email | `session.account.email` | ✅ Real | bind |
| Avatar | `session.account.picture` | ⚠️ Nullable pre-`0011` | **Derive** — `AccountAvatar` already renders initials when null. Reference draws the derived state ("VM"), so parity holds either way |
| Asset title | `asset.metadata.prompt` | ⚠️ Can be empty | **Derive** — `CloudAssetGrid` already falls back to `'Untitled result'` |
| "Temporary" meta | `asset.expiresAt` | ⚠️ Rare | **Show when present** — a state, not a missing field. `TemporaryAssetNotice` already owns this vocabulary |
| Storage used / limit / reserved | `storage.*Bytes` | ✅ Real | bind; all `NOT NULL` |
| Percent used, bytes free | derived | ✅ Real | arithmetic |
| Connection label + hint | `connection.provider` → `ENGINES`, `.hint` | ✅ Real | bind; both `NOT NULL` |
| Connections count ("3") | `session.connections.length` | ✅ Real | bind |
| Import summary ("3 provider keys and 7 files") | `useAppStore` keys, `useGalleryStore.records` | ✅ Real | bind; both panels already compute this |
| Asset thumbnail / video | `/api/account/assets/{id}/content` | ✅ Real | bind; route exists |
| Provider · kind · size meta | `metadata.provider`, `asset.kind`, `asset.bytes` | ✅ Real | bind |
| "Add provider key" button | — | ✅ Real | opens the existing dialog via `onOpenConnections(<engine id>)`; `ApiKeyConfig.focusProvider` handles focus |
| Pager (Latest / Older assets) | `cursor` / `nextCursor` | ✅ Real | already implemented in `useAccountLibrary` |
| All static copy | — | ✅ Real | verbatim from `AccountPageShell` and the panels |

## Gaps — decisions (Step 3, resolved with the user 2026-09-05)

| # | Element | Field path | Class | Count / note | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Pill counts "All 24 / Images 18 / Video 6" | assets endpoint | ⚠️ Sometimes | Cursor-paged, returns **no total**. Correct only for the loaded page | **Source it** — add a media-type/state query param **and** a counts field to the assets endpoint in the Worker. Correct at any library size |
| 2 | Pill filtering behaviour | — | ❌ Aspirational | No filter param on the endpoint, no client filter state. `Needs attention` reads from **jobs** (unpaged, always correct); the other three read from **assets** (paged) | **Source it** — server-side filtering, same endpoint change as #1. `Needs attention` keeps reading from jobs |
| 3 | Spend "$14.82 · 61 runs · 78% exact" | `SpendTotals` via `lib/spend/rollup` | ✅ Real data, wrong route | `account_spend` exists and is populated; /account does not fetch it today, it only links to /spend | **Source it** — fetch the canonical spend totals on /account per `docs/codex/account-development.md` |
| 4 | Per-provider dot colour | — | ❌ Aspirational | `ENGINES` has no colour field — 0 of 8 engines. DESIGN.md does reserve accents for "provider identity" | **Derive it** — `ProviderMark`: real SVG when the registry has one (**0 of 8 today — none exist in this repo**), else a monogram tile with the hue hashed from the provider id. Same 20px slot both ways, so real logos drop in without a layout change |
| 5 | Running-job visibility | `storage.activeJobs`, jobs list | ✅ Real, unbound | The in-flight strip was cut in review. Nothing in A now names a *running* job; the rail's "48 MB reserved for active jobs" is the only trace. `storage.activeJobs` is `NOT NULL` and already fetched | **Source it** — a "Generating N" pill from `storage.activeJobs`, beside the other pills |

## Step 5 — parity diff (2026-09-05)

Implementation screenshotted against `account-page-A.reference.html` on the real local stack
(Next :3097 + wrangler Worker, `DEV_FAKE_GENERATION=1`), on two records:

- **Loaded** — 8 assets, 2 connections, real `ProviderLogo` marks, live counts.
- **Sparse** — a freshly created account: 0 assets, 0 connections, nothing importable on the device.

| Round | Delta found | Resolution |
| --- | --- | --- |
| 1 | Grid rendered **2-up**; reference is 4-up | `CloudAssetGrid` gained `columns`; console passes 4, the library overlay keeps 2 |
| 1 | Eyebrow "YOUR CREATIVE SPACE" printed **twice** (shell + canvas) | removed from the canvas — `AccountPageShell` already prints it |
| 1 | Delete block was a heavy bordered box; reference is a quiet link | `AccountDeletion variant="rail"` |
| 1 | "Run local background test" was a full-width bar, the loudest control | reduced to a small secondary control (dev-only anyway) |
| 2 | Card actions stacked over **3 rows**, cards far taller than reference | dense mode at 4-up: tighter padding, 13px title, 10px meta, one worded action plus icon buttons |
| 2 | Trash wrapped to its own row at desktop | tightened gaps and icon padding; all four actions now sit on one row |
| 3 | **Sparse record looked barebones** — three zero-count pills and one grey sentence in a wide empty canvas | pills hide when there is nothing to filter; a composed empty state (mark, heading, explanation) replaces the bare line |

### Deliberate deviations from the reference

1. **Four card actions, not two.** The mock drew "Use as ref" plus a download glyph. The real card also
   restores prompt settings and deletes; both kept, as icon buttons with accessible names, rather than
   dropping working features to match a drawing.
2. **Work area runs wider than the mock and than every other page** (`max-w-[110rem]`), at the user's
   request, so the rail does not eat a card's worth of grid width.
3. **Label shortened to "Use as ref"** at the user's request. The accessible name stays
   "Use as reference", and still contains the visible words so voice control matches.
   The reference file was updated to match, so future diffs stay clean.
4. **Empty state is designed here, not in the mock** — the exploration never drew a library with
   nothing in it.
5. **"Run local background test"** appears only under a local sign-in; it is absent in production
   and was never in the mock.

### Verification

- `tsc --noEmit` clean · `eslint` 0 errors (1 pre-existing warning in `ResultStack.tsx`)
- App suite **1581 passed** (140 files) · Worker suite **138 passed** (19 files)
- Both records screenshotted and reviewed; the sparse record now reads as composed, not broken.
