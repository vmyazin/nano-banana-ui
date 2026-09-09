# An exact rate must snap to itself, not to its NTSC neighbour

Status: Approved design
Date: 2026-09-09

## Follow-up decision — 2026-09-09

Browser testing found that existing gallery records retain the old collapsed
rate. This supersedes the prohibition on touching `acquire.ts` below: inside
`probeFor`, remeasure cached 23.976/29.97/59.94 values on their first acquisition
in a session, preserving the existing value if measurement fails. Other cached
rates still skip the scan. Repeated placements retain the session cache. Update
`tests/timeline/acquire.test.ts` to cover repair, true fractional sources,
measurement failure, and reuse. This avoids guessing that every fractional
record actually came from an integer source. The cost is a packet-rate scan for
true fractional sources when reopened; no new persistence format is introduced.

## Context

A synthetic, genuinely-exact 24fps 4-second MP4 imported into the timeline is
labelled **23.976fps**, and "match clips" reproduces the same value because it
reads the clip fps `deriveOutputFormat` already derived. Every path that reports
a clip's rate runs through one pure function, `snapFramerate` in
`lib/timeline/probe.ts`, so this is the single decision to correct.

### Root cause

`snapFramerate` snaps a measured rate onto a list of recognisable rates:

```
COMMON_RATES = [8, 10, 12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 120]
nearest = COMMON_RATES.find((rate) => Math.abs(raw - rate) <= rate * 0.02)
```

`Array.find` returns the **first** entry within tolerance, and the tolerance is
2% *of the candidate rate*. For 23.976 that band is `± 0.48 fps` — twenty times
the `0.024 fps` gap to 24. So an exactly-measured `24.0` falls inside 23.976's
band, 23.976 comes first in the ascending list, and `find` returns it before it
ever tests 24. The identical overlap mislabels `30.0` (29.97's band is
`± 0.60`) and `60.0` (59.94's band is `± 1.2`).

This was a deliberate "collapse each NTSC pair into one bucket" decision — the
old rationale was that clips a container describes inconsistently as 23.976 and
24 must vote together in `deriveOutputFormat`. But mediabunny's
`underlyingFrameRate` is computed from real packet timestamps: a `24000/1001`
clip measures ≈ 23.976 and a true-24 clip measures ≈ 24.0. They sit on opposite
sides of the midpoint, so the pair never actually needed collapsing to vote
together — and collapsing them makes a real exact rate impossible to detect.

## Goals

- An exactly-measured `24` snaps to `24`; `24000/1001` (≈ 23.97602) snaps to
  `23.976`. The two are distinct buckets.
- The same holds for the other NTSC pairs: `30` → `30`, `29.97` → `29.97`;
  `60` → `60`, `59.94` → `59.94`.
- A measured rate near exactly one common rate snaps to the **nearest** one.
- Every other standard rate still snaps to itself; genuinely-between rates
  (40, 37.5, 18) and out-of-band rates keep two decimals as before; the
  tolerance stays proportional (118 → 120, 13 → 13).

## Non-goals

- No change to how the framerate is *measured* (`readFramerate`,
  `computeFrameRateMetrics`, the VFR abstain rule) or to `deriveOutputFormat`'s
  voting, its 30fps fallback, or `constrainFps`.
- No change to `COMMON_RATES`' membership. Its ascending order is retained and
  now only decides ties (see below), no longer which of two overlapping bands
  wins.
- No new UI, no render-path change.

## Fix

Snap to the common rate with the **smallest absolute distance** among those
within the proportional 2% band, instead of the first one found:

```
let nearest; let nearestDelta = Infinity;
for (const rate of COMMON_RATES) {
  const delta = Math.abs(raw - rate);
  if (delta <= rate * 0.02 && delta < nearestDelta) { nearest = rate; nearestDelta = delta; }
}
return nearest ?? Number(raw.toFixed(2));
```

The band is still the gate that decides whether to snap at all; nearest-wins is
what decides *which* rate. Iterating ascending with a strict `<` means an exact
midpoint (e.g. 23.988) deterministically favours the lower/NTSC rate — a
tie-break that only matters for a measurement no real clip produces.

### Accepted trade-off

The only behaviour lost is the theoretical case where one nominal cadence is
reported across clips as *both* 23.976 and 24; those would now land in two
buckets. In practice a timeline of same-cadence clips measures to one side of
the midpoint and still votes together, and the stated requirement — detect an
exact rate as itself — takes precedence.

## Follow-up decision (supersedes the "same bucket" rule)

This overrides the deliberate collapse documented in `lib/timeline/probe.ts`'s
`COMMON_RATES` comment and asserted by `tests/timeline/probe.test.ts`
("puts 23.976 and 24 in the same bucket", "collapses the other NTSC pairs").
Those assertions encoded the bug; they are rewritten to pin distinct detection
and nearest snapping. `snapFramerate(30.0001)` therefore now returns `30`, not
`29.97`.

## Scope and implementation boundary

- `lib/timeline/probe.ts` — `snapFramerate` body and the `COMMON_RATES` /
  ordering comments. Nothing else in the file.
- `tests/timeline/probe.test.ts` — rewrite the NTSC-collapse assertions into
  distinct-detection + nearest-snapping regression tests.

Must not modify: `deriveOutputFormat` (`lib/timeline/derive-output.ts`),
`acquire.ts`, the render engine, any component, or `COMMON_RATES`' membership.

## Acceptance

- `snapFramerate(24) === 24`, `snapFramerate(24000/1001) === 23.976`, and the
  two are `!==`.
- `snapFramerate(30) === 30`, `snapFramerate(30000/1001) === 29.97`;
  `snapFramerate(60) === 60`, `snapFramerate(60000/1001) === 59.94`.
- Every entry in `COMMON_RATES` snaps to itself.
- 40, 37.5, 18 unchanged; 118 → 120; 13 → 13; 40.123456789 → 40.12.
- `pnpm vitest run tests/timeline/probe.test.ts tests/timeline/derive-output.test.ts` passes.
