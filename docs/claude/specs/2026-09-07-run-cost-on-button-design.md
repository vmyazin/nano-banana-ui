# The interface does the arithmetic

Status: Approved design
Date: 2026-09-07

## Context

SA-05, follow-up: the interface gives a rate — `$0.036 / s @ 480p · $0.081 / s
@ 720p` — but not a result. To know what a press costs you multiply the rate by
the duration yourself, and keep straight which tier you selected. Over a session
of five clips that is five multiplications in your head, and the report asks for
the total on the button: *Generate video · ~$0.32*.

Everything needed is already on screen. The rate is in the picker, the duration
and the size are controls, and the ledger prices the finished run from the same
figures moments later.

## Root cause

`ProviderRate` carried one flat `usd`, and the catalogue's own comment said
tiered or metered models "leave it out and their runs record as unknown". Every
model in the report's example is tiered, so the arithmetic the interface needed
did not exist as data — only as the display string, which is deliberately copy
rather than numbers.

## A collision, and how it was resolved

Two branches fixed this at once. `ebebd55` (Atlas pricing) gave `ProviderRate` a
`usdByResolution` table behind a discriminated union, keyed by each size's API
**preset**, and taught `resolveCatalogRate` to take `controls: { size,
inputImages }`. The button branch had, independently, added `usdByTier` keyed by
the leading tier of a size's **label**, with a fourth positional argument.

The Atlas design is kept wholesale — the union enforces exactly-one-of at compile
time where the other only tested it at runtime, and it was already threaded
through capture, account and their tests. The button branch's parallel helpers
(`usdByTier`, `sizeTier`-as-key, `rateUsd`) are dropped, not merged.

What the two lookups did not share was coverage. Atlas sizes carry presets;
Runware's carry width and height and a label, so the preset lookup returned
unknown for all four Runware models. `sizeRateKey` reconciles that in one place:
preset when the vendor names one, else the tier the label leads with. One rate
table, one resolver, both families.

## Design

**Tiers are data.** Four per-second Runware models gain `usdByResolution`,
transcribed from their published strings: `wan@3.0`, `ltx@2.5-fast`,
`seedance@2.0-mini`, `wan@2.6-flash`. PixVerse is left alone: it publishes
`$0.094 / 5s`, a block price, and dividing that into a per-second figure would
be arithmetic the vendor never published.

**One resolver prices both the button and the ledger.** The button calls the
same `resolveCatalogRate` the spend ledger uses, so the two cannot disagree. A
tiered rate with no size, or a size the vendor never priced, comes back unknown
and the figure is absent — LTX sells 2K and 4K while quoting only 720p and
1080p, and a nearby tier standing in would be a number the reader has no reason
to doubt.

**A drift guard.** `price` is copy and `rate` is arithmetic, and they are the
same money written twice. Atlas generates its string from its table, so those
cannot drift; the Runware tiers are hand-transcribed, so a test asserts every
dollar figure in `price` appears in `rate` (including `extraInputImageUsd`), and
that every table key is one the model's own sizes can produce.

### What the guard caught

Porting the Runware tiers exposed a latent bug in the shared lookup. With no
size chosen, `size.preset === controls.size` is `undefined === undefined` —
true for every size without a preset — so the resolver matched Seedance's first
size and priced its cheapest tier. That is the exact fallback the rate type's own
comment forbids. It was invisible while every rated size had a preset, and it is
now guarded by "only search when a size was given" and by a test that asks for
Seedance with no size and expects unknown.

## The React compiler constraint

The fal workspace derives its control values from the selected variant, so
handing any of those values to an imported helper during its render makes the
compiler treat the variant as possibly mutated — it then declines to preserve
that component's existing memoization and skips optimizing the file. Every
in-place shape failed the same way. So the fal lookup crosses into a child,
`FalRunCost`, on props; `lib/fal/run-cost.ts` is a new module rather than an
addition to `lib/fal/pricing.ts`, which is deliberately dependency-free. The
Runware workspace has no such memoization at stake and prices inline.

`falSecondsFrom` is split out of `falDurationSeconds` so one raw value reads
`5`, `'10'` and `'8s'` by the same rule — `Number('8s')` is `NaN`, which is how
an estimate quietly went missing during this work.

## Non-goals

- No new rate figures beyond transcribing four published strings, guarded.
- No pricing where the vendor published none. The badge is absent, not zero.
- No change to how spend is captured after a run, or to the Atlas rate table.

## Acceptance

- Seedance at 480p × 4s reads `~$0.14`; at 720p × 4s, `~$0.32`; at 720p × 10s,
  `~$0.81`. The figure follows both the size and the duration control.
- Every Atlas figure in `ebebd55`'s test is unchanged.
- A model or size the vendor never priced shows no figure — and so does a
  tiered model with no size chosen.
- The fal workspace still compiles under the React compiler.

## Note on superseded tests

Twenty-two queries asked for a button named exactly `Generate video`. The
accessible name now carries the estimate, which is the point — a reader using a
screen reader hears the price before committing — so those became prefix
matches rather than losing the figure from the name.
