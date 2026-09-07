# Plan — the interface does the arithmetic (merged with Atlas pricing)

Spec: `docs/claude/specs/2026-09-07-run-cost-on-button-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `lib/providers/types.ts` | `sizeTier`, `sizeRateKey` beside the existing `ProviderRate` union — the union itself untouched |
| `lib/providers/catalog.ts` | `usdByResolution` for the four per-second Runware models; Atlas untouched |
| `lib/spend/resolve.ts` | Lookup via `sizeRateKey`; search only when a size was given |
| `components/ProviderVideoWorkspace.tsx` | Estimate on the button through `controls: { size }` |
| `components/FalRunCost.tsx` | New: the fal badge, across a props boundary |
| `lib/fal/run-cost.ts` | New: endpoint lookup + pricing from primitives |
| `lib/fal/pricing.ts` | `falSecondsFrom` split out of `falDurationSeconds` |
| `components/FalGenerationWorkspace.tsx` | Renders the badge |
| `tests/spend/catalog-rates.test.ts` | Drift guard and Runware cases folded in beside the Atlas ones |
| `tests/spend/run-cost.test.tsx` | New: duration parsing, pricing, the badge |
| `tests/video-workspace.test.tsx`, `tests/fal/workspace.test.tsx`, `tests/account/execution.test.tsx` | Button-name queries become prefix matches |

## Deliberately not ported from `feat/cost-on-button`

- `usdByTier`, `rateUsd`, the runtime exactly-one-of test — superseded by the union.
- `tests/spend/catalog-rate-drift.test.ts` — folded into `catalog-rates.test.ts` instead.

## Do not modify

- The Atlas rate table, or `ebebd55`'s `toEqual` assertion over it
- `lib/fal/pricing.ts`'s dependency-free contract (add, never import into it)
- PixVerse's block price, or any metered model

## Tasks

- [x] **1. Adopt the Atlas design.** Worktree from `ebebd55`; port only what the
      collision does not touch; drop the parallel helpers.
- [x] **2. Unify the lookup** with `sizeRateKey` so one resolver serves both
      families.
- [x] **3. Runware tiers as `usdByResolution`**, with the drift guard folded in
      beside the Atlas tests.
- [x] **4. The guard fires** on the undefined-size match; fix it in the lookup.
- [x] **5. Full check.** tsc, eslint, vitest (1772), next build — all exit 0.
- [x] **6. Smoke test** on port 3125: $0.14 / $0.32 / $0.81 through the merged
      resolver, and Atlas unchanged.
