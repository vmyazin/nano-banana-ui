'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { filesFromDataTransfer } from '@/lib/drop/dropped-sources';

interface UseFileDropOptions {
  /** Receives the dropped files, and applies the zone's own limits and MIME rules. */
  onFiles: (files: File[]) => void | Promise<void>;
  /** Surfaces "nothing usable in this drop" through the zone's existing error slot. */
  onError?: (message: string) => void;
  disabled?: boolean;
}

export interface FileDropProps {
  onDragEnter: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

/** A drag carrying files or a URL — as opposed to a text selection from the page itself. */
function carriesSource(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types ?? []);
  return types.some(
    (type) => type === 'Files' || type === 'text/uri-list' || type === 'text/html' || type === 'text/plain'
  );
}

/**
 * Drop-target plumbing shared by every image source picker.
 *
 * Two things here are less obvious than they look. `dragover` must call preventDefault on
 * every event or the browser refuses the drop and navigates to the dragged file instead.
 * And dragenter/dragleave fire once per child element crossed, so the highlight is driven
 * by a depth counter rather than a boolean, which would flicker over the zone's own icon
 * and label.
 */
export function useFileDrop({ onFiles, onError, disabled = false }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const depthRef = useRef(0);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !carriesSource(event.dataTransfer)) return;
      event.preventDefault();
      depthRef.current += 1;
      setIsDragging(true);
    },
    [disabled]
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !carriesSource(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [disabled]
  );

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (disabled) return;
      event.preventDefault();
      depthRef.current = 0;
      setIsDragging(false);

      const { dataTransfer } = event;
      if (!dataTransfer) return;

      // A URL drop needs a round trip through the proxy; a file drop resolves immediately.
      const needsFetch = (dataTransfer.files?.length ?? 0) === 0;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (needsFetch) setIsFetching(true);

      void filesFromDataTransfer(dataTransfer, { signal: controller.signal })
        .then(async ({ files, error }) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          if (error) {
            onError?.(error);
            return;
          }
          if (files.length > 0) await onFiles(files);
        })
        .finally(() => {
          if (mountedRef.current && needsFetch) setIsFetching(false);
        });
    },
    [disabled, onError, onFiles]
  );

  const dropProps: FileDropProps = { onDragEnter, onDragOver, onDragLeave, onDrop };

  // Derived rather than reset in an effect: a zone that fills up mid-drag (the second
  // frame lands, the max is reached) must drop its highlight on the same render.
  return { isDragging: isDragging && !disabled, isFetching, dropProps };
}
