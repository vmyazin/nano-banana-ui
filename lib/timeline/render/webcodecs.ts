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
 * Video only. No audio track is decoded, encoded, or muxed — exports are silent
 * by design in this slice, and the server engine passes `-an` to match. Two
 * engines that disagree about sound produce two different files from the same
 * timeline, and that divergence is discovered by ear rather than by a test.
 */

/** High Profile, Level 4.2. Widely hardware-encoded and widely playable. */
const H264_CODEC = 'avc1.640028';

const NO_WEBCODECS =
  'This browser cannot encode video on its own. Try Chrome or Edge, or export on the server.';
const NO_H264 =
  'This browser cannot encode H.264 video at this size. Try a smaller export size, or export on the server.';

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

      return support?.supported ? null : NO_H264;
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
}

async function renderInBrowser(
  request: RenderRequest,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (p: RenderProgress) => void }
): Promise<Blob> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    EncodedPacket,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Input: MediabunnyInput,
    Mp4OutputFormat,
    Output,
  } = await import('mediabunny');

  const { width, height, fps } = request.output;
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

      let track: InputVideoTrack | null;
      let decoderConfig: VideoDecoderConfig | null;
      let startTimestamp: number;
      let endTimestamp: number;
      try {
        track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error(`Clip ${index + 1} has no video track.`);

        decoderConfig = await track.getDecoderConfig();
        if (!decoderConfig) {
          throw new Error(`Clip ${index + 1} is in a format this browser cannot decode.`);
        }

        startTimestamp = await track.getFirstTimestamp();
        endTimestamp = await track.computeDuration();
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
      codec: VideoDecoder | VideoEncoder,
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

      // ---- The muxer. One video track. No audio track, ever.
      const target = new BufferTarget();
      const mp4 = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      outputFile = mp4;
      const videoSource = new EncodedVideoPacketSource('avc');
      mp4.addVideoTrack(videoSource, { frameRate: fps });
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
      }

      throwIfBroken();
      await videoEncoder.flush();
      await muxChain;
      throwIfBroken();
      // Clip durations round, so the running fraction can stop a frame or two
      // short of the estimate. Say it finished rather than leaving it at 98%.
      onProgress({ phase: 'encoding', completed: 1 });

      // Both codecs are done. Release them before finalizing, which is the
      // memory-hungry step for a fastStart: 'in-memory' file.
      closeCodecs();

      onProgress({ phase: 'muxing', completed: null });
      videoSource.close();
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
