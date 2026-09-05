'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SpendEntry } from '@/lib/spend/ledger';
import { useAccountStore } from '@/store/useAccountStore';
import { accountRequest } from './client';

interface SpendPageResponse {
  accountId: string;
  entries: SpendEntry[];
  nextCursor: string | null;
}

interface SpendState {
  scope: string;
  entries: SpendEntry[];
  nextCursor: string | null;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
}

const message = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Could not load account spend.';

/** Account spend stays in component memory and is discarded whenever owner or epoch changes. */
export function useAccountSpend(ownerId: string) {
  const epoch = useAccountStore((state) => state.epoch);
  const scope = `${ownerId}:${epoch}`;
  const [state, setState] = useState<SpendState>({
    scope,
    entries: [],
    nextCursor: null,
    loading: true,
    loadingOlder: false,
    error: null,
  });
  const controllers = useRef(new Set<AbortController>());
  const running = useRef<Promise<void> | null>(null);
  const canAutoRefresh = useRef(true);
  const mutationRevision = useRef(0);

  const current = useCallback((signal?: AbortSignal) => {
    const account = useAccountStore.getState();
    return !signal?.aborted && account.epoch === epoch && account.session?.account?.id === ownerId;
  }, [epoch, ownerId]);

  const read = useCallback((cursor: string | null, append: boolean) => {
    if (running.current) return running.current;
    const controller = new AbortController();
    const startedAtRevision = mutationRevision.current;
    controllers.current.add(controller);
    setState((previous) => previous.scope === scope
      ? { ...previous, loading: !append, loadingOlder: append, error: null }
      : { scope, entries: [], nextCursor: null, loading: !append, loadingOlder: append, error: null });

    const path = `spend${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
    const operation = accountRequest<SpendPageResponse>(path, {
      signal: controller.signal,
      headers: { 'X-Account-Id': ownerId },
    }).then((response) => {
      if (!current(controller.signal)) return;
      if (startedAtRevision !== mutationRevision.current) {
        setState((previous) => previous.scope === scope
          ? { ...previous, loading: false, loadingOlder: false }
          : previous);
        return;
      }
      if (response.accountId !== ownerId) {
        setState((previous) => previous.scope === scope
          ? { ...previous, loading: false, loadingOlder: false, error: 'Account spend returned for a different account.' }
          : previous);
        return;
      }
      setState((previous) => {
        if (previous.scope !== scope) return previous;
        const combined = append ? [...previous.entries, ...response.entries] : response.entries;
        const entries = [...new Map(combined.map((entry) => [entry.id, entry])).values()];
        return { ...previous, entries, nextCursor: response.nextCursor, loading: false, loadingOlder: false, error: null };
      });
    }).catch((error) => {
      if (!current(controller.signal) || startedAtRevision !== mutationRevision.current) return;
      setState((previous) => previous.scope === scope
        ? { ...previous, loading: false, loadingOlder: false, error: message(error) }
        : previous);
    }).finally(() => {
      controllers.current.delete(controller);
      if (running.current === operation) running.current = null;
    });
    running.current = operation;
    return operation;
  }, [current, ownerId, scope]);

  const refresh = useCallback(() => read(null, false), [read]);

  useEffect(() => {
    const activeControllers = controllers.current;
    canAutoRefresh.current = true;
    setState({ scope, entries: [], nextCursor: null, loading: true, loadingOlder: false, error: null });
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible' && canAutoRefresh.current) void refresh();
    };
    const timer = window.setInterval(refreshVisible, 15_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
      running.current = null;
    };
  }, [refresh, scope]);

  const visible = state.scope === scope;
  const entries = visible ? state.entries : [];
  const nextCursor = visible ? state.nextCursor : null;

  const loadOlder = useCallback(() => {
    if (!nextCursor) return Promise.resolve();
    canAutoRefresh.current = false;
    return read(nextCursor, true);
  }, [nextCursor, read]);

  const remove = useCallback(async (id: string) => {
    if (!current()) return;
    mutationRevision.current += 1;
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      await accountRequest(`spend/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        signal: controller.signal,
        headers: { 'X-Account-Id': ownerId },
      });
      if (!current(controller.signal)) return;
      setState((previous) => previous.scope === scope
        ? { ...previous, entries: previous.entries.filter((entry) => entry.id !== id), error: null }
        : previous);
    } catch (error) {
      if (current(controller.signal)) setState((previous) => previous.scope === scope ? { ...previous, error: message(error) } : previous);
    } finally {
      controllers.current.delete(controller);
    }
  }, [current, ownerId, scope]);

  const clear = useCallback(async () => {
    if (!current()) return;
    mutationRevision.current += 1;
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      await accountRequest('spend/all', {
        method: 'DELETE',
        signal: controller.signal,
        headers: { 'X-Account-Id': ownerId },
      });
      if (!current(controller.signal)) return;
      setState((previous) => previous.scope === scope
        ? { ...previous, entries: [], nextCursor: null, error: null }
        : previous);
    } catch (error) {
      if (current(controller.signal)) setState((previous) => previous.scope === scope ? { ...previous, error: message(error) } : previous);
    } finally {
      controllers.current.delete(controller);
    }
  }, [current, ownerId, scope]);

  return {
    entries,
    loading: !visible || state.loading,
    loadingOlder: visible && state.loadingOlder,
    error: visible ? state.error : null,
    hasOlder: Boolean(nextCursor),
    refresh,
    loadOlder,
    remove,
    clear,
  };
}
