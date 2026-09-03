import { Cpu, Library as LibraryIcon, Trash2 } from 'lucide-react';

import ProviderLogo from '@/components/ProviderLogo';
import ConfidenceBadge from '@/components/spend/ConfidenceBadge';
import { formatUsd } from '@/lib/spend/format';
import { providerLabel, type SpendEntry } from '@/lib/spend/ledger';

function quantityLabel(entry: SpendEntry): string {
  if (!entry.quantity) return '';
  const { unit, value } = entry.quantity;
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${rounded} ${unit}${value === 1 ? '' : 's'}`;
}

export default function SpendLedger({ entries, onRemove }: { entries: SpendEntry[]; onRemove: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Ledger" className="w-full text-sm">
        <thead>
          <tr className="text-left text-[0.8125rem] text-[var(--foreground-muted)]">
            <th className="py-2 pr-3 font-medium">When</th>
            <th className="py-2 pr-3 font-medium">Provider</th>
            <th className="py-2 pr-3 font-medium">Model</th>
            <th className="py-2 pr-3 font-medium">Kind</th>
            <th className="py-2 pr-3 font-medium">Prompt</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 pr-3 text-right font-medium">Cost</th>
            <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-[var(--border)] align-top">
              <td className="whitespace-nowrap py-2 pr-3 font-mono text-[var(--foreground-muted)]">
                {new Date(entry.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="whitespace-nowrap py-2 pr-3">
                <span className="inline-flex items-center gap-1.5">
                  {entry.provider === 'micro-ai' ? <Cpu size={13} /> : <ProviderLogo provider={entry.provider} size={13} />}
                  {providerLabel(entry.provider)}
                </span>
              </td>
              <td className="max-w-[12rem] truncate py-2 pr-3 font-mono text-[0.8125rem]">{entry.modelId}</td>
              <td className="py-2 pr-3 capitalize">{entry.kind}</td>
              <td className="max-w-[20rem] truncate py-2 pr-3 text-[var(--foreground-muted)]">
                {entry.promptExcerpt}
                {entry.galleryRecordId && <LibraryIcon size={12} className="ml-1 inline" aria-label="In library" />}
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-right font-mono text-[var(--foreground-muted)]">{quantityLabel(entry)}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">
                <span className="mr-2 font-mono">{entry.costUsd === null ? '—' : formatUsd(entry.costUsd)}</span>
                <ConfidenceBadge confidence={entry.confidence} source={entry.source} note={entry.note} />
              </td>
              <td className="py-2 text-right">
                <button type="button" onClick={() => onRemove(entry.id)} aria-label="Remove entry" className="rounded p-1 text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
