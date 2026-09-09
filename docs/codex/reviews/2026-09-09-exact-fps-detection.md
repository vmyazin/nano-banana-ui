# Exact FPS detection browser verification

## Before

Local app http://localhost:3143, Worker 8843. Synthetic media only.
Seed exact 24 fps with:

`EXPORT_FIXTURE_ORIGIN=http://localhost:3143 node scripts/seed-export-audio-fixture.mjs`

The generated file measures 24/1 r_frame_rate and avg_frame_rate, 96 frames,
4.000000 seconds with ffprobe. Local account Library -> Add to timeline selects
23.976 fps automatically, reproducing the defect.

A comparison fixture generated with the same seed, replacing `rate=24` with
`rate=24000/1001` and using distinct import id `fps-fractional-4s-v1` and prompt
`FPS verification — 23.976 tone`, also selects 23.976 fps. Only the synthetic
local timeline was reset between the two runs.

## Required after

- Exact 24 source selects 24; fractional source still selects 23.976.
- Match clips follows the same distinction after manual output changes.
- Targeted regression tests distinguish neighboring integer and fractional rates.
- Production build and final diff check pass.

## After

The same cached exact-24 clip now selects 24 after reloading the app. Changing
the output to 30 then using Match clips restores 24. The fractional fixture
continues selecting 23.976. The initial snap-only fix did not repair persisted
FPS metadata; the spec follow-up records why acquisition now rechecks affected
fractional cache values. Root implemented directly after the user's request to
continue without Claude. No paid generation or production data was used.

Final checks passed: 471 timeline tests across 42 files, targeted ESLint,
production build (including TypeScript), and `git diff --check`.
User approved commit/merge on 2026-09-09 after review at http://localhost:3143/timeline.
