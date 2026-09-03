# Spend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what every finished generation cost, in a browser-local ledger, and show it on a `/spend` page linked from the footer and ⌘K.

**Architecture:** A persisted zustand ledger (`useSpendStore`) receives one entry per finished generation from `lib/spend/capture.ts`, which is called at the five places a result already becomes final. Per-provider cost resolution is pure (`lib/spend/resolve.ts`) and fed by two new thin routes (fal estimate, Kie credits) plus Gemini usage metadata passed through the existing generate route. Pure rollups (`lib/spend/rollup.ts`) drive a client page with no arithmetic of its own.

**Tech Stack:** Next.js 16 App Router, React 19, zustand 5 (`persist`), nuqs, Tailwind 4, vitest + Testing Library, inline SVG for the chart (no chart library).

**Spec:** `docs/superpowers/specs/2026-09-03-spend-dashboard-design.md`

## Global Constraints

- Work in a fresh worktree: `git worktree add .claude/worktrees/spend-dashboard main`, then from inside it run the four wiring commands from `AGENTS.md` (`ln -s ../../../node_modules node_modules`, copy `.env.local`, `next-env.d.ts`, thumbnails).
- Spend capture must never throw into a generation path. Every resolver and every capture function catches and records `unknown` on failure.
- Every ledger entry carries `confidence` (`exact` | `estimated` | `unknown`) and `source`.
- The two new routes answer `200` with a `null` figure on vendor errors, `400` only for a malformed body.
- Do not record failed, cancelled, or timed-out jobs.
- Do not touch: job polling cadence, timeout, or terminal-state logic; gallery capture, eviction, or storage; the connections dialog beyond the shared `formatUsd` import; any provider request body.
- Commit messages: conventional prefix, no agent attribution trailer (repo rule in `AGENTS.md`).
- Verify each task with the named vitest command, then `npx tsc --noEmit` before every commit.
- Before writing the chart in Task 10, load the `dataviz` skill.

---

## File map

| Path | Responsibility |
| --- | --- |
| `lib/spend/rates.ts` (create) | Published USD rates with source and date; Gemini token arithmetic; Kie credit rate |
| `lib/spend/ledger.ts` (create) | `SpendEntry` and related types, `excerpt`, `providerLabel`, ledger cap |
| `lib/spend/format.ts` (create) | `formatUsd` (moved from the panel) and `formatUsdTotal` |
| `store/useSpendStore.ts` (create) | Persisted ledger, `record` / `remove` / `clear` |
| `lib/spend/rollup.ts` (create) | Ranges, totals, groupings, per-day series, CSV |
| `lib/spend/resolve.ts` (create) | Pure per-provider resolvers and Kie sharing math |
| `lib/fal/pricing.ts` (create) | `falUnitQuantity`, `falDurationSeconds` — dependency-free, used by server and client |
| `lib/spend/capture.ts` (create) | Builds entries at each settle point and files them |
| `lib/spend/palette.ts` (create) | Provider → chart fill |
| `app/api/fal/estimate/route.ts` (create) | fal cost estimate proxy |
| `app/api/kie/credits/route.ts` (create) | Kie balance proxy |
| `components/spend/*.tsx` (create) | Summary tiles, daily chart, breakdown table, ledger table, confidence badge |
| `app/spend/page.tsx` (create) | The page |
| `lib/providers/types.ts:60-64` (modify) | Add `rate` beside `price` |
| `lib/providers/catalog.ts:168-236` (modify) | Fill `rate` on Atlas models with flat prices |
| `lib/engines/gemini.ts` (modify) | Return `usage` from `usageMetadata` |
| `app/api/generate/route.ts:174-178` (modify) | Pass `usage` through |
| `lib/fal/server.ts` (modify) | Add `estimateFalCost` |
| `lib/fal/browser.ts` (modify) | Add `estimateFalJobCost` |
| `lib/kie/browser.ts` (modify) | Add `fetchKieCredits` |
| `lib/kie/types.ts:53-66` (modify) | Add `creditsBefore` to `KieJob` |
| `components/KieGenerationWorkspace.tsx:351-378` (modify) | Read balance before submit |
| `components/KieJobsProvider.tsx:36-40` (modify) | Capture on success |
| `components/FalJobsProvider.tsx:131-135` (modify) | Capture on success |
| `components/ProviderVideoWorkspace.tsx:395-412` (modify) | Capture on success |
| `components/GenerationInterface.tsx:401-540, 589-610` (modify) | Return usage/cost from the mutation; capture on success; read rates from the table |
| `store/useMicroAiUsageStore.ts` (modify) | File a helper entry |
| `components/MicroAiUsagePanel.tsx:8-12` (modify) | Import `formatUsd` from `lib/spend/format` |
| `app/page.tsx:381-400` (modify) | Footer "Spend" link |
| `components/CommandPalette.tsx` (modify) | "View spend" command |
| `AGENTS.md`, `README.md` (modify) | Routing entry and feature line |

**Do not modify:** `lib/fal/queue.ts`, `lib/kie/queue.ts`, `lib/gallery/*`, `store/useGalleryStore.ts`, `lib/providers/runware.ts`, `lib/providers/atlas.ts`, `lib/providers/comet.ts`, `app/api/providers/video/route.ts`, `app/api/fal/queue/route.ts`, `components/ApiKeyConfig.tsx`.

---

### Task 1: Rates, ledger types, and formatting

**Files:**
- Create: `lib/spend/rates.ts`, `lib/spend/ledger.ts`, `lib/spend/format.ts`
- Modify: `components/MicroAiUsagePanel.tsx:1-12`
- Test: `tests/spend/rates.test.ts`, `tests/spend/format.test.ts`

**Interfaces:**
- Produces: `GEMINI_IMAGE_RATES`, `KIE_USD_PER_CREDIT`, `geminiTokenCost(promptTokens, outputTokens): number`, `geminiResolutionCost(resolution, inputImages): number`, types `SpendEntry`, `SpendKind`, `SpendConfidence`, `SpendSource`, `SpendQuantity`, `SpendProvider`, `SPEND_LEDGER_LIMIT`, `excerpt(prompt): string`, `providerLabel(provider): string`, `formatUsd(cost): string`, `formatUsdTotal(cost): string`.

- [ ] **Step 1: Write the failing tests**

`tests/spend/rates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { geminiResolutionCost, geminiTokenCost, KIE_USD_PER_CREDIT } from '@/lib/spend/rates';

describe('Gemini image rates', () => {
  it('prices output tokens at the published rate', () => {
    expect(geminiTokenCost(0, 1120)).toBeCloseTo(0.1344, 6);
    expect(geminiTokenCost(0, 2000)).toBeCloseTo(0.24, 6);
  });

  it('adds input tokens at the input rate', () => {
    expect(geminiTokenCost(560, 0)).toBeCloseTo(0.00112, 6);
  });

  it('estimates a resolution the same way the studio always has', () => {
    expect(geminiResolutionCost('1K', 0)).toBeCloseTo(0.1344, 6);
    expect(geminiResolutionCost('2K', 0)).toBeCloseTo(0.1344, 6);
    expect(geminiResolutionCost('4K', 2)).toBeCloseTo(0.24 + 2 * 0.00112, 6);
    expect(geminiResolutionCost(undefined, 0)).toBeCloseTo(0.1344, 6);
  });

  it('never returns a negative or non-finite figure', () => {
    expect(geminiTokenCost(Number.NaN, -5)).toBe(0);
  });

  it('publishes the Kie credit rate', () => {
    expect(KIE_USD_PER_CREDIT).toBe(0.005);
  });
});
```

`tests/spend/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatUsd, formatUsdTotal } from '@/lib/spend/format';
import { excerpt, providerLabel } from '@/lib/spend/ledger';

describe('formatUsd', () => {
  it('keeps four decimals for per-run figures', () => {
    expect(formatUsd(0.1344)).toBe('$0.1344');
  });
  it('floors sub-cent-of-a-cent figures instead of printing zero', () => {
    expect(formatUsd(0.00001)).toBe('<$0.0001');
  });
  it('treats nothing and nonsense as zero', () => {
    expect(formatUsd(0)).toBe('$0.0000');
    expect(formatUsd(Number.NaN)).toBe('$0.0000');
  });
});

describe('formatUsdTotal', () => {
  it('rounds totals to cents', () => {
    expect(formatUsdTotal(12.3456)).toBe('$12.35');
  });
  it('flags a total that would round to nothing', () => {
    expect(formatUsdTotal(0.004)).toBe('<$0.01');
    expect(formatUsdTotal(0)).toBe('$0.00');
  });
});

describe('ledger helpers', () => {
  it('trims a prompt to 120 characters', () => {
    expect(excerpt(`${'a'.repeat(130)}`)).toHaveLength(120);
    expect(excerpt('  short  ')).toBe('short');
  });
  it('labels every engine and the helper tier', () => {
    expect(providerLabel('gemini')).toBe('Google Gemini');
    expect(providerLabel('micro-ai')).toBe('Helper tasks');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/spend/rates.test.ts tests/spend/format.test.ts`
Expected: FAIL — cannot resolve `@/lib/spend/rates`, `@/lib/spend/format`, `@/lib/spend/ledger`.

- [ ] **Step 3: Write the implementation**

`lib/spend/rates.ts`:

```ts
// lib/spend/rates.ts
/**
 * Published vendor rates in USD. Each block names the page it was read from and
 * when; update a whole block from that page rather than one number in
 * isolation. Dependency-free so server routes and client code can both price.
 */

/** https://ai.google.dev/gemini-api/docs/pricing — Gemini 3 Pro Image, read 2026-09-03. */
export const GEMINI_IMAGE_RATES = {
  modelId: 'gemini-3-pro-image-preview',
  inputUsdPerMillionTokens: 2,
  outputUsdPerMillionTokens: 120,
  /** Output image tokens by the studio's `imageSize` control. */
  outputTokensByResolution: { '1K': 1120, '2K': 1120, '4K': 2000 } as Record<string, number>,
  /** Each reference image counts as this many input tokens. */
  inputTokensPerImage: 560,
} as const;

/** https://kie.ai/pricing — "1 credit ≈ $0.005", read 2026-09-03. */
export const KIE_USD_PER_CREDIT = 0.005;

export function geminiTokenCost(promptTokens: number, outputTokens: number): number {
  const cost =
    (promptTokens / 1_000_000) * GEMINI_IMAGE_RATES.inputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * GEMINI_IMAGE_RATES.outputUsdPerMillionTokens;
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

/** The estimate the studio has always shown: one output image plus its references. */
export function geminiResolutionCost(resolution: string | undefined, inputImages: number): number {
  const table = GEMINI_IMAGE_RATES.outputTokensByResolution;
  const outputTokens = table[resolution ?? '1K'] ?? table['1K'];
  const safeImages = Number.isFinite(inputImages) && inputImages > 0 ? inputImages : 0;
  return geminiTokenCost(safeImages * GEMINI_IMAGE_RATES.inputTokensPerImage, outputTokens);
}
```

`lib/spend/ledger.ts`:

```ts
// lib/spend/ledger.ts
import { ENGINES, type EngineId } from '@/lib/engines/registry';

export type SpendKind = 'image' | 'video' | 'helper';
export type SpendConfidence = 'exact' | 'estimated' | 'unknown';
export type SpendSource =
  | 'response'        // vendor returned the cost (Runware)
  | 'usage-metadata'  // priced from token counts (Gemini)
  | 'estimate-api'    // vendor estimate endpoint (fal)
  | 'balance-delta'   // credits before minus credits after (Kie)
  | 'catalog-rate'    // published rate times quantity (Atlas, Comet, Gemini fallback, helper)
  | 'free';           // Pollinations, Cloudflare

export type SpendProvider = EngineId | 'micro-ai';

export interface SpendQuantity {
  unit: 'image' | 'second' | 'video' | 'token' | 'credit';
  value: number;
}

export interface SpendEntry {
  /** `${provider}-${jobId}` when a job id exists, so a re-poll cannot file twice. */
  id: string;
  at: number;
  provider: SpendProvider;
  modelId: string;
  kind: SpendKind;
  inputMode?: string;
  costUsd: number | null;
  confidence: SpendConfidence;
  source: SpendSource;
  quantity?: SpendQuantity;
  /** First 120 characters, for the ledger row. */
  promptExcerpt: string;
  /** Library record this run produced, when one exists. */
  galleryRecordId?: string;
  /** Human note, e.g. "Balance change shared with 2 other Kie jobs." */
  note?: string;
}

/** Enough for months of daily work without unbounded localStorage growth. */
export const SPEND_LEDGER_LIMIT = 2_000;

const EXCERPT_LENGTH = 120;

export function excerpt(prompt: string): string {
  return prompt.trim().slice(0, EXCERPT_LENGTH);
}

export function providerLabel(provider: SpendProvider): string {
  if (provider === 'micro-ai') return 'Helper tasks';
  return ENGINES.find((engine) => engine.id === provider)?.label ?? provider;
}
```

`lib/spend/format.ts`:

```ts
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
```

In `components/MicroAiUsagePanel.tsx`, delete the local `formatUsd` (lines 8–12, including its comment) and add `import { formatUsd } from '@/lib/spend/format';` after the `MICRO_AI_MODELS` import. Keep everything else unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/spend/rates.test.ts tests/spend/format.test.ts tests/notify`
Expected: PASS (the notify tests render the panel and confirm the import moved cleanly).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/spend tests/spend components/MicroAiUsagePanel.tsx
git commit -m "feat: add spend rates, ledger types, and shared USD formatting"
```

---

### Task 2: The spend store

**Files:**
- Create: `store/useSpendStore.ts`
- Test: `tests/spend/store.test.ts`

**Interfaces:**
- Consumes: `SpendEntry`, `SPEND_LEDGER_LIMIT` from Task 1.
- Produces: `useSpendStore` with `{ entries: SpendEntry[]; hasHydrated: boolean; record(entry): void; remove(id): void; clear(): void; setHasHydrated(v): void }`, persisted under `scene-assembly-spend`, `skipHydration: true`.

- [ ] **Step 1: Write the failing test**

`tests/spend/store.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spend/store.test.ts`
Expected: FAIL — cannot resolve `@/store/useSpendStore`.

- [ ] **Step 3: Write the store**

`store/useSpendStore.ts`:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SPEND_LEDGER_LIMIT, type SpendEntry } from '@/lib/spend/ledger';

const STORAGE_KEY = 'scene-assembly-spend';

interface SpendState {
  /** Newest first. One row per finished generation; failures are never filed. */
  entries: SpendEntry[];
  hasHydrated: boolean;
  /** No-op when the id is already present, so a re-poll cannot bill twice. */
  record: (entry: SpendEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSpendStore = create<SpendState>()(
  persist(
    (set) => ({
      entries: [],
      hasHydrated: false,

      record: (entry) =>
        set((state) => {
          if (state.entries.some((existing) => existing.id === entry.id)) return state;
          return { entries: [entry, ...state.entries].slice(0, SPEND_LEDGER_LIMIT) };
        }),

      remove: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      clear: () => set({ entries: [] }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ entries: state.entries }),
      // Same deferred hydration as useAppStore: kicked from a mount effect so the
      // server and first client render agree.
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/spend/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add store/useSpendStore.ts tests/spend/store.test.ts
git commit -m "feat: persist a browser-local spend ledger"
```

---

### Task 3: Rollups

**Files:**
- Create: `lib/spend/rollup.ts`
- Test: `tests/spend/rollup.test.ts`

**Interfaces:**
- Consumes: `SpendEntry`, `SpendProvider`, `providerLabel` from Task 1.
- Produces: `SpendRange`, `SPEND_RANGES`, `isSpendRange`, `rangeStart`, `inRange`, `SpendTotals`, `totals`, `SpendRow`, `byProvider`, `byModel`, `byKind`, `SpendDay`, `dayKey`, `byDay`, `toCsv`.

- [ ] **Step 1: Write the failing test**

`tests/spend/rollup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { SpendEntry } from '@/lib/spend/ledger';
import {
  byDay,
  byKind,
  byModel,
  byProvider,
  inRange,
  isSpendRange,
  rangeStart,
  toCsv,
  totals,
} from '@/lib/spend/rollup';

// Local noon avoids any day boundary in whatever zone the runner is in.
const NOW = new Date(2026, 8, 15, 12, 0, 0).getTime(); // 2026-09-15
const DAY = 24 * 60 * 60 * 1_000;

function entry(overrides: Partial<SpendEntry>): SpendEntry {
  return {
    id: Math.random().toString(36).slice(2),
    at: NOW,
    provider: 'runware',
    modelId: 'runware:z-image@turbo',
    kind: 'image',
    costUsd: 0.01,
    confidence: 'exact',
    source: 'response',
    promptExcerpt: 'A harbour',
    ...overrides,
  };
}

describe('ranges', () => {
  it('recognises the three ranges', () => {
    expect(isSpendRange('month')).toBe(true);
    expect(isSpendRange('30d')).toBe(true);
    expect(isSpendRange('all')).toBe(true);
    expect(isSpendRange('week')).toBe(false);
  });

  it('starts the month at local midnight on the first', () => {
    expect(rangeStart('month', NOW)).toBe(new Date(2026, 8, 1).getTime());
  });

  it('counts 30 days inclusive of today', () => {
    expect(rangeStart('30d', NOW)).toBe(new Date(2026, 7, 17).getTime());
  });

  it('has no start for all time', () => {
    expect(rangeStart('all', NOW)).toBeNull();
  });

  it('filters by the range start', () => {
    const inside = entry({ at: NOW - DAY });
    const outside = entry({ at: NOW - 40 * DAY });
    expect(inRange([inside, outside], '30d', NOW)).toEqual([inside]);
    expect(inRange([inside, outside], 'all', NOW)).toHaveLength(2);
  });
});

describe('totals', () => {
  it('sums by confidence and counts unknowns separately', () => {
    const result = totals([
      entry({ costUsd: 0.1, confidence: 'exact' }),
      entry({ costUsd: 0.2, confidence: 'estimated' }),
      entry({ costUsd: null, confidence: 'unknown' }),
    ]);
    expect(result).toEqual({
      costUsd: expect.closeTo(0.3, 6),
      runs: 3,
      exactUsd: expect.closeTo(0.1, 6),
      estimatedUsd: expect.closeTo(0.2, 6),
      unknownRuns: 1,
    });
  });
});

describe('groupings', () => {
  const entries = [
    entry({ provider: 'gemini', modelId: 'gemini-3-pro-image-preview', costUsd: 0.13 }),
    entry({ provider: 'gemini', modelId: 'gemini-3-pro-image-preview', costUsd: 0.24 }),
    entry({ provider: 'runware', modelId: 'runware:z-image@turbo', costUsd: 0.003 }),
    entry({ provider: 'kie', modelId: 'veo-3-1', kind: 'video', costUsd: null, confidence: 'unknown' }),
  ];

  it('groups by provider, most expensive first, with labels', () => {
    expect(byProvider(entries).map((row) => [row.key, row.label, row.runs, row.unknownRuns])).toEqual([
      ['gemini', 'Google Gemini', 2, 0],
      ['runware', 'Runware', 1, 0],
      ['kie', 'Kie.ai', 1, 1],
    ]);
    expect(byProvider(entries)[0].costUsd).toBeCloseTo(0.37, 6);
  });

  it('groups by model and remembers the provider for the logo', () => {
    const rows = byModel(entries);
    expect(rows[0]).toMatchObject({ key: 'gemini:gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview', provider: 'gemini', runs: 2 });
  });

  it('groups by kind', () => {
    expect(byKind(entries).map((row) => [row.key, row.runs])).toEqual([
      ['image', 3],
      ['video', 1],
    ]);
  });
});

describe('byDay', () => {
  it('zero-fills every day in the range and stacks by provider', () => {
    const days = byDay(
      [
        entry({ at: NOW, provider: 'gemini', costUsd: 0.1 }),
        entry({ at: NOW, provider: 'runware', costUsd: 0.01 }),
        entry({ at: NOW - 2 * DAY, provider: 'gemini', costUsd: 0.2 }),
      ],
      '30d',
      NOW
    );
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toEqual({
      day: '2026-09-15',
      costUsd: expect.closeTo(0.11, 6),
      runs: 2,
      byProvider: { gemini: 0.1, runware: 0.01 },
    });
    expect(days.at(-3)?.costUsd).toBeCloseTo(0.2, 6);
    expect(days.at(-2)).toEqual({ day: '2026-09-14', costUsd: 0, runs: 0, byProvider: {} });
  });

  it('spans from the earliest entry for all time, and one day when empty', () => {
    expect(byDay([entry({ at: NOW - 3 * DAY })], 'all', NOW)).toHaveLength(4);
    expect(byDay([], 'all', NOW)).toHaveLength(1);
  });
});

describe('toCsv', () => {
  it('writes a header and quotes prompts', () => {
    const csv = toCsv([
      entry({ at: Date.UTC(2026, 8, 15, 12), promptExcerpt: 'A "quoted", prompt', quantity: { unit: 'second', value: 5 } }),
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('at,provider,model,kind,input_mode,quantity,unit,cost_usd,confidence,source,prompt');
    expect(row).toBe('2026-09-15T12:00:00.000Z,runware,runware:z-image@turbo,image,,5,second,0.01,exact,response,"A ""quoted"", prompt"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spend/rollup.test.ts`
Expected: FAIL — cannot resolve `@/lib/spend/rollup`.

- [ ] **Step 3: Write the rollups**

`lib/spend/rollup.ts`:

```ts
// lib/spend/rollup.ts
/**
 * Pure arithmetic over ledger entries. The page renders these and adds nothing
 * of its own, so every figure it shows is testable here without React.
 */
import { providerLabel, type SpendEntry, type SpendKind, type SpendProvider } from './ledger';

export type SpendRange = 'month' | '30d' | 'all';

export const SPEND_RANGES: ReadonlyArray<{ value: SpendRange; label: string }> = [
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export function isSpendRange(value: unknown): value is SpendRange {
  return value === 'month' || value === '30d' || value === 'all';
}

/** Local-time start of the range, or null for all time. */
export function rangeStart(range: SpendRange, now: number): number | null {
  if (range === 'all') return null;
  const date = new Date(now);
  if (range === 'month') return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 29).getTime();
}

export function inRange(entries: SpendEntry[], range: SpendRange, now: number): SpendEntry[] {
  const start = rangeStart(range, now);
  return start === null ? entries : entries.filter((entry) => entry.at >= start);
}

export interface SpendTotals {
  costUsd: number;
  runs: number;
  exactUsd: number;
  estimatedUsd: number;
  unknownRuns: number;
}

export function totals(entries: SpendEntry[]): SpendTotals {
  const result: SpendTotals = { costUsd: 0, runs: 0, exactUsd: 0, estimatedUsd: 0, unknownRuns: 0 };
  for (const entry of entries) {
    result.runs += 1;
    if (entry.costUsd === null) {
      result.unknownRuns += 1;
      continue;
    }
    result.costUsd += entry.costUsd;
    if (entry.confidence === 'exact') result.exactUsd += entry.costUsd;
    else result.estimatedUsd += entry.costUsd;
  }
  return result;
}

export interface SpendRow {
  key: string;
  label: string;
  /** Set on model rows so the table can show the provider's logo. */
  provider?: SpendProvider;
  runs: number;
  costUsd: number;
  unknownRuns: number;
}

function group(
  entries: SpendEntry[],
  keyOf: (entry: SpendEntry) => string,
  describe: (entry: SpendEntry) => Pick<SpendRow, 'label' | 'provider'>
): SpendRow[] {
  const rows = new Map<string, SpendRow>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const row = rows.get(key) ?? { key, ...describe(entry), runs: 0, costUsd: 0, unknownRuns: 0 };
    row.runs += 1;
    if (entry.costUsd === null) row.unknownRuns += 1;
    else row.costUsd += entry.costUsd;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd || b.runs - a.runs);
}

export function byProvider(entries: SpendEntry[]): SpendRow[] {
  return group(
    entries,
    (entry) => entry.provider,
    (entry) => ({ label: providerLabel(entry.provider), provider: entry.provider })
  );
}

export function byModel(entries: SpendEntry[]): SpendRow[] {
  return group(
    entries,
    (entry) => `${entry.provider}:${entry.modelId}`,
    (entry) => ({ label: entry.modelId, provider: entry.provider })
  );
}

const KIND_LABELS: Record<SpendKind, string> = { image: 'Images', video: 'Video', helper: 'Helper tasks' };

export function byKind(entries: SpendEntry[]): SpendRow[] {
  return group(
    entries,
    (entry) => entry.kind,
    (entry) => ({ label: KIND_LABELS[entry.kind] })
  );
}

/** Local calendar day as YYYY-MM-DD, so a day boundary matches what the user sees. */
export function dayKey(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface SpendDay {
  day: string;
  costUsd: number;
  runs: number;
  byProvider: Partial<Record<SpendProvider, number>>;
}

/** One row per day from the range start (or the earliest entry) through today, zero-filled. */
export function byDay(entries: SpendEntry[], range: SpendRange, now: number): SpendDay[] {
  const earliest = entries.reduce((min, entry) => Math.min(min, entry.at), now);
  const start = rangeStart(range, now) ?? earliest;
  const first = new Date(start);
  const last = new Date(now);
  const days: SpendDay[] = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  while (cursor.getTime() <= end.getTime()) {
    days.push({ day: dayKey(cursor.getTime()), costUsd: 0, runs: 0, byProvider: {} });
    cursor.setDate(cursor.getDate() + 1);
  }
  const index = new Map(days.map((day) => [day.day, day]));
  for (const entry of entries) {
    const day = index.get(dayKey(entry.at));
    if (!day) continue;
    day.runs += 1;
    if (entry.costUsd === null) continue;
    day.costUsd += entry.costUsd;
    day.byProvider[entry.provider] = (day.byProvider[entry.provider] ?? 0) + entry.costUsd;
  }
  return days;
}

function csvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(entries: SpendEntry[]): string {
  const header = 'at,provider,model,kind,input_mode,quantity,unit,cost_usd,confidence,source,prompt';
  const rows = entries.map((entry) =>
    [
      new Date(entry.at).toISOString(),
      entry.provider,
      entry.modelId,
      entry.kind,
      entry.inputMode,
      entry.quantity?.value,
      entry.quantity?.unit,
      entry.costUsd,
      entry.confidence,
      entry.source,
      entry.promptExcerpt,
    ]
      .map(csvCell)
      .join(',')
  );
  return [header, ...rows].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/spend/rollup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/spend/rollup.ts tests/spend/rollup.test.ts
git commit -m "feat: roll the spend ledger up by range, provider, model, and day"
```

---

### Task 4: Catalog rates for Atlas and Comet

**Files:**
- Modify: `lib/providers/types.ts:60-64` (after `price`)
- Modify: `lib/providers/catalog.ts:168-236` (`ATLAS_MODELS`)
- Test: `tests/spend/catalog-rates.test.ts`

**Interfaces:**
- Produces: `ProviderModel.rate?: ProviderRate` where `ProviderRate = { usd: number; per: 'image' | 'second' | 'video' }`.

- [ ] **Step 1: Write the failing test**

`tests/spend/catalog-rates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { PROVIDER_MODELS } from '@/lib/providers/catalog';

describe('provider catalog rates', () => {
  it('gives every Atlas model with a flat published price a structured rate', () => {
    const atlas = Object.fromEntries(PROVIDER_MODELS.atlas.map((model) => [model.id, model.rate]));
    expect(atlas).toEqual({
      'black-forest-labs/flux-schnell': { usd: 0.003, per: 'image' },
      'z-image/turbo': { usd: 0.005, per: 'image' },
      'qwen-image-3.0/text-to-image': { usd: 0.04, per: 'image' },
      'qwen-image-3.0/edit': { usd: 0.04, per: 'image' },
      'ltx-2.3-quality/text-to-video': { usd: 0.002, per: 'second' },
      'bytedance/seedance-v1-pro-fast/image-to-video': { usd: 0.009, per: 'second' },
    });
  });

  it('leaves metered Comet models without a rate', () => {
    expect(PROVIDER_MODELS.comet.every((model) => model.rate === undefined)).toBe(true);
  });

  it('never gives a rate to a model whose price string is not a flat figure', () => {
    for (const models of Object.values(PROVIDER_MODELS)) {
      for (const model of models) {
        if (model.rate) expect(model.price).toMatch(/^\$\d/);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spend/catalog-rates.test.ts`
Expected: FAIL — `rate` is undefined on every Atlas model.

- [ ] **Step 3: Add the field and fill it**

In `lib/providers/types.ts`, above `export interface ProviderModel`, add:

```ts
/** A flat published price the app can multiply, unlike the display-only `price`. */
export interface ProviderRate {
  usd: number;
  per: 'image' | 'second' | 'video';
}
```

Inside `ProviderModel`, directly after the `price?: string;` line, add:

```ts
  /**
   * The same published price as arithmetic, for the spend ledger. Only set
   * when `price` is one flat figure; tiered or metered models leave it out and
   * their runs record as unknown.
   */
  rate?: ProviderRate;
```

In `lib/providers/catalog.ts`, inside `ATLAS_MODELS` (starts line 168), add a `rate` line directly after each `price` line:

| model id | add after `price` |
| --- | --- |
| `black-forest-labs/flux-schnell` | `rate: { usd: 0.003, per: 'image' },` |
| `z-image/turbo` | `rate: { usd: 0.005, per: 'image' },` |
| `qwen-image-3.0/text-to-image` | `rate: { usd: 0.04, per: 'image' },` |
| `qwen-image-3.0/edit` | `rate: { usd: 0.04, per: 'image' },` |
| `ltx-2.3-quality/text-to-video` | `rate: { usd: 0.002, per: 'second' },` |
| `bytedance/seedance-v1-pro-fast/image-to-video` | `rate: { usd: 0.009, per: 'second' },` |

Do not add rates to Runware (its response carries the exact cost) or Comet (metered).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/spend/catalog-rates.test.ts tests/providers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/providers/types.ts lib/providers/catalog.ts tests/spend/catalog-rates.test.ts
git commit -m "feat: carry Atlas prices as structured rates"
```

---

### Task 5: Pure resolvers

**Files:**
- Create: `lib/fal/pricing.ts`, `lib/spend/resolve.ts`
- Test: `tests/spend/resolve.test.ts`, `tests/fal/pricing.test.ts`

**Interfaces:**
- Consumes: Task 1 rates/types, Task 4 `ProviderModel.rate`, `KieJob` from `lib/kie/types`.
- Produces:
  - `falUnitQuantity(unit: string, durationSeconds?: number): number | null`
  - `falDurationSeconds(values: Record<string, string | number | boolean>): number | undefined`
  - `SpendFigure = Pick<SpendEntry, 'costUsd' | 'confidence' | 'source' | 'quantity' | 'note'>`
  - `unknownFigure(source, note?)`, `resolveGemini`, `resolveRunware`, `resolveCatalogRate`, `resolveFree`, `resolveFalEstimate`, `resolveKieDelta`, `kieSharers`, `resolveHelper`.

- [ ] **Step 1: Write the failing tests**

`tests/fal/pricing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { falDurationSeconds, falUnitQuantity } from '@/lib/fal/pricing';

describe('falUnitQuantity', () => {
  it('bills one unit for per-image, per-video, and per-request endpoints', () => {
    expect(falUnitQuantity('image')).toBe(1);
    expect(falUnitQuantity('video')).toBe(1);
    expect(falUnitQuantity('request')).toBe(1);
  });
  it('bills the duration for per-second endpoints, and nothing without one', () => {
    expect(falUnitQuantity('second', 8)).toBe(8);
    expect(falUnitQuantity('seconds', 8)).toBe(8);
    expect(falUnitQuantity('second')).toBeNull();
  });
  it('refuses units it cannot count', () => {
    expect(falUnitQuantity('megapixel')).toBeNull();
  });
});

describe('falDurationSeconds', () => {
  it('reads numeric and "8s"-style duration controls', () => {
    expect(falDurationSeconds({ duration: 5 })).toBe(5);
    expect(falDurationSeconds({ duration: '8s' })).toBe(8);
    expect(falDurationSeconds({ duration: '10' })).toBe(10);
  });
  it('returns nothing for a missing or unusable value', () => {
    expect(falDurationSeconds({})).toBeUndefined();
    expect(falDurationSeconds({ duration: 'long' })).toBeUndefined();
    expect(falDurationSeconds({ duration: 0 })).toBeUndefined();
  });
});
```

`tests/spend/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { KieJob } from '@/lib/kie/types';
import type { ProviderModel } from '@/lib/providers/types';
import {
  kieSharers,
  resolveCatalogRate,
  resolveFalEstimate,
  resolveFree,
  resolveGemini,
  resolveHelper,
  resolveKieDelta,
  resolveRunware,
} from '@/lib/spend/resolve';

describe('resolveGemini', () => {
  it('is exact when the response carried usage', () => {
    expect(resolveGemini({ usage: { promptTokens: 560, outputTokens: 1120 }, resolution: '4K', inputImages: 3 })).toEqual({
      costUsd: expect.closeTo(0.13552, 6),
      confidence: 'exact',
      source: 'usage-metadata',
      quantity: { unit: 'token', value: 1680 },
    });
  });
  it('falls back to the resolution estimate', () => {
    expect(resolveGemini({ usage: null, resolution: '4K', inputImages: 1 })).toEqual({
      costUsd: expect.closeTo(0.24112, 6),
      confidence: 'estimated',
      source: 'catalog-rate',
      quantity: { unit: 'image', value: 1 },
    });
  });
});

describe('resolveRunware', () => {
  it('trusts the response cost', () => {
    expect(resolveRunware(0.0032)).toEqual({ costUsd: 0.0032, confidence: 'exact', source: 'response' });
  });
  it('is unknown without one', () => {
    expect(resolveRunware(undefined)).toMatchObject({ costUsd: null, confidence: 'unknown', source: 'response' });
  });
});

describe('resolveCatalogRate', () => {
  const image = { id: 'm', rate: { usd: 0.04, per: 'image' } } as ProviderModel;
  const video = { id: 'v', rate: { usd: 0.002, per: 'second' } } as ProviderModel;
  const metered = { id: 'x' } as ProviderModel;

  it('multiplies per-second rates by the duration', () => {
    expect(resolveCatalogRate(video, 5)).toEqual({
      costUsd: expect.closeTo(0.01, 6),
      confidence: 'estimated',
      source: 'catalog-rate',
      quantity: { unit: 'second', value: 5 },
    });
  });
  it('charges one unit for per-image rates', () => {
    expect(resolveCatalogRate(image)).toMatchObject({ costUsd: 0.04, quantity: { unit: 'image', value: 1 } });
  });
  it('is unknown for a metered model or a missing duration', () => {
    expect(resolveCatalogRate(metered)).toMatchObject({ costUsd: null, confidence: 'unknown' });
    expect(resolveCatalogRate(video)).toMatchObject({ costUsd: null, confidence: 'unknown' });
    expect(resolveCatalogRate(undefined)).toMatchObject({ costUsd: null, confidence: 'unknown' });
  });
});

describe('resolveFree', () => {
  it('records a free run as exactly nothing', () => {
    expect(resolveFree()).toEqual({ costUsd: 0, confidence: 'exact', source: 'free', quantity: { unit: 'image', value: 1 } });
  });
});

describe('resolveFalEstimate', () => {
  it('uses the vendor estimate and unit', () => {
    expect(resolveFalEstimate({ costUsd: 0.4, unit: 'second', quantity: 8 })).toEqual({
      costUsd: 0.4,
      confidence: 'estimated',
      source: 'estimate-api',
      quantity: { unit: 'second', value: 8 },
    });
  });
  it('is unknown when the estimate failed', () => {
    expect(resolveFalEstimate({ costUsd: null })).toMatchObject({ costUsd: null, confidence: 'unknown', source: 'estimate-api' });
  });
});

describe('resolveKieDelta', () => {
  it('converts a balance drop to dollars', () => {
    expect(resolveKieDelta({ before: 1000, after: 940, sharedWith: 0 })).toEqual({
      costUsd: expect.closeTo(0.3, 6),
      confidence: 'estimated',
      source: 'balance-delta',
      quantity: { unit: 'credit', value: 60 },
    });
  });
  it('splits the drop with other jobs that overlapped, and says so', () => {
    expect(resolveKieDelta({ before: 1000, after: 940, sharedWith: 2 })).toEqual({
      costUsd: expect.closeTo(0.1, 6),
      confidence: 'estimated',
      source: 'balance-delta',
      quantity: { unit: 'credit', value: 20 },
      note: 'Balance change shared with 2 other Kie jobs.',
    });
  });
  it('is unknown without a before or after reading, or when the balance rose or held', () => {
    expect(resolveKieDelta({ before: undefined, after: 940, sharedWith: 0 })).toMatchObject({ costUsd: null, confidence: 'unknown' });
    expect(resolveKieDelta({ before: 1000, after: null, sharedWith: 0 })).toMatchObject({ costUsd: null, confidence: 'unknown' });
    expect(resolveKieDelta({ before: 900, after: 1000, sharedWith: 0 })).toMatchObject({ costUsd: null, note: expect.stringContaining('rose') });
    expect(resolveKieDelta({ before: 1000, after: 1000, sharedWith: 0 })).toMatchObject({ costUsd: null, note: expect.stringContaining('did not change') });
  });
});

describe('kieSharers', () => {
  const base: KieJob = {
    id: 'a', taskId: 'a', protocol: 'market', state: 'success', resultUrls: [],
    modelId: 'nano-banana-pro', mediaType: 'image', inputMode: 'text', prompt: 'p',
    createdAt: 1_000, updatedAt: 5_000, pollAttempt: 1,
  };
  it('counts other jobs submitted or succeeded during this job, not ones merely polling', () => {
    const jobs: KieJob[] = [
      base,
      { ...base, id: 'b', createdAt: 2_000, updatedAt: 3_000 },
      { ...base, id: 'c', createdAt: 500, updatedAt: 4_000 },
      { ...base, id: 'd', createdAt: 100, updatedAt: 900 },
      { ...base, id: 'e', createdAt: 2_500, updatedAt: 2_600, state: 'fail' },
      { ...base, id: 'f', createdAt: 400, updatedAt: 4_500, state: 'generating' },
    ];
    expect(kieSharers(jobs, base)).toBe(2);
  });
});

describe('resolveHelper', () => {
  it('passes the micro-AI estimate through', () => {
    expect(resolveHelper({ promptTokens: 100, completionTokens: 20, costUsd: 0.0000024 })).toEqual({
      costUsd: 0.0000024,
      confidence: 'estimated',
      source: 'catalog-rate',
      quantity: { unit: 'token', value: 120 },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fal/pricing.test.ts tests/spend/resolve.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the helpers and resolvers**

`lib/fal/pricing.ts`:

```ts
// lib/fal/pricing.ts
/**
 * How a fal endpoint's billing unit maps onto one of our runs. Dependency-free
 * so the estimate route and the client-side capture share one answer.
 */

/** Units fal bills as one per call. `request` and `call` appear on non-media endpoints. */
const ONE_PER_RUN = new Set(['image', 'video', 'request', 'call']);
const PER_SECOND = new Set(['second', 'seconds', 'sec']);

export function falUnitQuantity(unit: string, durationSeconds?: number): number | null {
  const normalized = unit.trim().toLowerCase();
  if (ONE_PER_RUN.has(normalized)) return 1;
  if (PER_SECOND.has(normalized)) {
    return durationSeconds !== undefined && durationSeconds > 0 ? durationSeconds : null;
  }
  // Per-megapixel and anything else needs the output size, which we do not know.
  return null;
}

/** fal duration controls are `5`, `'10'`, or `'8s'` depending on the model. */
export function falDurationSeconds(
  values: Record<string, string | number | boolean>
): number | undefined {
  const raw = values.duration;
  const seconds =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
```

`lib/spend/resolve.ts`:

```ts
// lib/spend/resolve.ts
/**
 * One resolver per provider. Each returns the cost fields of a ledger entry,
 * never throws, and answers `unknown` for anything it cannot price. Pure, so a
 * fixture response is all a test needs.
 */
import type { KieJob } from '@/lib/kie/types';
import type { MicroAiUsage } from '@/lib/micro-ai/models';
import type { ProviderModel } from '@/lib/providers/types';

import type { SpendEntry, SpendSource } from './ledger';
import { geminiResolutionCost, geminiTokenCost, KIE_USD_PER_CREDIT } from './rates';

export type SpendFigure = Pick<SpendEntry, 'costUsd' | 'confidence' | 'source' | 'quantity' | 'note'>;

export function unknownFigure(source: SpendSource, note?: string): SpendFigure {
  return { costUsd: null, confidence: 'unknown', source, ...(note ? { note } : {}) };
}

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
}

export function resolveGemini(args: {
  usage?: GeminiUsage | null;
  resolution?: string;
  inputImages: number;
}): SpendFigure {
  const { usage } = args;
  if (usage && Number.isFinite(usage.outputTokens) && usage.outputTokens > 0) {
    const promptTokens = Number.isFinite(usage.promptTokens) ? Math.max(0, usage.promptTokens) : 0;
    return {
      costUsd: geminiTokenCost(promptTokens, usage.outputTokens),
      confidence: 'exact',
      source: 'usage-metadata',
      quantity: { unit: 'token', value: promptTokens + usage.outputTokens },
    };
  }
  return {
    costUsd: geminiResolutionCost(args.resolution, args.inputImages),
    confidence: 'estimated',
    source: 'catalog-rate',
    quantity: { unit: 'image', value: 1 },
  };
}

export function resolveRunware(cost: number | undefined): SpendFigure {
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    return unknownFigure('response');
  }
  return { costUsd: cost, confidence: 'exact', source: 'response' };
}

export function resolveCatalogRate(
  model: ProviderModel | undefined,
  durationSeconds?: number
): SpendFigure {
  const rate = model?.rate;
  if (!rate) return unknownFigure('catalog-rate');
  if (rate.per === 'second') {
    if (durationSeconds === undefined || !(durationSeconds > 0)) return unknownFigure('catalog-rate');
    return {
      costUsd: rate.usd * durationSeconds,
      confidence: 'estimated',
      source: 'catalog-rate',
      quantity: { unit: 'second', value: durationSeconds },
    };
  }
  return {
    costUsd: rate.usd,
    confidence: 'estimated',
    source: 'catalog-rate',
    quantity: { unit: rate.per, value: 1 },
  };
}

export function resolveFree(): SpendFigure {
  return { costUsd: 0, confidence: 'exact', source: 'free', quantity: { unit: 'image', value: 1 } };
}

export interface FalEstimate {
  costUsd: number | null;
  unit?: string;
  quantity?: number;
}

export function resolveFalEstimate(estimate: FalEstimate | null | undefined): SpendFigure {
  if (!estimate || typeof estimate.costUsd !== 'number' || !Number.isFinite(estimate.costUsd)) {
    return unknownFigure('estimate-api');
  }
  const unit = estimate.unit === 'second' || estimate.unit === 'seconds' ? 'second' : estimate.unit === 'video' ? 'video' : 'image';
  return {
    costUsd: estimate.costUsd,
    confidence: 'estimated',
    source: 'estimate-api',
    ...(estimate.quantity !== undefined ? { quantity: { unit, value: estimate.quantity } } : {}),
  };
}

export function resolveKieDelta(args: {
  before: number | undefined;
  after: number | null;
  sharedWith: number;
}): SpendFigure {
  const { before, after, sharedWith } = args;
  if (before === undefined || after === null) return unknownFigure('balance-delta');
  const delta = before - after;
  if (delta < 0) {
    return unknownFigure('balance-delta', 'The Kie balance rose during this job, so its cost is unknown.');
  }
  if (delta === 0) {
    return unknownFigure('balance-delta', 'The Kie balance did not change, so the cost is unknown.');
  }
  const credits = delta / (sharedWith + 1);
  return {
    costUsd: credits * KIE_USD_PER_CREDIT,
    confidence: 'estimated',
    source: 'balance-delta',
    quantity: { unit: 'credit', value: credits },
    ...(sharedWith > 0
      ? { note: `Balance change shared with ${sharedWith} other Kie job${sharedWith === 1 ? '' : 's'}.` }
      : {}),
  };
}

/**
 * Other Kie jobs whose credits could sit inside this job's before/after window:
 * anything submitted after we read the balance, or anything that succeeded
 * after it. A job still polling only bumps `updatedAt`, which spends nothing,
 * and failed jobs are refunded, so neither counts.
 */
export function kieSharers(jobs: KieJob[], job: KieJob): number {
  return jobs.filter(
    (other) =>
      other.id !== job.id &&
      other.state !== 'fail' &&
      (other.createdAt >= job.createdAt ||
        (other.state === 'success' && other.updatedAt >= job.createdAt))
  ).length;
}

export function resolveHelper(usage: MicroAiUsage): SpendFigure {
  return {
    costUsd: usage.costUsd,
    confidence: 'estimated',
    source: 'catalog-rate',
    quantity: { unit: 'token', value: usage.promptTokens + usage.completionTokens },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/fal/pricing.test.ts tests/spend/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/fal/pricing.ts lib/spend/resolve.ts tests/fal/pricing.test.ts tests/spend/resolve.test.ts
git commit -m "feat: resolve a cost figure per provider"
```

---

### Task 6: Gemini usage passthrough

**Files:**
- Modify: `lib/engines/gemini.ts:3-6, 46-64`
- Modify: `app/api/generate/route.ts:174-178`
- Test: `tests/spend/gemini-usage.test.ts`

**Interfaces:**
- Produces: `EngineUsage = { promptTokens: number; outputTokens: number }`, `EngineResult.usage?: EngineUsage`; `/api/generate` response gains `usage` for Gemini runs.

- [ ] **Step 1: Write the failing test**

`tests/spend/gemini-usage.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { geminiGenerate } from '@/lib/engines/gemini';
import { POST } from '@/app/api/generate/route';

const IMAGE_RESPONSE = {
  candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
  usageMetadata: { promptTokenCount: 560, candidatesTokenCount: 1120 },
};

afterEach(() => generateContent.mockReset());

describe('geminiGenerate usage', () => {
  it('reports prompt and output tokens from usageMetadata', async () => {
    generateContent.mockResolvedValue(IMAGE_RESPONSE);
    const result = await geminiGenerate({ prompt: 'a banana', apiKey: 'k' });
    expect(result.usage).toEqual({ promptTokens: 560, outputTokens: 1120 });
  });

  it('omits usage when the response has no metadata', async () => {
    generateContent.mockResolvedValue({ candidates: IMAGE_RESPONSE.candidates });
    const result = await geminiGenerate({ prompt: 'a banana', apiKey: 'k' });
    expect(result.usage).toBeUndefined();
  });
});

describe('POST /api/generate — Gemini', () => {
  it('passes usage through to the client', async () => {
    generateContent.mockResolvedValue(IMAGE_RESPONSE);
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'gemini', prompt: 'a banana', apiKey: 'k', config: {} }),
      }) as never
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      imageData: 'AAAA',
      usage: { promptTokens: 560, outputTokens: 1120 },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spend/gemini-usage.test.ts`
Expected: FAIL — `result.usage` is undefined in the first and third tests.

- [ ] **Step 3: Read and pass usage through**

In `lib/engines/gemini.ts`, replace the `EngineResult` interface with:

```ts
export interface EngineUsage {
  promptTokens: number;
  outputTokens: number;
}

export interface EngineResult {
  imageData: string; // base64, no data: prefix
  mimeType: string;
  /** Token counts from `usageMetadata`, when the API reported them. */
  usage?: EngineUsage;
}
```

Replace the final `return { imageData, mimeType: 'image/png' };` with:

```ts
  const meta = response.usageMetadata;
  const usage: EngineUsage | undefined =
    meta && typeof meta.candidatesTokenCount === 'number'
      ? { promptTokens: meta.promptTokenCount ?? 0, outputTokens: meta.candidatesTokenCount }
      : undefined;

  return { imageData, mimeType: 'image/png', usage };
```

In `app/api/generate/route.ts`, replace

```ts
    return NextResponse.json({
      success: true,
      imageData: result.imageData,
      mimeType: result.mimeType,
    });
```

with

```ts
    return NextResponse.json({
      success: true,
      imageData: result.imageData,
      mimeType: result.mimeType,
      // Only Gemini reports it; the free engines leave it undefined and JSON drops it.
      usage: 'usage' in result ? result.usage : undefined,
    });
```

If `tsc` reports that `result` is typed as `EngineResult` for all three branches, simplify to `usage: result.usage`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/spend/gemini-usage.test.ts tests/providers/generate-route.test.ts tests/kie/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/engines/gemini.ts app/api/generate/route.ts tests/spend/gemini-usage.test.ts
git commit -m "feat: report Gemini token usage from the generate route"
```

---

### Task 7: fal cost estimate route

**Files:**
- Modify: `lib/fal/server.ts` (append after `validateFalApiKey`, line 196)
- Create: `app/api/fal/estimate/route.ts`
- Modify: `lib/fal/browser.ts` (append an export)
- Test: `tests/fal/estimate.test.ts`, extend `tests/fal/routes.test.ts`

**Interfaces:**
- Consumes: `falUnitQuantity` from Task 5.
- Produces:
  - server `estimateFalCost({ apiKey, endpointId, durationSeconds? }): Promise<FalCostEstimate>` with `FalCostEstimate = { costUsd: number | null; unit?: string; quantity?: number }`
  - `POST /api/fal/estimate` body `{ apiKey, endpointId, durationSeconds? }` → `{ success: true, costUsd, unit?, quantity? }`
  - browser `estimateFalJobCost({ apiKey, endpointId, durationSeconds? }): Promise<FalCostEstimate>` (never rejects)

- [ ] **Step 1: Write the failing tests**

`tests/fal/estimate.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { estimateFalCost } from '@/lib/fal/server';

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('estimateFalCost', () => {
  it('reads the unit, counts the quantity, and asks fal for the total', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ prices: [{ endpoint_id: 'fal-ai/veo3.1', unit_price: 0.05, unit: 'second', currency: 'USD' }] }))
      .mockResolvedValueOnce(jsonResponse({ estimate_type: 'unit_price', total_cost: 0.4, currency: 'USD' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      estimateFalCost({ apiKey: 'fal-key', endpointId: 'fal-ai/veo3.1', durationSeconds: 8 })
    ).resolves.toEqual({ costUsd: 0.4, unit: 'second', quantity: 8 });

    const [pricingUrl, pricingInit] = fetchMock.mock.calls[0];
    expect(String(pricingUrl)).toBe('https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fveo3.1');
    expect(pricingInit.headers.Authorization).toBe('Key fal-key');
    const [, estimateInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(estimateInit.body)).toEqual({
      estimate_type: 'unit_price',
      endpoints: { 'fal-ai/veo3.1': { unit_quantity: 8 } },
    });
  });

  it('falls back to unit price times quantity when the estimate call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ prices: [{ unit_price: 0.039, unit: 'image' }] }))
        .mockResolvedValueOnce(jsonResponse({}, false))
    );
    await expect(estimateFalCost({ apiKey: 'k', endpointId: 'fal-ai/nano-banana-2' })).resolves.toEqual({
      costUsd: 0.039,
      unit: 'image',
      quantity: 1,
    });
  });

  it('is unknown when the unit needs a duration it was not given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ prices: [{ unit_price: 0.05, unit: 'second' }] })));
    // A different endpoint from the first test: unit prices are cached per endpoint for the process.
    await expect(estimateFalCost({ apiKey: 'k', endpointId: 'fal-ai/kling-video/v3' })).resolves.toEqual({ costUsd: null, unit: 'second' });
  });

  it('is unknown when fal cannot be reached, and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(estimateFalCost({ apiKey: 'k', endpointId: 'fal-ai/x' })).resolves.toEqual({ costUsd: null });
  });
});
```

Append to `tests/fal/routes.test.ts`, inside the top-level `describe` (add `estimateFalCost: vi.fn()` to the hoisted block and to the `vi.mock('../../lib/fal/server', …)` factory, and `import { POST as estimatePost } from '../../app/api/fal/estimate/route';` beside the other route imports):

```ts
  describe('POST /api/fal/estimate', () => {
    it('proxies the estimate for a valid body', async () => {
      estimateFalCost.mockResolvedValue({ costUsd: 0.4, unit: 'second', quantity: 8 });
      const response = await estimatePost(
        jsonRequest('/api/fal/estimate', { apiKey: 'fal-key', endpointId: 'fal-ai/veo3.1', durationSeconds: 8 })
      );
      await expect(response.json()).resolves.toEqual({ success: true, costUsd: 0.4, unit: 'second', quantity: 8 });
      expect(estimateFalCost).toHaveBeenCalledWith({ apiKey: 'fal-key', endpointId: 'fal-ai/veo3.1', durationSeconds: 8 });
    });

    it('answers 200 with a null figure when the vendor fails', async () => {
      estimateFalCost.mockRejectedValue(new Error('boom'));
      const response = await estimatePost(jsonRequest('/api/fal/estimate', { apiKey: 'fal-key', endpointId: 'fal-ai/veo3.1' }));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, costUsd: null });
    });

    it('rejects a missing key or an endpoint id it does not like', async () => {
      expect((await estimatePost(jsonRequest('/api/fal/estimate', { endpointId: 'fal-ai/veo3.1' }))).status).toBe(400);
      expect((await estimatePost(jsonRequest('/api/fal/estimate', { apiKey: 'k', endpointId: 'https://evil' }))).status).toBe(400);
      expect(estimateFalCost).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fal/estimate.test.ts tests/fal/routes.test.ts`
Expected: FAIL — `estimateFalCost` is not exported; the estimate route does not exist.

- [ ] **Step 3: Write the server function, route, and browser client**

Append to `lib/fal/server.ts` (after `validateFalApiKey`; also add `import { falUnitQuantity } from './pricing';` at the top):

```ts
const FAL_PRICING_API = 'https://api.fal.ai/v1/models/pricing';
const FAL_ESTIMATE_API = 'https://api.fal.ai/v1/models/pricing/estimate';

export interface FalCostEstimate {
  costUsd: number | null;
  unit?: string;
  quantity?: number;
}

/** Unit prices do not change within a process lifetime, so one lookup per endpoint. */
const falUnitPrices = new Map<string, { unit: string; unitPrice: number }>();

async function falUnitPrice(
  apiKey: string,
  endpointId: string
): Promise<{ unit: string; unitPrice: number } | null> {
  const cached = falUnitPrices.get(endpointId);
  if (cached) return cached;
  try {
    const response = await fetch(`${FAL_PRICING_API}?endpoint_id=${encodeURIComponent(endpointId)}`, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!response.ok) return null;
    const payload = asRecord(await response.json());
    const first = asRecord((Array.isArray(payload.prices) ? payload.prices : [])[0]);
    if (typeof first.unit !== 'string' || typeof first.unit_price !== 'number') return null;
    const price = { unit: first.unit, unitPrice: first.unit_price };
    falUnitPrices.set(endpointId, price);
    return price;
  } catch {
    return null;
  }
}

async function falEstimateTotal(apiKey: string, endpointId: string, quantity: number): Promise<number | null> {
  try {
    const response = await fetch(FAL_ESTIMATE_API, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estimate_type: 'unit_price',
        endpoints: { [endpointId]: { unit_quantity: quantity } },
      }),
    });
    if (!response.ok) return null;
    const payload = asRecord(await response.json());
    return typeof payload.total_cost === 'number' && Number.isFinite(payload.total_cost)
      ? payload.total_cost
      : null;
  } catch {
    return null;
  }
}

/**
 * What one run of an endpoint costs. Never throws: a spend figure is a readout,
 * and the generation it describes has already succeeded. Prefers fal's own
 * estimate (it applies account discounts), and multiplies the unit price itself
 * when that call fails.
 */
export async function estimateFalCost(args: {
  apiKey: string;
  endpointId: string;
  durationSeconds?: number;
}): Promise<FalCostEstimate> {
  const price = await falUnitPrice(args.apiKey, args.endpointId);
  if (!price) return { costUsd: null };
  const quantity = falUnitQuantity(price.unit, args.durationSeconds);
  if (quantity === null) return { costUsd: null, unit: price.unit };
  const total = await falEstimateTotal(args.apiKey, args.endpointId, quantity);
  return { costUsd: total ?? price.unitPrice * quantity, unit: price.unit, quantity };
}
```

Create `app/api/fal/estimate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { estimateFalCost } from '@/lib/fal/server';
import { FalRequestBodyTooLarge, parseBoundedFalJson } from '@/lib/fal/request-body';

const MAX_ESTIMATE_BODY_BYTES = 4 * 1024;
const MAX_API_KEY_LENGTH = 1024;
/** fal endpoint ids look like `fal-ai/veo3.1/fast/image-to-video`. */
const ENDPOINT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i;

/**
 * Cost estimate for one run. Answers 200 with `costUsd: null` on any vendor
 * failure: the caller has already generated something and can do nothing with
 * an error except show an unknown figure.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await parseBoundedFalJson(request, MAX_ESTIMATE_BODY_BYTES);
  } catch (error) {
    const status = error instanceof FalRequestBodyTooLarge ? 413 : 400;
    return NextResponse.json({ success: false, error: 'The request body must be valid JSON.' }, { status });
  }

  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
  const endpointId = typeof record.endpointId === 'string' ? record.endpointId.trim() : '';
  const durationSeconds =
    typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds) && record.durationSeconds > 0
      ? record.durationSeconds
      : undefined;

  if (!apiKey || apiKey.length > MAX_API_KEY_LENGTH) {
    return NextResponse.json({ success: false, error: 'A fal API key is required.' }, { status: 400 });
  }
  if (!endpointId || endpointId.length > 128 || !ENDPOINT_ID_PATTERN.test(endpointId)) {
    return NextResponse.json({ success: false, error: 'A fal endpoint id is required.' }, { status: 400 });
  }

  try {
    const estimate = await estimateFalCost({ apiKey, endpointId, durationSeconds });
    return NextResponse.json({ success: true, ...estimate });
  } catch {
    return NextResponse.json({ success: true, costUsd: null });
  }
}
```

Append to `lib/fal/browser.ts`:

```ts
export interface FalJobCostEstimate {
  costUsd: number | null;
  unit?: string;
  quantity?: number;
}

/** Spend readout for a finished job. Resolves to an unknown figure rather than rejecting. */
export async function estimateFalJobCost(args: {
  apiKey: string;
  endpointId: string;
  durationSeconds?: number;
}): Promise<FalJobCostEstimate> {
  try {
    const response = await fetch('/api/fal/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<FalJobCostEstimate> & { success?: boolean };
    if (!response.ok || !data.success) return { costUsd: null };
    return {
      costUsd: typeof data.costUsd === 'number' ? data.costUsd : null,
      ...(typeof data.unit === 'string' ? { unit: data.unit } : {}),
      ...(typeof data.quantity === 'number' ? { quantity: data.quantity } : {}),
    };
  } catch {
    return { costUsd: null };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/fal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/fal/server.ts lib/fal/browser.ts app/api/fal/estimate tests/fal/estimate.test.ts tests/fal/routes.test.ts
git commit -m "feat: estimate what a fal run cost"
```

---

### Task 8: Kie credits route and balance-before-submit

**Files:**
- Create: `app/api/kie/credits/route.ts`
- Modify: `lib/kie/browser.ts` (append), `lib/kie/types.ts:53-66`, `components/KieGenerationWorkspace.tsx:9, 351-378`
- Test: extend `tests/kie/routes.test.ts`, `tests/kie/workspace.test.tsx`

**Interfaces:**
- Produces: `POST /api/kie/credits` `{ apiKey }` → `{ success: true, credits: number | null }`; browser `fetchKieCredits(apiKey): Promise<number | null>`; `KieJob.creditsBefore?: number`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/kie/routes.test.ts` inside `describe('Kie API routes', …)` (add `import { POST as creditsPost } from '../../app/api/kie/credits/route';`):

```ts
  it('reads the credit balance without validating anything else', async () => {
    validateKieApiKey.mockResolvedValue({ credits: 940 });
    const response = await creditsPost(
      new Request('http://localhost/api/kie/credits', { method: 'POST', body: JSON.stringify({ apiKey: 'kie_test_key' }) }) as NextRequest
    );
    await expect(response.json()).resolves.toEqual({ success: true, credits: 940 });
  });

  it('answers 200 with a null balance when Kie fails', async () => {
    validateKieApiKey.mockRejectedValue(new Error('down'));
    const response = await creditsPost(
      new Request('http://localhost/api/kie/credits', { method: 'POST', body: JSON.stringify({ apiKey: 'kie_test_key' }) }) as NextRequest
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, credits: null });
  });

  it('rejects a credits request without a key', async () => {
    const response = await creditsPost(
      new Request('http://localhost/api/kie/credits', { method: 'POST', body: JSON.stringify({}) }) as NextRequest
    );
    expect(response.status).toBe(400);
  });
```

In `tests/kie/workspace.test.tsx`, add `fetchKieCreditsMock: vi.fn()` to the `vi.hoisted` block (line 9), add `fetchKieCredits: fetchKieCreditsMock,` to the `vi.mock('../../lib/kie/browser', …)` factory (line 14), and add `fetchKieCreditsMock.mockResolvedValue(1000);` to `beforeEach` beside the other `mockResolvedValue` lines. Then add this test directly after `submits shared control values with their declared types`:

```ts
  it('reads the Kie balance before submitting and pins it to the job', async () => {
    render(
      <KieGenerationWorkspace
        mediaType="image"
        inputMode="text"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A glass forest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));

    await waitFor(() => expect(submitKieJobMock).toHaveBeenCalledOnce());
    expect(fetchKieCreditsMock).toHaveBeenCalledWith('kie_test_key');
    await waitFor(() =>
      expect(useKieJobsStore.getState().jobs[0]).toMatchObject({ id: 'task_test', creditsBefore: 1000 })
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/kie/routes.test.ts tests/kie/workspace.test.tsx`
Expected: FAIL — credits route missing; `creditsBefore` undefined.

- [ ] **Step 3: Write the route, client, type, and workspace change**

`app/api/kie/credits/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { validateKieApiKey } from '@/lib/kie/server';

/**
 * Current Kie credit balance. The spend ledger reads it before a submit and
 * after a success and bills the difference, so a vendor failure here answers
 * 200 with `null`: the run is already done and only the readout is affected.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { apiKey?: unknown } | null;
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Kie API key is required' }, { status: 400 });
  }
  try {
    const { credits } = await validateKieApiKey(apiKey);
    return NextResponse.json({ success: true, credits });
  } catch {
    return NextResponse.json({ success: true, credits: null });
  }
}
```

Append to `lib/kie/browser.ts`:

```ts
/** Balance readout for the spend ledger. Resolves to null on any failure. */
export async function fetchKieCredits(apiKey: string): Promise<number | null> {
  try {
    const response = await fetch('/api/kie/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; credits?: unknown };
    return response.ok && data.success && typeof data.credits === 'number' ? data.credits : null;
  } catch {
    return null;
  }
}
```

In `lib/kie/types.ts`, inside `KieJob` after `controlValues`, add:

```ts
  /** Credit balance read just before submit; the ledger bills the drop on success. */
  creditsBefore?: number;
```

In `components/KieGenerationWorkspace.tsx`:
- line 9: `import { fetchKieCredits, submitKieJob, uploadKieFiles } from '@/lib/kie/browser';`
- in `submit`, replace `const uploadUrls = await uploadKieFiles(kieApiKey, references.map((reference) => reference.file));` with

```ts
      // The balance is read alongside the uploads, before the submit that spends
      // it, so the ledger can bill the drop once the task succeeds.
      const [uploadUrls, creditsBefore] = await Promise.all([
        uploadKieFiles(kieApiKey, references.map((reference) => reference.file)),
        fetchKieCredits(kieApiKey),
      ]);
```

- in the `upsertJob({ … })` call that follows, add `creditsBefore: creditsBefore ?? undefined,` after `controlValues: values,`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/kie`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add app/api/kie/credits lib/kie/browser.ts lib/kie/types.ts components/KieGenerationWorkspace.tsx tests/kie
git commit -m "feat: read the Kie balance before a submit"
```

---

### Task 9: Capture at every settle point

**Files:**
- Create: `lib/spend/capture.ts`
- Modify: `components/FalJobsProvider.tsx:5-11, 131-135`, `components/KieJobsProvider.tsx:4-9, 36-40`, `components/ProviderVideoWorkspace.tsx:18-20, 395-412`, `components/GenerationInterface.tsx:19-21, 401-540`, `store/useMicroAiUsageStore.ts`
- Test: `tests/spend/capture.test.ts`; extend `tests/fal/jobs-provider.test.tsx`, `tests/kie/jobs-provider.test.tsx`, `tests/micro-ai/browser.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `captureImageResult(args: ImageResultCapture): void`
  - `captureFalJob(job: FalJob, apiKey: string): void`
  - `captureKieJob(job: KieJob, apiKey: string, jobs: KieJob[]): void`
  - `captureProviderJob(provider: ProviderId, job: ProviderJob, task: ProviderTask): void`
  - `captureHelper(usage: MicroAiUsage, model: string): void`

- [ ] **Step 1: Write the failing tests**

`tests/spend/capture.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { estimateFalJobCost, fetchKieCredits } = vi.hoisted(() => ({
  estimateFalJobCost: vi.fn(),
  fetchKieCredits: vi.fn(),
}));
vi.mock('@/lib/fal/browser', () => ({ estimateFalJobCost }));
vi.mock('@/lib/kie/browser', () => ({ fetchKieCredits }));

import type { FalJob } from '@/lib/fal/types';
import type { KieJob } from '@/lib/kie/types';
import {
  captureFalJob,
  captureHelper,
  captureImageResult,
  captureKieJob,
  captureProviderJob,
} from '@/lib/spend/capture';
import type { ProviderJob } from '@/store/useProviderJobsStore';
import { useSpendStore } from '@/store/useSpendStore';

const entries = () => useSpendStore.getState().entries;

beforeEach(() => {
  useSpendStore.setState({ entries: [] });
  estimateFalJobCost.mockReset();
  fetchKieCredits.mockReset();
});

describe('captureImageResult', () => {
  it('files a Gemini run as exact when usage came back', () => {
    captureImageResult({
      engine: 'gemini',
      prompt: 'A harbour at dusk',
      inputImages: 0,
      resolution: '1K',
      usage: { promptTokens: 10, outputTokens: 1120 },
      galleryRecordId: 'result-1',
    });
    expect(entries()[0]).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3-pro-image-preview',
      kind: 'image',
      confidence: 'exact',
      source: 'usage-metadata',
      promptExcerpt: 'A harbour at dusk',
      galleryRecordId: 'result-1',
    });
  });

  it('files free engines at zero', () => {
    captureImageResult({ engine: 'pollinations', prompt: 'p', inputImages: 0 });
    expect(entries()[0]).toMatchObject({ provider: 'pollinations', costUsd: 0, source: 'free' });
  });

  it('files an aggregator image with the response cost or the catalog rate', () => {
    captureImageResult({ engine: 'runware', modelId: 'runware:z-image@turbo', prompt: 'p', inputImages: 0, cost: 0.003 });
    captureImageResult({ engine: 'atlas', modelId: 'z-image/turbo', prompt: 'p', inputImages: 0 });
    captureImageResult({ engine: 'comet', modelId: 'gpt-image-2', prompt: 'p', inputImages: 0 });
    expect(entries().map((e) => [e.provider, e.costUsd, e.confidence])).toEqual([
      ['comet', null, 'unknown'],
      ['atlas', 0.005, 'estimated'],
      ['runware', 0.003, 'exact'],
    ]);
  });

  it('asks fal for an estimate on the image endpoint', async () => {
    estimateFalJobCost.mockResolvedValue({ costUsd: 0.039, unit: 'image', quantity: 1 });
    captureImageResult({ engine: 'fal', modelId: 'nano-banana-2', prompt: 'p', inputImages: 2, falApiKey: 'fal-key' });
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(estimateFalJobCost).toHaveBeenCalledWith({ apiKey: 'fal-key', endpointId: expect.stringContaining('nano-banana-2') });
    expect(entries()[0]).toMatchObject({ provider: 'fal', costUsd: 0.039, source: 'estimate-api', inputMode: 'image' });
  });
});

describe('captureFalJob', () => {
  const job: FalJob = {
    id: 'req-1', requestId: 'req-1', state: 'success', logs: [], modelId: 'veo-3-1-fast',
    mediaType: 'video', inputMode: 'text', prompt: 'A banana crossing the moon',
    controlValues: { duration: '8s' }, createdAt: 1, updatedAt: 2, pollAttempt: 1,
  };

  it('estimates from the variant endpoint and the duration control', async () => {
    estimateFalJobCost.mockResolvedValue({ costUsd: 1.2, unit: 'second', quantity: 8 });
    captureFalJob(job, 'fal-key');
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(estimateFalJobCost).toHaveBeenCalledWith({ apiKey: 'fal-key', endpointId: 'fal-ai/veo3.1/fast', durationSeconds: 8 });
    expect(entries()[0]).toMatchObject({ id: 'fal-req-1', galleryRecordId: 'fal-req-1', kind: 'video', costUsd: 1.2, quantity: { unit: 'second', value: 8 } });
  });

  it('records unknown, not nothing, when the estimate throws', async () => {
    estimateFalJobCost.mockRejectedValue(new Error('offline'));
    captureFalJob(job, 'fal-key');
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toMatchObject({ costUsd: null, confidence: 'unknown' });
  });
});

describe('captureKieJob', () => {
  const job: KieJob = {
    id: 't-1', taskId: 't-1', protocol: 'market', state: 'success', resultUrls: [],
    modelId: 'nano-banana-pro', mediaType: 'image', inputMode: 'text', prompt: 'p',
    creditsBefore: 1000, createdAt: 1_000, updatedAt: 5_000, pollAttempt: 1,
  };

  it('bills the balance drop', async () => {
    fetchKieCredits.mockResolvedValue(940);
    captureKieJob(job, 'kie-key', [job]);
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toMatchObject({ id: 'kie-t-1', provider: 'kie', costUsd: 0.3, quantity: { unit: 'credit', value: 60 } });
  });

  it('splits with an overlapping job', async () => {
    fetchKieCredits.mockResolvedValue(940);
    captureKieJob(job, 'kie-key', [job, { ...job, id: 't-2', createdAt: 2_000 }]);
    await vi.waitFor(() => expect(entries()).toHaveLength(1));
    expect(entries()[0]).toMatchObject({ costUsd: 0.15, note: 'Balance change shared with 1 other Kie job.' });
  });
});

describe('captureProviderJob', () => {
  const job: ProviderJob = {
    id: 'runware-1', provider: 'runware', modelId: 'alibaba:wan@3.0', prompt: 'p', inputMode: 'text',
    state: 'success', urls: ['https://x/y.mp4'], controlValues: { duration: 5 }, createdAt: 1, updatedAt: 2, pollAttempt: 1,
  };

  it('uses the Runware response cost', () => {
    captureProviderJob('runware', job, { taskId: 'x', state: 'success', urls: job.urls, cost: 0.25 });
    expect(entries()[0]).toMatchObject({ id: 'runware-runware-1', galleryRecordId: 'runware-runware-1', kind: 'video', costUsd: 0.25, confidence: 'exact' });
  });

  it('uses the catalog rate and duration for Atlas', () => {
    captureProviderJob('atlas', { ...job, provider: 'atlas', modelId: 'ltx-2.3-quality/text-to-video' }, { taskId: 'x', state: 'success', urls: job.urls });
    expect(entries()[0]).toMatchObject({ costUsd: 0.01, confidence: 'estimated', quantity: { unit: 'second', value: 5 } });
  });
});

describe('captureHelper', () => {
  it('files a helper entry per request', () => {
    captureHelper({ promptTokens: 100, completionTokens: 20, costUsd: 0.0000024 }, 'meta-llama/Llama-3.1-8B-Instruct');
    expect(entries()[0]).toMatchObject({ provider: 'micro-ai', kind: 'helper', modelId: 'meta-llama/Llama-3.1-8B-Instruct', costUsd: 0.0000024 });
  });
});
```

Extend `tests/fal/jobs-provider.test.tsx`: add `estimateFalJobCost: vi.fn().mockResolvedValue({ costUsd: 0.5, unit: 'second', quantity: 8 })` to the hoisted block and to the `vi.mock('../../lib/fal/browser', …)` factory; import `useSpendStore` and reset it in `beforeEach` (`useSpendStore.setState({ entries: [] })`). Then at the end of the first test (`polls queued to running to success …`), after the existing success assertions, add:

```ts
    await vi.waitFor(() => expect(useSpendStore.getState().entries).toHaveLength(1));
    expect(useSpendStore.getState().entries[0]).toMatchObject({ id: `fal-${initial.id}`, provider: 'fal', kind: 'video', costUsd: 0.5 });
```

And a new test in the same file:

```ts
  it('files nothing in the spend ledger for a failed job', async () => {
    getFalJobStatus.mockResolvedValueOnce({ requestId: 'request_0001', state: 'fail', logs: [], error: 'nope' });
    useFalJobsStore.getState().upsertJob(makeJob());
    render(<FalJobsProvider><div /></FalJobsProvider>);
    await advance(nextFalPollDelay(0));
    expect(useFalJobsStore.getState().jobs[0].state).toBe('fail');
    expect(useSpendStore.getState().entries).toEqual([]);
  });
```

Extend `tests/kie/jobs-provider.test.tsx`: add `fetchKieCredits: vi.fn().mockResolvedValue(940)` to the hoisted block and mock factory, import and reset `useSpendStore`, give the polled job `creditsBefore: 1000`, and after the existing success expectation add:

```ts
    await vi.waitFor(() => expect(useSpendStore.getState().entries).toHaveLength(1));
    expect(useSpendStore.getState().entries[0]).toMatchObject({ id: 'kie-task_poll_1', costUsd: 0.3 });
```

Extend `tests/micro-ai/browser.test.ts` `requestPromptSlug usage accounting`: reset `useSpendStore` in `beforeEach`, and at the end of the accumulate test assert `expect(useSpendStore.getState().entries[0]).toMatchObject({ provider: 'micro-ai', kind: 'helper' })`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/spend/capture.test.ts tests/fal/jobs-provider.test.tsx tests/kie/jobs-provider.test.tsx tests/micro-ai/browser.test.ts`
Expected: FAIL — `@/lib/spend/capture` missing; no ledger entries appear.

- [ ] **Step 3: Write the capture module and wire it in**

`lib/spend/capture.ts`:

```ts
// lib/spend/capture.ts
/**
 * The one door into the ledger. Called at each place a generation already
 * becomes final, next to the gallery record, and never throws back into that
 * path: a spend figure is a readout of work that has already succeeded.
 */
import { estimateFalJobCost } from '@/lib/fal/browser';
import { FAL_IMAGE_MODEL, resolveFalVariant } from '@/lib/fal/catalog';
import { falDurationSeconds } from '@/lib/fal/pricing';
import type { FalJob } from '@/lib/fal/types';
import type { EngineId } from '@/lib/engines/registry';
import { fetchKieCredits } from '@/lib/kie/browser';
import type { KieJob } from '@/lib/kie/types';
import type { MicroAiUsage } from '@/lib/micro-ai/models';
import { findModel } from '@/lib/providers/catalog';
import type { ProviderId, ProviderTask } from '@/lib/providers/types';
import type { ProviderJob } from '@/store/useProviderJobsStore';
import { useSpendStore } from '@/store/useSpendStore';

import { excerpt, type SpendEntry } from './ledger';
import { GEMINI_IMAGE_RATES } from './rates';
import {
  kieSharers,
  resolveCatalogRate,
  resolveFalEstimate,
  resolveFree,
  resolveGemini,
  resolveHelper,
  resolveKieDelta,
  resolveRunware,
  unknownFigure,
  type GeminiUsage,
  type SpendFigure,
} from './resolve';

let sequence = 0;

function mintId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function file(entry: SpendEntry): void {
  try {
    useSpendStore.getState().record(entry);
  } catch {
    // A full or blocked localStorage must not surface as a generation problem.
  }
}

function withFigure(
  base: Omit<SpendEntry, 'costUsd' | 'confidence' | 'source' | 'quantity' | 'note'>,
  figure: SpendFigure
): SpendEntry {
  return { ...base, ...figure };
}

export interface ImageResultCapture {
  engine: EngineId;
  modelId?: string;
  prompt: string;
  inputImages: number;
  resolution?: string;
  usage?: GeminiUsage | null;
  /** Response cost, when the route returned one (Runware). */
  cost?: number;
  galleryRecordId?: string;
  /** fal only: the key the estimate call needs. */
  falApiKey?: string;
}

const GEMINI_MODEL = GEMINI_IMAGE_RATES.modelId;

export function captureImageResult(args: ImageResultCapture): void {
  try {
    const at = Date.now();
    const base = {
      id: mintId(args.engine),
      at,
      provider: args.engine,
      modelId: args.modelId ?? (args.engine === 'gemini' ? GEMINI_MODEL : args.engine),
      kind: 'image' as const,
      inputMode: args.inputImages > 0 ? 'image' : 'text',
      promptExcerpt: excerpt(args.prompt),
      ...(args.galleryRecordId ? { galleryRecordId: args.galleryRecordId } : {}),
    };

    switch (args.engine) {
      case 'gemini':
        file(withFigure(base, resolveGemini({ usage: args.usage, resolution: args.resolution, inputImages: args.inputImages })));
        return;
      case 'pollinations':
      case 'cloudflare':
        file(withFigure(base, resolveFree()));
        return;
      case 'runware':
        file(withFigure(base, resolveRunware(args.cost)));
        return;
      case 'atlas':
      case 'comet':
        file(withFigure(base, resolveCatalogRate(args.modelId ? findModel(args.engine, args.modelId) : undefined)));
        return;
      case 'fal': {
        const inputMode = args.inputImages > 0 ? 'image' : 'text';
        const modelId = args.modelId ?? FAL_IMAGE_MODEL.id;
        void (async () => {
          try {
            const endpointId = resolveFalVariant(modelId, 'image', inputMode).endpointId;
            const estimate = args.falApiKey
              ? await estimateFalJobCost({ apiKey: args.falApiKey, endpointId })
              : null;
            file(withFigure({ ...base, modelId }, resolveFalEstimate(estimate)));
          } catch {
            file(withFigure({ ...base, modelId }, unknownFigure('estimate-api')));
          }
        })();
        return;
      }
      case 'kie':
        // Kie images run through KieGenerationWorkspace and captureKieJob.
        return;
    }
  } catch {
    // Never let a readout break the studio.
  }
}

export function captureFalJob(job: FalJob, apiKey: string): void {
  const base = {
    id: `fal-${job.id}`,
    at: Date.now(),
    provider: 'fal' as const,
    modelId: job.modelId,
    kind: job.mediaType,
    inputMode: job.inputMode,
    promptExcerpt: excerpt(job.prompt),
    galleryRecordId: `fal-${job.id}`,
  };
  void (async () => {
    try {
      const endpointId = resolveFalVariant(job.modelId, job.mediaType, job.inputMode).endpointId;
      const durationSeconds = falDurationSeconds(job.controlValues ?? {});
      const estimate = await estimateFalJobCost({
        apiKey,
        endpointId,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      });
      file(withFigure(base, resolveFalEstimate(estimate)));
    } catch {
      file(withFigure(base, unknownFigure('estimate-api')));
    }
  })();
}

export function captureKieJob(job: KieJob, apiKey: string, jobs: KieJob[]): void {
  const base = {
    id: `kie-${job.id}`,
    at: Date.now(),
    provider: 'kie' as const,
    modelId: job.modelId,
    kind: job.mediaType,
    inputMode: job.inputMode,
    promptExcerpt: excerpt(job.prompt),
    galleryRecordId: `kie-${job.id}`,
  };
  void (async () => {
    try {
      const after = await fetchKieCredits(apiKey);
      const sharedWith = kieSharers(jobs, job);
      file(withFigure(base, resolveKieDelta({ before: job.creditsBefore, after, sharedWith })));
    } catch {
      file(withFigure(base, unknownFigure('balance-delta')));
    }
  })();
}

export function captureProviderJob(provider: ProviderId, job: ProviderJob, task: ProviderTask): void {
  try {
    const base = {
      id: `${provider}-${job.id}`,
      at: Date.now(),
      provider,
      modelId: job.modelId,
      kind: 'video' as const,
      inputMode: job.inputMode,
      promptExcerpt: excerpt(job.prompt),
      galleryRecordId: `${provider}-${job.id}`,
    };
    if (provider === 'runware') {
      file(withFigure(base, resolveRunware(task.cost)));
      return;
    }
    const duration = job.controlValues?.duration;
    file(
      withFigure(
        base,
        resolveCatalogRate(findModel(provider, job.modelId), typeof duration === 'number' ? duration : undefined)
      )
    );
  } catch {
    // See file().
  }
}

export function captureHelper(usage: MicroAiUsage, model: string): void {
  try {
    file(
      withFigure(
        {
          id: mintId('micro-ai'),
          at: Date.now(),
          provider: 'micro-ai',
          modelId: model,
          kind: 'helper',
          promptExcerpt: '',
        },
        resolveHelper(usage)
      )
    );
  } catch {
    // See file().
  }
}
```

Wire it in:

**`components/FalJobsProvider.tsx`**: add `import { captureFalJob } from '@/lib/spend/capture';`. In `settle`, change the success branch to:

```ts
        if (task.state === 'success') {
          recordFinishedJob('fal', { ...job, mimeType: task.mimeType }, task.resultUrl);
          captureFalJob(job, operation.apiKey);
          playGenerationChime();
        }
```

**`components/KieJobsProvider.tsx`**: add `import { captureKieJob } from '@/lib/spend/capture';`. Change the success branch to:

```ts
              if (task.state === 'success') {
                recordFinishedJob('kie', job, task.resultUrls[0]);
                captureKieJob(job, apiKey, useKieJobsStore.getState().jobs);
                playGenerationChime();
              }
```

**`components/ProviderVideoWorkspace.tsx`**: add `import { captureProviderJob } from '@/lib/spend/capture';`. In `pollJob`, inside `if (task.state === 'success') {` directly after the `recordFinishedJob(…)` call, add `captureProviderJob(provider, job, task);`.

**`components/GenerationInterface.tsx`**:
- add `import { captureImageResult } from '@/lib/spend/capture';` and `import type { EngineUsage } from '@/lib/engines/gemini';`.
- change the mutation's declared return type to `Promise<{ dataUrl: string; ext: string; mimeType: string; usage?: EngineUsage; cost?: number }>`.
- in the successful route branch, return `{ dataUrl: …, ext, mimeType: mime, usage: data.usage, cost: typeof data.cost === 'number' ? data.cost : undefined }`.
- change `captureImage` to return the record id: `const record = await useGalleryStore.getState().record({ … }); return record?.id;` (and `catch { return undefined; }`). Its signature becomes `async (result: string): Promise<string | undefined>`.
- in `onSuccess`, replace `void captureImage(result.dataUrl);` with:

```ts
      void captureImage(result.dataUrl).then((galleryRecordId) =>
        captureImageResult({
          engine: activeEngine.id,
          modelId: activeModelId,
          prompt,
          inputImages: images.length,
          resolution: config.imageSize,
          usage: result.usage,
          cost: result.cost,
          galleryRecordId,
          falApiKey,
        })
      );
```

**`store/useMicroAiUsageStore.ts`**: add `import { captureHelper } from '@/lib/spend/capture';` and change `record` to call it first:

```ts
  record: (usage, model) => {
    captureHelper(usage, model);
    set((state) => ({ … unchanged … }));
  },
```

Also add `estimateFalJobCost: vi.fn().mockResolvedValue({ costUsd: null })` to the `vi.mock('@/lib/fal/browser', …)` factory in `tests/generation-interface.test.tsx` so the fal image path has the function it now imports.

The aggregator video path is covered by the `captureProviderJob` unit tests above rather than by extending `tests/providers/workspace.test.tsx`: that file drives real timers through `pollJob`, and a direct test of the capture function is both faster and more precise about the figure filed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/spend tests/fal tests/kie tests/micro-ai tests/generation-interface.test.tsx tests/providers/workspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/spend/capture.ts components/FalJobsProvider.tsx components/KieJobsProvider.tsx components/ProviderVideoWorkspace.tsx components/GenerationInterface.tsx store/useMicroAiUsageStore.ts tests
git commit -m "feat: file every finished generation in the spend ledger"
```

---

### Task 10: The `/spend` page

**Files:**
- Create: `lib/spend/palette.ts`, `components/spend/ConfidenceBadge.tsx`, `components/spend/SpendSummary.tsx`, `components/spend/SpendDailyChart.tsx`, `components/spend/SpendBreakdown.tsx`, `components/spend/SpendLedger.tsx`, `app/spend/page.tsx`
- Test: `tests/spend/page.test.tsx`

**Interfaces:**
- Consumes: store, rollups, format, `fetchKieCredits`, `SegmentedToggleGroup`, `ProviderLogo`, `BrandWordmark`.
- Produces: the route `/spend` reading `?range=`.

Before writing the chart, load the `dataviz` skill and follow its guidance on bar marks, axis labels, and the hover state; keep the fills from `lib/spend/palette.ts`.

- [ ] **Step 1: Write the failing test**

`tests/spend/page.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spend/page.test.tsx`
Expected: FAIL — `@/app/spend/page` does not exist.

- [ ] **Step 3: Write the palette, components, and page**

`lib/spend/palette.ts`:

```ts
// lib/spend/palette.ts
import type { SpendProvider } from './ledger';

/**
 * Chart fills per provider, from the design tokens. Five hues cover nine
 * providers, so the second user of a hue takes it at lower opacity; the pairs
 * are never adjacent in practice because a stack orders by the provider list.
 */
export const PROVIDER_FILL: Record<SpendProvider, { color: string; opacity: number }> = {
  gemini: { color: 'var(--neon-cyan)', opacity: 1 },
  runware: { color: 'var(--neon-cyan)', opacity: 0.5 },
  pollinations: { color: 'var(--neon-purple)', opacity: 1 },
  atlas: { color: 'var(--neon-purple)', opacity: 0.5 },
  fal: { color: 'var(--neon-pink)', opacity: 1 },
  comet: { color: 'var(--neon-pink)', opacity: 0.5 },
  cloudflare: { color: 'var(--brand-accent)', opacity: 1 },
  kie: { color: 'var(--foreground)', opacity: 0.85 },
  'micro-ai': { color: 'var(--foreground-muted)', opacity: 0.7 },
};

/** Stack order, so the same provider always sits at the same height. */
export const PROVIDER_ORDER: SpendProvider[] = [
  'gemini', 'fal', 'kie', 'runware', 'atlas', 'comet', 'pollinations', 'cloudflare', 'micro-ai',
];
```

`components/spend/ConfidenceBadge.tsx`:

```tsx
import type { SpendConfidence, SpendSource } from '@/lib/spend/ledger';

const LABELS: Record<SpendConfidence, string> = { exact: 'Exact', estimated: 'Estimated', unknown: 'Unknown' };

const SOURCES: Record<SpendSource, string> = {
  response: 'Cost reported by the provider in its response.',
  'usage-metadata': 'Priced from the token counts the provider reported.',
  'estimate-api': "Estimated by the provider's pricing endpoint.",
  'balance-delta': 'Credit balance before the run minus the balance after.',
  'catalog-rate': 'Published list price times the quantity generated.',
  free: 'This engine is free.',
};

const STYLES: Record<SpendConfidence, string> = {
  exact: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  estimated: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  unknown: 'border-[var(--border)] bg-[var(--background-elevated)] text-[var(--foreground-muted)]',
};

export default function ConfidenceBadge({ confidence, source, note }: { confidence: SpendConfidence; source: SpendSource; note?: string }) {
  return (
    <span
      title={note ? `${SOURCES[source]} ${note}` : SOURCES[source]}
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[0.6875rem] font-medium ${STYLES[confidence]}`}
    >
      {LABELS[confidence]}
    </span>
  );
}
```

`components/spend/SpendSummary.tsx`:

```tsx
import { formatUsdTotal } from '@/lib/spend/format';
import type { SpendTotals } from '@/lib/spend/rollup';

interface SpendSummaryProps {
  totals: SpendTotals;
  /** Live Kie balance; undefined hides the tile, null means the read failed. */
  kieCredits?: number | null;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card p-3.5 md:p-4">
      <dt className="field-label">{label}</dt>
      <dd className="display mt-1 text-2xl">{value}</dd>
      {hint && <p className="field-hint mt-1">{hint}</p>}
    </div>
  );
}

export default function SpendSummary({ totals, kieCredits }: SpendSummaryProps) {
  const exactShare = totals.costUsd > 0 ? Math.round((totals.exactUsd / totals.costUsd) * 100) : 0;
  return (
    <section aria-label="Summary">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total" value={formatUsdTotal(totals.costUsd)} hint={totals.unknownRuns > 0 ? `${totals.unknownRuns} run${totals.unknownRuns === 1 ? '' : 's'} unpriced` : undefined} />
        <Tile label="Runs" value={String(totals.runs)} />
        <Tile label="Exact" value={`${exactShare}%`} hint={`${formatUsdTotal(totals.estimatedUsd)} estimated`} />
        {kieCredits !== undefined && (
          <Tile label="Kie credits" value={kieCredits === null ? '—' : String(kieCredits)} hint="Live balance" />
        )}
      </dl>
    </section>
  );
}
```

`components/spend/SpendDailyChart.tsx` (shape it per the `dataviz` skill; this is the minimum the test needs):

```tsx
import { formatUsdTotal } from '@/lib/spend/format';
import { providerLabel } from '@/lib/spend/ledger';
import { PROVIDER_FILL, PROVIDER_ORDER } from '@/lib/spend/palette';
import type { SpendDay } from '@/lib/spend/rollup';

const WIDTH = 600;
const HEIGHT = 160;
const PAD_BOTTOM = 18;

export default function SpendDailyChart({ days }: { days: SpendDay[] }) {
  const max = Math.max(...days.map((day) => day.costUsd), 0);
  const slot = WIDTH / Math.max(days.length, 1);
  const barWidth = Math.max(2, slot * 0.7);
  const plotHeight = HEIGHT - PAD_BOTTOM;
  const scale = (usd: number) => (max > 0 ? (usd / max) * plotHeight : 0);
  const labelEvery = days.length > 14 ? Math.ceil(days.length / 6) : 1;

  return (
    <section aria-label="Daily spend" className="glass-card p-3.5 md:p-4">
      <h2 className="field-label mb-2">Per day</h2>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Spend per day, stacked by provider" className="h-40 w-full">
        <line x1="0" x2={WIDTH} y1={plotHeight} y2={plotHeight} stroke="var(--border)" />
        {days.map((day, index) => {
          const x = index * slot + (slot - barWidth) / 2;
          let y = plotHeight;
          return (
            <g key={day.day}>
              <title>{`${day.day}: ${formatUsdTotal(day.costUsd)} across ${day.runs} run${day.runs === 1 ? '' : 's'}`}</title>
              {PROVIDER_ORDER.map((provider) => {
                const usd = day.byProvider[provider] ?? 0;
                if (usd <= 0) return null;
                const height = scale(usd);
                y -= height;
                const fill = PROVIDER_FILL[provider];
                return (
                  <rect key={provider} x={x} y={y} width={barWidth} height={height} fill={fill.color} fillOpacity={fill.opacity}>
                    <title>{`${providerLabel(provider)}: ${formatUsdTotal(usd)}`}</title>
                  </rect>
                );
              })}
              {index % labelEvery === 0 && (
                <text x={x + barWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize="10" fill="var(--foreground-muted)">
                  {day.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
```

`components/spend/SpendBreakdown.tsx`:

```tsx
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
```

`components/spend/SpendLedger.tsx`:

```tsx
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
```

`app/spend/page.tsx`:

```tsx
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

  const [kieCredits, setKieCredits] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!kieApiKey) {
      setKieCredits(undefined);
      return;
    }
    let cancelled = false;
    void fetchKieCredits(kieApiKey).then((credits) => {
      if (!cancelled) setKieCredits(credits);
    });
    return () => {
      cancelled = true;
    };
  }, [kieApiKey]);

  const [providerFilter, setProviderFilter] = useState<SpendProvider | 'all'>('all');
  // One clock reading per render keeps every rollup on the same "now".
  const now = Date.now();
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
    <div className="min-h-screen w-full">
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

        {hasHydrated && scoped.length === 0 ? (
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
                <div className="flex items-center gap-2">
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
```

If `SegmentedToggleGroup` renders its options as buttons without a visible-selected style issue, leave it; if `SPEND_RANGES` is rejected because its `value` type is narrower than `string | number`, map it: `options={SPEND_RANGES.map((r) => ({ label: r.label, value: r.value }))}`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/spend/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Smoke-test in the browser**

Run: `PORT=3107 npm run dev` in the worktree. Open `http://localhost:3107/spend`: empty state renders. Seed a few entries in the console:

```js
localStorage.setItem('scene-assembly-spend', JSON.stringify({ state: { entries: [
  { id: 'a', at: Date.now(), provider: 'gemini', modelId: 'gemini-3-pro-image-preview', kind: 'image', costUsd: 0.1344, confidence: 'exact', source: 'usage-metadata', promptExcerpt: 'A harbour at dusk' },
  { id: 'b', at: Date.now() - 86400000, provider: 'fal', modelId: 'veo-3-1-fast', kind: 'video', inputMode: 'text', costUsd: 1.2, confidence: 'estimated', source: 'estimate-api', quantity: { unit: 'second', value: 8 }, promptExcerpt: 'A banana crossing the moon' },
  { id: 'c', at: Date.now() - 3 * 86400000, provider: 'kie', modelId: 'veo-3-1', kind: 'video', costUsd: null, confidence: 'unknown', source: 'balance-delta', note: 'The Kie balance did not change, so the cost is unknown.', promptExcerpt: 'Rain on neon' }
] }, version: 0 }));
```

Reload. Check: tiles, chart bars on three days, both breakdowns, ledger rows with badges, range toggle updates `?range=`, Export CSV downloads, Clear asks first. Check at 375px width that only the ledger scrolls horizontally.

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/spend/palette.ts components/spend app/spend tests/spend/page.test.tsx
git commit -m "feat: add the spend page"
```

---

### Task 11: Entry points

**Files:**
- Modify: `app/page.tsx:381-400` (footer), `components/CommandPalette.tsx:6-24, 296-306`
- Test: `tests/spend/entry-points.test.tsx`; extend `tests/command-palette.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/spend/entry-points.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Same mocks as tests/page-scroll-position.test.tsx, which also renders Home.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('nuqs', () => ({ useQueryState: () => [null, vi.fn()] }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({}, { get: () => 'div' }),
}));
vi.mock('@/components/ApiKeyConfig', () => ({ default: () => null }));
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/FeatureSelector', () => ({ default: () => null }));
vi.mock('@/components/VideoWorkspace', () => ({ default: () => null }));

import Home from '@/app/page';

describe('spend entry points', () => {
  it('links to the spend page from the footer', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<Home />);
    expect(screen.getByRole('link', { name: 'Spend' })).toHaveAttribute('href', '/spend');
  });
});
```

In `tests/command-palette.test.tsx`, add a test after `opens the library on the section the command names`, using the file's `renderPalette()` helper (it renders the palette open):

```tsx
  it('offers a jump to the spend page', () => {
    renderPalette();
    expect(screen.getByText('View spend')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/spend/entry-points.test.tsx tests/command-palette.test.tsx`
Expected: FAIL — no "Spend" link; no "View spend" item.

- [ ] **Step 3: Add the link and the command**

In `app/page.tsx`, inside the footer's first `<div className="text-center space-y-1.5">`, after the `<p className="text-xs …">{brand.description}</p>`, add:

```tsx
              <p className="text-xs">
                <Link
                  href="/spend"
                  className="text-[var(--neon-cyan)] hover:text-[var(--neon-purple)] font-medium transition-colors hover:underline"
                >
                  Spend
                </Link>
              </p>
```

In `components/CommandPalette.tsx`, add `Wallet` to the `lucide-react` import, and after the "Saved prompts" `Command.Item` add:

```tsx
          <Command.Item
            value="View spend"
            keywords={['cost', 'spend', 'expenses', 'usage', 'billing', 'ledger', 'money']}
            onSelect={() => go(() => window.location.assign('/spend'))}
          >
            <Wallet size={15} />
            <span className="cmd-item-body">
              <span className="cmd-item-title">View spend</span>
              <span className="cmd-item-desc">What your generations have cost</span>
            </span>
          </Command.Item>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/spend/entry-points.test.tsx tests/command-palette.test.tsx tests/page-scroll-position.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add app/page.tsx components/CommandPalette.tsx tests/spend/entry-points.test.tsx tests/command-palette.test.tsx
git commit -m "feat: link the spend page from the footer and ⌘K"
```

---

### Task 12: Docs and full verification

**Files:**
- Modify: `AGENTS.md` (Auto-load routing), `README.md` (Studio Features)

- [ ] **Step 1: Add the routing entry**

In `AGENTS.md`, append to the **Auto-load routing** list:

```md
- **Anything that costs money, or a new place a generation finishes** → file it
  through `lib/spend/capture.ts` next to the gallery record, and price it with a
  resolver in `lib/spend/resolve.ts` that labels the figure exact, estimated, or
  unknown. Rates live only in `lib/spend/rates.ts` and the catalog's `rate`
  field, because a number pasted into a component drifts from the vendor page
  it came from and nobody can tell which run it applied to. Capture never
  throws: the generation it describes has already succeeded. Spec:
  `docs/superpowers/specs/2026-09-03-spend-dashboard-design.md`.
```

- [ ] **Step 2: Add the README feature line**

In `README.md`, under **🎯 Studio Features**, replace the `- **Per-image cost estimate** — shown under the Generate button for Gemini runs` line with:

```md
- **Spend page** — every finished generation is recorded in your browser with its cost, labelled exact or estimated, and rolled up by provider, model, and day at `/spend`. Runware reports exact costs; Gemini is priced from its token usage; fal and Kie are estimated from their pricing and credit-balance endpoints; free engines record as free
```

- [ ] **Step 3: Run everything**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: route cost capture through the spend ledger"
```

- [ ] **Step 5: Hand off for smoke test and ship**

Per `AGENTS.md`: give the user the localhost link to `/spend` and to a workspace, and wait for a go-ahead. After sign-off: `git fetch && git rebase origin/main`, push, stop the dev server, remove the worktree.
