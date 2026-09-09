# Plan — accurate output dimensions on every size control

Spec: `docs/claude/specs/2026-09-09-accurate-output-dimensions-design.md`

## File map

| path | lines | what happens |
| --- | --- | --- |
| `lib/providers/output-size.ts` | new | the shared module: image ratio tables + label formatting |
| `lib/providers/runware.ts` | 23-42 | drop `DIMENSIONS`, import `RUNWARE_IMAGE_DIMENSIONS` |
| `lib/providers/atlas.ts` | 23-64 | drop `SIZES`/`SEEDREAM_SIZES`, import + format `w*h` |
| `lib/providers/comet.ts` | 22-39, 73, 104 | drop `SIZES`/`VIDEO_SIZES`, import + format `wxh` |
| `lib/engines/pollinations.ts` | 5-23 | drop `DIMS`, import `POLLINATIONS_IMAGE_DIMENSIONS` |
| `components/ProviderVideoWorkspace.tsx` | 125-134 | size options get pixels; description gets the legend |
| `components/GenerationInterface.tsx` | 103-124, 1112-1128 | aspect options get pixels; legend under the select |
| `tests/providers/output-size.test.ts` | new | the module, and the table-matches-the-wire check |
| `tests/providers/workspace.test.tsx` | 82-83 | option text now carries pixels (behaviour change) |
| `tests/generation-interface.test.tsx` | append | image control per engine |

**Do not modify:** `lib/draft/aspect-match.ts`, `lib/models/listbox-specs.ts`,
`lib/spend/rates.ts`, `lib/spend/capture.ts`, `lib/spend/resolve.ts`, any
`sizes`/`price`/`rate` value in `lib/providers/catalog.ts`, `cloud/**`,
`temp/`, `test-assets/`.

## Tasks

Status legend: **written** = the code is in the worktree; **verified** = a
command was run and passed. This session could not run `pnpm`/`vitest` (the
permission was denied, not bypassed), so nothing below is marked verified —
root's validation pass is what decides that.

- [x] **1. The shared module.** *(written)* Created `lib/providers/output-size.ts`
  with `parseDimensions`, `sizeDimensions`, `formatDimensions`, `isExactRatio`,
  `ratioDrift`, `shapeName`, `deliveredShape`, `withDimensions`,
  `isApproximateLabel`, `hasApproximateSize`, `APPROXIMATE_LEGEND`, the four
  engine tables, and `imageDimensions(engine, modelId, ratio)`. Imports only
  the `ProviderSize` type, by relative path.
  Verifies: `pnpm vitest run tests/providers/output-size.test.ts`

- [x] **2. Move the tables.** *(written)* `runware.ts`, `atlas.ts`, `comet.ts`,
  `engines/pollinations.ts` each delete their private table and import the
  shared one relatively. Values unchanged; the vendor's own string format
  (`*` for Atlas, `x` for Comet) is applied at the call site.
  Verifies: `pnpm vitest run tests/providers`

- [x] **3. Video size control.** *(written)* `controlFieldsFor` maps each size
  through `withDimensions` for its option label, keeps `value: size.label`, and
  appends `APPROXIMATE_LEGEND` to the description only when
  `hasApproximateSize(model.sizes)`.
  Verifies: `pnpm vitest run tests/providers/workspace.test.tsx`

- [x] **4. Image aspect control.** *(written)* `GenerationInterface` derives its
  option labels through `withDimensions(option.label, imageDimensions(...))` for
  the active engine and model, and renders the legend under the select when any
  option is approximate. Engines with no known table are untouched.
  Verifies: `pnpm vitest run tests/generation-interface.test.tsx`

- [x] **5. Tests.** *(written, not run)* New `tests/providers/output-size.test.ts`;
  updated the option-text assertion and added the Seedance marking case in
  `tests/providers/workspace.test.tsx`; appended the per-engine image cases to
  `tests/generation-interface.test.tsx`.
  Verifies: `pnpm vitest run`

- [x] **6. Review finding — the legend claimed something untrue.** *(written)*
  `APPROXIMATE_LEGEND` said every mismatch was "close to" the labelled ratio.
  Seedream answers `21:9` with 2048 × 1152, which is 24% away and an exact
  16:9, so `≈21:9` was the same false claim in a smaller font. A mismatch is
  now split at 5% drift (`SHAPE_CHANGE_DRIFT`): under it the pixels are a
  rounding and keep `≈`; over it the control names what actually arrives —
  `21:9 (Ultra Wide) · delivers 16:9 · 2048 × 1152`, and
  `3:2 (Classic Photo) · delivers ≈4:3 · 1776 × 1328` where the delivered shape
  has no readable reduction (111:83) and is itself only approximate. The legend
  now reads “≈” marks a ratio the pixels come close to without being exactly
  it, which is true of every place the mark survives; `delivers …` needs no key,
  so the legend appears only where a `≈` does.
  Verifies: `pnpm vitest run tests/providers/output-size.test.ts`

- [x] **7. Launch config.** An entry named `Accurate output dimensions smoke test`
  running `ACCOUNT_WORKER_PORT=8839 DEV_FAKE_GENERATION=1 npm run dev -- --port 3139`
  was added to `.claude/launch.json` by root after Claude reported its edit
  was denied as a sensitive file. See independent verification below.

- [x] **8. Handoff.** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, and a
  localhost smoke on the video workspace and the image controls. Root completed
  these checks; results and browser coverage limits are recorded below.

## What root's smoke test should look at

- `http://localhost:3139/` → text-to-image, engine **Runware**: the Aspect Ratio
  select reads `≈9:16 (Story/Reels) · 768 × 1344` with the legend beneath it.
- Same control, engine **Pollinations · FLUX**: `9:16 (Story/Reels) · 720 × 1280`
  and no legend (its `21:9` is the only marked one).
- Engine **Atlas Cloud**, model Seedream v5.0 Pro: `21:9 (Ultra Wide) · delivers
  16:9 · 2048 × 1152`.
- Engine **Google Gemini** or **fal.ai**: the control is exactly what it was.
- Video workspace, Runware → Seedance 2.0 Mini: `480p · ≈9:16 · 496 × 864` with
  the legend in the field description; LTX-2.5 Fast gains pixels and no legend.

## Independent root verification — 2026-09-09

- Targeted provider, workspace, image and aspect tests: 247 passed across 20 files.
- Full web suite: 1,953 passed across 171 files.
- Production build passed, including TypeScript; one unrelated existing file-tracing warning through the timeline auth route.
- Cloud TypeScript passed. Lint passed with two existing warnings (ResultStack img and generation-interface test _blob).
- Browser smoke on localhost:3139: Runware portrait shows approximate 768 × 1344; switching to Pollinations preserves portrait and shows exact 720 × 1280; Atlas Seedream shows 21:9 delivers 16:9 and 3:2 delivers approximately 4:3. Video control labels and unchanged values are covered by workspace regression tests; guest video UI remains credential-gated.
- Root added the named launch entry for web3139/Worker8839 after Claude reported its edit permission denied. No paid generation performed.
- User approved commit and merge after localhost review on 2026-09-09.
