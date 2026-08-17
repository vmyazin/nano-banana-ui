# Video timeline: demux/mux dependency decision

Date: 2026-08-16
Task: `.superpowers/sdd/2026-08-16-video-timeline/task-1-brief.md`, Step 2
Status: **superseded once (fix round below); final choice is `mediabunny`.**

## Evaluation table (verified values, unchanged from the first pass — kept as evidence)

All values below were pulled live from the npm registry via `pnpm view` (network access
confirmed available) and cross-checked against the published README/LICENSE files on GitHub
and npm, and against the actual `.d.ts` files shipped in `node_modules` after install. No value
here is assumed or guessed.

| Criterion | Requirement | `mediabunny` | `mp4box` | `mp4-muxer` |
| --- | --- | --- | --- | --- |
| Version | — | 1.54.0 | 2.4.1 | 5.2.2 |
| Licence | MIT or Apache-2.0 (see ruling below) | MPL-2.0 | BSD-3-Clause | MIT |
| Last release | Within 12 months of 2026-08-16 | 2026-08-14 (2 days ago) — passes | 2026-06-19 (58 days ago) — passes | **2025-07-02 (410 days ago) — FAILS, 45 days past the 12-month window** |
| Distribution | JavaScript, not wasm | Pure TS/JS — passes | Pure TS/JS (tsup-built) — passes | Pure TS/JS — passes |
| Bundle | Tree-shakeable ESM | `type: module`, `exports["."].import` — passes | `type: module`, `exports["."].import` — passes | `exports.import` — passes |
| Capability | MP4 demux → encoded chunks AND MP4 mux ← encoded chunks | Both, single package — passes (details below) | Demux only | Mux only |
| Framerate | Sample count or per-sample timestamps | Yes — purpose-built API, see below | Yes: `onSamples` → `dts`/`cts`/`duration`; `nb_samples` on track info | N/A (mux-only) |

## Ruling: the MIT/Apache-2.0 criterion is overridden — record this explicitly

The first pass of this task (see git history on this branch, commit `d4d4519`) picked
`mp4box` + `mp4-muxer` specifically *because* `mediabunny`'s MPL-2.0 licence failed the
"MIT or Apache-2.0" row in the table above, treating that row as a hard requirement.

**That row was overridden by the controller after independently verifying the same facts.**
Recorded here so a future reader does not mistake this for an oversight:

1. The "MIT or Apache-2.0" line in the original task brief's table was the *plan author's own
   default*, not a requirement handed down from the project owner or the design spec. The actual
   concern it was meant to encode is avoiding copyleft that would force this project to change its
   own licensing posture.
2. MPL-2.0 is **file-level** copyleft: consuming and bundling it obliges publishing modifications
   to *mediabunny's own files* if they are changed and redistributed. It does not reach
   application source code that merely imports it as a dependency. It does not, in other words,
   put this repo's own code under any new licence obligation.
3. This repo has no `LICENSE` file and `package.json` declares `"private": true` — there is no
   declared licensing posture for MPL-2.0 to conflict with in the first place.
4. The alternative (`mp4box` + `mp4-muxer`) fails a criterion that matters more in practice than
   the licence string: `mp4-muxer`'s own maintainer publishes, in the package's npm README itself,
   "mp4-muxer is no longer being maintained and will not receive any new features or bug fixes"
   and "has been deprecated in favor of Mediabunny, which entirely supersedes it." `pnpm add
   mp4-muxer` prints this as a `WARN deprecated` line at install time — independent corroboration.
   `docs/superpowers/specs/2026-07-12-dependency-longevity-design.md` exists specifically to
   prevent building new feature work on top of a dependency whose own author is actively steering
   users away from it. Choosing the deprecated predecessor of the very package recommended as its
   replacement is the worst available outcome on that axis.
5. `mediabunny` is one dependency instead of two, capability-complete for both demux and mux (see
   below), and is the most recently published of all three candidates (2 days old vs. 58 and 410).

**Ruling: use `mediabunny`.** The licence row is treated as satisfied by inspection of the actual
obligation (no propagation to this repo's code, no declared licensing posture to conflict with),
not by literal SPDX-string match.

## Capability confirmation for `mediabunny` (what Task 8 needs)

Confirmed against the actual shipped type definitions in
`node_modules/.pnpm/mediabunny@1.54.0/node_modules/mediabunny/dist/modules/src/*.d.ts` after
`pnpm add mediabunny` — not just documentation prose.

1. **MP4 demux to encoded chunks.** `EncodedPacketSink` (constructed from an `InputTrack`)
   exposes `.packets()` for async iteration over raw `EncodedPacket`s without decoding. Each
   `EncodedPacket` (`packet.d.ts`) has `.timestamp`, `.duration`, and `.toEncodedVideoChunk()` /
   `.toEncodedAudioChunk()` methods that convert directly to WebCodecs `EncodedVideoChunk` /
   `EncodedAudioChunk`. Confirmed via `mediabunny.dev/guide/reading-media-files` and by reading
   `packet.d.ts` directly.

2. **MP4 mux from encoded chunks.** `media-source.d.ts` declares `EncodedVideoPacketSource extends
   VideoSource` and `EncodedAudioPacketSource extends AudioSource`, described in the source as
   "the most basic video source; can be used to directly pipe encoded packets into the output
   file." Its `add(packet: EncodedPacket, meta?: EncodedVideoChunkMetadata): Promise<void>` method
   takes packets in decode order with presentation timestamps — i.e., accepts pre-encoded
   WebCodecs chunks directly, no re-encoding required. `output-format.d.ts` declares
   `Mp4OutputFormat extends IsobmffOutputFormat`, confirming MP4 is a first-class output target for
   these sources via `Output`.

3. **Sample counts / per-sample timestamps for framerate derivation.** This is better covered than
   the bare requirement: `input-track.d.ts` declares `InputVideoTrack.computeFrameRateMetrics
   (options?: FrameRateMetricsOptions): Promise<FrameRateMetrics>`, purpose-built for exactly this.
   `FrameRateMetrics` returns `underlyingFrameRate` (heuristically fitted true frame rate, `null`
   for VFR video), `bestGuessFrameRate`, and `minFrameRate`. There is also a general
   `computePacketStats(targetPacketCount?, options?): Promise<PacketStats>` returning
   `{ packetCount, averagePacketRate, averageBitrate }`, plus raw per-packet `.timestamp` /
   `.duration` on every `EncodedPacket` from `EncodedPacketSink`. Any one of these alone would
   satisfy the requirement; mediabunny ships all three.

All three requirements are met. No BLOCKED condition applies.

## Cost if this ruling turns out to be wrong

If MPL-2.0 later proves unacceptable (e.g. the project gains a declared licensing posture that
conflicts with it, or a stricter policy is adopted), the swap-back cost is contained: it means
rewriting the files that call it to use `mp4box` + `mp4-muxer` instead.

**Correction (recorded at final review).** When this ruling was written, that was *one* file —
`lib/timeline/render/webcodecs.ts`, which did not yet exist. It is now **two**:

| File | What it uses mediabunny for |
| --- | --- |
| `lib/timeline/render/webcodecs.ts` | Demux to encoded packets, mux from encoded packets (`EncodedPacketSink`, `EncodedVideoPacketSource`, `Mp4OutputFormat`, `Output`) |
| `lib/timeline/probe.ts` | Framerate (`computeFrameRateMetrics`) and the add-time decoder config the decode probe asks `VideoDecoder.isConfigSupported` about (`getDecoderConfig`) |

The decision stands — nothing about the second call site changes the licensing reasoning, and
`probe.ts`'s use is the smaller of the two. The record is corrected because the stated cost was
no longer true, not because the conclusion moved.

## Known divergences between the two render engines

Both recorded rather than fixed: neither is reachable with fal or Kie output, and both are the
kind of thing that gets rediscovered as a mystery bug by eye rather than by a test.

- **Rotation** (Ruling 12). The browser engine paints the decoded frame unrotated; ffmpeg
  autorotates by default. If a clip carrying rotation metadata ever arrives, the two engines
  produce differently-oriented output, and the **browser** is the side that must change — it
  should read `InputVideoTrack.rotation` and feed the rotated display size to `fitRect`. Do **not**
  add `-noautorotate` to the ffmpeg graph: upright is the correct output and ffmpeg already
  produces it.
- **Non-square pixels.** `fitRect` is fed `frame.displayWidth`/`displayHeight`, which are
  SAR-corrected, while ffmpeg's `scale` works in coded dimensions (the graph then forces
  `setsar=1`). A clip with a sample aspect ratio other than 1:1 would therefore be framed
  differently by the two engines. Unreachable with fal/Kie output, which is square-pixel
  throughout; recorded so it is not rediscovered as a bug.
- **Sub-pixel offset** (Ruling 14, accepted). `fitRect` uses `Math.round`; ffmpeg's pad/crop
  expression evaluator truncates, so the two differ by 1px whenever `(output - scaled)` is odd.

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

$ curl -s https://registry.npmjs.org/mp4-muxer | jq -r .readme | head -8
# ⚠️ This library is deprecated ⚠️
mp4-muxer has been deprecated in favor of Mediabunny...
mp4-muxer is no longer being maintained and will not receive any new features or bug fixes.

# Fix round: switch to mediabunny
$ pnpm remove mp4box mp4-muxer
dependencies:
- mp4-muxer 5.2.2
- mp4box 2.4.1
Done in 1.3s using pnpm v10.32.1

$ pnpm add mediabunny
dependencies:
+ mediabunny 1.54.0
Done in 1.3s using pnpm v10.32.1
(no deprecation warning printed)

$ grep -n "computePacketStats\|PacketStats\|computeFrameRateMetrics\|FrameRateMetrics" \
    node_modules/.pnpm/mediabunny@1.54.0/node_modules/mediabunny/dist/modules/src/input-track.d.ts
21:export type PacketStats = {
23:    packetCount: number;
25:    averagePacketRate: number;
287:    computePacketStats(targetPacketCount?: number, options?: PacketRetrievalOptions): Promise<PacketStats>;
34:export type FrameRateMetrics = {
447:    computeFrameRateMetrics(options?: FrameRateMetricsOptions): Promise<FrameRateMetrics>;

$ grep -n "class EncodedVideoPacketSource\|class EncodedAudioPacketSource\|add(packet: EncodedPacket" \
    node_modules/.pnpm/mediabunny@1.54.0/node_modules/mediabunny/dist/modules/src/media-source.d.ts
39:export declare class EncodedVideoPacketSource extends VideoSource {
48:    add(packet: EncodedPacket, meta?: EncodedVideoChunkMetadata): Promise<void>;
179:export declare class EncodedAudioPacketSource extends AudioSource {

$ pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 281ms using pnpm v10.32.1
(no deprecation warning)

$ pnpm build
✓ Compiled successfully in 1689ms
  Running TypeScript ...
  Finished TypeScript in 2.7s ...
✓ Generating static pages using 13 workers (14/14) in 125ms
  Finalizing page optimization ...
(build succeeded; route table printed; same one pre-existing unrelated
 next.config.ts path.join warning as before, not caused by this change)
```

Date math (unchanged from the first pass, `2026-08-16` minus each `time.modified`): mediabunny 2
days, mp4box 58 days, mp4-muxer 410 days.
