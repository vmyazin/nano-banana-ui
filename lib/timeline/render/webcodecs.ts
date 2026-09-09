import {
  packetSettledBy,
  trimPacketToEndpoint,
} from '@/lib/timeline/render/audio-endpoint';
import {
  fitRect,
  type RenderEngine,
  type RenderProgress,
  type RenderRequest,
} from '@/lib/timeline/render/port';

// Types only — `import type` is erased at compile time, so this does not pull
// mediabunny into the bundle. The runtime import is the dynamic one inside
// `renderInBrowser`, which keeps the demuxer/muxer in its own chunk.
import type { Input, InputVideoTrack } from 'mediabunny';

/**
 * The browser render engine: demux → decode → composite → encode → mux, entirely
 * on this machine, producing one continuous MP4 from an ordered list of clips.
 *
 * Audio follows `output.keepAudio`, and the server engine's filter graph
 * (`lib/timeline/render/ffmpeg-args.ts`) must keep answering it the same way:
 * two engines that disagree about sound produce two different files from the
 * same timeline, and that divergence is discovered by ear rather than by a test.
 */

/** High Profile, Level 4.2. Widely hardware-encoded and widely playable. */
const H264_CODEC = 'avc1.640028';
/** AAC-LC, the only audio codec MP4 is universally played back with. */
const AAC_CODEC = 'mp4a.40.2';

/**
 * Everything is resampled onto this before encoding — clips on one timeline
 * routinely disagree about rate and channel count, and an encoder configured
 * once cannot be fed two of either. Matches `AUDIO_SAMPLE_RATE`/`AUDIO_CHANNELS`
 * in ffmpeg-args.ts, so both engines mix down to the same thing.
 */
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = 192_000;

/**
 * AAC-LC packs a fixed 1024 sample frames into every packet — 21.333 ms at
 * 48 kHz. This is the grid `audio-endpoint.ts` is written against.
 */
const AAC_FRAMES_PER_PACKET = 1024;

/**
 * The presented duration, in seconds, to stamp on one AAC-LC packet coming out
 * of the encoder.
 *
 * `EncodedAudioChunk.duration` is nullable in the WebCodecs spec — Chrome fills
 * it, but nothing requires a browser to — and mediabunny's
 * `EncodedPacket.fromEncodedChunk` turns an absent one into a zero-duration
 * packet (`(chunk.duration ?? 0) / 1e6`). The endpoint rule reads
 * `timestamp + duration`, so a zero there makes the last packet look like it
 * presents nothing: `packetSettledBy` settles it early and `trimPacketToEndpoint`
 * never shortens the tail the container's duration hangs on — which is exactly
 * the 12.074667 s-around-12 s bug this whole path exists to prevent. Because
 * AAC-LC's packet is always 1024 frames, the grid supplies the number the
 * encoder omitted. A reported duration is preserved as-is.
 *
 * Scoped to this file's explicitly configured AAC-LC encoder: the fallback is
 * only correct because the packet size is fixed and known.
 */
export function aacPacketDurationSeconds(reportedDurationMicros: number | null): number {
  if (reportedDurationMicros != null) return reportedDurationMicros / 1_000_000;
  return AAC_FRAMES_PER_PACKET / AUDIO_SAMPLE_RATE;
}

/**
 * How many sample frames go into the encoder at once: ten AAC packets' worth,
 * ~213 ms. Small enough that `encodeQueueSize` backpressure means something and
 * a copy of the planar block is not a large allocation, large enough that a
 * long clip is not thousands of `AudioData` objects.
 */
const AUDIO_CHUNK_FRAMES = 10_240;

/**
 * Known and measured: this path lands the sound 2112 samples — 44 ms — behind
 * the picture, which is the AAC encoder's standard priming delay played as
 * real audio because neither WebCodecs nor the muxer writes the edit list that
 * would skip it. (`ffmpeg` does, so the server engine measures at 0.)
 *
 * Deliberately not compensated by trimming 2112 samples off the front: the
 * priming count is the encoder's, not ours, and an encoder that primes with
 * fewer would end up with the audio *ahead* of the picture. 44 ms of audio lag
 * sits well under the ~125 ms at which a lag becomes detectable, while a lead
 * is detectable from ~45 ms — so of the two ways to be wrong, this is the one
 * nobody hears.
 *
 * The *end* of the track is a separate question with a separate answer, in
 * `audio-endpoint.ts`: nothing here shifts audio, but the packet that runs past
 * the last video frame is cut back to it.
 */

const NO_WEBCODECS =
  'This browser cannot encode video on its own. Try Chrome or Edge, or export on the server.';
const NO_H264 =
  'This browser cannot encode H.264 video at this size. Try a smaller export size, or export on the server.';
const NO_AAC =
  'This browser cannot encode audio on its own. Turn off "Keep audio", or export on the server.';

/** How many frames may sit in each codec's queue before we stop feeding it. */
const DECODE_QUEUE_LIMIT = 8;
const ENCODE_QUEUE_LIMIT = 8;

/** A keyframe at least this often, so the finished file is seekable. */
const KEYFRAME_INTERVAL_SECONDS = 2;

/** Longest wait between queue-depth re-checks, so a stalled codec cannot hang. */
const QUEUE_POLL_MS = 20;

/** ~0.1 bits per pixel per second: 6.2 Mbps at 1080p30. Clamped either side. */
const BITS_PER_PIXEL = 0.1;
const MIN_BITRATE = 1_000_000;
const MAX_BITRATE = 40_000_000;

export function targetBitrate(width: number, height: number, fps: number): number {
  const raw = Math.round(width * height * fps * BITS_PER_PIXEL);
  if (!Number.isFinite(raw)) return MIN_BITRATE;
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, raw));
}

/**
 * How many output frames sit strictly before `timeSeconds`, on a grid where
 * output frame N is at N / fps.
 *
 * This is the whole of the frame-selection rule, and it is deliberately a
 * function of time rather than of source frame indices: the source may run at
 * any rate, or at no fixed rate at all, and never has to match the output. When
 * a decoded frame arrives at source time T, every output slot before T is
 * already settled — the frame we were holding is the nearest one at-or-before
 * each of them.
 */
export function outputFramesBefore(timeSeconds: number, fps: number): number {
  if (!(timeSeconds > 0) || !(fps > 0)) return 0;
  // Slot i qualifies when i / fps < t, i.e. i < t * fps. A hair of tolerance
  // stops a timestamp that should land exactly on a boundary — 2.0s at 30fps —
  // from claiming an extra slot because of float drift.
  return Math.ceil(timeSeconds * fps - 1e-6);
}

/** How many output frames a clip of this length contributes. At least one. */
export function clipFrameCount(durationSeconds: number, fps: number): number {
  if (!(durationSeconds > 0) || !(fps > 0)) return 1;
  return Math.max(1, Math.round(durationSeconds * fps));
}

/** One block of sample frames on its way to the audio encoder. */
export interface AudioChunkPlan {
  /** Offset of this block inside the clip's own buffer, in sample frames. */
  offset: number;
  /** How many sample frames this block carries. */
  frames: number;
  /** Presentation timestamp for the block, in microseconds. */
  timestampMicros: number;
}

/**
 * Cut one clip's rendered buffer into encoder-sized blocks, timestamped from a
 * cursor that runs across the whole timeline.
 *
 * The cursor is what keeps the audio unshifted: block timestamps are the
 * running sample count, so clip two's sound starts exactly where clip one's
 * stopped and nothing is nudged to make a boundary land on a packet. The
 * blocks tile the buffer exactly — no gap, no overlap — because a dropped
 * remainder would pull every clip after it out of sync with its picture.
 */
export function planAudioChunks(
  cursorFrames: number,
  bufferFrames: number,
  sampleRate: number,
  chunkFrames: number = AUDIO_CHUNK_FRAMES
): AudioChunkPlan[] {
  if (!(bufferFrames > 0) || !(sampleRate > 0) || !(chunkFrames > 0)) return [];

  const plans: AudioChunkPlan[] = [];
  for (let offset = 0; offset < bufferFrames; offset += chunkFrames) {
    plans.push({
      offset,
      frames: Math.min(chunkFrames, bufferFrames - offset),
      timestampMicros: Math.round(((cursorFrames + offset) * 1_000_000) / sampleRate),
    });
  }
  return plans;
}

function abortError(): DOMException {
  return new DOMException('The export was cancelled.', 'AbortError');
}

export function createWebCodecsEngine(): RenderEngine {
  return {
    id: 'webcodecs',

    async unavailableReason(request: RenderRequest): Promise<string | null> {
      if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
        return NO_WEBCODECS;
      }

      // isConfigSupported is authoritative. Sniffing the user agent guesses at
      // something the browser will answer directly.
      const support = await VideoEncoder.isConfigSupported({
        codec: H264_CODEC,
        width: request.output.width,
        height: request.output.height,
        framerate: request.output.fps,
      }).catch(() => null);

      if (!support?.supported) return NO_H264;

      // Asked only when it can actually block the render: a browser with no
      // AudioEncoder can still export this timeline perfectly well with the
      // checkbox off, and withdrawing the engine outright would send it to the
      // server for a file it is fully capable of producing.
      if (request.output.keepAudio) {
        if (typeof AudioEncoder === 'undefined') return NO_AAC;
        const audio = await AudioEncoder.isConfigSupported({
          codec: AAC_CODEC,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: AUDIO_CHANNELS,
          bitrate: AUDIO_BITRATE,
        }).catch(() => null);
        if (!audio?.supported) return NO_AAC;
      }

      return null;
    },

    render(request, opts) {
      return renderInBrowser(request, opts);
    },
  };
}

interface PreparedClip {
  input: Input;
  track: InputVideoTrack;
  decoderConfig: VideoDecoderConfig;
  /** The track's own first timestamp, which is not always zero. */
  startTimestamp: number;
  frameCount: number;
  fit: 'contain' | 'cover';
  /** The bytes again, for the audio pass — see `clipAudioBuffer`. */
  media: Blob;
  /** In-point in *file* seconds, which is what `decodeAudioData` counts in. */
  audioOffset: number;
  hasAudio: boolean;
}

/**
 * One clip's audio, decoded, trimmed, resampled and mixed to the output's
 * format, as exactly `durationSeconds` of samples.
 *
 * `OfflineAudioContext` rather than a second WebCodecs pipeline, because it
 * does the three things that pipeline would have to hand-roll and get subtly
 * wrong: `decodeAudioData` resamples to the context's rate, the destination's
 * channel count up/downmixes, and the rendered length is fixed — so a clip
 * whose sound runs short (or has none at all) comes back padded with silence
 * rather than pulling everything after it out of sync.
 */
async function clipAudioBuffer(
  media: Blob,
  options: { offsetSeconds: number; durationSeconds: number; hasAudio: boolean }
): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.round(options.durationSeconds * AUDIO_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(AUDIO_CHANNELS, frames, AUDIO_SAMPLE_RATE);

  // A container the audio decoder cannot read is not a failed export: the clip
  // simply contributes silence, exactly as a clip with no audio track does —
  // and one already known to have no audio track skips the decode entirely
  // rather than paying for it to fail.
  const decoded = options.hasAudio
    ? await ctx.decodeAudioData(await media.arrayBuffer()).catch(() => null)
    : null;
  if (decoded) {
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    // An offset past the end of the buffer plays nothing, which is the right
    // answer for a clip trimmed past where its audio stops.
    source.start(0, options.offsetSeconds, options.durationSeconds);
  }
  return ctx.startRendering();
}

async function renderInBrowser(
  request: RenderRequest,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (p: RenderProgress) => void }
): Promise<Blob> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    EncodedAudioPacketSource,
    EncodedPacket,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Input: MediabunnyInput,
    Mp4OutputFormat,
    Output,
  } = await import('mediabunny');

  const { width, height, fps, keepAudio } = request.output;
  if (signal.aborted) throw abortError();
  if (request.clips.length === 0) throw new Error('There is nothing on the timeline to export.');

  // ---- Phase 1: open every clip, so the total frame count is known before the
  // first frame is encoded and progress can report a real fraction.
  onProgress({ phase: 'preparing', completed: null });

  const prepared: PreparedClip[] = [];

  try {
    for (const [index, clip] of request.clips.entries()) {
      if (signal.aborted) throw abortError();

      const input = new MediabunnyInput({
        formats: ALL_FORMATS,
        source: new BlobSource(clip.media),
      });

      // The clip's own name where the caller supplied one: "Clip 3" is a poor
      // answer on a timeline that holds the same record twice, and a person
      // scanning a failure message is looking for which clip to replace.
      const name = clip.label?.trim() || `Clip ${index + 1}`;

      let track: InputVideoTrack | null;
      let decoderConfig: VideoDecoderConfig | null;
      let startTimestamp: number;
      let endTimestamp: number;
      let hasAudio: boolean;
      try {
        track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error(`"${name}" has no video track.`);

        decoderConfig = await track.getDecoderConfig();
        if (!decoderConfig) {
          throw new Error(`"${name}" is in a format this browser cannot decode.`);
        }

        const firstTimestamp = await track.getFirstTimestamp();
        const trackEnd = await track.computeDuration();

        // The container's own answer, not the caller's `hasAudio` hint: the
        // demuxer is already open here, and a wrong hint would either drop
        // sound that exists or write a track's worth of silence.
        hasAudio = keepAudio ? (await input.getPrimaryAudioTrack()) !== null : false;

        // Trimming moves the clip's origin and shortens its span. Everything
        // below is already written against exactly those two numbers, so this
        // is a matter of stating them rather than of new decode logic: frames
        // before the in-point still arrive and still become the held frame,
        // they simply fill no slot, because `outputFramesBefore` of a negative
        // source time clamps to the clip's first slot. Frames past the
        // out-point are likewise decoded and dropped, since `settled` is
        // already clamped to the clip's last slot.
        const inPoint =
          typeof clip.trimStart === 'number' && clip.trimStart > 0
            ? Math.min(firstTimestamp + clip.trimStart, trackEnd)
            : firstTimestamp;
        const outPoint =
          typeof clip.trimEnd === 'number' && clip.trimEnd > 0
            ? Math.min(firstTimestamp + clip.trimEnd, trackEnd)
            : trackEnd;

        startTimestamp = inPoint;
        // A collapsed range would ask for a clip of no length; clipFrameCount
        // floors at one frame, so this stays a clip rather than a hole.
        endTimestamp = outPoint > inPoint ? outPoint : trackEnd;
      } catch (error) {
        input.dispose();
        throw error;
      }

      prepared.push({
        input,
        track,
        decoderConfig,
        startTimestamp,
        frameCount: clipFrameCount(endTimestamp - startTimestamp, fps),
        fit: clip.fit,
        media: clip.media,
        // `decodeAudioData` hands back a buffer that starts at the file's own
        // zero, so the in-point is the trim value as given — not
        // `startTimestamp`, which is offset by the video track's first
        // timestamp. It is also exactly what the server engine passes to
        // ffmpeg's `-ss`, which is what keeps the two cuts in the same place.
        audioOffset: typeof clip.trimStart === 'number' && clip.trimStart > 0 ? clip.trimStart : 0,
        hasAudio,
      });
    }

    const totalFrames = prepared.reduce((sum, clip) => sum + clip.frameCount, 0);
    const keyframeInterval = Math.max(1, Math.round(KEYFRAME_INTERVAL_SECONDS * fps));

    // ---- Everything below holds a resource the browser will not reclaim on its
    // own: two codecs and a muxer with an open target. They are declared here and
    // constructed inside the guard below, so a throw anywhere after the first one
    // is created still tears all of them down. Constructing before the guard is
    // the version of this that leaks a VideoEncoder holding a hardware session.
    let decoder: VideoDecoder | null = null;
    let encoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;
    let outputFile: InstanceType<typeof Output> | null = null;
    /**
     * The most recent decoded frame: the one that fills the next output slot.
     * A box rather than a bare `let` because it is read and written from inside
     * nested closures, where TypeScript's narrowing of a plain local goes stale.
     */
    const held: { frame: VideoFrame | null } = { frame: null };
    /** Decoded frames awaiting compositing, in presentation order. */
    let pending: VideoFrame[] = [];
    let codecsClosed = false;
    let codecError: Error | null = null;
    /** Set only once the finished blob is in hand. */
    let finished = false;

    const noteError = (error: unknown) => {
      codecError ??= error instanceof Error ? error : new Error(String(error));
    };

    const closeCodecs = () => {
      if (codecsClosed) return;
      codecsClosed = true;
      held.frame?.close();
      held.frame = null;
      for (const frame of pending) frame.close();
      pending = [];
      try {
        if (decoder && decoder.state !== 'closed') decoder.close();
      } catch {
        /* already gone */
      }
      try {
        if (encoder && encoder.state !== 'closed') encoder.close();
      } catch {
        /* already gone */
      }
      // The audio encoder is a third codec holding a real resource now that the
      // export drives it itself, so it is torn down on exactly the paths the
      // other two are — an abort between two clips used to have nothing of its
      // own to release, and this is the line that keeps that true.
      try {
        if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      } catch {
        /* already gone */
      }
    };

    const throwIfBroken = () => {
      if (codecError) throw codecError;
      if (signal.aborted) throw abortError();
    };

    /**
     * Wait until a codec's queue has drained to `limit`. Backpressure is the
     * difference between a timeline that exports and one that exhausts memory:
     * both codecs accept work far faster than they finish it, and every frame in
     * flight is a full uncompressed surface. The `dequeue` event does the real
     * work; the timer is only there so a codec that dies mid-queue surfaces its
     * error instead of hanging the export forever.
     */
    const drainQueue = async (
      codec: VideoDecoder | VideoEncoder | AudioEncoder,
      queueSize: () => number,
      limit: number
    ) => {
      while (queueSize() > limit) {
        throwIfBroken();
        const eventTarget: EventTarget = codec;
        await new Promise<void>((resolve) => {
          const done = () => {
            eventTarget.removeEventListener('dequeue', done);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(done, QUEUE_POLL_MS);
          eventTarget.addEventListener('dequeue', done);
        });
      }
      throwIfBroken();
    };

    /** Output frames emitted so far, across all clips: the timeline position. */
    let emittedTotal = 0;

    try {
      // ---- The surface every clip is composited onto, sized to the output once.
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('This browser could not open a drawing surface for the export.');

      // ---- The muxer. One video track, and an audio track only when there is
      // sound to put in it: with the box ticked but nothing on the timeline
      // carrying audio, a track of pure silence is a bigger file saying
      // exactly what no track says.
      const target = new BufferTarget();
      const mp4 = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      outputFile = mp4;
      const videoSource = new EncodedVideoPacketSource('avc');
      mp4.addVideoTrack(videoSource, { frameRate: fps });

      // Encoded packets rather than `AudioBufferSource`, which encodes and muxes
      // in one step and so gives nothing to cut at: its packets reach the file
      // the moment a buffer is handed over, and the last of them always runs
      // past the picture (see `audio-endpoint.ts`). Driving the AudioEncoder
      // here costs the resample/downmix that source did for free — which is why
      // `clipAudioBuffer` still exists and still does it — and buys the mux
      // boundary the endpoint rule needs.
      const audioSource = prepared.some((clip) => clip.hasAudio)
        ? new EncodedAudioPacketSource('aac')
        : null;
      if (audioSource) mp4.addAudioTrack(audioSource);

      await mp4.start();

      // The encoder's output callback is synchronous but muxing is not. Chaining
      // the adds keeps them in encode order — which is decode order, which is
      // what EncodedVideoPacketSource.add requires — without blocking the
      // callback.
      let muxChain: Promise<void> = Promise.resolve();

      // ---- One encoder for the whole timeline, not one per clip. A fresh
      // encoder per clip would restart its timestamps at zero, and a muxed file
      // whose timestamps reset at each boundary plays only the first clip in most
      // players. One encoder plus one running frame counter makes continuity
      // structural rather than something to remember.
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxChain = muxChain
            .then(() => videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta))
            .catch(noteError);
        },
        error: noteError,
      });
      encoder = videoEncoder;
      videoEncoder.configure({
        codec: H264_CODEC,
        width,
        height,
        framerate: fps,
        bitrate: targetBitrate(width, height, fps),
        // AVCC, which is the form the ISOBMFF muxer writes into the avcC box.
        avc: { format: 'avc' },
      });

      // ---- The audio encoder, and the queue of packets waiting to learn where
      // the picture ends.
      //
      // A packet is muxed as soon as it is *settled* — wholly inside the frames
      // already emitted — because the endpoint only ever moves later while the
      // export runs, so a settled packet can never need trimming. Everything
      // still in flight is held to the end, where the true endpoint is known.
      // The queue drains between clips, so it holds at most a clip's encoded
      // audio plus encoder delay, rather than the whole track.
      type PendingAudio = {
        packet: InstanceType<typeof EncodedPacket>;
        meta: EncodedAudioChunkMetadata | undefined;
      };
      const pendingAudio: PendingAudio[] = [];
      /**
       * The first decoder config the encoder reports. It rides along with
       * whichever packet is muxed first, not with whichever packet it arrived
       * on: mediabunny needs it on the first `add`, and the packet it came with
       * is not guaranteed to be the one that survives to get there.
       */
      let audioConfigMeta: EncodedAudioChunkMetadata | undefined;
      let audioTrackStarted = false;
      /** Sample frames handed to the encoder so far, across all clips. */
      let audioCursorFrames = 0;

      if (audioSource) {
        const encodedAudio = new AudioEncoder({
          output: (chunk, meta) => {
            audioConfigMeta ??= meta?.decoderConfig ? meta : undefined;
            // A browser that leaves chunk.duration null (the spec allows it)
            // would give the endpoint rule a zero-duration packet; supply the
            // fixed AAC-LC packet span instead, and leave a reported one alone.
            const packet = EncodedPacket.fromEncodedChunk(chunk);
            pendingAudio.push({
              packet:
                chunk.duration == null
                  ? packet.clone({ duration: aacPacketDurationSeconds(chunk.duration) })
                  : packet,
              meta,
            });
          },
          error: noteError,
        });
        audioEncoder = encodedAudio;
        encodedAudio.configure({
          // An explicit bitrate rather than a quality level, so the two engines
          // aim at the same number (ffmpeg-args.ts passes `-b:a`), and the full
          // codec string because that is the one `unavailableReason` asked this
          // browser about — a derived one can come back as HE-AAC.
          codec: AAC_CODEC,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: AUDIO_CHANNELS,
          bitrate: AUDIO_BITRATE,
        });
      }

      /**
       * Mux every held packet that is settled by `settledSeconds`. With
       * `final`, the number is the export's real endpoint instead of a lower
       * bound, so what is left is cut to it and the queue empties.
       */
      const muxSettledAudio = async (settledSeconds: number, final: boolean) => {
        if (!audioSource) return;
        while (pendingAudio.length > 0) {
          if (!final && !packetSettledBy(pendingAudio[0].packet, settledSeconds)) break;
          const entry = pendingAudio.shift()!;
          const packet = final ? trimPacketToEndpoint(entry.packet, settledSeconds) : entry.packet;
          if (!packet) continue;
          await audioSource.add(packet, audioTrackStarted ? entry.meta : audioConfigMeta);
          audioTrackStarted = true;
        }
      };

      /**
       * One clip's rendered audio into the encoder, timestamped from the
       * running cursor so nothing is shifted at a clip boundary.
       */
      const encodeAudioBuffer = async (buffer: AudioBuffer) => {
        const encodedAudio = audioEncoder;
        if (!encodedAudio) return;

        const channels: Float32Array[] = [];
        for (let channel = 0; channel < AUDIO_CHANNELS; channel += 1) {
          channels.push(buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)));
        }

        for (const chunk of planAudioChunks(audioCursorFrames, buffer.length, AUDIO_SAMPLE_RATE)) {
          throwIfBroken();
          await drainQueue(encodedAudio, () => encodedAudio.encodeQueueSize, ENCODE_QUEUE_LIMIT);

          // Planar: every channel's block laid end to end, which is the layout
          // `getChannelData` already hands back and so needs no interleave.
          const planar = new Float32Array(chunk.frames * AUDIO_CHANNELS);
          for (let channel = 0; channel < AUDIO_CHANNELS; channel += 1) {
            planar.set(
              channels[channel].subarray(chunk.offset, chunk.offset + chunk.frames),
              channel * chunk.frames
            );
          }

          const data = new AudioData({
            format: 'f32-planar',
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfFrames: chunk.frames,
            numberOfChannels: AUDIO_CHANNELS,
            timestamp: chunk.timestampMicros,
            data: planar,
          });
          try {
            encodedAudio.encode(data);
          } finally {
            data.close();
          }
        }

        audioCursorFrames += buffer.length;
      };

      /**
       * Composite one source frame into one output slot and hand it to the
       * encoder. `index` is the slot's position on the *timeline*, not within the
       * clip — that offset is the whole of timestamp continuity.
       */
      const emit = async (frame: VideoFrame, index: number, fit: 'contain' | 'cover') => {
        // fitRect rather than local letterbox maths, so the server engine frames
        // the same clip in the same place. Two answers here means one timeline
        // yields two different videos.
        const rect = fitRect(
          { width: frame.displayWidth, height: frame.displayHeight },
          { width, height },
          fit
        );

        // Repaint the whole surface: the bars belong to this frame, and a
        // previous larger frame must not show through around a smaller one.
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(frame, rect.x, rect.y, rect.width, rect.height);

        // Wait for room *before* allocating the frame. Built first, it would be
        // an orphaned surface whenever the drain throws on abort or codec error.
        await drainQueue(videoEncoder, () => videoEncoder.encodeQueueSize, ENCODE_QUEUE_LIMIT);

        const composited = new VideoFrame(canvas, {
          timestamp: Math.round((index * 1_000_000) / fps),
          duration: Math.round(1_000_000 / fps),
        });
        try {
          videoEncoder.encode(composited, { keyFrame: index % keyframeInterval === 0 });
        } finally {
          composited.close();
        }
      };

      onProgress({ phase: 'encoding', completed: 0 });

      for (const clip of prepared) {
        throwIfBroken();

        const clipBase = emittedTotal;
        const clipEnd = clipBase + clip.frameCount;
        pending = [];

        const activeDecoder = new VideoDecoder({
          output: (frame) => pending.push(frame),
          error: noteError,
        });
        decoder = activeDecoder;
        activeDecoder.configure(clip.decoderConfig);

        /** Fill every output slot the held frame is the right answer for. */
        const fillSlotsUpTo = async (limitIndex: number) => {
          while (emittedTotal < limitIndex) {
            const frame = held.frame;
            if (!frame) return;
            throwIfBroken();
            await emit(frame, emittedTotal, clip.fit);
            emittedTotal += 1;
            onProgress({ phase: 'encoding', completed: emittedTotal / totalFrames });
          }
        };

        /**
         * Drain decoded frames into output slots. `final` releases the last held
         * frame across whatever slots the clip still owes — including the case
         * of a clip that decoded exactly one frame.
         */
        const consumeDecoded = async (final: boolean) => {
          while (pending.length > 0) {
            const frame = pending.shift()!;
            const sourceTime = frame.timestamp / 1_000_000 - clip.startTimestamp;
            const settled = Math.min(clipEnd, clipBase + outputFramesBefore(sourceTime, fps));
            await fillSlotsUpTo(settled);
            held.frame?.close();
            held.frame = frame;
          }
          if (final) await fillSlotsUpTo(clipEnd);
        };

        const sink = new EncodedPacketSink(clip.track);
        for await (const packet of sink.packets()) {
          throwIfBroken();
          await drainQueue(activeDecoder, () => activeDecoder.decodeQueueSize, DECODE_QUEUE_LIMIT);
          activeDecoder.decode(packet.toEncodedVideoChunk());
          await consumeDecoded(false);
        }

        await activeDecoder.flush();
        await consumeDecoded(true);

        // Drop the held frame at the boundary: it belongs to this clip and must
        // never fill a slot in the next one.
        held.frame?.close();
        held.frame = null;
        activeDecoder.close();
        decoder = null;

        // A clip that decoded nothing simply contributes nothing; `emittedTotal`
        // stays where it was, so the next clip continues from the next real
        // frame and the timeline has no hole in it.

        // ---- This clip's audio, cut to the video that was actually emitted
        // for it rather than to the length it was predicted to have. The
        // buffers still go in end to end, so every clip must contribute its
        // exact share — including a mute one, whose silence is what keeps the
        // clips after it lined up with their own pictures.
        if (audioEncoder && emittedTotal > clipBase) {
          const buffer = await clipAudioBuffer(clip.media, {
            offsetSeconds: clip.audioOffset,
            durationSeconds: (emittedTotal - clipBase) / fps,
            hasAudio: clip.hasAudio,
          });
          throwIfBroken();
          await encodeAudioBuffer(buffer);
          // Everything the frames emitted so far already cover can go to the
          // muxer now; the rest waits for the endpoint.
          await muxSettledAudio(emittedTotal / fps, false);
        }
      }

      throwIfBroken();
      await videoEncoder.flush();
      await muxChain;
      throwIfBroken();

      // ---- The endpoint, at the one moment it is knowable: every frame that
      // is going to be emitted has been, so the picture presents through
      // `emittedTotal / fps` — 288 frames at 24 fps is 12.000000 s — and the
      // audio still in the queue is cut to exactly that. Read from what was
      // emitted rather than from the frame count predicted in phase 1, because
      // a clip that decodes short emits fewer frames than it was planned to and
      // the file has to match the picture that exists.
      if (audioEncoder) {
        await audioEncoder.flush();
        throwIfBroken();
        await muxSettledAudio(emittedTotal / fps, true);
        throwIfBroken();
      }
      // Clip durations round, so the running fraction can stop a frame or two
      // short of the estimate. Say it finished rather than leaving it at 98%.
      onProgress({ phase: 'encoding', completed: 1 });

      // Every codec is done. Release them before finalizing, which is the
      // memory-hungry step for a fastStart: 'in-memory' file.
      closeCodecs();

      onProgress({ phase: 'muxing', completed: null });
      videoSource.close();
      audioSource?.close();
      await mp4.finalize();

      if (!target.buffer) throw new Error('The export finished but produced no file.');
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      finished = true;
      return blob;
    } finally {
      // Every exit path, abort included. closeCodecs is idempotent, so the
      // success path having already called it costs nothing.
      closeCodecs();
      if (!finished) await outputFile?.cancel().catch(() => undefined);
    }
  } finally {
    for (const clip of prepared) clip.input.dispose();
  }
}
