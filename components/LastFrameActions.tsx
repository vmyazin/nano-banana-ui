'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, ImageDown, Loader2 } from 'lucide-react';

import { extractLastFrame, FRAME_EXTRACTION_ERROR, lastFrameFilename } from '@/lib/video-frame';

interface LastFrameActionsProps {
  videoUrl: string;
  /** Slug the clip was named with; the frame is saved alongside it. */
  filenameBase: string;
}

const COPY_UNSUPPORTED = 'This browser cannot copy images to the clipboard.';

/** Image clipboard writes need a secure context, and PNG is the only safe type. */
function canCopyImages() {
  return typeof ClipboardItem !== 'undefined' && typeof navigator?.clipboard?.write === 'function';
}

/**
 * Save or copy the closing frame of a finished clip. Extraction is cached per
 * URL so using both buttons, or retrying, refetches nothing.
 */
export default function LastFrameActions({ videoUrl, filenameBase }: LastFrameActionsProps) {
  const [pending, setPending] = useState<'save' | 'copy' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Safe to detect during render: this only mounts once a job has finished in
  // the browser, so it is never part of the server-rendered HTML.
  const [copySupported] = useState(canCopyImages);
  const frameRef = useRef<{ url: string; blob: Blob } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureFrame = async () => {
    if (frameRef.current?.url === videoUrl) return frameRef.current.blob;
    const blob = await extractLastFrame(videoUrl);
    frameRef.current = { url: videoUrl, blob };
    return blob;
  };

  const run = async (action: 'save' | 'copy', task: () => Promise<void>) => {
    if (pending) return;
    setPending(action);
    setError(null);
    setCopied(false);
    try {
      await task();
      if (action === 'copy' && mountedRef.current) setCopied(true);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(caught instanceof Error && caught.message ? caught.message : FRAME_EXTRACTION_ERROR);
    } finally {
      if (mountedRef.current) setPending(null);
    }
  };

  const save = () =>
    run('save', async () => {
      const blob = await ensureFrame();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = lastFrameFilename(filenameBase);
        link.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    });

  const copy = () =>
    run('copy', async () => {
      if (!canCopyImages()) throw new Error(COPY_UNSUPPORTED);
      // Safari only honours a write started in the gesture's task, so it gets the
      // pending extraction rather than an awaited blob.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': ensureFrame() })]);
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending !== null}
          className="btn-secondary flex flex-1 items-center justify-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === 'save' ? <Loader2 className="animate-spin" size={15} /> : <ImageDown size={15} />}
          {pending === 'save' ? 'Reading frame…' : 'Save last frame'}
        </button>
        {copySupported && (
          <button
            type="button"
            onClick={() => void copy()}
            disabled={pending !== null}
            className="btn-secondary flex flex-1 items-center justify-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === 'copy' ? (
              <Loader2 className="animate-spin" size={15} />
            ) : copied ? (
              <Check size={15} className="text-emerald-400" />
            ) : (
              <Clipboard size={15} />
            )}
            {pending === 'copy' ? 'Reading frame…' : copied ? 'Copied' : 'Copy last frame'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
