# A chosen size is a budget decision, and a rate belongs next to the model

Status: Approved design
Date: 2026-09-07

## SA-04 — output size reset to 720p whenever a reference was attached

Set 480p, attach or replace a reference, and the control was back on
`720p · 16:9` with no indication: $0.081/s instead of $0.036/s, a 2.25× jump on
a setting the reader had already made, 4 of 4 attempts.

### Root cause

`useAutoAspect` snaps a size-shaped control to the reference's aspect ratio.
That is right for shape and wrong for everything else, because these labels
carry a resolution too, and resolution is where the money is.

It is not even a tie. This model publishes `480p · 16:9` as **864×496**, which
is 1.742, while `720p · 16:9` is exactly 1.778. A 16:9 reference therefore
matches the *more expensive* row more closely, and the vendor's own rounding
silently overrode an explicit choice.

### Fix

`closestAspectCandidate` takes what the control already holds and treats it as a
decision rather than a starting point:

- If the current value is already the right shape — within `SAME_SHAPE`, 0.05 in
  log space — it is kept. Nothing needs correcting.
- If the shape genuinely must change, the same resolution tier is preferred when
  it can carry the new shape, so a portrait reference moves `480p · 16:9` to
  `480p · 9:16` rather than to `720p · 9:16`.

0.05 is chosen against the data: the vendor's rounding puts `480p · 16:9` 0.02
from true 16:9, while the nearest genuinely different shape in these tables, 3:2,
is 0.17 away.

## SA-05 — fal engines showed no pricing

Runware puts per-second rates in the model dropdown. fal listed Veo 3.1 Standard
and Kling 3 Pro by name alone, so there was no way to stay inside a budget
without leaving the app. The image side said "fal usage rates apply" where the
real figure is $0.080 per image.

### Root cause

The figures were never missing. `FAL_RATES` carries them, dated and sourced, and
the spend ledger prices every finished run from it. Only the aggregator
catalogues carried a `price` string for display, so the fal pickers had nothing
to show — while the app wrote the number down moments later.

### Fix

`falRateLabel(endpointId)` renders a rate short enough to sit beside a name, and
the fal video picker reads it for the variant it would actually submit to, since
a model publishes one endpoint per input mode. Ranges rather than a single
number where the rate genuinely moves with resolution, audio or duration — a
single figure there would be a guess presented as a fact.

The image line uses `falPublishedCost`, which is exact: the resolution and the
web-search toggle are both known at that point. It reads "Est. ≈ $0.080 / image"
and tracks the resolution control ($0.160 at 4K).

## Non-goals

- No change to the rate figures themselves, or to how spend is captured.
- No pricing for endpoints the table does not list; those still show a name
  alone rather than a guess.
- SA-04's rule is not applied to the ratio-only controls beyond what falls out
  of it: those labels carry no resolution, so there is no budget to protect.

## Scope and implementation boundary

`lib/draft/aspect-match.ts`, `lib/spend/rates.ts` (additive),
`components/ProviderVideoWorkspace.tsx` (passes the current size),
`components/FalGenerationWorkspace.tsx` and `components/GenerationInterface.tsx`
(display only).

Must not modify: `FAL_RATES` values, `lib/spend/capture.ts`, `lib/spend/resolve.ts`.

## Acceptance

- 480p survives attaching a 16:9 reference; a portrait reference moves the shape
  without moving the tier.
- With nothing chosen yet, matching still picks purely on ratio.
- Every listed fal model shows a rate; unlisted ones show none.
- The fal image line shows the published figure and follows the resolution.

## Note on a superseded test

`generation-interface.test.tsx` asserted "fal usage rates apply" under the name
"without a hard-coded price". The principle it protected — do not invent a
figure — still holds; the app simply no longer has to invent one. The test now
derives its expectation from `falPublishedCost`, so it still fails if a literal
is ever typed into the component.
