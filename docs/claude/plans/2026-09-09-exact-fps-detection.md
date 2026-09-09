# Plan: exact FPS detection (nearest snapping)

Spec: `docs/claude/specs/2026-09-09-exact-fps-detection-design.md`

## Follow-up decision — 2026-09-09

The spec follow-up expands scope to `lib/timeline/acquire.ts:163-200` and
`tests/timeline/acquire.test.ts:165-190` for correcting old cached rates.
This overrides the original do-not-modify entry for acquire.ts only.
Root also owns `.claude/launch.json` and the verification record at
`docs/codex/reviews/2026-09-09-exact-fps-detection.md`.

## File map

- `lib/timeline/probe.ts:65-71` — rewrite `snapFramerate` to nearest-within-band;
  update the `COMMON_RATES` doc comment (lines 50-64) so "first match wins /
  same bucket" becomes "nearest within band; order only tie-breaks".
- `tests/timeline/probe.test.ts` — replace the NTSC-collapse cases with
  distinct-detection and nearest-snapping regressions.

Do not modify: `lib/timeline/derive-output.ts`, `lib/timeline/acquire.ts`,
`lib/timeline/render/webcodecs.ts`, any component, `COMMON_RATES` membership,
`readFramerate`.

## Tasks

- [x] Rewrite the regression tests first so they fail against current code:
      exact 24 → 24, 24000/1001 → 23.976 (and `!==`), each NTSC pair distinct,
      every COMMON_RATE snaps to itself, nearest wins (30.0001 → 30), and the
      existing preserve-cases (40/37.5/18, 118→120, 13, two-decimal) still hold.
      Verify: `pnpm vitest run tests/timeline/probe.test.ts` (red).
- [x] Change `snapFramerate` to pick the minimum-delta candidate within the 2%
      band; update the module comments to match.
      Verify: `pnpm vitest run tests/timeline/probe.test.ts` (green).
- [x] Guard the neighbours: `pnpm vitest run tests/timeline/derive-output.test.ts`
      and the timeline import/acquire suites.
      Verify: `pnpm vitest run tests/timeline/`.
- [x] Typecheck: `pnpm tsc --noEmit` (or repo's typecheck script).

## Verification

- Original snapping regressions failed (7 failures), then passed with nearest selection.
- Cached-rate regressions failed (4 failures), then passed with remeasurement.
- Full timeline suite passed: 471 tests across 42 files.
- Browser: cached exact 24 -> 24; manual 30 -> Match clips -> 24;
  genuine 24000/1001 -> 23.976, including Match clips.
- Production build/final checks and user merge approval recorded in the root review.
