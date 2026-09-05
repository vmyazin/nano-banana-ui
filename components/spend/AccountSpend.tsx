'use client';

import SpendReport from '@/components/spend/SpendReport';
import { useAccountSpend } from '@/lib/account/use-spend';
import type { SpendRange } from '@/lib/spend/rollup';

export default function AccountSpend({ ownerId, range, now, onClearRequest }: {
  ownerId: string;
  range: SpendRange;
  now: number;
  onClearRequest: (clear: () => Promise<void>) => void;
}) {
  const spend = useAccountSpend(ownerId);
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
