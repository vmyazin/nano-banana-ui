# Browser export endpoint reproduction

Status: Verified; user approved commit and merge on 2026-09-09

## Scope

The requested twelve-second, 24 fps export must present for twelve seconds with
audio enabled. Do not remove a hard-coded amount of encoder priming: the existing
browser-specific lag policy is outside this fix. No paid provider runs are needed.

## Reproduction

1. Start the isolated worktree with web port 3141 and Worker port 8841.
2. Run `node scripts/seed-export-audio-fixture.mjs`. It generates four seconds of
   synthetic 320 × 240 color bars at 24 fps plus a 48 kHz, 440 Hz tone, and imports
   it into the local test account. The script rejects non-local destinations.
3. At `/sign-up`, use the local test account. At `/account`, add the tone clip to
   the timeline. Add two further placements from the clip rail.
4. Set output fps to **24** explicitly; leave Keep audio on. Export.
5. Save the export to the browser library. On `/account`, Review items and import
   only that export into the local account. Fetch its content through the local
   account API to measure it. This avoids the in-app browser download limitation;
   no production media or account is involved.

## Before measurements

The app shows `Exported`, `12s`, and `with audio`.

`ffprobe -show_entries format=duration:stream=codec_name,duration,start_time,r_frame_rate,nb_frames`
reports:

| Stream | Start | Duration | Frames |
| --- | --- | --- | --- |
| H.264, 24/1 fps | 0 | 12.000000 s | 288 |
| AAC, 48 kHz | 0 | 12.074667 s | 566 |
| MP4 container | | 12.074667 s | |

`ffmpeg -i <export> -map 0:a -af silencedetect=n=-60dB:d=0.02 -f null -`
detects initial silence ending at 0.0440208 s, then final silence from 12.044 s
through 12.074667 s. This matches encoder priming and trailing padding, rather
than three independently padded four-second buffers.

## Required after evidence

- Repeat the same actual UI export and inspect its MP4 and stream durations.
- Video stays 288 frames at 24/1 fps, with a twelve-second presentation endpoint.
- Audio remains decodable and no exported presentation runs beyond that endpoint.
- Test non-packet-aligned durations, audio-disabled export, and the existing
  audio priming policy. Do not infer success solely from the UI's rounded label.

## After measurements (2026-09-09)

Fresh-page native browser exports, measured through the same local import path:

| Export | Video | AAC | Container |
| --- | --- | --- | --- |
| Two four-second placements | 8.000000 s, 192 frames | 8.000000 s | 8.000000 s |
| Three four-second placements | 12.000000 s, 288 frames | 12.000000 s | 12.000000 s |
| Keep audio off | 12.000000 s, 288 frames | No audio track | 12.000000 s |

All video streams are 24/1 fps. The twelve-second AAC stream decodes with
`ffmpeg -v error -i <export> -map 0:a -f null -` without errors. Eight and twelve
seconds exercise different AAC packet remainders. Cancel during a 1920 × 1080
export restores the export button without an error; test dimensions were restored
to 320 × 240 afterward.

The existing approximately 44 ms browser encoder lag remains: capping presentation
also cuts source audio shifted past the picture endpoint. This change does not
claim to repair lip synchronization. A fresh document is required when testing
changed exporter code; an already-open page initially retained the old exporter.

Fable 5.1 independently reviewed endpoint arithmetic, encoder lifecycle, packet
metadata, backpressure, and cancellation. It found no confirmed runtime defect in
the measured path, and identified a compatibility gap if an encoder omits chunk
duration. Opus 4.8 supplied the AAC-LC duration fallback and regression coverage. Root ran all 21 endpoint tests successfully after the follow-up. Misleading comments about
queue size and source-audio truncation were corrected.

Production build, final TypeScript check, and `git diff --check` passed. The broader timeline suite passed 448 tests before the bounded duration fallback; lint passed with two existing warnings. No provider generation or production media was used.
