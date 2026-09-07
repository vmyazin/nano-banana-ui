# Plan — size choices survive, fal rates become visible

Spec: `docs/claude/specs/2026-09-07-size-and-rates-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `lib/draft/aspect-match.ts` | `closestAspectCandidate` takes the current value; `sizeTier`; `SAME_SHAPE` |
| `components/ProviderVideoWorkspace.tsx` | Passes `values.size` to `useAutoAspect` |
| `lib/spend/rates.ts` | `falRateLabel` (additive) |
| `components/FalGenerationWorkspace.tsx` | Rate beside each model, per input-mode variant |
| `components/GenerationInterface.tsx` | Real fal image figure via `falPublishedCost` |
| `tests/draft/aspect-match.test.tsx` | The 480p case and its guards |
| `tests/spend/rate-label.test.ts` | Formatter, incl. the unlisted endpoint |
| `tests/generation-interface.test.tsx` | Superseded price test, rewritten to derive |

## Do not modify

- `FAL_RATES` figures, `lib/spend/capture.ts`, `lib/spend/resolve.ts`
- The aggregator catalogues' own `price` strings

## Tasks

- [x] **1. SA-04 rule** in the pure function, with tests covering: 480p kept for
      a 16:9 reference; a wrong shape still corrected; the tier held while the
      shape changes; ratio-only matching when nothing is chosen; a stale label
      from another model ignored.
- [x] **2. Wire** the current size through `useAutoAspect`.
- [x] **3. SA-05 formatter** and the two display sites.
- [x] **4. Full check.** `npx vitest run` (1714), `npx tsc --noEmit`, `npx eslint`, `npx next build`.
- [x] **5. Smoke test** on port 3121: 480p held on attach; 9 of 9 fal models
      priced; image line reads $0.080 and follows the resolution to $0.160 at 4K.
