'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Video } from 'lucide-react';

import { useFileDrop } from '@/lib/drop/use-file-drop';
import type { GalleryRecord } from '@/lib/gallery/storage';
import { importLocalVideos } from '@/lib/timeline/import-local';
import { posterImage } from '@/lib/timeline/poster';

interface TimelineClipDrawerProps {
  records: GalleryRecord[];
  onAdd: (recordId: string) => void;
  onDelete: (recordId: string) => void;
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
      const blob = posterImage(record.posterBlob);
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
 * Bringing videos the app never generated into the library.
 *
 * Both a button and a drop target: a drag is the natural gesture for files
 * already sitting in a folder, but it is not discoverable on its own and
 * leaves no path for anyone who would rather browse.
 */
function ImportTile() {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const runImport = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      const results = await importLocalVideos(files);
      // One bad file in a multi-select must not read as a total failure, so
      // each rejection is named rather than collapsed into a single message.
      setErrors(
        results
          .filter((result) => result.status === 'rejected')
          .map((result) => `${result.fileName}: ${result.message}`)
      );
    } finally {
      setBusy(false);
    }
  };

  const { isDragging, dropProps } = useFileDrop({
    onFiles: runImport,
    onError: (message) => setErrors([message]),
    disabled: busy,
  });

  return (
    <div
      {...dropProps}
      data-testid="import-clips"
      className={`rounded-lg border border-dashed transition-colors ${
        isDragging
          ? 'border-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
          : 'border-[var(--border-hover)] bg-[var(--background-elevated)]/40'
      }`}
    >
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center justify-center gap-1.5 p-2.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
      >
        {busy ? (
          <Loader2 size={13} className="shrink-0 animate-spin" />
        ) : (
          <Plus size={13} className="shrink-0" />
        )}
        {busy ? 'Importing…' : 'Add files from your device'}
      </label>

      <input
        id={inputId}
        type="file"
        accept="video/*"
        multiple
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // Reset first, or picking the same file twice in a row fires no
          // change event and the retry looks like it silently did nothing.
          event.target.value = '';
          void runImport(picked);
        }}
      />

      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 px-2.5 pb-2.5">
          {errors.map((message) => (
            <li key={message} className="text-[0.7rem] text-red-300">
              {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The library rail: every video result, newest first, each with compact trash
 * and plus controls that remove the source from Your clips or add a timeline
 * placement. Copies GalleryGrid's card treatment rather than importing it
 * (that markup is inline there, not extracted) or reaching for MediaCard,
 * which despite its name is the picker card used elsewhere.
 */
export default function TimelineClipDrawer({
  records,
  onAdd,
  onDelete,
}: TimelineClipDrawerProps) {
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

      <ImportTile />

      {clips.length === 0 ? (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--foreground-muted)]">
          Generated videos are kept here automatically. Nothing yet — make one, or add a file
          from your device above.
        </p>
      ) : (
        <ul className="space-y-2">
          {clips.map((record) => {
            const preview = previews.get(record.id);
            const title = titleOf(record);
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
                  className="line-clamp-2 min-w-0 flex-1 text-[0.8125rem] leading-snug text-[var(--foreground)]"
                  title={record.prompt}
                >
                  {title}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onDelete(record.id)}
                    aria-label={`Delete ${title} from Your clips`}
                    title={`Delete ${title} from Your clips`}
                    className="btn-secondary size-10 shrink-0 p-0"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdd(record.id)}
                    aria-label={`Add ${title} to the timeline`}
                    title={`Add ${title} to the timeline`}
                    className="btn-secondary size-10 shrink-0 p-0"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
