import { MAX_REMOTE_VIDEO_BYTES } from '@/lib/media-download';
import { extractLastFrameFromBlob, isVideoFile } from '@/lib/video-frame';
import { isPersisted, persistenceWarning, UNSAVED_WARNING } from '@/lib/timeline/acquire';
import type { ClipDimensions } from '@/lib/timeline/derive-output';
import { probeDimensions } from '@/lib/timeline/probe';
import { useGalleryStore } from '@/store/useGalleryStore';

/**
 * Putting the bytes back into a record whose provider URL has died.
 *
 * fal expires outputs after seven days and Kie calls its URLs temporary, so a
 * result the user never explicitly kept becomes unrecoverable from our side.
 * They usually still have the download on disk, which makes this the one repair
 * the app can offer: take the file back and re-fill the existing record, so the
 * prompt, model, settings and slug it was generated with all survive. Creating
 * a *new* record from a local file is a different feature and is deliberately
 * not this one.
 */

export type RepairRejection = 'missing' | 'not-video' | 'empty' | 'too-large' | 'unreadable';

export interface RepairRejected {
  status: 'rejected';
  reason: RepairRejection;
  message: string;
}

export interface RepairSucceeded {
  status: 'repaired';
  dimensions: ClipDimensions;
  /** Same meaning as on `ClipMedia`: confirmed pinned and holding bytes. */
  durable: boolean;
  /** Why `durable` is false, when it is. */
  warning?: string;
  /**
   * Set when the file's shape differs from what the record remembered, so the
   * user can notice they grabbed the wrong export. Never blocks: a re-encode
   * legitimately differs, and a record that was never probed has nothing to
   * compare against, so refusing on a mismatch would reject correct files more
   * often than wrong ones.
   */
  mismatch?: string;
}

export type RepairResult = RepairSucceeded | RepairRejected;

const MESSAGES: Record<RepairRejection, string> = {
  missing: 'This clip is no longer in your library.',
  'not-video': 'That is not a video file.',
  empty: 'That file is empty.',
  'too-large': 'That file is larger than this app will store.',
  unreadable: 'This browser could not read that video file.',
};

const rejected = (reason: RepairRejection): RepairRejected => ({
  status: 'rejected',
  reason,
  message: MESSAGES[reason],
});

/** Below this, two durations are the same clip re-encoded rather than a different one. */
const DURATION_TOLERANCE_SECONDS = 0.5;

function describeMismatch(record: { width?: number; height?: number; durationSeconds?: number }, probed: ClipDimensions) {
  const sizeKnown = Boolean(record.width && record.height);
  const sizeDiffers = sizeKnown && (record.width !== probed.width || record.height !== probed.height);

  const durationKnown = typeof record.durationSeconds === 'number' && record.durationSeconds > 0;
  const durationDiffers =
    durationKnown &&
    Math.abs((record.durationSeconds as number) - probed.durationSeconds) > DURATION_TOLERANCE_SECONDS;

  if (!sizeDiffers && !durationDiffers) return undefined;

  const was = [
    sizeKnown ? `${record.width}x${record.height}` : null,
    durationKnown ? `${(record.durationSeconds as number).toFixed(1)}s` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const now = `${probed.width}x${probed.height} · ${probed.durationSeconds.toFixed(1)}s`;

  return `This file is ${now}; the clip was ${was}. Using it anyway.`;
}

/**
 * Re-fill an existing gallery record from a file the user still has.
 *
 * Deliberately mirrors `acquireClipMedia`'s ending: `keep` stores the bytes and
 * pins in one call but swallows storage failures internally, so success is
 * confirmed by re-reading the store rather than by the call not throwing.
 */
export async function repairRecordFromFile(recordId: string, file: File): Promise<RepairResult> {
  const store = useGalleryStore.getState();
  const record = store.records.find((candidate) => candidate.id === recordId);
  if (!record) return rejected('missing');

  if (!isVideoFile(file)) return rejected('not-video');
  if (file.size === 0) return rejected('empty');
  if (file.size > MAX_REMOTE_VIDEO_BYTES) return rejected('too-large');

  let probed: ClipDimensions;
  try {
    probed = await probeDimensions(file);
  } catch {
    return rejected('unreadable');
  }
  // A file the browser opens but reports no dimensions for is not usable either,
  // and reaches the encoder as a 0x0 frame if we let it through.
  if (!probed.width || !probed.height) return rejected('unreadable');

  const mismatch = describeMismatch(record, probed);

  // Best effort, exactly as `GalleryGrid`'s own Keep does it — a poster that
  // cannot be extracted is worth less than the repair itself.
  const poster = await extractLastFrameFromBlob(file).catch(() => undefined);
  await store.keep(recordId, file, poster);
  await useGalleryStore.getState().setDimensions(recordId, probed);

  const durable = isPersisted(recordId);
  const result: RepairSucceeded = { status: 'repaired', dimensions: probed, durable };
  if (!durable) result.warning = persistenceWarning(UNSAVED_WARNING);
  if (mismatch) result.mismatch = mismatch;
  return result;
}
