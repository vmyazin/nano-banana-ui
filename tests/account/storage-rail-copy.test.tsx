import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AccountConsole from '@/components/account/AccountConsole';
import type { AccountStorage } from '@/lib/account/use-library';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/account/CloudAssetGrid', () => ({ default: () => <section>Cloud assets</section> }));
vi.mock('@/components/account/AccountDeletion', () => ({ default: () => <section>Deletion</section> }));
vi.mock('@/components/account/AccountConnections', () => ({ default: () => <section>Connections</section> }));
vi.mock('@/components/account/BrowserImportDialog', () => ({ default: () => null }));

const storage = vi.hoisted(() => ({ current: null as AccountStorage | null }));

vi.mock('@/lib/account/use-library', () => ({
  formatAccountBytes: (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`,
  useAccountLibrary: () => ({
    jobs: [], assets: [], counts: {}, loading: false,
    storage: storage.current, refresh: vi.fn(),
  }),
}));

function renderConsole(next: AccountStorage) {
  storage.current = next;
  return render(
    <AccountConsole
      account={{ id: 'owner-1', name: 'Ada Creator', email: 'ada@example.test' }}
      busy={false}
      error={null}
      onSignOut={vi.fn()}
      onManageKeys={vi.fn()}
    />
  );
}

/**
 * The counter this line prints releases only on a terminal state, so it also
 * counts a job parked in `needs_attention`. The intake stopped treating those
 * as slots, and the tab beside this shows only the running ones — so calling
 * both numbers "active" in one panel reads as a page contradicting itself.
 */
describe('the cloud storage rail', () => {
  it('calls the reservation counter unfinished, not active', () => {
    renderConsole({ limitBytes: 1_000_000_000, usedBytes: 0, reservedBytes: 288_000_000, activeJobs: 3 });

    expect(screen.getByText(/3 unfinished jobs · 288 MB reserved/)).toBeInTheDocument();
    expect(screen.queryByText(/3 active jobs/)).toBeNull();
  });

  it('says the same thing with nothing unfinished', () => {
    renderConsole({ limitBytes: 1_000_000_000, usedBytes: 0, reservedBytes: 0, activeJobs: 0 });

    expect(screen.getByText(/0 MB reserved for unfinished jobs/)).toBeInTheDocument();
  });

  it('speaks of one job in the singular', () => {
    renderConsole({ limitBytes: 1_000_000_000, usedBytes: 0, reservedBytes: 96_000_000, activeJobs: 1 });

    expect(screen.getByText(/1 unfinished job · 96 MB reserved/)).toBeInTheDocument();
  });
});
