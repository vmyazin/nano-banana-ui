import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nuqs', () => ({ useQueryState: () => ['all', vi.fn()] }));
vi.mock('@/lib/kie/browser', () => ({ fetchKieCredits: vi.fn().mockResolvedValue(940) }));

import SpendPage from '@/app/spend/page';
import type { SpendEntry } from '@/lib/spend/ledger';
import { useAppStore } from '@/store/useAppStore';
import { useSpendStore } from '@/store/useSpendStore';

function entry(overrides: Partial<SpendEntry>): SpendEntry {
  return {
    id: Math.random().toString(36).slice(2),
    at: Date.now(),
    provider: 'gemini',
    modelId: 'gemini-3-pro-image-preview',
    kind: 'image',
    costUsd: 0.1344,
    confidence: 'exact',
    source: 'usage-metadata',
    promptExcerpt: 'A harbour at dusk',
    ...overrides,
  };
}

describe('SpendPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useSpendStore.setState({ entries: [], hasHydrated: true });
    useAppStore.setState({ kieApiKey: '', hasHydrated: true });
  });

  it('explains what gets recorded when the ledger is empty', () => {
    render(<SpendPage />);
    expect(screen.getByRole('heading', { name: 'Spend' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing recorded yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to studio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Open the studio' })).toHaveAttribute('href', '/');
  });

  it('shows totals, breakdowns, and the ledger for recorded runs', async () => {
    useSpendStore.setState({
      entries: [
        entry({ id: 'a' }),
        entry({ id: 'b', provider: 'runware', modelId: 'runware:z-image@turbo', costUsd: 0.003, source: 'response' }),
        entry({ id: 'c', provider: 'kie', modelId: 'veo-3-1', kind: 'video', costUsd: null, confidence: 'unknown', source: 'balance-delta' }),
      ],
      hasHydrated: true,
    });
    useAppStore.setState({ kieApiKey: 'kie-key', hasHydrated: true });
    render(<SpendPage />);

    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('$0.14')).toBeInTheDocument();
    expect(within(summary).getByText('3')).toBeInTheDocument();
    expect(await within(summary).findByText('940')).toBeInTheDocument();

    const byProvider = screen.getByRole('table', { name: 'By provider' });
    expect(within(byProvider).getAllByRole('row')).toHaveLength(4);
    expect(within(byProvider).getByText('Google Gemini')).toBeInTheDocument();

    const ledger = screen.getByRole('table', { name: 'Ledger' });
    expect(within(ledger).getAllByRole('row')).toHaveLength(4);
    // Gemini and Runware are both exact; Kie is the unknown one.
    expect(within(ledger).getAllByText('Exact', { selector: 'span' })).toHaveLength(2);
    expect(within(ledger).getByText('Unknown', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear ledger' })).toBeInTheDocument();
  });

  it('removes a row from the ledger', () => {
    useSpendStore.setState({ entries: [entry({ id: 'a' })], hasHydrated: true });
    render(<SpendPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry' }));
    expect(useSpendStore.getState().entries).toEqual([]);
  });
});
