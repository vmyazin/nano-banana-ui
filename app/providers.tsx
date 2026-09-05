'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState } from 'react';
import AccountSessionProvider from '@/components/account/AccountSessionProvider';
import JobQueueOverlay from '@/components/account/JobQueueOverlay';
import FalJobsProvider from '@/components/FalJobsProvider';
import KieJobsProvider from '@/components/KieJobsProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session (created lazily, never on the server twice).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AccountSessionProvider>
      <KieJobsProvider>
        <FalJobsProvider>{children}</FalJobsProvider>
      </KieJobsProvider>
      {/* Mounted once, outside the page tree: background jobs outlive the page
          that started them, so the indicator cannot live on that page. */}
      <JobQueueOverlay />
      </AccountSessionProvider>
      <Toaster
        theme="dark"
        // Toasts moved off bottom-right when the job queue card claimed that
        // corner: a transient toast must not sit on top of standing status.
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--background-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
