/**
 * Where an exported file's *audio* has to stop, and the two operations that
 * make it stop there.
 *
 * A twelve-second export is twelve seconds of picture: 288 frames at 24 fps,
 * the last of them presenting through 12.000000 s. Audio does not divide that
 * way. AAC is encoded in packets of 1024 samples — 21.333 ms at 48 kHz — so the
 * packet that covers the last of the picture almost always runs past it, and
 * the file's duration becomes the audio track's, not the video's: the measured
 * before-state of this export was a 12.000000 s video stream inside a
 * 12.074667 s container.
 *
 * The fix is applied at the mux boundary rather than at the encoder, because
 * the encoder's packet grid is not ours to move:
 *
 * - a packet that starts at or after the endpoint is dropped, and
 * - a packet that straddles the endpoint is kept with its duration shortened
 *   to end exactly there.
 *
 * **The trade-off, stated:** audio presenting after the final video frame is
 * discarded, including source audio shifted past that boundary by encoder
 * priming (about 44 ms in the measured fixture). The final kept packet's bytes
 * are still written and still decode; only its
 * presented span is clipped, which is what an edit list would express. We take
 * that over the alternative, which is a file whose reported duration disagrees
 * with the twelve seconds the timeline, the UI label, and the server engine all
 * say — a disagreement that shows up in every player's scrubber, in
 * concatenation, and in any downstream tool that trusts container duration.
 *
 * This module holds no mediabunny import on purpose: it is written against the
 * shape of a packet, so it is exercised by unit tests in Node while the render
 * path keeps mediabunny inside its own dynamically imported chunk.
 */

/**
 * How far either side of the endpoint counts as *on* it. Packet timestamps
 * arrive through a microsecond integer grid (`EncodedAudioChunk.timestamp`),
 * so a packet that lands mathematically on 12 s can report 11.999999 s. One
 * microsecond of slop keeps that from being read as a real straddle and
 * written as a 1 µs sliver of a packet.
 */
export const ENDPOINT_TOLERANCE_SECONDS = 1e-6;

/** The part of an encoded packet this rule reads. */
export interface TimedPacket {
  /** Presentation timestamp, in seconds. */
  readonly timestamp: number;
  /** Presented duration, in seconds. */
  readonly duration: number;
}

/** A packet that can be re-issued with a shorter presented duration. */
export interface ClonablePacket<T> extends TimedPacket {
  clone(options: { duration: number }): T;
}

/**
 * Whether a packet is wholly inside `settledSeconds` and therefore safe to mux
 * before the final endpoint is known.
 *
 * The endpoint can only ever move later while an export is still encoding —
 * `emittedTotal` counts up — so a packet that ends at or before the frames
 * already emitted can never need trimming, whatever the export finishes at.
 * Everything else is held. This is the guard against the tempting bug of
 * truncating against a running total and cutting the audio short of the
 * picture that had not been encoded yet.
 */
export function packetSettledBy(packet: TimedPacket, settledSeconds: number): boolean {
  if (!Number.isFinite(settledSeconds)) return false;
  return packet.timestamp + packet.duration <= settledSeconds + ENDPOINT_TOLERANCE_SECONDS;
}

/**
 * One packet, cut to the endpoint: the packet itself when it ends at or before
 * the endpoint, a shortened clone when it straddles it, and `null` when it
 * starts at or after it and so presents nothing.
 *
 * A non-finite endpoint means the endpoint is not known, and an unknown
 * endpoint trims nothing — cutting on a guess is the one outcome worse than
 * not cutting at all.
 */
export function trimPacketToEndpoint<T extends ClonablePacket<T>>(
  packet: T,
  endpointSeconds: number
): T | null {
  if (!Number.isFinite(endpointSeconds)) return packet;

  if (packet.timestamp >= endpointSeconds - ENDPOINT_TOLERANCE_SECONDS) return null;

  const end = packet.timestamp + packet.duration;
  if (end <= endpointSeconds + ENDPOINT_TOLERANCE_SECONDS) return packet;

  return packet.clone({ duration: endpointSeconds - packet.timestamp });
}

/** `trimPacketToEndpoint` over a whole track, dropping what presents nothing. */
export function trimPacketsToEndpoint<T extends ClonablePacket<T>>(
  packets: readonly T[],
  endpointSeconds: number
): T[] {
  const kept: T[] = [];
  for (const packet of packets) {
    const trimmed = trimPacketToEndpoint(packet, endpointSeconds);
    if (trimmed) kept.push(trimmed);
  }
  return kept;
}
