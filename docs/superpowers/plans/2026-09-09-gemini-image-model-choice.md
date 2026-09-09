# Plan: Gemini image model choice

Spec: `docs/superpowers/specs/2026-09-09-gemini-image-model-choice-design.md`

## File map

| Path | Target | Change |
| --- | --- | --- |
| `lib/engines/gemini-catalog.ts` | new | The three models, their sizes, grounding, ref caps |
| `lib/spend/rates.ts` | 8-35 | `GEMINI_IMAGE_RATES` keyed by model id; `geminiRateLabel` |
| `lib/spend/resolve.ts` | 26-56 | `resolveGemini` takes a model id |
| `lib/spend/capture.ts` | 74-93 | Pass the chosen id through |
| `lib/spend/account.ts` | 73-90 | Price a cloud job from `request.modelId` |
| `lib/account/job-label.ts` | 17-23 | Catalog lookup before the fixed label |
| `lib/download-name.ts` | 26-44 | Catalog lookup before the engine `fileCode` |
| `lib/models/listbox-specs.ts` | 220-232 | `geminiImageSpecs` rows |
| `lib/engines/gemini.ts` | 16-60 | `model` option, defaulting to Pro |
| `app/api/generate/route.ts` | 137-170 | Forward `model` to `geminiGenerate` |
| `store/useAppStore.ts` | 90-200 | `geminiImageModel` + setter, persisted |
| `components/GenerationInterface.tsx` | 100-160, 300-360, 700-760, 1020-1200 | Model rack, sizes, cost line, request bodies |
| `cloud/src/provider-adapters/synchronous.ts` | 12-24 | Accept any catalogued Gemini model |
| `README.md` | 29, 209 | Name all three models |
| `AGENTS.md` | routing | A line pointing at the catalog |

Do not modify: `lib/fal/*`, `lib/kie/*`, `lib/providers/catalog.ts`,
`lib/providers/output-size.ts`, `components/*Video*`, `components/Timeline*`,
`cloud/src/provider-adapters/queued.ts`, `cloud/src/provider-adapters/aggregators.ts`.

## Tasks

- [ ] **1. Catalog.** Create `lib/engines/gemini-catalog.ts` with the three
      models. Verify: `npx tsc --noEmit`.
- [ ] **2. Rates.** Key `GEMINI_IMAGE_RATES` by model id, take the id in
      `geminiTokenCost`/`geminiResolutionCost`, add `geminiRateLabel`. Update
      `tests/spend/rates.test.ts` with the three published price points.
      Verify: `npx vitest run tests/spend/rates.test.ts`.
- [ ] **3. Resolvers and ledger.** Thread the id through `resolveGemini`,
      `captureImageResult`, `buildAccountSpendEntry`. Verify:
      `npx vitest run tests/spend`.
- [ ] **4. Names.** Catalog lookups in `modelFileCode` and `jobModelLabel`.
      Verify: `npx vitest run tests/download-name.test.ts tests/account`.
- [ ] **5. Engine and route.** `model` option on `geminiGenerate`, forwarded by
      `/api/generate`. Verify: `npx vitest run tests/spend/gemini-usage.test.ts`.
- [ ] **6. Cloud validation.** Accept every catalogued id, gate `imageSize` and
      `useGoogleSearch` per model. Verify: `npx vitest run --dir cloud`.
- [ ] **7. Store and UI.** Persisted `geminiImageModel`, the Model rack for
      Gemini, per-model resolutions, per-model cost line, both request bodies.
      Verify: `npx vitest run tests/generation-interface.test.tsx`.
- [ ] **8. Docs.** README table and model list; an AGENTS.md routing line.
- [ ] **9. Full verification.** `npx tsc --noEmit`, `npx vitest run`,
      `npx eslint .`, `pnpm run build`, then a smoke test on the worktree ports.
