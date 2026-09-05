'use client';

import { CloudUpload, Film, Image as ImageIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ENGINES } from '@/lib/engines/registry';
import { formatAccountBytes } from '@/lib/account/use-library';
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
import { AccountSurface } from './AccountSurface';

type ItemStatus = 'ready' | 'uploading' | 'imported' | 'error';
const labels = new Map<string, string>(ENGINES.map(engine => [engine.id, engine.label]));

function recordTitle(record: GalleryRecord) {
  return record.slug?.replaceAll('-', ' ') || record.prompt || `${record.kind} result`;
}

export default function AccountAssetImport({ ownerId, onImported }: { ownerId: string; onImported?: () => void }) {
  const records = useGalleryStore(state => state.records);
  const hydrated = useGalleryStore(state => state.hydrated);
  const epoch = useAccountStore(state => state.epoch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [restartable, setRestartable] = useState<Set<string>>(new Set());
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  return <AccountSurface label="Import browser assets" className="mt-5">
    <div className="flex items-start gap-3">
      <span className="rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/15 to-violet-400/15 p-2.5 text-cyan-300">
        <CloudUpload size={19} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Import browser assets</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">Choose local files to add to your private cloud library. Originals remain on this device.</p>
      </div>
    </div>
    <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/5 px-4 py-3 text-xs leading-relaxed text-[var(--foreground-muted)]">
      <p>1 GB included, shared with files already in your cloud library.</p>
      <p className="mt-1">Keep this tab open during transfer. Your browser must send these saved bytes.</p>
    </div>
    {!hydrated ? <p role="status" className="mt-5 text-sm text-[var(--foreground-muted)]">Checking this browser for saved files…</p> : eligible.length === 0 ? <p className="mt-5 text-sm text-[var(--foreground-muted)]">No eligible local files are available to import.</p> : <form className="mt-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="sr-only">Browser assets to import</legend>
        {eligible.map(record => {
          const status = statuses[record.id] ?? 'ready';
          const title = recordTitle(record);
          return <div key={record.id} className="rounded-xl border border-[var(--border-hover)] px-4 py-3 transition-colors hover:border-cyan-400/35">
            <label aria-label={`${title}, ${status}`} className="flex min-h-8 items-center gap-3">
            <input type="checkbox" checked={selected.has(record.id)} disabled={status === 'uploading' || status === 'imported' || restartable.has(record.id)} onChange={() => toggle(record.id)} className="size-4 accent-cyan-400" />
            <span className="text-cyan-300">{record.kind === 'image' ? <ImageIcon size={17} aria-hidden="true" /> : <Film size={17} aria-hidden="true" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block text-xs text-[var(--foreground-muted)]">{labels.get(record.provider) ?? record.provider} · {formatAccountBytes(record.blob.size)}</span>
            </span>
            <span className={`text-xs capitalize ${status === 'imported' ? 'text-emerald-300' : status === 'error' ? 'text-red-300' : status === 'uploading' ? 'text-cyan-300' : 'text-[var(--foreground-muted)]'}`}>{status}</span>
            </label>
            {restartable.has(record.id) && <button type="button" className="btn-secondary mt-3 w-full justify-center text-xs" onClick={() => restart(record)}>{`Start new import attempt for ${title}`}</button>}
          </div>;
        })}
      </fieldset>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-[var(--foreground-muted)]">Selected: {formatAccountBytes(selectedBytes)}</span>
        <button type="submit" disabled={busy || selectedBytes === 0} className="btn-primary min-h-11 px-5">{busy ? 'Importing…' : 'Import selected'}</button>
      </div>
    </form>}
    {hasLinkOnly && <p className="mt-4 text-xs leading-relaxed text-[var(--foreground-muted)]">Some videos are links only. Choose Keep in the browser library first so the original file is available to import.</p>}
    {notice && <p role="status" className="mt-4 text-sm text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
  </AccountSurface>;
}
