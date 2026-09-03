// lib/spend/format.ts

/** Sub-cent figures round to nothing, so show a floor rather than "$0.0000". */
export function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.0000';
  return cost < 0.0001 ? '<$0.0001' : `$${cost.toFixed(4)}`;
}

/** Totals read in cents; a total under a cent still says it is not nothing. */
export function formatUsdTotal(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00';
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
}
