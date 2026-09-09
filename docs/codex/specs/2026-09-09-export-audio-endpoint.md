# Browser export: audio ends where the picture ends

Status: Approved design

## Goals and scope

Make the browser MP4 audio presentation end with the emitted video. The change
lives in `lib/timeline/render/webcodecs.ts` and its new pure helper
`lib/timeline/render/audio-endpoint.ts`.

Non-goals: changing the server renderer, compensating for encoder priming,
changing provider generation, modifying timeline placement or trim controls,
or introducing a second encode or custom MP4 parser.

Companion to `docs/codex/reviews/2026-09-09-export-audio-endpoint.md`, which
holds the measured reproduction. That document is the evidence; this one is the
change.

## The defect

A twelve-second, 24 fps export measures 288 video frames presenting through
12.000000 s inside a container of 12.074667 s, because the AAC track runs to
12.074667 s and the container takes the longest track. AAC is encoded in packets
of 1024 samples — 21.333 ms at 48 kHz — so the packet grid does not land on the
video endpoint, and `AudioBufferSource` writes whatever the encoder emits.

## The change

`AudioBufferSource` encodes *and* muxes in one step: its packets are in the file
before the endpoint is known, so there is nothing to cut. It is replaced by an
`EncodedAudioPacketSource` fed from an `AudioEncoder` this module drives itself,
mirroring the existing H.264 encoder and mux chain. That opens a mux boundary,
and the boundary applies one rule (`lib/timeline/render/audio-endpoint.ts`):

- a packet starting at or after the endpoint is dropped;
- a packet straddling it is cloned with `duration = endpoint - timestamp`;
- a microsecond of tolerance either side, because packet timestamps arrive on an
  integer-microsecond grid.

The endpoint is `emittedTotal / fps` — the video that was *actually* emitted, not
the frame count predicted in phase 1 — read after `videoEncoder.flush()`.

**Not truncating early.** While clips are still encoding, `emittedTotal / fps` is
a lower bound on the endpoint, never the endpoint. So mid-export only *settled*
packets are muxed — those ending at or before the frames already emitted, which
can never need trimming however much longer the export turns out to be. The rest
is held until after the video flush. The queue drains between clips, bounding
it to roughly a clip's encoded audio plus encoder delay rather than a whole track.

## Trade-off, accepted

Audio presenting beyond the last video frame is cut, including source audio
shifted past that boundary by the untouched priming delay. In the measured
fixture the last ~44 ms of source audio is no longer presented. Taken over a file whose
duration disagrees with the twelve seconds the timeline, the UI label, and the
server engine all report — a disagreement visible in every player's scrubber and
in anything that concatenates or trusts container duration.

## Boundaries — deliberately unchanged

- **Priming.** The 2112-sample AAC priming delay is still not compensated; the
  comment block stating why still stands, and nothing is shifted at the front.
- **Timestamps.** Audio is timestamped from a running sample cursor across all
  clips, so no clip boundary moves and no packet is nudged onto a grid.
- **Mixdown.** `clipAudioBuffer` still does the decode, trim, resample and
  downmix through `OfflineAudioContext`, including the silence a mute clip
  contributes to keep later clips aligned.
- **Keep audio off**, and a timeline with no audio at all, still add no audio
  track and construct no `AudioEncoder`.
- **The server engine** (`ffmpeg-args.ts`) is untouched.
- Cancellation, codec error propagation, encoder backpressure and teardown all
  follow the paths that were already there; the audio encoder joins the other two
  codecs in `closeCodecs`.

## Verification

- `pnpm vitest run tests/timeline/audio-endpoint.test.ts` — the endpoint rule
  against the measured 566-packet track, the exact-boundary case, drops past the
  end, no zero-length packet, unshifted timestamps, and the settled-packet guard.
- Manual, in a browser: repeat the reproduction and re-measure. Expect 288 frames
  at 24/1, video 12.000000 s, and an audio stream and container that no longer
  run past it.
