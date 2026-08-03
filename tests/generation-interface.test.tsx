import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationInterface from '../components/GenerationInterface';
import { useAppStore } from '../store/useAppStore';
import { FEATURES } from '../types';

vi.mock('@/components/KieGenerationWorkspace', () => ({
  default: ({ engineSelector }: { engineSelector?: ReactNode }) => (
    <div data-testid="kie-workspace">
      <h2>Kie page title</h2>
      {engineSelector}
    </div>
  ),
}));

const textToImage = FEATURES.find((feature) => feature.id === 'text-to-image')!;

describe('GenerationInterface engine selection', () => {
  beforeEach(() => {
    useAppStore.setState({
      engine: 'kie',
      apiKey: 'gemini_test_key',
      cfAccountId: 'cf_account',
      cfToken: 'cf_token',
      kieApiKey: 'kie_test_key',
    });
  });

  it('keeps Gemini and Cloudflare selectable while the Kie workspace is active', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerationInterface
          feature={textToImage}
          apiKey="gemini_test_key"
          onBack={() => undefined}
          onOpenConnections={() => undefined}
        />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('kie-workspace')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Google Gemini' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cloudflare · FLUX/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Google Gemini' }));

    expect(useAppStore.getState().engine).toBe('gemini');
    expect(screen.queryByTestId('kie-workspace')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Generated Image' })).toBeTruthy();
  });

  it('uses the standalone Kie-style engine picker for every active engine', () => {
    useAppStore.setState({ engine: 'gemini' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerationInterface
          feature={textToImage}
          apiKey="gemini_test_key"
          onBack={() => undefined}
          onOpenConnections={() => undefined}
        />
      </QueryClientProvider>
    );

    const picker = screen.getByRole('region', { name: 'Generation engine' });

    expect(picker.className).toContain('glass-card');
    expect(
      within(picker).getByRole('button', { name: 'Google Gemini' })
    ).toBeTruthy();
    expect(
      within(picker).getByRole('button', { name: /Cloudflare · FLUX/i })
    ).toBeTruthy();
    expect(within(picker).queryByRole('heading')).toBeNull();
  });

  it('places the engine picker below the Kie page title', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerationInterface
          feature={textToImage}
          apiKey="gemini_test_key"
          onBack={() => undefined}
          onOpenConnections={() => undefined}
        />
      </QueryClientProvider>
    );

    const title = screen.getByRole('heading', { name: 'Kie page title' });
    const picker = screen.getByRole('region', { name: 'Generation engine' });

    expect(title.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('places the engine picker below non-Kie page titles', () => {
    useAppStore.setState({ engine: 'gemini' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerationInterface
          feature={textToImage}
          apiKey="gemini_test_key"
          onBack={() => undefined}
          onOpenConnections={() => undefined}
        />
      </QueryClientProvider>
    );

    const title = screen.getByRole('heading', { name: /Text to Image Generation/ });
    const picker = screen.getByRole('region', { name: 'Generation engine' });

    expect(title.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('renders Gemini resolution choices as concise horizontal toggles', () => {
    useAppStore.setState({ engine: 'gemini' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerationInterface
          feature={textToImage}
          apiKey="gemini_test_key"
          onBack={() => undefined}
          onOpenConnections={() => undefined}
        />
      </QueryClientProvider>
    );

    const resolution = screen.getByRole('radiogroup', { name: 'Resolution' });
    const choices = within(resolution).getAllByRole('radio');

    expect(resolution.className).toContain('flex');
    expect(choices.map((choice) => choice.textContent)).toEqual(['1K', '2K', '4K']);
    expect(screen.queryByText(/Fast Generation|Balanced Quality|Maximum Quality/)).toBeNull();
    expect(screen.getByRole('radio', { name: '1K' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: '2K' }));

    expect(screen.getByRole('radio', { name: '2K' }).getAttribute('aria-checked')).toBe('true');
  });
});
