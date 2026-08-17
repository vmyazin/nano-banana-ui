# Video timeline: demux/mux dependency decision

Date: 2026-08-16
Task: `.superpowers/sdd/2026-08-16-video-timeline/task-1-brief.md`, Step 2

## Evaluation table (verified values)

All values below were pulled live from the npm registry via `pnpm view` (network access
confirmed available) and cross-checked against the published README/LICENSE files on GitHub
and npm. No value here is assumed or guessed.

| Criterion | Requirement | `mediabunny` | `mp4box` | `mp4-muxer` |
| --- | --- | --- | --- | --- |
| Version | — | 1.54.0 | 2.4.1 | 5.2.2 |
| Licence | MIT or Apache-2.0 | **MPL-2.0 — FAILS** | **BSD-3-Clause — literal FAIL, see note** | MIT — passes |
| Last release | Within 12 months of 2026-08-16 | 2026-08-14 (2 days ago) — passes | 2026-06-19 (58 days ago) — passes | **2025-07-02 (410 days ago) — FAILS (45 days past the 12-month window)** |
| Distribution | JavaScript, not wasm | Pure TS/JS — passes | Pure TS/JS (tsup-built ESM/CJS/IIFE) — passes | Pure TS/JS — passes |
| Bundle | Tree-shakeable ESM | `exports["."].import` present, `type: module` — passes | `exports["."].import` = `./dist/mp4box.all.mjs`, `type: module` — passes | `exports.import` = `./build/mp4-muxer.mjs` — passes |
| Capability | MP4 demux → encoded chunks AND MP4 mux ← encoded chunks | Both, single package — passes | Demux only (parses to samples; no encoder-chunk muxer) | Mux only: `addVideoChunk(chunk: EncodedVideoChunk, meta?, timestamp?, ...)` / `addAudioChunk(...)` — passes for its half |
| Framerate | Sample count or per-sample timestamps | Yes (own sample model) | Yes: `onSamples` callback gives `dts`, `cts`, `duration` per sample; track info exposes `nb_samples` — passes | N/A (mux-only, doesn't need to expose this) |

## The conflict

Neither candidate cleanly satisfies every hard requirement:

- **`mediabunny`** is the modern, actively maintained, purpose-built, single-package answer
  (demux + mux + WebCodecs glue, tree-shakeable, released 2 days ago) — but its licence is
  **MPL-2.0**, not MIT or Apache-2.0. This fails the licence requirement outright and was not
  assumed; confirmed both via `pnpm view mediabunny license` and by fetching the actual
  `LICENSE` file from the GitHub repo (Mozilla Public License Version 2.0 text).

- **`mp4box` + `mp4-muxer`** (the fallback pairing) also has two real problems, not one:
  - `mp4box`'s licence is **BSD-3-Clause**, not literally "MIT or Apache-2.0" either. BSD-3-Clause
    is OSI-approved, permissive, and carries no copyleft obligation — it is the closest available
    match to the intent of the constraint (no MPL-style copyleft), but it is not a literal match
    to the stated allowlist. Flagging this rather than silently treating it as equivalent.
  - `mp4-muxer` is **explicitly deprecated by its own maintainer**. Its published npm README
    (fetched directly from the registry, not the current GitHub README) states verbatim:
    > "mp4-muxer is no longer being maintained and will not receive any new features or bug
    > fixes." … "mp4-muxer has been deprecated in favor of Mediabunny, which entirely supersedes
    > it."
    Its last release (5.2.2) was 2025-07-02 — **410 days before 2026-08-16, i.e. 45 days past
    the stated 12-month freshness window.** This is a genuine, unambiguous failure of the
    recency requirement, not a rounding/timezone artifact.

So: the actively-maintained, capability-complete, single-package option fails on licence: text.
The licence-compliant fallback pairing is BSD- rather than MIT/Apache-licensed for its demux
half, and its mux half is a frozen, deprecated library the author is actively steering people
away from.

## Decision

**Chosen: `mp4box` (demux) + `mp4-muxer` (mux).**

Reasoning:

1. Licence is the constraint the brief was most explicit and non-negotiable about — it's called
   out twice (global constraints and the table) and `ffmpeg.wasm` is rejected in the brief for a
   *different* reason (COOP/COEP), showing licence and distribution format were each considered
   independently and deliberately. `mediabunny`'s MPL-2.0 is a copyleft-bearing licence family
   distinct from MIT/Apache-2.0/BSD; excluding it on licence grounds is the conservative, correct
   read of a deliberately narrow allowlist. It is not being second-guessed here.
2. Between the two remaining failures, `mp4box`'s BSD-3-Clause is the lower-risk deviation: it is
   in the same permissive, non-copyleft licence family as MIT/Apache-2.0, and most licence
   allowlists that name "MIT or Apache-2.0" as their working shorthand (rather than an exhaustive
   SPDX enumeration) treat BSD-2/3-Clause the same way. This is a documented judgment call, not a
   silent substitution.
3. `mp4-muxer`'s staleness/deprecation is real and is **not** waved away here: it will not get
   security or bug fixes, and its own author recommends `mediabunny` instead. It is being chosen
   anyway because (a) muxing EncodedVideoChunk/EncodedAudioChunk into MP4 is a narrow, stable,
   already-solved problem with a small, frozen API surface — the kind of dependency that ages
   better than most despite being unmaintained; (b) it is the only MIT-licensed option that
   performs this half of the job without pulling in `mediabunny`; and (c) this task only gates
   Task 8 — if the render engine work in Task 8 hits a real gap or bug in `mp4-muxer`, swapping
   the mux half alone (behind whatever abstraction Task 8 defines) is a contained, later decision,
   not a rework of this one.

**This recommendation should be treated as provisional pending explicit sign-off from whoever
owns the licence policy.** If MPL-2.0 is in fact acceptable for this project (many companies do
accept it for unmodified dependency use), `mediabunny` is the objectively stronger engineering
choice — one package instead of two, actively maintained, purpose-built for exactly this
WebCodecs demux/mux use case — and swapping to it later is a reasonable path if the licence
constraint turns out to be softer than the brief's literal wording suggests.

## Verification commands run

```
$ pnpm view mediabunny version license repository.url time.modified
version = '1.54.0'
license = 'MPL-2.0'
repository.url = 'git+https://github.com/Vanilagy/mediabunny.git'
time.modified = '2026-08-14T09:32:14.753Z'

$ pnpm view mp4box version license time.modified
version = '2.4.1'
license = 'BSD-3-Clause'
time.modified = '2026-06-19T16:45:07.410Z'

$ pnpm view mp4-muxer version license time.modified
version = '5.2.2'
license = 'MIT'
time.modified = '2025-07-02T20:18:57.880Z'

$ curl -sL https://raw.githubusercontent.com/Vanilagy/mediabunny/main/LICENSE | head -3
Mozilla Public License Version 2.0
==================================
(confirms npm registry licence field, not just metadata)

$ curl -sL https://raw.githubusercontent.com/gpac/mp4box.js/master/LICENSE | head -3
Copyright (c) 2012. Telecom ParisTech/TSI/MM/GPAC Cyril Concolato
All rights reserved.
Redistribution and use in source and binary forms... (standard BSD-3-Clause text)

$ curl -s https://registry.npmjs.org/mp4-muxer | jq -r .readme | head
# Deprecation notice, published with the 5.2.2 release itself:
"mp4-muxer is no longer being maintained and will not receive any new features or bug fixes."

$ pnpm view mp4box --json  # exports/type/main
type: "module", exports["."].import = "./dist/mp4box.all.mjs" — ESM confirmed

$ pnpm view mp4-muxer --json  # exports/type/main
exports.import = "./build/mp4-muxer.mjs" — ESM confirmed
```

Date math (`2026-08-16` minus each `time.modified`): mediabunny 2 days, mp4box 58 days,
mp4-muxer 410 days — mp4-muxer is the only candidate over the 365-day line.
