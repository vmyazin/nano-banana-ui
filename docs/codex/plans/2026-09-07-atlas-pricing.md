# Atlas pricing correction plan

Acceptance source: [approved spec](../specs/2026-09-07-atlas-pricing.md).

## File map

- `lib/providers/types.ts:46-87`: structured price type.
- `lib/providers/catalog.ts:174-346`: Atlas tier prices and labels.
- `lib/spend/resolve.ts:66-112`: resolution and reference pricing.
- `lib/spend/capture.ts:99-110,228-240`: browser capture settings.
- `lib/spend/account.ts:131-148`: durable capture settings and unknown notes.
- `tests/spend/catalog-rates.test.ts:1-95`: rate regression cases.
- `tests/spend/capture.test.ts:35-240`: browser capture regressions.
- `tests/spend/account.test.ts:13-110`: account capture regressions.

Do not modify: generation adapters, UI controls/layout, stored historical ledgers,
deployment configuration, unrelated untracked `temp/` and `test-assets/` files.

## Tasks

- [x] Verify Atlas's resolution prices and input-reference surcharge against
  published vendor pages; record sources and ambiguities in the spec.
- [x] Update provider rate type/catalog and canonical resolver; pass saved
  controls from browser and account capture. Verify with app and Worker typechecks.
- [x] Add published billing examples, missing-size/duration cases, reference
  surcharge cases and both capture-path regressions. Verify with Vitest.
- [x] Verify changed TypeScript files with ESLint and review `git diff --check`.

## Validation

`pnpm test -- tests/spend tests/providers` ran the full app suite in this runner:
156 files / 1,739 tests passed. `pnpm exec tsc --noEmit` and
`pnpm --dir cloud typecheck` passed. The current checkout/workflow exception is
explicitly requested by the user; no worktree, commit, or push is part of this task.
