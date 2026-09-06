'use client';

import { useEffect } from 'react';

import SpendReport from '@/components/spend/SpendReport';
import { useAccountSpend } from '@/lib/account/use-spend';
import type { SpendRange } from '@/lib/spend/rollup';

export default function AccountSpend({ ownerId, range, now, onClearRequest, onEmptyChange }: {
  ownerId: string;
  range: SpendRange;
  now: number;
  onClearRequest: (clear: () => Promise<void>) => void;
  /** Reports whether the account has any records at all, so the page can hide range controls that have nothing to filter. */
  onEmptyChange?: (empty: boolean) => void;
}) {
  const spend = useAccountSpend(ownerId);
  const empty = spend.entries.length === 0;
  useEffect(() => { onEmptyChange?.(empty); }, [empty, onEmptyChange]);
  return (
    <SpendReport
      source="account"
      entries={spend.entries}
      range={range}
      now={now}
      loading={spend.loading}
      loadingOlder={spend.loadingOlder}
      error={spend.error}
      hasOlder={spend.hasOlder}
      onRetry={() => void spend.refresh()}
      onLoadOlder={() => void spend.loadOlder()}
      onRemove={spend.remove}
      onClearRequest={() => onClearRequest(spend.clear)}
    />
  );
}
