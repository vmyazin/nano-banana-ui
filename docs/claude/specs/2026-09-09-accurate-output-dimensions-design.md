# A ratio on a size control is a claim, and some of them are not true

Status: Approved design
Date: 2026-09-09

## SA-06 — "9:16" is offered as a shape and delivered as something else

Pick 9:16 in the image controls with Runware selected and Z-Image Turbo returns
**768 × 1344**. Pick `480p · 9:16` on Seedance 2.0 Mini and the clip comes back
**496 × 864**. Both are *near* 9:16 and neither is 9:16: 0.5714 and 0.5741
against a true 0.5625, 1.6% and 2.1% off. Someone cutting an exact 9:16 film
gets frames that will letterbox or crop, and nothing in the app said so.

### Evidence, before the fix

Nothing in the app prints an output dimension anywhere. Three places touch the
question and all three round it away:

- `components/GenerationInterface.tsx:1112-1128` — the image **Aspect Ratio**
  select lists `9:16 (Story/Reels)` and nothing else. The pixels are decided
  much later and per engine, by tables the reader never sees: Runware's
  `9:16` is 768 × 1344, Atlas's is 768 × 1344, Comet's is 864 × 1536,
  Pollinations' is 720 × 1280. Two of those four are exactly 9:16 and two are
  not, under one label.
- `components/ProviderVideoWorkspace.tsx:125-134` — the **Output size** select
  renders `size.label` alone, so `480p · 9:16` is shown while the catalog
  entry beside it already holds `width: 496, height: 864`. The number was
  present and simply not displayed.
- `lib/models/listbox-specs.ts:67` — `snapRatio` deliberately snaps a pixel
  pair to the nearest canonical ratio **within 3%**, so the Model listbox's
  Shapes column draws a 9:16 glyph for 496 × 864. That is right for a
  glanceable comparison column and wrong as the only answer available.

Atlas's own table is the sharpest case: on Seedream it maps `3:2` to
1776 × 1328, which is 4:3, and `21:9` to 2048 × 1152, which is 16:9
(`lib/providers/atlas.ts:47-56`). The comment says so; the UI does not.

### Root cause

Two facts are kept apart. The **nominal ratio** is what the label says, and it
is what the reader picks. The **actual dimensions** are what the vendor
returns, and they live in a table the browser never reads — either in the
catalog's `width`/`height` (video) or inside a server adapter (image). No
control brings the two together, so a label that rounds cannot be told from a
label that is exact.

## Fix

One dependency-free module, `lib/providers/output-size.ts`, becomes the single
place that knows what pixels a chosen size produces:

- The per-engine image ratio→pixel tables **move here** from `runware.ts`,
  `atlas.ts`, `comet.ts` and `engines/pollinations.ts`, which then import them.
  A second copy typed into a component is a number that drifts from the request
  it describes — the rule `lib/spend/rates.ts` already pays for.
- `withDimensions(label, dimensions)` renders one shared string for every size
  control: the label, then the pixels. Exactness is an integer cross-product
  (`w * ratioH === h * ratioW`), not a tolerance, so nothing is judged
  "close enough" twice with two different thresholds.
- A size whose pixels *round* its labelled ratio gets `≈` immediately before
  that ratio — `480p · ≈9:16 · 496 × 864` — and the control's description
  carries the legend once, only when at least one offered size needs it.
- A size whose pixels are a **different shape** does not get `≈`, because "≈"
  claims closeness and Seedream's answer to `21:9` is a 24%-away, exact 16:9.
  Past 5% drift the control names what arrives instead — `21:9 (Ultra Wide) ·
  delivers 16:9 · 2048 × 1152` — in words that need no legend. Where that shape
  has no readable reduction (1776 × 1328 is 111:83) it is described by the
  nearest ratio the app already names, and *that* description carries the `≈`:
  `3:2 (Classic Photo) · delivers ≈4:3 · 1776 × 1328`.

Both controls read the same functions, so `≈9:16 · 768 × 1344` means the same
thing on the image page and the video page.

## Non-goals

- **No cropping, resizing or re-encoding.** The app reports what the vendor
  produces; it does not correct it.
- **No change to any provider payload.** The same width, height, preset and
  ratio go out as before; the tables move file, not value.
- **No change to prices, rates, or `lib/spend/*`.**
- **No change to `lib/draft/aspect-match.ts`.** The 2026-09-07 tier-preserving
  rule (SA-04) and its `SAME_SHAPE` tolerance stay exactly as they are; this
  work only labels, it never re-selects.
- **No new sizes, and no removing an approximate one.** A 496 × 864 option is
  still the vendor's cheapest 480p portrait and still worth offering.
- **No marking for engines whose pixels we do not know.** Gemini, fal, Kie,
  PiAPI and Cloudflare decide dimensions themselves; their controls are left
  exactly as they are rather than shown a guess.
- `snapRatio` and the Model listbox Shapes column are unchanged — a comparison
  glyph is not the place for this, and the spec above says why.

## Scope and implementation boundary

Creates `lib/providers/output-size.ts`.

Modifies, mechanically and without changing a value:
`lib/providers/runware.ts`, `lib/providers/atlas.ts`, `lib/providers/comet.ts`,
`lib/engines/pollinations.ts` (each loses its private table and imports the
shared one, by **relative** path — the Worker bundles these files from
`cloud/src/provider-adapters/` and does not resolve the `@/` alias).

Modifies, display only:
`components/ProviderVideoWorkspace.tsx` (`controlFieldsFor` decorates the size
options and its description) and `components/GenerationInterface.tsx` (the
image aspect options and a legend under the select).

Must not modify: `lib/draft/aspect-match.ts`, `lib/spend/rates.ts`,
`lib/spend/capture.ts`, `lib/spend/resolve.ts`, `lib/models/listbox-specs.ts`,
any `sizes`/`price`/`rate` value in `lib/providers/catalog.ts`, and the
`value` a size control stores (it stays `size.label`, because the rate table,
`resolveSize`, and the carry-over rule all key off it).

## Acceptance

- Seedance 2.0 Mini's size list reads `480p · ≈9:16 · 496 × 864` and
  `720p · 9:16 · 720 × 1280`, and its description carries the `≈` legend.
- LTX-2.5 Fast, whose table is exact throughout, gains pixels and no `≈`, and
  its description carries no legend.
- A bare preset that publishes no pixels (`480p`, `1080p (upscaled)`,
  `Portrait 9:16`) is left exactly as it was.
- With Runware selected, the image control reads `≈9:16 (Story/Reels) · 768 ×
  1344`; with Pollinations it reads `9:16 (Story/Reels) · 720 × 1280`.
- With Atlas + Seedream v5.0 Pro selected, `21:9` reads `21:9 (Ultra Wide) ·
  delivers 16:9 · 2048 × 1152` and nowhere reads `≈21:9`.
- With Gemini or fal selected the image control is byte-for-byte what it was.
- The shared table returns the same numbers the adapters put on the wire.
