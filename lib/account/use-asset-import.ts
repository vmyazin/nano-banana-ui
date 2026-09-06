'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  AccountAssetImportError,
  accountImportClientId,
  importGalleryRecord,
  isImportableGalleryRecord,
  startNewAccountImportAttempt,
} from '@/lib/account/import';
import type { GalleryRecord } from '@/lib/gallery/storage';
import { useAccountStore } from '@/store/useAccountStore';
import { useGalleryStore } from '@/store/useGalleryStore';

export type ImportItemStatus = 'ready' | 'uploading' | 'imported' | 'error';

export function importRecordTitle(record: GalleryRecord) {
  return record.slug?.replaceAll('-', ' ') || record.prompt || `${record.kind} result`;
}

/**
 * The browser → cloud transfer, separated from whatever renders it.
 *
 * The loop and its guards used to live inside the panel that drew the list. The
 * picker dialog replaced that list, and moving this wholesale rather than
 * rewriting it keeps the parts that are easy to get wrong and were paid for
 * once already: the stable per-file client id that makes a retry idempotent,
 * the terminal-failure restart, and the owner/epoch check between every file so
 * a session change mid-transfer stops the batch instead of writing one
 * account's bytes into another's library.
 */
export function useBrowserAssetImport(ownerId: string, onImported?: () => void) {
  const records = useGalleryStore(state => state.records);
  const hydrated = useGalleryStore(state => state.hydrated);
  const epoch = useAccountStore(state => state.epoch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, ImportItemStatus>>({});
  const [restartable, setRestartable] = useState<Set<string>>(new Set());
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [batchSize, setBatchSize] = useState(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    void useGalleryStore.getState().hydrate();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    controller.current?.abort();
    running.current = false;
  }, [ownerId, epoch]);

  const eligible = useMemo(() => records.filter(isImportableGalleryRecord), [records]);
  const busy = busyScope === `${ownerId}:${epoch}`;
  const hasLinkOnly = records.some(record => !record.blob && Boolean(record.sourceUrl));
  const selectedBytes = eligible.reduce(
    (total, record) => total + (selected.has(record.id) && statuses[record.id] !== 'imported' ? record.blob.size : 0),
    0
  );
  const selectedCount = eligible.reduce(
    (total, record) => total + (selected.has(record.id) && statuses[record.id] !== 'imported' ? 1 : 0),
    0
  );

  function identityMatches(capturedEpoch: number) {
    const account = useAccountStore.getState();
    return mounted.current && account.epoch === capturedEpoch && account.session?.account?.id === ownerId;
  }

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setError(null);
  }

  function selectAll(ids: string[]) {
    setSelected(new Set(ids));
    setError(null);
  }

  function clearSelection() {
    setSelected(new Set());
    setError(null);
  }

  function restart(record: GalleryRecord) {
    const attempt = startNewAccountImportAttempt(ownerId, record.id);
    setRestartable(current => {
      const next = new Set(current);
      next.delete(record.id);
      return next;
    });
    setStatuses(current => ({ ...current, [record.id]: 'ready' }));
    setSelected(current => new Set(current).add(record.id));
    setError(attempt.persisted ? null : 'This new attempt is ready, but this browser could not save it for resume after a reload. Keep this tab open and retry here if needed.');
  }

  /** Stops the batch after the file in flight; finished files stay imported. */
  function cancel() {
    controller.current?.abort();
  }

  async function submit() {
    if (running.current) return;
    running.current = true;
    const capturedEpoch = useAccountStore.getState().epoch;
    setBusyScope(`${ownerId}:${capturedEpoch}`);
    const abortController = new AbortController();
    controller.current = abortController;
    setError(null);
    setNotice(null);
    let completed = 0;
    let failed = 0;
    let terminalFailure = false;
    const batch = eligible.filter(item => selected.has(item.id) && statuses[item.id] !== 'imported');
    setBatchSize(batch.length);
    setCompletedCount(0);
    try {
      for (const record of batch) {
        if (!identityMatches(capturedEpoch) || abortController.signal.aborted) break;
        setStatuses(current => ({ ...current, [record.id]: 'uploading' }));
        try {
          await importGalleryRecord(
            record,
            ownerId,
            capturedEpoch,
            abortController.signal,
            accountImportClientId(ownerId, record.id)
          );
          if (!identityMatches(capturedEpoch)) break;
          completed += 1;
          setCompletedCount(completed);
          setStatuses(current => ({ ...current, [record.id]: 'imported' }));
          setSelected(current => {
            const next = new Set(current);
            next.delete(record.id);
            return next;
          });
        } catch (reason) {
          if (!identityMatches(capturedEpoch) || abortController.signal.aborted) break;
          failed += 1;
          setStatuses(current => ({ ...current, [record.id]: 'error' }));
          if (reason instanceof AccountAssetImportError && reason.reason === 'terminal') {
            terminalFailure = true;
            setRestartable(current => new Set(current).add(record.id));
            setError('An earlier import expired or was cancelled. A new import attempt is needed for that file.');
          }
        }
      }
      if (identityMatches(capturedEpoch)) {
        if (completed > 0) {
          setNotice(`${completed} ${completed === 1 ? 'asset' : 'assets'} imported. The originals remain on this device.`);
          onImported?.();
        }
        if (failed > 0 && !terminalFailure) setError('Some files could not be imported. Retry the selected files.');
      }
    } finally {
      if (controller.current === abortController) controller.current = null;
      running.current = false;
      if (mounted.current) setBusyScope(null);
    }
  }

  return {
    eligible, hydrated, hasLinkOnly, selected, statuses, restartable,
    busy, error, notice, selectedBytes, selectedCount, completedCount, batchSize,
    toggle, selectAll, clearSelection, restart, submit, cancel,
  };
}
