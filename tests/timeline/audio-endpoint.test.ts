import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ENDPOINT_TOLERANCE_SECONDS,
  packetSettledBy,
  trimPacketToEndpoint,
  trimPacketsToEndpoint,
} from '../../lib/timeline/render/audio-endpoint';
import { aacPacketDurationSeconds, planAudioChunks } from '../../lib/timeline/render/webcodecs';

/**
 * The endpoint rule is the whole of the fix and it is pure, so it is tested for
 * real here rather than behind a mocked encoder: these cases are the measured
 * export (12 s of 24 fps picture, 566 AAC packets of 1024 samples at 48 kHz)
 * reduced to the arithmetic that decided its container duration.
 */

const AAC_PACKET_SECONDS = 1024 / 48_000;

/** Stands in for a mediabunny `EncodedPacket`: timing plus a duration clone. */
class FakePacket {
  constructor(
    readonly timestamp: number,
    readonly duration: number,
    readonly index = -1
  ) {}

  clone(options: { duration: number }): FakePacket {
    return new FakePacket(this.timestamp, options.duration, this.index);
  }
}

/** The AAC grid the browser encoder actually produces, one packet per 1024. */
function aacTrack(packetCount: number): FakePacket[] {
  return Array.from(
    { length: packetCount },
    (_, index) => new FakePacket(index * AAC_PACKET_SECONDS, AAC_PACKET_SECONDS, index)
  );
}

function presentedEnd(packets: FakePacket[]): number {
  const last = packets[packets.length - 1];
  return last.timestamp + last.duration;
}

describe('audio is cut to the endpoint the picture actually reaches', () => {
  it('ends the measured twelve-second export at twelve seconds, not 12.074667', () => {
    // 288 frames at 24 fps present through 12.000000s; 566 AAC packets run to
    // 12.074667s, and the longer of the two used to become the file duration.
    const kept = trimPacketsToEndpoint(aacTrack(566), 288 / 24);

    expect(presentedEnd(kept)).toBeCloseTo(12, 9);
    // Packet 562 covers sample 575488 through 576512 and straddles 576000.
    expect(kept).toHaveLength(563);
    expect(kept[562].index).toBe(562);
    expect(kept[562].duration).toBeCloseTo(12 - 562 * AAC_PACKET_SECONDS, 9);
  });

  it('keeps the straddling packet rather than dropping it', () => {
    // Dropping it instead would end the audio at 11.989333s — 10ms of the
    // timeline's own sound missing, which is audible on a hard cut.
    const kept = trimPacketsToEndpoint(aacTrack(566), 12);
    expect(kept[562].timestamp).toBeLessThan(12);
    expect(kept[562].duration).toBeGreaterThan(0);
  });

  it('leaves a packet that ends exactly on the endpoint untouched', () => {
    const packet = new FakePacket(11.5, 0.5);
    expect(trimPacketToEndpoint(packet, 12)).toBe(packet);
  });

  it('drops the packet that starts exactly on the endpoint', () => {
    // The exact-boundary case: presenting it would add a whole packet past the
    // last frame, which is the bug in its purest form.
    expect(trimPacketToEndpoint(new FakePacket(12, AAC_PACKET_SECONDS), 12)).toBeNull();

    const grid = 562 * AAC_PACKET_SECONDS;
    const kept = trimPacketsToEndpoint(aacTrack(566), grid);
    expect(kept).toHaveLength(562);
    expect(presentedEnd(kept)).toBeCloseTo(grid, 9);
  });

  it('drops every packet that starts after the endpoint', () => {
    const kept = trimPacketsToEndpoint(aacTrack(566), 1);
    expect(kept.every((packet) => packet.timestamp < 1)).toBe(true);
    expect(presentedEnd(kept)).toBeCloseTo(1, 9);
  });

  it('never emits a zero-length or negative-length packet', () => {
    const kept = trimPacketsToEndpoint(aacTrack(566), 12);
    expect(kept.every((packet) => packet.duration > 0)).toBe(true);
  });

  it('reads a microsecond of grid slop as on the endpoint, not as a straddle', () => {
    // EncodedAudioChunk timestamps come off an integer microsecond grid, so a
    // packet that lands mathematically on 12s can report 11.999999s. Without
    // the tolerance that becomes a 1µs sliver of a packet in the file.
    const packet = new FakePacket(12 - ENDPOINT_TOLERANCE_SECONDS / 2, AAC_PACKET_SECONDS);
    expect(trimPacketToEndpoint(packet, 12)).toBeNull();
  });

  it('trims nothing when the endpoint is not known', () => {
    // Cutting on a guess is worse than not cutting: it would truncate audio the
    // picture still needs.
    const packet = new FakePacket(11.99, AAC_PACKET_SECONDS);
    expect(trimPacketToEndpoint(packet, Number.POSITIVE_INFINITY)).toBe(packet);
    expect(trimPacketToEndpoint(packet, Number.NaN)).toBe(packet);
  });

  it('does not shift any packet it keeps', () => {
    const source = aacTrack(566);
    const kept = trimPacketsToEndpoint(source, 12);
    for (const packet of kept) {
      expect(packet.timestamp).toBe(source[packet.index].timestamp);
    }
  });
});

describe('a packet is only muxed early once the frames it covers exist', () => {
  it('settles a packet that ends inside the frames already emitted', () => {
    expect(packetSettledBy(new FakePacket(1, AAC_PACKET_SECONDS), 4)).toBe(true);
  });

  it('holds a packet that runs past them, because the endpoint may still move', () => {
    // Mid-export `emittedTotal / fps` is a lower bound, not the endpoint.
    // Trimming against it here would cut the audio short of clips that have not
    // been encoded yet.
    expect(packetSettledBy(new FakePacket(3.99, AAC_PACKET_SECONDS), 4)).toBe(false);
    expect(packetSettledBy(new FakePacket(1, AAC_PACKET_SECONDS), Number.NaN)).toBe(false);
  });

  it('settles a packet that ends exactly there', () => {
    expect(packetSettledBy(new FakePacket(4 - AAC_PACKET_SECONDS, AAC_PACKET_SECONDS), 4)).toBe(
      true
    );
  });
});

describe('audio reaches the encoder in blocks that tile the timeline', () => {
  it('covers the buffer exactly, with no gap and no overlap', () => {
    const plans = planAudioChunks(0, 25_000, 48_000, 10_240);
    expect(plans.map((plan) => plan.frames)).toEqual([10_240, 10_240, 4_520]);
    expect(plans[1].offset).toBe(10_240);
    expect(plans.reduce((sum, plan) => sum + plan.frames, 0)).toBe(25_000);
  });

  it('timestamps from the running cursor, so a clip boundary shifts nothing', () => {
    // Clip one is four seconds; clip two must start at 4.000000s, not at zero.
    const first = planAudioChunks(0, 192_000, 48_000, 10_240);
    const second = planAudioChunks(192_000, 192_000, 48_000, 10_240);

    expect(first[0].timestampMicros).toBe(0);
    expect(second[0].timestampMicros).toBe(4_000_000);
    expect(second[1].timestampMicros).toBe(
      Math.round(((192_000 + 10_240) * 1_000_000) / 48_000)
    );
  });

  it('gives a buffer shorter than one block a single block', () => {
    expect(planAudioChunks(48_000, 512, 48_000, 10_240)).toEqual([
      { offset: 0, frames: 512, timestampMicros: 1_000_000 },
    ]);
  });

  it('plans nothing for an empty or nonsense buffer', () => {
    expect(planAudioChunks(0, 0, 48_000, 10_240)).toEqual([]);
    expect(planAudioChunks(0, 1_000, 0, 10_240)).toEqual([]);
    expect(planAudioChunks(0, 1_000, 48_000, 0)).toEqual([]);
  });
});

describe('an AAC-LC packet whose browser omits its duration still spans the grid', () => {
  it('falls back to the 1024-frame packet duration when the chunk reports none', () => {
    // EncodedAudioChunk.duration is nullable in the spec, and mediabunny turns a
    // null into a zero-duration packet — which the endpoint rule reads as a
    // packet presenting nothing, settling the tail early and never trimming it.
    expect(aacPacketDurationSeconds(null)).toBeCloseTo(AAC_PACKET_SECONDS, 12);
  });

  it('keeps a settled/straddling decision working under the fallback duration', () => {
    // With duration 0 (mediabunny's null mapping) this packet would settle at
    // any endpoint and never be trimmed; the fallback restores the real span so
    // the last packet is cut to the picture like any other.
    const fallback = aacPacketDurationSeconds(null);
    const straddling = new FakePacket(12 - fallback / 2, fallback);
    expect(packetSettledBy(straddling, 12)).toBe(false);
    const trimmed = trimPacketToEndpoint(straddling, 12);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.duration).toBeCloseTo(fallback / 2, 9);
  });

  it('preserves a reported duration, converting microseconds to seconds', () => {
    expect(aacPacketDurationSeconds(21_333)).toBeCloseTo(0.021333, 9);
    expect(aacPacketDurationSeconds(0)).toBe(0);
  });
});

/**
 * Two invariants of the render path that no unit test can reach — jsdom has
 * neither WebCodecs nor a muxer — but that a later edit could quietly undo, so
 * they are asserted against the source. Both are the difference between this
 * fix holding and the file going back to what it was.
 */
describe('the browser engine keeps the seam the endpoint rule needs', () => {
  const source = readFileSync(
    join(process.cwd(), 'lib/timeline/render/webcodecs.ts'),
    'utf8'
  );

  it('does not mux audio through AudioBufferSource', () => {
    // AudioBufferSource encodes and muxes in one step, so its packets reach the
    // file before the endpoint is known and cannot be cut to it.
    expect(source).not.toMatch(/new AudioBufferSource\b/);
    expect(source).toMatch(/new EncodedAudioPacketSource\(/);
  });

  it('closes the audio encoder on every teardown path the other codecs use', () => {
    const teardown = source.slice(
      source.indexOf('const closeCodecs'),
      source.indexOf('const throwIfBroken')
    );
    expect(teardown).toMatch(/audioEncoder.*close\(\)/s);
  });
});
