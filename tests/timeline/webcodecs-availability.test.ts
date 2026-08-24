import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clipFrameCount,
  createWebCodecsEngine,
  outputFramesBefore,
} from '../../lib/timeline/render/webcodecs';
import type { RenderRequest } from '../../lib/timeline/render/port';

/**
 * jsdom has no WebCodecs and cannot decode video, so the pipeline itself is not
 * exercised here — a test that mocks decode, encode, and mux and then asserts
 * "it worked" cannot fail for the reason it exists. What is tested is what is
 * honestly testable without a browser: the availability check, whose whole job
 * is to read a capability the environment reports, and the two pure functions
 * the frame-selection rule is built out of. The real render is a manual check.
 */

/** Video only, so these cases answer for the video config and nothing else. */
const request: RenderRequest = {
  output: { width: 1920, height: 1080, fps: 30, auto: true, keepAudio: false },
  clips: [],
};

const withAudio: RenderRequest = {
  ...request,
  output: { ...request.output, keepAudio: true },
};

afterEach(() => vi.unstubAllGlobals());

describe('the browser engine reports why it cannot run', () => {
  it('names the missing API when WebCodecs is absent', async () => {
    const reason = await createWebCodecsEngine().unavailableReason(request);
    expect(reason).toMatch(/cannot encode video/i);
  });

  it('names the codec when WebCodecs exists but H.264 is unsupported', async () => {
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: false }) });
    expect(await createWebCodecsEngine().unavailableReason(request)).toMatch(/H\.264/);
  });

  it('reports available when the config is supported', async () => {
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: true }) });
    expect(await createWebCodecsEngine().unavailableReason(request)).toBeNull();
  });

  it('asks about the requested size rather than a fixed one', async () => {
    const seen: VideoEncoderConfig[] = [];
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: async (config: VideoEncoderConfig) => {
        seen.push(config);
        return { supported: true };
      },
    });

    await createWebCodecsEngine().unavailableReason({
      output: { width: 720, height: 1280, fps: 24, auto: false, keepAudio: false },
      clips: [],
    });

    expect(seen).toEqual([
      expect.objectContaining({ width: 720, height: 1280, framerate: 24 }),
    ]);
  });

  it('treats a rejected capability query as unsupported rather than crashing', async () => {
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: async () => {
        throw new TypeError('bad config');
      },
    });
    expect(await createWebCodecsEngine().unavailableReason(request)).toMatch(/H\.264/);
  });
});

describe('audio only blocks the browser engine when audio was asked for', () => {
  const videoIsFine = () => {
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: true }) });
  };

  it('stays available with no AudioEncoder at all when the box is off', async () => {
    videoIsFine();
    expect(await createWebCodecsEngine().unavailableReason(request)).toBeNull();
  });

  it('withdraws when audio is wanted and this browser cannot encode it', async () => {
    videoIsFine();
    expect(await createWebCodecsEngine().unavailableReason(withAudio)).toMatch(/cannot encode audio/i);
  });

  it('asks for AAC at the shared 48 kHz stereo mixdown', async () => {
    videoIsFine();
    const seen: AudioEncoderConfig[] = [];
    vi.stubGlobal('AudioEncoder', {
      isConfigSupported: async (config: AudioEncoderConfig) => {
        seen.push(config);
        return { supported: true };
      },
    });

    expect(await createWebCodecsEngine().unavailableReason(withAudio)).toBeNull();
    expect(seen).toEqual([
      expect.objectContaining({ codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 }),
    ]);
  });

  it('treats a rejected audio capability query as unsupported', async () => {
    videoIsFine();
    vi.stubGlobal('AudioEncoder', {
      isConfigSupported: async () => {
        throw new TypeError('bad config');
      },
    });
    expect(await createWebCodecsEngine().unavailableReason(withAudio)).toMatch(/cannot encode audio/i);
  });
});

describe('output frames are chosen by timestamp, not by source frame index', () => {
  it('counts the slots settled by the time a frame arrives', () => {
    // Slot i sits at i / 30. A frame arriving at 0.1s settles slots 0, 1, 2.
    expect(outputFramesBefore(0.1, 30)).toBe(3);
    expect(outputFramesBefore(1, 30)).toBe(30);
  });

  it('does not claim a slot that sits exactly on the arriving frame', () => {
    // The frame at 2.0s is itself the answer for slot 60, so only 0..59 are
    // settled. Getting this wrong duplicates one frame per boundary.
    expect(outputFramesBefore(2, 30)).toBe(60);
    expect(outputFramesBefore(1 / 3, 24)).toBe(8);
  });

  it('settles nothing before the first slot', () => {
    expect(outputFramesBefore(0, 30)).toBe(0);
    expect(outputFramesBefore(-0.5, 30)).toBe(0);
  });

  it('is unaffected by the source rate, which may not match the output', () => {
    // A 24fps source on a 30fps grid: the third source frame lands at 2/24s and
    // settles the slots at 0, 1/30, and 2/30 — an uneven 3:2 cadence, which is
    // the correct answer rather than a bug.
    expect(outputFramesBefore(2 / 24, 30)).toBe(3);
    expect(outputFramesBefore(3 / 24, 30)).toBe(4);
  });

  it('survives a nonsense framerate instead of producing Infinity slots', () => {
    expect(outputFramesBefore(1, 0)).toBe(0);
    expect(outputFramesBefore(Number.NaN, 30)).toBe(0);
  });
});

describe('clip length in output frames', () => {
  it('rounds to the nearest whole frame', () => {
    expect(clipFrameCount(5, 30)).toBe(150);
    expect(clipFrameCount(5.02, 30)).toBe(151);
  });

  it('gives a clip too short to fill a frame one frame anyway', () => {
    // Better a single-frame clip than one silently dropped from the export.
    expect(clipFrameCount(0.001, 30)).toBe(1);
    expect(clipFrameCount(0, 30)).toBe(1);
  });
});
