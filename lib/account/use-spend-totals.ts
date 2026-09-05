'use client';

import { useEffect, useState } from 'react';

import type { SpendTotals } from '@/lib/spend/rollup';
import { useAccountStore } from '@/store/useAccountStore';
import { accountRequest } from './client';

/**
 * All-time spend totals for the account rail.
 *
 * Deliberately not `useAccountSpend`: that hook pages the ledger fifty entries
 * at a time for the report, and summing what it happens to have loaded would
 * quietly under-report any account past its first page. The Worker reduces the
 * whole ledger instead and returns one object.
 *
 * Totals are memory-only and scoped to owner + epoch, like every other account
 * read, so a session change can never leave one account's figure on screen
 * under another account's name.
 */
export function useAccountSpendTotals(ownerId: string) {
  const epoch = useAccountStore(state => state.epoch);
  const scope = `${ownerId}:${epoch}`;
  const [state, setState] = useState<{ scope: string; totals: SpendTotals | null; error: string | null }>({ scope, totals: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    // No synchronous reset here: `visible` below already withholds a previous
    // owner's figure, so clearing state in the effect body would only add a
    // cascading render on every scope change.
    accountRequest<{ accountId: string; totals: SpendTotals }>('spend/totals', {
      signal: controller.signal,
      headers: { 'X-Account-Id': ownerId },
    })
      .then(response => {
        if (controller.signal.aborted || response.accountId !== ownerId) return;
        setState({ scope, totals: response.totals, error: null });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setState({ scope, totals: null, error: error instanceof Error && error.message ? error.message : 'Could not load spend.' });
      });
    return () => controller.abort();
  }, [ownerId, scope]);

  const visible = state.scope === scope;
  return { totals: visible ? state.totals : null, error: visible ? state.error : null };
}
