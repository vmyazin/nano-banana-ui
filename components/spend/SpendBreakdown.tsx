import ProviderLogo from '@/components/ProviderLogo';
import { formatUsdTotal } from '@/lib/spend/format';
import type { SpendRow } from '@/lib/spend/rollup';

export default function SpendBreakdown({ title, rows }: { title: string; rows: SpendRow[] }) {
  const max = Math.max(...rows.map((row) => row.costUsd), 0);
  return (
    <section className="glass-card p-3.5 md:p-4">
      <h2 className="field-label mb-2">{title}</h2>
      <table aria-label={title} className="w-full text-sm">
        <thead className="sr-only">
          <tr><th>Name</th><th>Runs</th><th>Cost</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[var(--border)]">
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  {row.provider && row.provider !== 'micro-ai' && <ProviderLogo provider={row.provider} size={13} />}
                  <span className="truncate">{row.label}</span>
                </div>
                <div className="mt-1 h-1 rounded bg-[var(--background-elevated)]">
                  <div className="h-1 rounded bg-[var(--neon-cyan)]" style={{ width: max > 0 ? `${(row.costUsd / max) * 100}%` : 0 }} />
                </div>
              </td>
              <td className="py-2 pr-2 text-right font-mono text-[var(--foreground-muted)]">{row.runs}</td>
              <td className="py-2 text-right font-mono">{formatUsdTotal(row.costUsd)}{row.unknownRuns > 0 ? '*' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((row) => row.unknownRuns > 0) && <p className="field-hint mt-2">* includes runs that could not be priced.</p>}
    </section>
  );
}
