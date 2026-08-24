import { fetchResultBlob } from '@/lib/gallery/capture';
import { isDownloadableMediaUrl } from '@/lib/media-download';
import { extractLastFrameFromBlob } from '@/lib/video-frame';
import { probeDimensions, probeWithDemuxer } from '@/lib/timeline/probe';
import type { ClipDimensions } from '@/lib/timeline/derive-output';
import { useGalleryStore } from '@/store/useGalleryStore';

export type UnavailableReason = 'missing' | 'expired' | 'unreachable' | 'no-source';

export interface ClipMedia {
  status: 'ready';
  blob: Blob;
  dimensions: ClipDimensions;
  /**
   * True once the gallery record is confirmed pinned and holding bytes; false
   * when the clip is usable right now but persistence failed, so it will not
   * survive a reload. `setPinned`/`keep` swallow storage failures internally
   * (catch → set `storageError` → return, leaving `records` untouched) rather
   * than throwing or returning a result, so this can only be known by
   * re-reading the store after calling them — never by whether the call threw.
   */
  durable: boolean;
  /** Why `durable` is false. Sourced from the store's `storageError` so the
   *  user sees the real cause (e.g. quota) rather than a generic message. */
  warning?: string;
  /**
   * `false` when `VideoDecoder.isConfigSupported` said this browser cannot
   * decode the clip's codec; absent when the probe could not answer.
   *
   * Deliberately not an `Unavailable` reason: the server engine decodes
   * whatever ffmpeg does, so a clip this browser cannot read is still
   * perfectly exportable — blocking the whole timeline would dead-end the
   * one route that still works. The UI warns on the clip and withdraws the
   * browser engine instead, which is the "offers the server engine as a next
   * step" the design spec's error handling asks for.
   */
  decodable?: boolean;
  /**
   * Whether the file holds an audio track. Absent when the probe could not
   * answer. Drives the "with audio"/"silent" wording on Export and, for the
   * server engine, which inputs need silence padded in (see
   * `lib/timeline/render/ffmpeg-args.ts`).
   */
  hasAudio?: boolean;
}

export interface Unavailable {
  status: 'unavailable';
  reason: UnavailableReason;
  message: string;
}

const MESSAGES: Record<UnavailableReason, string> = {
  missing: 'This clip is no longer in your library.',
  expired: "This clip's source has expired and the file was never kept.",
  unreachable: 'This clip could not be downloaded. Check your connection.',
  'no-source': 'This clip has no file and no source to download it from.',
};

/**
 * Shown on a clip whose codec this browser answered "no" to at add time. Not
 * an `Unavailable` message: the clip is still exportable, just not here.
 */
export const UNDECODABLE_WARNING =
  'This browser cannot decode this clip — export on the server instead.';

const unavailable = (reason: UnavailableReason): Unavailable => ({
  status: 'unavailable',
  reason,
  message: MESSAGES[reason],
});

/**
 * The two ways `durable: false` happens are not the same failure, and saying
 * the wrong one is worse than saying nothing.
 *
 * On the cached path the bytes are already in IndexedDB and only `setPinned`
 * failed — the clip survives a reload perfectly well; what it has lost is its
 * protection from `lib/gallery/eviction.ts`. On the download path nothing was
 * written at all, so the bytes exist only in this tab.
 */
const UNPINNED_WARNING =
  'This clip could not be pinned, so your library may evict it to reclaim space.';
export const UNSAVED_WARNING =
  'This clip could not be saved to your library and will not survive a reload.';

/**
 * Assembles a ready result, keeping the optional fields genuinely absent
 * rather than present-and-undefined — `expect(result).not.toHaveProperty(...)`
 * is how the "a clip that abstains is not warned about" rule is pinned.
 */
function ready(
  blob: Blob,
  dimensions: ClipDimensions,
  facts: DemuxFacts,
  durable: boolean,
  unsavedFallback: string
): ClipMedia {
  const media: ClipMedia = { status: 'ready', blob, dimensions, durable };
  if (!durable) media.warning = persistenceWarning(unsavedFallback);
  if (facts.decodable !== undefined) media.decodable = facts.decodable;
  if (facts.hasAudio !== undefined) media.hasAudio = facts.hasAudio;
  return media;
}

/**
 * Whether a record is genuinely safe from eviction right now: pinned *and*
 * holding bytes, re-read fresh from the store rather than inferred from
 * whether `setPinned`/`keep` threw — they never throw outward, they swallow
 * failures and leave `records` untouched instead.
 */
export function isPersisted(recordId: string): boolean {
  const record = useGalleryStore.getState().records.find((candidate) => candidate.id === recordId);
  return record?.pinned === true && record?.blob !== undefined;
}

/** The store's own explanation for the failure, when it recorded one —
 *  otherwise the accurate statement for the path that failed. */
export function persistenceWarning(fallback: string): string {
  return useGalleryStore.getState().storageError ?? fallback;
}

/** What one demuxer open learned about a record, beyond its dimensions. */
interface DemuxFacts {
  /** Absent when nothing has been able to answer for this record yet. */
  decodable?: boolean;
  hasAudio?: boolean;
}

/**
 * What the demuxer said about a given record, remembered for the session.
 *
 * Not `GalleryRecord` fields: the scope boundary permits exactly four optional
 * additions there (width, height, durationSeconds, fps) and these are not among
 * them — and `decodable`, unlike those, is a fact about *this browser*, not
 * about the file. A module-level map is the right lifetime: neither answer can
 * change while the tab is open, and it means the second placement of a clip
 * whose dimensions are already cached still knows what the first placement
 * learned, instead of one row warning and its twin staying silent.
 */
const demuxFactsByRecord = new Map<string, DemuxFacts>();

interface ProbeResult extends DemuxFacts {
  dimensions: ClipDimensions;
}

/**
 * Cached dimensions when we have them, freshly probed otherwise. Old records —
 * anything kept before the timeline existed — have bytes but no dimensions, and
 * without this they would give deriveOutputFormat nothing to vote with.
 *
 * Framerate and decodability both come from the demuxer rather than the video
 * element, which can report neither, and both come out of a single open. They
 * are deliberately the weaker half of this: dimensions decide whether the clip
 * can be used at all, while a framerate that cannot be read leaves `fps`
 * undefined (the clip simply abstains from the cadence vote) and a decode
 * question that cannot be answered leaves `decodable` undefined (render-time
 * detection still catches it). Neither can fail an add.
 */
async function probeFor(recordId: string, blob: Blob): Promise<ProbeResult> {
  const record = useGalleryStore.getState().records.find((r) => r.id === recordId);
  if (record?.width && record.height) {
    return {
      dimensions: {
        width: record.width,
        height: record.height,
        durationSeconds: record.durationSeconds ?? 0,
        fps: record.fps,
      },
      ...demuxFactsByRecord.get(recordId),
    };
  }

  // Both probes read the same bytes and neither depends on the other, so they
  // run together rather than in series. Neither ever rejects.
  // The demuxer probe's own contract is that it never rejects; the `catch` is
  // so acquisition does not depend on that staying true. A cadence hint and a
  // decode warning are both worth less than an add that works.
  const [probed, demuxed] = await Promise.all([
    probeDimensions(blob),
    probeWithDemuxer(blob).catch(() => ({}) as Awaited<ReturnType<typeof probeWithDemuxer>>),
  ]);
  const dimensions: ClipDimensions = demuxed.fps === undefined ? probed : { ...probed, fps: demuxed.fps };

  const facts: DemuxFacts = {};
  if (demuxed.decodable !== undefined) facts.decodable = demuxed.decodable;
  if (demuxed.hasAudio !== undefined) facts.hasAudio = demuxed.hasAudio;
  if (Object.keys(facts).length > 0) demuxFactsByRecord.set(recordId, facts);

  // Only the four fields the record is allowed to carry are written through the
  // store; the demuxer's other answers stay in memory (see `demuxFactsByRecord`).
  await useGalleryStore.getState().setDimensions(recordId, dimensions);
  return { dimensions, ...facts };
}

/** Test-only: clears the per-session demuxer memo. */
export function __resetDecodeCacheForTests(): void {
  demuxFactsByRecord.clear();
}

export async function acquireClipMedia(
  recordId: string,
  options: { signal?: AbortSignal } = {}
): Promise<ClipMedia | Unavailable> {
  const store = useGalleryStore.getState();
  const record = store.records.find((candidate) => candidate.id === recordId);

  // 1. The reference dangles: removed, cleared, or evicted by the count ceiling.
  if (!record) return unavailable('missing');

  // 2. Bytes in hand. Pin regardless — eviction reclaims unpinned bytes, and the
  //    library lets the user unpin at any time, so a blob is not safety.
  if (record.blob) {
    if (!record.pinned) await store.setPinned(recordId, true);
    const durable = isPersisted(recordId);
    const { dimensions, ...facts } = await probeFor(recordId, record.blob);
    // The bytes are already in IndexedDB here; only the pin can have failed,
    // so "will not survive a reload" would be false. What is actually at risk
    // is eviction reclaiming an unpinned record.
    return ready(record.blob, dimensions, facts, durable, UNPINNED_WARNING);
  }

  // 3. A URL that may or may not still resolve.
  if (record.sourceUrl && isDownloadableMediaUrl(record.sourceUrl)) {
    let blob: Blob;
    try {
      blob = await fetchResultBlob(record.sourceUrl, 'video', { signal: options.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Coupled to the literal error message thrown by fetchResultBlob() in
      // lib/gallery/capture.ts ('Result could not be fetched') when
      // `!response.ok`. That file is off-limits for this task, so a string
      // match is the only way to tell "the provider deleted it" (expired)
      // apart from "the network failed" (unreachable). See
      // tests/timeline/acquire.test.ts, "stays coupled to capture.ts's error
      // message", which fails loudly if that message ever changes.
      return unavailable(/not be fetched/.test(String(error)) ? 'expired' : 'unreachable');
    }

    // The poster is the *last* frame, matching what GalleryGrid's Keep stores —
    // "Use as reference" depends on it being the end of the clip.
    const poster = await extractLastFrameFromBlob(blob).catch(() => undefined);
    await store.keep(recordId, blob, poster);
    const durable = isPersisted(recordId);
    const { dimensions, ...facts } = await probeFor(recordId, blob);
    // Nothing was written to IndexedDB on this path, so the bytes really do
    // exist only in this tab's memory.
    return ready(blob, dimensions, facts, durable, UNSAVED_WARNING);
  }

  return unavailable('no-source');
}

/** Bounded fan-out so a multi-select neither spikes memory nor hammers the CDN. */
export async function acquireAll(
  recordIds: string[],
  options: { signal?: AbortSignal } = {}
): Promise<Array<ClipMedia | Unavailable>> {
  const results: Array<ClipMedia | Unavailable> = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < recordIds.length) {
      const index = cursor++;
      results[index] = await acquireClipMedia(recordIds[index], options);
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, recordIds.length) }, worker));
  return results;
}
