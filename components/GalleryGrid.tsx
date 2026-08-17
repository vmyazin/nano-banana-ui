'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, ImageDown, Loader2, Pin, PinOff, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { fetchResultBlob } from '@/lib/gallery/capture';
import { hasBytes, type GalleryRecord } from '@/lib/gallery/storage';
import { downloadRemoteMedia, extensionForMedia, fallbackFilenameBase } from '@/lib/media-download';
import { extractLastFrameFromBlob } from '@/lib/video-frame';
import { LOCAL_PROVIDER } from '@/lib/timeline/import-local';
import RecoverMediaDropZone from '@/components/RecoverMediaDropZone';
import { useDraftStore } from '@/store/useDraftStore';
import { useGalleryStore } from '@/store/useGalleryStore';

/** Generous ceiling; the workspace trims to its own model's limit on mount. */
const REFERENCE_LIMIT = 8;

function titleOf(record: GalleryRecord) {
  return record.slug?.replace(/-/g, ' ') || record.prompt || 'Untitled result';
}

/**
 * Object URLs for whatever bytes each record holds, revoked when the set
 * changes. The gallery store owns the Blobs; this owns only the URLs made to
 * display them.
 */
function usePreviewUrls(records: GalleryRecord[]) {
  const previews = useMemo(() => {
    const entries = new Map<string, string>();
    for (const record of records) {
      const blob = record.posterBlob ?? record.blob;
      if (blob) entries.set(record.id, URL.createObjectURL(blob));
    }
    return entries;
  }, [records]);

  useEffect(() => {
    return () => {
      for (const url of previews.values()) URL.revokeObjectURL(url);
    };
  }, [previews]);

  return previews;
}

export default function GalleryGrid({ onUsedReference }: { onUsedReference?: () => void }) {
  const records = useGalleryStore((state) => state.records);
  const previews = usePreviewUrls(records);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * Video records whose Keep failed because the provider URL is dead. Repair is
   * offered here rather than on every unkept video: most video records have no
   * bytes yet simply because nobody asked to keep them, and a permanent
   * "replace file" affordance on all of them would be noise. A failed download
   * is the moment the user actually learns the file is gone.
   */
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());

  if (records.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--foreground-muted)]">
        Generated results are kept here automatically. Nothing yet.
      </p>
    );
  }

  const keep = async (record: GalleryRecord) => {
    if (!record.sourceUrl) return;
    setBusyId(record.id);
    try {
      // One download yields both artefacts: the clip and a still from its end.
      const blob = await fetchResultBlob(record.sourceUrl, record.kind);
      const poster =
        record.kind === 'video'
          ? await extractLastFrameFromBlob(blob).catch(() => undefined)
          : undefined;
      await useGalleryStore.getState().keep(record.id, blob, poster);
      setExpiredIds((prev) => {
        if (!prev.has(record.id)) return prev;
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
      toast.success('Pinned');
    } catch {
      if (record.kind === 'video') {
        setExpiredIds((prev) => new Set(prev).add(record.id));
        toast.error('That clip’s source is gone. You can restore it from your own copy.');
      } else {
        toast.error('This result is no longer available to keep.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const sendAsReference = async (record: GalleryRecord) => {
    // A clip's poster stands in for it, since a video is not a reference image.
    const blob = record.posterBlob ?? (record.kind === 'image' ? record.blob : undefined);
    if (!blob) {
      toast.error('Keep this clip first so its frame can be used.');
      return;
    }
    const base = record.slug || fallbackFilenameBase(record.prompt, 'image');
    useDraftStore
      .getState()
      .addReferences(
        [{ file: new File([blob], `${base}.png`, { type: blob.type || 'image/png' }), sourceLabel: `From ${titleOf(record)}` }],
        REFERENCE_LIMIT
      );
    toast.success('Added as a reference');
    onUsedReference?.();
  };

  const restore = (record: GalleryRecord) => {
    const draft = useDraftStore.getState();
    draft.setPrompt(record.prompt);
    // Replayed through the same guard as a provider switch, so a control the
    // current model cannot express falls back to its default.
    draft.rememberControlValues(record.controlValues);
    toast.success('Prompt and settings restored');
    onUsedReference?.();
  };

  const download = async (record: GalleryRecord) => {
    const base = record.slug || fallbackFilenameBase(record.prompt, record.kind);
    if (record.blob) {
      const url = URL.createObjectURL(record.blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${base}.${extensionForMedia(record.kind, record.mimeType)}`;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      return;
    }
    if (record.sourceUrl) {
      await downloadRemoteMedia({
        url: record.sourceUrl,
        mediaType: record.kind,
        filenameBase: base,
        mimeType: record.mimeType,
      });
    }
  };

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {records.map((record) => {
        const preview = previews.get(record.id);
        const stored = hasBytes(record);
        const busy = busyId === record.id;

        return (
          <li
            key={record.id}
            className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--background-elevated)]/60 p-3"
          >
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black/40">
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview} alt={titleOf(record)} className="h-full w-full object-contain" />
              ) : record.kind === 'video' && record.sourceUrl ? (
                <video src={record.sourceUrl} controls preload="metadata" className="h-full w-full" />
              ) : (
                <p className="px-4 text-center text-xs text-[var(--foreground-subtle)]">
                  This result was not kept and its provider link has expired.
                </p>
              )}
            </div>

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--foreground)]" title={record.prompt}>
                  {titleOf(record)}
                </p>
                <p className="text-[0.65rem] uppercase tracking-wide text-[var(--foreground-subtle)]">
                  {record.provider} · {record.kind}
                  {stored ? '' : ' · link only'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void useGalleryStore.getState().setPinned(record.id, !record.pinned)}
                aria-label={record.pinned ? 'Unpin result' : 'Pin result'}
                title={record.pinned ? 'Unpin' : 'Pin to keep when storage fills'}
                className="shrink-0 rounded-md border border-[var(--border)] p-1.5 text-[var(--foreground-muted)] hover:text-[var(--neon-cyan)]"
              >
                {record.pinned ? <Pin size={13} /> : <PinOff size={13} />}
              </button>
            </div>

            {expiredIds.has(record.id) && (
              <RecoverMediaDropZone
                recordId={record.id}
                onRepaired={() =>
                  setExpiredIds((prev) => {
                    const next = new Set(prev);
                    next.delete(record.id);
                    return next;
                  })
                }
              />
            )}

            <div className="flex flex-wrap gap-1.5">
              {!stored && record.sourceUrl && (
                <button
                  type="button"
                  onClick={() => void keep(record)}
                  disabled={busy}
                  className="btn-secondary flex items-center gap-1.5 px-2 py-1 text-xs disabled:opacity-50"
                >
                  {busy ? <Loader2 className="animate-spin" size={13} /> : <ImageDown size={13} />}
                  {busy ? 'Keeping…' : 'Keep'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void sendAsReference(record)}
                className="btn-secondary flex items-center gap-1.5 px-2 py-1 text-xs"
              >
                <ImageDown size={13} /> Use as reference
              </button>
              {/* An imported clip was never generated, so it carries no prompt
                  or settings to replay — offering the action would be a button
                  that silently does nothing. */}
              {record.provider !== LOCAL_PROVIDER && (
                <button
                  type="button"
                  onClick={() => restore(record)}
                  className="btn-secondary flex items-center gap-1.5 px-2 py-1 text-xs"
                >
                  <Wand2 size={13} /> Restore settings
                </button>
              )}
              <button
                type="button"
                onClick={() => void download(record)}
                aria-label={`Download ${titleOf(record)}`}
                className="btn-secondary px-2 py-1 text-xs"
              >
                <Download size={13} />
              </button>
              <button
                type="button"
                onClick={() => void useGalleryStore.getState().remove(record.id)}
                aria-label={`Remove ${titleOf(record)}`}
                className="btn-secondary px-2 py-1 text-xs"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
