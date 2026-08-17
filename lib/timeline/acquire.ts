import { fetchResultBlob } from '@/lib/gallery/capture';
import { isDownloadableMediaUrl } from '@/lib/media-download';
import { extractLastFrameFromBlob } from '@/lib/video-frame';
import { probeDimensions } from '@/lib/timeline/probe';
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

const unavailable = (reason: UnavailableReason): Unavailable => ({
  status: 'unavailable',
  reason,
  message: MESSAGES[reason],
});

const UNSAVED_WARNING = 'This clip could not be saved to your library and will not survive a reload.';

/**
 * Whether a record is genuinely safe from eviction right now: pinned *and*
 * holding bytes, re-read fresh from the store rather than inferred from
 * whether `setPinned`/`keep` threw — they never throw outward, they swallow
 * failures and leave `records` untouched instead.
 */
function isPersisted(recordId: string): boolean {
  const record = useGalleryStore.getState().records.find((candidate) => candidate.id === recordId);
  return record?.pinned === true && record?.blob !== undefined;
}

/** The store's own explanation for the failure, when it recorded one. */
function persistenceWarning(): string {
  return useGalleryStore.getState().storageError ?? UNSAVED_WARNING;
}

/**
 * Cached dimensions when we have them, freshly probed otherwise. Old records —
 * anything kept before the timeline existed — have bytes but no dimensions, and
 * without this they would give deriveOutputFormat nothing to vote with.
 */
async function dimensionsFor(recordId: string, blob: Blob): Promise<ClipDimensions> {
  const record = useGalleryStore.getState().records.find((r) => r.id === recordId);
  if (record?.width && record.height) {
    return {
      width: record.width,
      height: record.height,
      durationSeconds: record.durationSeconds ?? 0,
      fps: record.fps,
    };
  }

  const probed = await probeDimensions(blob);
  await useGalleryStore.getState().setDimensions(recordId, probed);
  return probed;
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
    const dimensions = await dimensionsFor(recordId, record.blob);
    return durable
      ? { status: 'ready', blob: record.blob, dimensions, durable: true }
      : { status: 'ready', blob: record.blob, dimensions, durable: false, warning: persistenceWarning() };
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
    const dimensions = await dimensionsFor(recordId, blob);
    return durable
      ? { status: 'ready', blob, dimensions, durable: true }
      : { status: 'ready', blob, dimensions, durable: false, warning: persistenceWarning() };
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
