'use client';

import { useEffect, useMemo } from 'react';
import { Plus, Video } from 'lucide-react';

import type { GalleryRecord } from '@/lib/gallery/storage';

interface TimelineClipDrawerProps {
  records: GalleryRecord[];
  onAdd: (recordId: string) => void;
}

function titleOf(record: GalleryRecord) {
  return record.slug?.replace(/-/g, ' ') || record.prompt || 'Untitled result';
}

/**
 * Object URLs for whatever poster (or, lacking one, source) each video record
 * can show, revoked when the set changes. Mirrors GalleryGrid's own preview
 * hook — that one is not exported, so this is a small, deliberate duplicate
 * rather than a reach into a component this feature must not import from.
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

/**
 * The library rail: every video result, newest first, each with an Add button
 * that places it on the timeline. Copies GalleryGrid's card treatment rather
 * than importing it (that markup is inline there, not extracted) or reaching
 * for MediaCard, which despite its name is the picker card used elsewhere.
 */
export default function TimelineClipDrawer({ records, onAdd }: TimelineClipDrawerProps) {
  const clips = useMemo(
    () => records.filter((record) => record.kind === 'video').sort((a, b) => b.createdAt - a.createdAt),
    [records]
  );
  const previews = usePreviewUrls(clips);

  return (
    <div className="glass-card space-y-3 p-3.5">
      <div className="flex items-center gap-2">
        <Video size={15} className="text-[var(--neon-purple)]" />
        <h3 className="display text-sm font-semibold">Your clips</h3>
      </div>

      {clips.length === 0 ? (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--foreground-muted)]">
          Generated videos are kept in your library automatically. Nothing yet — make one, then
          come back here to build a sequence.
        </p>
      ) : (
        <ul className="space-y-2">
          {clips.map((record) => {
            const preview = previews.get(record.id);
            return (
              <li
                key={record.id}
                className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)]/60 p-2"
              >
                <div className="flex aspect-video w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40">
                  {preview ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Video size={14} className="text-[var(--foreground-subtle)]" />
                  )}
                </div>
                <p
                  className="min-w-0 flex-1 truncate text-[0.8125rem] text-[var(--foreground)]"
                  title={record.prompt}
                >
                  {titleOf(record)}
                </p>
                <button
                  type="button"
                  onClick={() => onAdd(record.id)}
                  aria-label={`Add ${titleOf(record)} to the timeline`}
                  className="btn-secondary shrink-0 gap-1 px-2 py-1 text-xs"
                >
                  <Plus size={13} /> Add
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
