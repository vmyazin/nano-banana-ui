import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractLastFrame,
  FRAME_EXTRACTION_ERROR,
  lastFrameFilename,
  lastFrameSeekTarget,
  seekToLastFrame,
  type SeekableVideo,
} from '../lib/video-frame';

/**
 * jsdom cannot decode video, so the seek choreography is exercised against a
 * double. Whether a real decoder paints the frame is a manual check.
 */
class FakeVideo implements SeekableVideo {
  duration: number;
  readonly seeks: number[] = [];
  private time = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(
    duration: number,
    private readonly onSeek?: (video: FakeVideo, requested: number) => void
  ) {
    this.duration = duration;
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(value: number) {
    this.seeks.push(value);
    this.onSeek?.(this, value);
    this.time = Number.isFinite(this.duration) ? Math.min(value, this.duration) : value;
    this.emit('seeked');
  }

  addEventListener(type: string, listener: () => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

describe('lastFrameSeekTarget', () => {
  it('samples just before the end of a known duration', () => {
    expect(lastFrameSeekTarget(8)).toBeCloseTo(7.95);
    expect(lastFrameSeekTarget(8, 0.5)).toBeCloseTo(7.5);
  });

  it('never returns a negative time for a clip shorter than the epsilon', () => {
    expect(lastFrameSeekTarget(0.02)).toBe(0);
  });

  it.each([
    [Number.POSITIVE_INFINITY, 'not yet buffered'],
    [Number.NaN, 'metadata not yet parsed'],
    [0, 'an empty video'],
  ])('returns null for %p (%s)', (duration) => {
    expect(lastFrameSeekTarget(duration)).toBeNull();
  });
});

describe('seekToLastFrame', () => {
  it('seeks once to just before the end when the duration is known', async () => {
    const video = new FakeVideo(8);

    await seekToLastFrame(video);

    expect(video.seeks).toEqual([7.95]);
  });

  it('probes past the end first when the duration is still Infinity', async () => {
    // A fragmented MP4 only reveals its duration once a seek runs off the end.
    const video = new FakeVideo(Number.POSITIVE_INFINITY, (current) => {
      current.duration = 6;
    });

    await seekToLastFrame(video);

    expect(video.seeks).toEqual([1e7, 5.95]);
  });

  it('gives up when the duration never resolves', async () => {
    const video = new FakeVideo(Number.POSITIVE_INFINITY);

    await expect(seekToLastFrame(video)).rejects.toThrow(FRAME_EXTRACTION_ERROR);
  });

  it('resolves without awaiting a seeked event that would never fire', async () => {
    // Already parked on the target: assigning the same currentTime emits nothing.
    const video = new FakeVideo(8);
    video.currentTime = 7.95;
    video.seeks.length = 0;

    await seekToLastFrame(video);

    expect(video.seeks).toEqual([]);
  });

  it('rejects when the element reports a decode error mid-seek', async () => {
    const video = new FakeVideo(8, (current) => current.emit('error'));

    await expect(seekToLastFrame(video)).rejects.toThrow(FRAME_EXTRACTION_ERROR);
  });

  it('rejects rather than hanging when no seeked event ever arrives', async () => {
    vi.useFakeTimers();
    try {
      const stalled = {
        currentTime: 0,
        duration: 8,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } satisfies SeekableVideo;

      const pending = seekToLastFrame(stalled);
      const assertion = expect(pending).rejects.toThrow(FRAME_EXTRACTION_ERROR);
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('extractLastFrame guards', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a URL it would not download', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(extractLastFrame('http://insecure.example/clip.mp4')).rejects.toThrow(
      FRAME_EXTRACTION_ERROR
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed response', new Response('nope', { status: 404 })],
    [
      'a non-video body',
      new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ],
  ])('refuses %s', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(extractLastFrame('https://v3.fal.media/files/tiger/clip.mp4')).rejects.toThrow(
      FRAME_EXTRACTION_ERROR
    );
  });
});

describe('lastFrameFilename', () => {
  it('marks the frame as coming from the end of its clip', () => {
    expect(lastFrameFilename('neon-tiger-in-the-rain')).toBe(
      'neon-tiger-in-the-rain-last-frame.png'
    );
  });
});
