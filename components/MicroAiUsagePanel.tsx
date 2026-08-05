'use client';

import { Check, Cpu } from 'lucide-react';

import { MICRO_AI_MODELS, PRICING_NOTE } from '@/lib/micro-ai/models';
import { useMicroAiUsageStore } from '@/store/useMicroAiUsageStore';

/** Sub-cent figures round to nothing, so show a floor rather than "$0.0000". */
export function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.0000';
  return cost < 0.0001 ? '<$0.0001' : `$${cost.toFixed(4)}`;
}

/**
 * Read-only telemetry for the shared micro-AI tier that names downloads and
 * writes example prompts. Deliberately not a quota: these numbers inform, they
 * do not gate.
 */
export default function MicroAiUsagePanel() {
  const requests = useMicroAiUsageStore((state) => state.requests);
  const promptTokens = useMicroAiUsageStore((state) => state.promptTokens);
  const completionTokens = useMicroAiUsageStore((state) => state.completionTokens);
  const costUsd = useMicroAiUsageStore((state) => state.costUsd);
  const lastModel = useMicroAiUsageStore((state) => state.lastModel);

  // Nothing is probed on open: the tier proves itself by serving a request, so
  // the badge appears once one has been billed to it this session.
  const active = requests > 0;
  const modelLabel = (lastModel || MICRO_AI_MODELS.micro.id).split('/').pop();

  return (
    <section className="space-y-3">
      <p className="eyebrow flex items-center gap-1.5">
        <Cpu size={13} /> Shared fast tier · filenames and examples
        {active && (
          <span className="inline-flex items-center gap-1 text-emerald-400 normal-case tracking-normal">
            <Check size={12} /> active
          </span>
        )}
      </p>
      <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">
        {active
          ? `Small helper tasks are running on ${modelLabel} at no cost to you.`
          : 'Small helper tasks — download filenames and example prompts — run on a shared fast model when this deployment provides one, then fall back to your Gemini key, then to a plain text slug.'}
      </p>

      {requests > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background-elevated)]/60 p-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[0.62rem] uppercase tracking-wide text-[var(--foreground-subtle)]">Requests</dt>
              <dd className="font-mono text-sm text-[var(--foreground)]">{requests}</dd>
            </div>
            <div>
              <dt className="text-[0.62rem] uppercase tracking-wide text-[var(--foreground-subtle)]">Tokens</dt>
              <dd className="font-mono text-sm text-[var(--foreground)]">{promptTokens + completionTokens}</dd>
            </div>
            <div>
              <dt className="text-[0.62rem] uppercase tracking-wide text-[var(--foreground-subtle)]">Est. cost</dt>
              <dd className="font-mono text-sm text-[var(--foreground)]">{formatUsd(costUsd)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-center text-[0.62rem] text-[var(--foreground-subtle)]">
            This session only. {PRICING_NOTE}
          </p>
        </div>
      )}
    </section>
  );
}
