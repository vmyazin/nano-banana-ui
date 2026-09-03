import { beforeEach, describe, expect, it } from 'vitest';

import type { SpendEntry } from '@/lib/spend/ledger';
import { SPEND_LEDGER_LIMIT } from '@/lib/spend/ledger';
import { useSpendStore } from '@/store/useSpendStore';

function entry(overrides: Partial<SpendEntry> = {}): SpendEntry {
  return {
    id: 'runware-1',
    at: 1_000,
    provider: 'runware',
    modelId: 'runware:z-image@turbo',
    kind: 'image',
    costUsd: 0.003,
    confidence: 'exact',
    source: 'response',
    promptExcerpt: 'A harbour at dusk',
    ...overrides,
  };
}

describe('useSpendStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSpendStore.setState({ entries: [], hasHydrated: false });
  });

  it('records newest first', () => {
    useSpendStore.getState().record(entry({ id: 'a', at: 1 }));
    useSpendStore.getState().record(entry({ id: 'b', at: 2 }));
    expect(useSpendStore.getState().entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('ignores a second entry with the same id, so a re-poll cannot double-bill', () => {
    useSpendStore.getState().record(entry({ id: 'a', costUsd: 1 }));
    useSpendStore.getState().record(entry({ id: 'a', costUsd: 2 }));
    expect(useSpendStore.getState().entries).toHaveLength(1);
    expect(useSpendStore.getState().entries[0].costUsd).toBe(1);
  });

  it('drops the oldest entries past the cap', () => {
    for (let index = 0; index < SPEND_LEDGER_LIMIT + 5; index += 1) {
      useSpendStore.getState().record(entry({ id: `e-${index}`, at: index }));
    }
    const { entries } = useSpendStore.getState();
    expect(entries).toHaveLength(SPEND_LEDGER_LIMIT);
    expect(entries[0].id).toBe(`e-${SPEND_LEDGER_LIMIT + 4}`);
    expect(entries.at(-1)?.id).toBe('e-5');
  });

  it('removes one entry and clears all', () => {
    useSpendStore.getState().record(entry({ id: 'a' }));
    useSpendStore.getState().record(entry({ id: 'b' }));
    useSpendStore.getState().remove('a');
    expect(useSpendStore.getState().entries.map((e) => e.id)).toEqual(['b']);
    useSpendStore.getState().clear();
    expect(useSpendStore.getState().entries).toEqual([]);
  });

  it('persists entries under the spend key', () => {
    useSpendStore.getState().record(entry({ id: 'a' }));
    const raw = localStorage.getItem('scene-assembly-spend');
    expect(raw).toContain('"id":"a"');
  });
});
