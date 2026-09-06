# Unified API Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two key-storage systems into one card per provider, so a signed-in user who pastes a key can run a cloud job without a second gesture.

**Architecture:** A new pure module decides which local keys the account is missing, guarded by the stored `hint` so an unchanged key is never rewritten. A new per-provider control renders storage state and the one button that changes it. `ApiKeyConfig` runs the sync on Save & close and gains the control in each card; `AccountConnections` collapses to a read-only rail summary whose button opens that same dialog.

**Tech Stack:** Next.js 16, React 19, Zustand (persisted), Vitest + Testing Library, existing Cloudflare Worker endpoints (unchanged).

**Spec:** `docs/superpowers/specs/2026-09-05-api-connections-design.md`

## Global Constraints

- **Do not touch `cloud/`.** `POST /api/account/connections` (no `ifAbsent`) already overwrites and bumps `revision`; `DELETE /api/account/connections/:provider` already removes. No Worker change is in scope.
- **Never rewrite an unchanged key.** A write bumps `revision`, and `resolveConnection` throws on a stale revision (`cloud/src/provider-adapters/queued.ts:14`), failing a running job into `needs_attention`. Compare `apiKey.slice(-4)` against the connection's `hint` before writing.
- **Sync on Save & close only.** Dismissing the dialog (X, backdrop, Escape) syncs nothing.
- **Worker validation floors**, mirrored client-side so no request is sent that will 400: `apiKey.trim().length >= 8`, and for `cloudflare` an `accountId` matching `/^[a-f0-9]{32}$/i`.
- **Signed out renders nothing new.** No badge, no button.
- **Tests after implementation** in every task, per the chosen workflow.
- Run the suite with `npx vitest run <path>`; typecheck with `npx tsc --noEmit`; lint with `npx eslint <files>`.

---

### Task 1: The sync decision

**Files:**
- Create: `lib/account/connection-sync.ts`
- Test: `tests/account/connection-sync.test.ts`

**Interfaces:**
- Consumes: `browserKeyCandidates`, `BrowserKeyFields`, `BrowserKeyImport`, `ImportableProvider` from `lib/account/key-import.ts`; `AccountConnection` from `store/useAccountStore.ts`; `accountRequest` from `lib/account/client.ts`.
- Produces:
  - `pendingConnectionWrites(fields: BrowserKeyFields, connections: AccountConnection[], optedOut: readonly ImportableProvider[]): BrowserKeyImport[]`
  - `saveBrowserKey(key: BrowserKeyImport, ownerId: string, signal?: AbortSignal): Promise<{ connections: AccountConnection[] }>`
  - `removeConnection(provider: ImportableProvider, ownerId: string, signal?: AbortSignal): Promise<{ connections: AccountConnection[] }>`
  - `syncPendingConnections(pending: BrowserKeyImport[], ownerId: string): Promise<ImportableProvider[]>` — resolves to the providers that **failed**.

- [ ] **Step 1: Create the module**

```ts
// lib/account/connection-sync.ts
import { accountRequest } from './client';
import { browserKeyCandidates, type BrowserKeyFields, type BrowserKeyImport, type ImportableProvider } from './key-import';
import type { AccountConnection } from '@/store/useAccountStore';

/** The Worker's own floor, mirrored so a half-typed key never becomes a 400. */
const MIN_KEY_LENGTH = 8;
const CLOUDFLARE_ACCOUNT = /^[a-f0-9]{32}$/i;

/**
 * The keys this device holds that the account does not already have.
 *
 * The hint comparison is the guard that matters. Every write bumps `revision`,
 * and a job still running on the previous revision fails when its connection
 * resolves — so re-uploading a key that has not changed would break jobs for
 * nothing. `hint` is the key's last four characters (`cloud/src/vault.ts:40`).
 */
export function pendingConnectionWrites(
  fields: BrowserKeyFields,
  connections: AccountConnection[],
  optedOut: readonly ImportableProvider[]
): BrowserKeyImport[] {
  const saved = new Map(connections.map(connection => [connection.provider, connection.hint]));
  return browserKeyCandidates(fields).filter(candidate => {
    if (optedOut.includes(candidate.provider)) return false;
    const key = candidate.apiKey.trim();
    if (key.length < MIN_KEY_LENGTH) return false;
    if (candidate.provider === 'cloudflare' && !CLOUDFLARE_ACCOUNT.test(candidate.accountId ?? '')) return false;
    return saved.get(candidate.provider) !== key.slice(-4);
  });
}

export function saveBrowserKey(key: BrowserKeyImport, ownerId: string, signal?: AbortSignal) {
  return accountRequest<{ connections: AccountConnection[] }>('connections', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Account-Id': ownerId },
    body: JSON.stringify(key),
  });
}

export function removeConnection(provider: ImportableProvider, ownerId: string, signal?: AbortSignal) {
  return accountRequest<{ connections: AccountConnection[] }>(`connections/${provider}`, {
    method: 'DELETE',
    signal,
    headers: { 'X-Account-Id': ownerId },
  });
}

/**
 * Writes sequentially, not in parallel: each response returns the whole
 * connection list, and concurrent writes to the same account would race on the
 * revision counter. Returns the providers that failed so the caller can say so
 * without losing the ones that worked.
 */
export async function syncPendingConnections(pending: BrowserKeyImport[], ownerId: string): Promise<ImportableProvider[]> {
  const failed: ImportableProvider[] = [];
  for (const key of pending) {
    try {
      await saveBrowserKey(key, ownerId);
    } catch {
      failed.push(key.provider);
    }
  }
  return failed;
}
```

- [ ] **Step 2: Write the tests**

```tsx
// tests/account/connection-sync.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { pendingConnectionWrites, syncPendingConnections } from '@/lib/account/connection-sync';
import { accountRequest } from '@/lib/account/client';
import type { BrowserKeyFields } from '@/lib/account/key-import';

vi.mock('@/lib/account/client', () => ({ accountRequest: vi.fn() }));

const EMPTY: BrowserKeyFields = {
  apiKey: '', cfToken: '', cfAccountId: '', kieApiKey: '',
  falApiKey: '', runwareApiKey: '', atlasApiKey: '', cometApiKey: '',
};
const connection = (provider: string, hint: string) => ({ id: `${provider}-1`, provider, revision: 1, hint });

describe('pendingConnectionWrites', () => {
  it('skips a provider whose stored hint already matches the local key', () => {
    const pending = pendingConnectionWrites(
      { ...EMPTY, apiKey: 'AIzaSyLocalKey4f2a' },
      [connection('gemini', '4f2a')],
      []
    );
    expect(pending).toEqual([]);
  });

  it('includes a provider whose local key has changed', () => {
    const pending = pendingConnectionWrites(
      { ...EMPTY, apiKey: 'AIzaSyLocalKey9c1d' },
      [connection('gemini', '4f2a')],
      []
    );
    expect(pending).toEqual([{ provider: 'gemini', apiKey: 'AIzaSyLocalKey9c1d' }]);
  });

  it('includes a provider the account has never held', () => {
    const pending = pendingConnectionWrites({ ...EMPTY, falApiKey: 'fal-key-abcd' }, [], []);
    expect(pending.map(key => key.provider)).toEqual(['fal']);
  });

  it('skips a provider the user opted out of', () => {
    const pending = pendingConnectionWrites({ ...EMPTY, falApiKey: 'fal-key-abcd' }, [], ['fal']);
    expect(pending).toEqual([]);
  });

  it('skips a key below the length the Worker accepts', () => {
    const pending = pendingConnectionWrites({ ...EMPTY, kieApiKey: 'short' }, [], []);
    expect(pending).toEqual([]);
  });

  it('skips cloudflare until its account id is a 32-character hex string', () => {
    const withoutId = pendingConnectionWrites({ ...EMPTY, cfToken: 'cf-token-value', cfAccountId: 'nope' }, [], []);
    expect(withoutId).toEqual([]);

    const withId = pendingConnectionWrites(
      { ...EMPTY, cfToken: 'cf-token-value', cfAccountId: 'a'.repeat(32) },
      [], []
    );
    expect(withId).toEqual([{ provider: 'cloudflare', apiKey: 'cf-token-value', accountId: 'a'.repeat(32) }]);
  });
});

describe('syncPendingConnections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports only the providers that failed, and still writes the rest', async () => {
    vi.mocked(accountRequest).mockImplementation(async (path, init) => {
      if (String(init?.body).includes('fal-key')) throw new Error('nope');
      return { connections: [] };
    });

    const failed = await syncPendingConnections(
      [{ provider: 'gemini', apiKey: 'AIzaSyGood' }, { provider: 'fal', apiKey: 'fal-key-abcd' }],
      'owner-1'
    );

    expect(failed).toEqual(['fal']);
    expect(accountRequest).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/account/connection-sync.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/account/connection-sync.ts tests/account/connection-sync.test.ts
git commit -m "feat: decide which local keys the account is missing"
```

---

### Task 2: The opt-out list

**Files:**
- Modify: `store/useAppStore.ts` (state interface ~line 31-90, initial state ~line 136-158, setters ~line 159-175, `partialize` ~line 180-200)
- Test: `tests/account/connection-opt-out.test.ts`

**Interfaces:**
- Produces: `accountKeyOptOuts: ImportableProvider[]` and `setAccountKeyOptOut(provider: ImportableProvider, optedOut: boolean): void` on `useAppStore`.

- [ ] **Step 1: Add the state to the interface**

Add to the `AppState` interface, beside the other key fields:

```ts
  /**
   * Providers deliberately kept out of the account. Save & close syncs every
   * other key, so without this flag pressing "Remove from account" would be
   * undone by the very next close.
   */
  accountKeyOptOuts: ImportableProvider[];
```

And beside the other setters:

```ts
  setAccountKeyOptOut: (provider: ImportableProvider, optedOut: boolean) => void;
```

Add the type import at the top of the file:

```ts
import type { ImportableProvider } from '@/lib/account/key-import';
```

- [ ] **Step 2: Add the initial value and the setter**

Initial state, beside `cometApiKey: ''`:

```ts
      accountKeyOptOuts: [],
```

Setter, beside `setProviderApiKey`:

```ts
      setAccountKeyOptOut: (provider, optedOut) =>
        set((state) => ({
          accountKeyOptOuts: optedOut
            ? state.accountKeyOptOuts.includes(provider)
              ? state.accountKeyOptOuts
              : [...state.accountKeyOptOuts, provider]
            : state.accountKeyOptOuts.filter((id) => id !== provider),
        })),
```

- [ ] **Step 3: Persist it**

Add to `partialize`, beside `cometApiKey: s.cometApiKey`:

```ts
        accountKeyOptOuts: s.accountKeyOptOuts,
```

- [ ] **Step 4: Write the tests**

```ts
// tests/account/connection-opt-out.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/useAppStore';

describe('account key opt-outs', () => {
  beforeEach(() => useAppStore.setState({ accountKeyOptOuts: [] }));

  it('records a provider once, however many times it is set', () => {
    useAppStore.getState().setAccountKeyOptOut('fal', true);
    useAppStore.getState().setAccountKeyOptOut('fal', true);
    expect(useAppStore.getState().accountKeyOptOuts).toEqual(['fal']);
  });

  it('clears one provider without disturbing the others', () => {
    useAppStore.getState().setAccountKeyOptOut('fal', true);
    useAppStore.getState().setAccountKeyOptOut('kie', true);
    useAppStore.getState().setAccountKeyOptOut('fal', false);
    expect(useAppStore.getState().accountKeyOptOuts).toEqual(['kie']);
  });

  it('is included in the persisted slice', () => {
    useAppStore.getState().setAccountKeyOptOut('atlas', true);
    const persisted = JSON.parse(localStorage.getItem('scene-assembly-store') ?? '{}');
    expect(persisted.state?.accountKeyOptOuts).toEqual(['atlas']);
  });
});
```

**Note for the implementer:** `scene-assembly-store` is the current `STORAGE_KEY` (`store/useAppStore.ts:25`), so the third test's literal is correct as written. The store sets `skipHydration: true`; if that means nothing is written to `localStorage` under test, drop the third test rather than forcing it — the first two carry the behavior.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/account/connection-opt-out.test.ts && npx tsc --noEmit`
Expected: PASS, then no typecheck output.

- [ ] **Step 6: Commit**

```bash
git add store/useAppStore.ts tests/account/connection-opt-out.test.ts
git commit -m "feat: remember which providers are kept out of the account"
```

---

### Task 3: The per-provider storage control

**Files:**
- Create: `components/account/ConnectionStorageControl.tsx`
- Test: `tests/account/connection-storage-control.test.tsx`

**Interfaces:**
- Consumes: `pendingConnectionWrites` is *not* used here; `saveBrowserKey`, `removeConnection` from Task 1; `setAccountKeyOptOut`, `accountKeyOptOuts` from Task 2.
- Produces: default export `ConnectionStorageControl({ provider, apiKey, accountId }: { provider: ImportableProvider; apiKey: string; accountId?: string })`.

**The five renders, so the implementer does not have to infer them:**

| connection | local key | opted out | badge | button |
| --- | --- | --- | --- | --- |
| no | no | — | render `null` | — |
| yes | yes | — | `On this device · Encrypted in your account` | Remove from account |
| yes | no | — | `Encrypted in your account · ends ··<hint>` + note | Remove from account |
| no | yes | yes | `On this device · Not in your account` + note | Save to account |
| no | yes | no | `On this device` | none — Save & close will sync it |

- [ ] **Step 1: Create the component**

```tsx
// components/account/ConnectionStorageControl.tsx
'use client';

import { useState } from 'react';
import { CloudUpload, Loader2, Lock, MonitorSmartphone } from 'lucide-react';

import { removeConnection, saveBrowserKey } from '@/lib/account/connection-sync';
import type { ImportableProvider } from '@/lib/account/key-import';
import { accountChanged, refreshAccount } from '@/lib/account/session';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

/**
 * Where one provider's key is kept, and the single button that changes it.
 *
 * Signed in, Save & close puts every key in both places, so this control is an
 * exit from that default rather than the route to it: the common case renders a
 * badge and a Remove button, and "Save to account" appears only for a provider
 * previously opted out.
 */
export default function ConnectionStorageControl({
  provider,
  apiKey,
  accountId,
}: {
  provider: ImportableProvider;
  apiKey: string;
  accountId?: string;
}) {
  const ownerId = useAccountStore((state) => state.session?.account?.id);
  const connection = useAccountStore((state) =>
    (state.session?.connections ?? []).find((entry) => entry.provider === provider)
  );
  const optedOut = useAppStore((state) => state.accountKeyOptOuts.includes(provider));
  const setOptOut = useAppStore((state) => state.setAccountKeyOptOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = apiKey.trim();
  if (!ownerId || (!connection && !key)) return null;

  async function run(action: () => Promise<unknown>, thenOptOut: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      // The flag flips only after the write lands, so a failed removal does not
      // leave the provider opted out of a connection it still has.
      setOptOut(provider, thenOptOut);
      accountChanged();
      void refreshAccount().catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => saveBrowserKey({ provider, apiKey: key, ...(accountId ? { accountId } : {}) }, ownerId), false);
  const remove = () => run(() => removeConnection(provider, ownerId), true);

  const button = connection ? (
    <button
      type="button"
      disabled={busy}
      onClick={() => void remove()}
      className="btn-secondary shrink-0 gap-1.5 px-2 py-1 text-xs disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      Remove from account
    </button>
  ) : optedOut ? (
    <button
      type="button"
      disabled={busy}
      onClick={() => void save()}
      className="btn-secondary shrink-0 gap-1.5 border-[var(--neon-cyan)]/30 px-2 py-1 text-xs text-[var(--neon-cyan)] disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CloudUpload size={13} aria-hidden="true" />}
      Save to account
    </button>
  ) : null;

  const badge = (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--foreground-subtle)]">
      {key && (
        <span className="inline-flex items-center gap-1.5">
          <MonitorSmartphone size={13} aria-hidden="true" />On this device
        </span>
      )}
      {key && (connection || optedOut) && <span aria-hidden="true">·</span>}
      {connection ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <Lock size={13} aria-hidden="true" />Encrypted in your account
          {!key && <span className="font-mono"> · ends ··{connection.hint}</span>}
        </span>
      ) : optedOut ? (
        <span>Not in your account</span>
      ) : null}
    </p>
  );

  const note = !key && connection
    ? 'Cloud jobs use it already. Browser-only runs need a key on this device.'
    : optedOut && key
      ? 'Kept off your account, so cloud jobs cannot use it.'
      : null;

  return (
    <>
      {button}
      <div className="space-y-1.5">
        {badge}
        {note && <p className="text-xs leading-snug text-[var(--foreground-subtle)]">{note}</p>}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>
    </>
  );
}
```

**Note for the implementer:** this returns a fragment of *two* pieces — the button belongs in the card header, the badge below the field. Task 4 splits them. If that proves awkward in practice, export two components (`ConnectionStorageButton`, `ConnectionStorageBadge`) sharing one hook rather than contorting the card layout; update Task 4's snippet to match and say so in the handoff.

- [ ] **Step 2: Write the tests**

```tsx
// tests/account/connection-storage-control.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConnectionStorageControl from '@/components/account/ConnectionStorageControl';
import { removeConnection, saveBrowserKey } from '@/lib/account/connection-sync';
import { useAccountStore, type AccountConnection } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

vi.mock('@/lib/account/connection-sync', () => ({
  saveBrowserKey: vi.fn(async () => ({ connections: [] })),
  removeConnection: vi.fn(async () => ({ connections: [] })),
}));
vi.mock('@/lib/account/session', () => ({ accountChanged: vi.fn(), refreshAccount: vi.fn(async () => undefined) }));

function signIn(connections: AccountConnection[] = []) {
  useAccountStore.getState().applySession({
    account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true, localSignIn: false, providers: [], connections,
  });
}
const gemini = (hint = '4f2a'): AccountConnection => ({ id: 'c1', provider: 'gemini', revision: 1, hint });

describe('ConnectionStorageControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ accountKeyOptOuts: [] });
  });

  it('renders nothing for a guest', () => {
    const { container } = render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no key and no connection', () => {
    signIn();
    const { container } = render(<ConnectionStorageControl provider="gemini" apiKey="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows both places and offers removal once the account holds the key', () => {
    signIn([gemini()]);
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(screen.getByText('On this device')).toBeInTheDocument();
    expect(screen.getByText(/Encrypted in your account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove from account/ })).toBeInTheDocument();
  });

  it('names the account copy and warns about browser-only when this device has no key', () => {
    signIn([gemini('9c1d')]);
    render(<ConnectionStorageControl provider="gemini" apiKey="" />);
    expect(screen.getByText(/9c1d/)).toBeInTheDocument();
    expect(screen.getByText(/Browser-only runs need a key on this device/)).toBeInTheDocument();
    expect(screen.queryByText('On this device')).not.toBeInTheDocument();
  });

  it('offers Save to account only for a provider that was opted out', () => {
    signIn();
    useAppStore.setState({ accountKeyOptOuts: ['gemini'] });
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(screen.getByText('Not in your account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save to account/ })).toBeInTheDocument();
  });

  it('shows no button while a key is waiting for the next Save & close', () => {
    signIn();
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    expect(screen.getByText('On this device')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('removing sets the opt-out so the next sync leaves it alone', async () => {
    signIn([gemini()]);
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    fireEvent.click(screen.getByRole('button', { name: /Remove from account/ }));
    await waitFor(() => expect(removeConnection).toHaveBeenCalledWith('gemini', 'owner-1'));
    expect(useAppStore.getState().accountKeyOptOuts).toEqual(['gemini']);
  });

  it('saving clears the opt-out and sends the key that is on screen', async () => {
    signIn();
    useAppStore.setState({ accountKeyOptOuts: ['cloudflare'] });
    render(<ConnectionStorageControl provider="cloudflare" apiKey="cf-token-value" accountId={'a'.repeat(32)} />);
    fireEvent.click(screen.getByRole('button', { name: /Save to account/ }));
    await waitFor(() =>
      expect(saveBrowserKey).toHaveBeenCalledWith(
        { provider: 'cloudflare', apiKey: 'cf-token-value', accountId: 'a'.repeat(32) },
        'owner-1'
      )
    );
    expect(useAppStore.getState().accountKeyOptOuts).toEqual([]);
  });

  it('keeps the connection and reports the failure when removal fails', async () => {
    signIn([gemini()]);
    vi.mocked(removeConnection).mockRejectedValueOnce(new Error('Network unavailable.'));
    render(<ConnectionStorageControl provider="gemini" apiKey="AIzaSyLocal" />);
    fireEvent.click(screen.getByRole('button', { name: /Remove from account/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable.');
    expect(useAppStore.getState().accountKeyOptOuts).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests, typecheck, lint**

Run: `npx vitest run tests/account/connection-storage-control.test.tsx && npx tsc --noEmit && npx eslint components/account/ConnectionStorageControl.tsx`
Expected: PASS, no typecheck output, no lint output.

- [ ] **Step 4: Commit**

```bash
git add components/account/ConnectionStorageControl.tsx tests/account/connection-storage-control.test.tsx
git commit -m "feat: show where each provider key is stored"
```

---

### Task 4: Rewire the dialog

**Files:**
- Modify: `components/ApiKeyConfig.tsx` — remove the embedded block at line 548; add a `storage` prop to `ProviderCard` (~line 76-127); pass the control from all seven cards; add the sync pass to `handleSave` (~line 409-464); replace the footer copy (~line 753)
- Test: `tests/account/connections-dialog.test.tsx`

**Interfaces:**
- Consumes: `ConnectionStorageControl` (Task 3), `pendingConnectionWrites` and `syncPendingConnections` (Task 1), `accountKeyOptOuts` (Task 2).
- Produces: no new exports. `ApiKeyConfig`'s props are unchanged, so `AccountConsole` can mount it in Task 5.

- [ ] **Step 1: Delete the old block**

Remove the entire embedded panel and heading at `components/ApiKeyConfig.tsx:548`, and the now-unused `AccountConnections` import at line 8. The line to delete begins `{account&&<div className="mb-5"><AccountConnections`.

- [ ] **Step 2: Give `ProviderCard` a storage slot**

Change its props and header so the button sits opposite the title:

```tsx
  storage,
}: {
  // …existing props…
  /** The provider's storage badge and button. Absent for a guest. */
  storage?: React.ReactNode;
  children: React.ReactNode;
}) {
```

Replace the `<h3>` element with:

```tsx
      <div className="flex items-start justify-between gap-2">
        <h3 className="field-label flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <ProviderLogo provider={provider} size={22} />
          {name}
          {connected && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px text-xs font-medium text-emerald-300">
              <Check size={13} /> Connected
            </span>
          )}
        </h3>
        {storage}
      </div>
```

- [ ] **Step 3: Pass the control from every card**

For each of the seven `<ProviderCard>` call sites, add the prop. Gemini takes the live input so the badge tracks what is typed, not only what is stored:

```tsx
                  storage={<ConnectionStorageControl provider="gemini" apiKey={keyInput} />}
```

The others, in the order they appear: `kie` with `kieKeyInput`, `fal` with `falKeyInput`, `cloudflare` with `apiKey={cfToken} accountId={cfAccountId}`, and each aggregator with `apiKey={providerKeys[aggregator.id]}`:

```tsx
                    storage={<ConnectionStorageControl provider={aggregator.id} apiKey={providerKeys[aggregator.id]} />}
```

Add the import:

```tsx
import ConnectionStorageControl from '@/components/account/ConnectionStorageControl';
```

- [ ] **Step 4: Sync on Save & close**

Add above `handleSave`:

```tsx
  /**
   * Signed in, closing with Save puts every changed key in the account too, so
   * a cloud job works the moment a key is pasted. Reading from the store rather
   * than the inputs is deliberate: a key that failed validation was never
   * written there, so it is never uploaded.
   */
  const syncAccountKeys = async (operationId: number) => {
    const owner = useAccountStore.getState().session?.account?.id;
    if (!owner) return;
    const state = useAppStore.getState();
    const pending = pendingConnectionWrites(
      {
        apiKey: state.apiKey, cfToken: state.cfToken, cfAccountId: state.cfAccountId,
        kieApiKey: state.kieApiKey, falApiKey: state.falApiKey, runwareApiKey: state.runwareApiKey,
        atlasApiKey: state.atlasApiKey, cometApiKey: state.cometApiKey,
      },
      useAccountStore.getState().session?.connections ?? [],
      state.accountKeyOptOuts
    );
    if (pending.length === 0) return;
    const failed = await syncPendingConnections(pending, owner);
    if (!isOperationCurrent(operationId)) return;
    accountChanged();
    void refreshAccount().catch(() => {});
    if (failed.length > 0) {
      toast.error(
        failed.length === 1
          ? 'One key could not be saved to your account. It is still on this device.'
          : `${failed.length} keys could not be saved to your account. They are still on this device.`
      );
    }
  };
```

Then in `handleSave`, replace the three `setValidationError('')` lines plus `onOpenChange(false)` at the end of the `try` block with:

```tsx
      if (!isOperationCurrent(operationId)) return;
      setValidationError('');
      setKieValidationError('');
      setFalValidationError('');
      await syncAccountKeys(operationId);
      if (!isOperationCurrent(operationId)) return;
      onOpenChange(false);
```

Add the imports:

```tsx
import { pendingConnectionWrites, syncPendingConnections } from '@/lib/account/connection-sync';
import { accountChanged, refreshAccount } from '@/lib/account/session';
```

- [ ] **Step 5: Replace the footer copy**

At line ~753, replace the two-branch string with:

```tsx
                {account
                  ? 'Signed in, so your keys are kept on this device and encrypted in your account, where cloud jobs can use them.'
                  : 'Credentials live in this browser’s local storage and go straight to each provider — never to our servers beyond proxying the request.'}
```

- [ ] **Step 6: Write the tests**

```tsx
// tests/account/connections-dialog.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ApiKeyConfig from '@/components/ApiKeyConfig';
import { syncPendingConnections } from '@/lib/account/connection-sync';
import { useAccountStore } from '@/store/useAccountStore';
import { useAppStore } from '@/store/useAppStore';

// ApiKeyConfig renders bare in jsdom — tests/api-key-focus.test.tsx mounts it
// with no mocks at all — so only the modules with side effects need doubling.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/account/session', () => ({ accountChanged: vi.fn(), refreshAccount: vi.fn(async () => undefined) }));
// pendingConnectionWrites stays real: the assertion below is about what it decides.
vi.mock('@/lib/account/connection-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/connection-sync')>()),
  syncPendingConnections: vi.fn(async () => []),
  saveBrowserKey: vi.fn(async () => ({ connections: [] })),
  removeConnection: vi.fn(async () => ({ connections: [] })),
}));

function signIn() {
  useAccountStore.getState().applySession({
    account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true, localSignIn: false, providers: [], connections: [],
  });
}

describe('the connections dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ apiKey: '', kieApiKey: '', falApiKey: '', cfToken: '', cfAccountId: '', runwareApiKey: '', atlasApiKey: '', cometApiKey: '', accountKeyOptOuts: [] });
  });

  it('no longer offers a separate saved-connections form', () => {
    signIn();
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Save connection' })).not.toBeInTheDocument();
    expect(screen.queryByText('Browser-only connections')).not.toBeInTheDocument();
  });

  it('tells a signed-in user their keys reach the account', () => {
    signIn();
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);
    expect(screen.getByText(/encrypted in your account/i)).toBeInTheDocument();
  });

  it('leaves a guest with the browser-only promise', () => {
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);
    expect(screen.getByText(/never to our servers beyond proxying the request/)).toBeInTheDocument();
  });

  it('syncs stored keys to the account on Save & close', async () => {
    signIn();
    useAppStore.setState({ runwareApiKey: 'runware-key-abcd' });
    const onOpenChange = vi.fn();
    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Save & close/ }));

    await waitFor(() =>
      expect(syncPendingConnections).toHaveBeenCalledWith(
        [{ provider: 'runware', apiKey: 'runware-key-abcd' }],
        'owner-1'
      )
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does not reach the account for a guest', async () => {
    useAppStore.setState({ runwareApiKey: 'runware-key-abcd' });
    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & close/ }));
    await waitFor(() => expect(syncPendingConnections).not.toHaveBeenCalled());
  });
});
```

- [ ] **Step 7: Run the tests plus the existing suites this touches**

Run: `npx vitest run tests/account tests/api-key-focus.test.tsx tests/connection-gate-parity.test.tsx && npx tsc --noEmit`
Expected: all PASS. `connection-gate-parity` must be untouched by this work; if it fails, the gating changed and that is out of scope — stop and report.

- [ ] **Step 8: Commit**

```bash
git add components/ApiKeyConfig.tsx tests/account/connections-dialog.test.tsx
git commit -m "feat: put every key in one card and sync them on save"
```

---

### Task 5: The rail and the account page

**Files:**
- Modify: `components/account/AccountConnections.tsx` (replace wholesale — 162 lines become roughly 40)
- Modify: `components/account/AccountConsole.tsx:208-210`
- Test: `tests/account/connections-rail.test.tsx`

**Interfaces:**
- Consumes: `ApiKeyConfig` (Task 4), unchanged props `{ open, onOpenChange, focusProvider? }`.
- Produces: `AccountConnections({ onManage }: { onManage: () => void })` — the `variant` and `initialProvider` props are gone. `AccountConsole` is the only caller.

- [ ] **Step 1: Replace `AccountConnections`**

```tsx
'use client';

import { KeyRound } from 'lucide-react';

import ProviderLogo from '@/components/ProviderLogo';
import { ENGINES, type EngineId } from '@/lib/engines/registry';
import { providerAccent } from '@/lib/providers/mark-color';
import { useAccountStore } from '@/store/useAccountStore';

const label = (id: string) => ENGINES.find((engine) => engine.id === id)?.label ?? id;

/**
 * A read-only summary of what the account holds. Managing a key happens in the
 * connections dialog — the same one the workspace opens — so the two surfaces
 * cannot drift, and there is one place to learn.
 *
 * Connections come from the session payload, which already carries them
 * (`cloud/src/index.ts:61`), so this no longer fetches on mount.
 */
export default function AccountConnections({ onManage }: { onManage: () => void }) {
  const connections = useAccountStore((state) => state.session?.connections ?? []);

  return (
    <section aria-label="Saved connections">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">Saved connections</span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--foreground-subtle)]">{connections.length}</span>
      </div>

      {connections.length > 0 ? (
        <ul className="mt-2.5">
          {connections.map((connection) => (
            <li key={connection.id} className="flex items-center gap-2.5 border-b border-[var(--border)] py-2">
              <span className="shrink-0" style={{ color: providerAccent(connection.provider) }}>
                <ProviderLogo provider={connection.provider as EngineId} size={15} />
              </span>
              <p className="min-w-0 truncate text-[13px] font-medium">{label(connection.provider)}</p>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--foreground-subtle)]">··{connection.hint}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--foreground-subtle)]">No provider keys are saved to this account yet.</p>
      )}

      <button type="button" onClick={onManage} className="btn-secondary mt-3 flex w-full justify-center">
        <KeyRound size={15} aria-hidden="true" />Manage connections
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Open the dialog from the console**

In `components/account/AccountConsole.tsx`, add state beside the other `useState` calls:

```tsx
  const [managingKeys, setManagingKeys] = useState(false);
```

Replace the rail block at line 208-210:

```tsx
        <RailBlock>
          <AccountConnections onManage={() => setManagingKeys(true)} />
        </RailBlock>
```

And mount the dialog beside the other portals at the end of the component's JSX:

```tsx
      <ApiKeyConfig open={managingKeys} onOpenChange={setManagingKeys} />
```

Add the import:

```tsx
import ApiKeyConfig from '@/components/ApiKeyConfig';
```

- [ ] **Step 3: Write the tests**

```tsx
// tests/account/connections-rail.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountConnections from '@/components/account/AccountConnections';
import { useAccountStore, type AccountConnection } from '@/store/useAccountStore';

const connections: AccountConnection[] = [
  { id: 'c1', provider: 'gemini', revision: 1, hint: '4f2a' },
  { id: 'c2', provider: 'fal', revision: 3, hint: '9c1d' },
];

function signIn(list: AccountConnection[]) {
  useAccountStore.getState().applySession({
    account: { id: 'owner-1', name: 'Owner', email: 'owner@example.test' },
    googleEnabled: true, localSignIn: false, providers: [], connections: list,
  });
}

describe('the connections rail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists what the account holds, from the session rather than a fetch', () => {
    signIn(connections);
    render(<AccountConnections onManage={() => undefined} />);
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText('··9c1d')).toBeInTheDocument();
  });

  it('says so plainly when the account holds nothing', () => {
    signIn([]);
    render(<AccountConnections onManage={() => undefined} />);
    expect(screen.getByText(/No provider keys are saved to this account yet/)).toBeInTheDocument();
  });

  it('hands managing off to the dialog instead of its own form', () => {
    signIn(connections);
    const onManage = vi.fn();
    render(<AccountConnections onManage={onManage} />);
    expect(screen.queryByRole('button', { name: /Add provider key/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Manage connections/ }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint components lib store`
Expected: everything passes. `tests/account/account-page.test.tsx` mocks `AccountConnections` wholesale, so it should be unaffected — confirm rather than assume.

- [ ] **Step 5: Smoke-test before shipping**

`AGENTS.md:118-123` makes this a hard gate: a push to `main` auto-deploys, so a UI change must be seen working. Start the app, sign in locally, and check the four card states, the rail button, and that Save & close creates a connection.

- [ ] **Step 6: Commit**

```bash
git add components/account/AccountConnections.tsx components/account/AccountConsole.tsx tests/account/connections-rail.test.tsx
git commit -m "feat: manage account keys from the connections dialog"
```

---

## Self-review notes

**Spec coverage.** Copy semantics — Task 1 writes without clearing local state. Default-both — Task 4 Step 4. Revision guard — Task 1 `pendingConnectionWrites`. Opt-out flag — Task 2, consumed in Tasks 1 and 3. Four card states — Task 3. Validation-failure exclusion — Task 4 Step 4, achieved by reading the store rather than the inputs. Account page — Task 5. Sync-failure reporting — Task 1 `syncPendingConnections`, surfaced in Tasks 3 and 4.

**Known open question for the implementer.** Task 3 returns a two-part fragment that Task 4 splits across the card header and body. If that fights the layout, split it into two exported components sharing a hook and update Task 4's snippet — flagged at Task 3 Step 1.

**Not covered, by design.** Workspace gating, `AccountKeyImport`, and anything in `cloud/` — all listed as non-goals in the spec.
