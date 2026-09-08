# Plan — Aspect default and the run-location switch

Spec: `docs/claude/specs/2026-09-07-defaults-and-run-location-design.md`
Date: 2026-09-07

## File map

| Path | Change |
| --- | --- |
| `components/GenerationInterface.tsx` | `DEFAULT_ASPECT_RATIO = '1:1'`, replacing five literals |
| `components/account/CloudExecutionNotice.tsx` | Consequence line under the status line |
| `tests/account/execution-notice.test.tsx` | Both directions, and the signed-out no-op |
| `tests/generation-interface.test.tsx` | Starts square; a remembered shape still wins |
| `tests/draft/provider-switch.test.tsx` | The incompatible-carry-over default |

## Do not modify

- Video defaults — 16:9 is right there and lives in the provider modules
- The option list and its labels
- `useAutoAspect`, and the draft's memory of a chosen shape
- The status line's existing wording, and the cost line above it

## Tasks

- [x] **1. Find every default.** Five `?? '16:9'` sites in the image workspace;
      the fal branch's `'auto'` is a different thing and stays.
- [x] **2. One constant** at `1:1`, used by all five.
- [x] **3. Consequence line**, named for the destination, both directions.
- [x] **4. Tests** — five new; each fails against `HEAD`. Two existing
      expectations encoded the old default and were updated.
- [x] **5. Full check.** vitest 1831, tsc, eslint, next build — all exit 0.
- [x] **6. Smoke test** on port 3135, signed in with the local test account so
      the notice renders: text-to-image opens on `1:1 (Square - Instagram
      Post)`; both switch directions show their own consequence line; the video
      workspace keeps its catalogue aspect and gains the same line.
