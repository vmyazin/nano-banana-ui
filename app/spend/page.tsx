'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';

import { BrandWordmark } from '@/components/BrandMark';
import SegmentedToggleGroup from '@/components/SegmentedToggleGroup';
import SpendBreakdown from '@/components/spend/SpendBreakdown';
import SpendDailyChart from '@/components/spend/SpendDailyChart';
import SpendLedger from '@/components/spend/SpendLedger';
import SpendSummary from '@/components/spend/SpendSummary';
import { fetchKieCredits } from '@/lib/kie/browser';
import { providerLabel, type SpendProvider } from '@/lib/spend/ledger';
import { byDay, byModel, byProvider, inRange, isSpendRange, SPEND_RANGES, toCsv, totals } from '@/lib/spend/rollup';
import { useAppStore } from '@/store/useAppStore';
import { useSpendStore } from '@/store/useSpendStore';

function SpendView() {
  const [rangeParam, setRangeParam] = useQueryState('range');
  const range = isSpendRange(rangeParam) ? rangeParam : 'month';

  const entries = useSpendStore((state) => state.entries);
  const hasHydrated = useSpendStore((state) => state.hasHydrated);
  const remove = useSpendStore((state) => state.remove);
  const clear = useSpendStore((state) => state.clear);
  const kieApiKey = useAppStore((state) => state.kieApiKey);

  useEffect(() => {
    useAppStore.persist.rehydrate();
    void useSpendStore.persist.rehydrate();
  }, []);

  // Reset to undefined happens by deriving from kieApiKey below, rather than
  // setting state synchronously in the effect body (react-hooks/set-state-in-effect).
  const [fetchedKieCredits, setFetchedKieCredits] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!kieApiKey) return;
    let cancelled = false;
    void fetchKieCredits(kieApiKey).then((credits) => {
      if (!cancelled) setFetchedKieCredits(credits);
    });
    return () => {
      cancelled = true;
    };
  }, [kieApiKey]);
  const kieCredits = kieApiKey ? fetchedKieCredits : undefined;

  const [providerFilter, setProviderFilter] = useState<SpendProvider | 'all'>('all');
  // Read once per mount rather than during render (react-hooks/purity forbids
  // Date.now() in the render body); day-granularity rollups don't need finer freshness.
  const [now] = useState(() => Date.now());
  const scoped = useMemo(() => inRange(entries, range, now), [entries, range, now]);
  const shown = providerFilter === 'all' ? scoped : scoped.filter((entry) => entry.provider === providerFilter);
  const providersPresent = [...new Set(scoped.map((entry) => entry.provider))];

  const exportCsv = () => {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `scene-assembly-spend-${range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearLedger = () => {
    if (window.confirm('Clear every recorded run from this browser? This cannot be undone.')) clear();
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-clip">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[hsl(var(--tint-hue)_38%_5%/0.72)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3.5 sm:px-8 md:px-12 md:py-4 lg:px-16">
          <Link href="/" aria-label="Go to Scene Assembly home" className="block min-w-0 rounded-lg">
            <BrandWordmark className="h-8 w-auto text-[var(--foreground)] sm:h-9" />
          </Link>
          <Link href="/" className="btn-secondary">Back to studio</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-4 px-6 py-6 sm:px-8 md:px-12 lg:px-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-2xl">Spend</h1>
            <p className="field-hint mt-1">What your generations cost, recorded in this browser. Estimates use published rates.</p>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[22rem]">
            <SegmentedToggleGroup
              label="Range"
              options={SPEND_RANGES}
              value={range}
              onChange={(value) => void setRangeParam(value === 'month' ? null : String(value))}
            />
          </div>
        </div>

        {!hasHydrated ? (
          <div className="flex items-center justify-center py-16">
            <div className="loading-spinner" />
          </div>
        ) : scoped.length === 0 ? (
          <section className="glass-card p-6 text-center">
            <p className="text-[var(--foreground)]">Nothing recorded yet for this range.</p>
            <p className="field-hint mt-2">
              Every finished image, video, and helper task is filed here with its cost. Failed runs are never billed and never listed.
            </p>
            <Link href="/" className="btn-primary mt-4 inline-flex">Open the studio</Link>
          </section>
        ) : (
          <>
            <SpendSummary totals={totals(scoped)} kieCredits={kieCredits} />
            <SpendDailyChart days={byDay(scoped, range, now)} />
            <div className="grid gap-4 md:grid-cols-2">
              <SpendBreakdown title="By provider" rows={byProvider(scoped)} />
              <SpendBreakdown title="By model" rows={byModel(scoped)} />
            </div>
            <section className="glass-card p-3.5 md:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="field-label">Ledger</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="field-hint" htmlFor="spend-provider-filter">Provider</label>
                  <select
                    id="spend-provider-filter"
                    value={providerFilter}
                    onChange={(event) => setProviderFilter(event.target.value as SpendProvider | 'all')}
                  >
                    <option value="all">All</option>
                    {providersPresent.map((provider) => (
                      <option key={provider} value={provider}>{providerLabel(provider)}</option>
                    ))}
                  </select>
                  <button type="button" onClick={exportCsv} className="btn-secondary">Export CSV</button>
                  <button type="button" onClick={clearLedger} className="btn-secondary">Clear ledger</button>
                </div>
              </div>
              <SpendLedger entries={shown} onRemove={remove} />
            </section>
          </>
        )}

        <p className="field-hint text-center">Stored in this browser only. Clearing site data clears the ledger.</p>
      </main>
    </div>
  );
}

export default function SpendPage() {
  // Suspense boundary required because the view reads the URL via nuqs.
  return (
    <Suspense fallback={null}>
      <SpendView />
    </Suspense>
  );
}
