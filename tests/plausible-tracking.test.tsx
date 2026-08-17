import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

vi.mock('next/script', () => ({
  default: ({
    strategy,
    ...props
  }: React.ScriptHTMLAttributes<HTMLScriptElement> & {
    strategy?: string;
  }) => <script data-nscript={strategy} {...props} />,
}));

vi.mock('nuqs/adapters/next/app', () => ({
  NuqsAdapter: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../app/providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => vi.unstubAllEnvs());

function renderLayout(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);

  return renderToStaticMarkup(
    <RootLayout>
      <main>Scene Assembly</main>
    </RootLayout>,
  );
}

describe('Plausible tracking', () => {
  it('configures Next.js to inject the Plausible embed into the production head', () => {
    const productionHtml = renderLayout('production');
    const developmentHtml = renderLayout('development');

    expect(productionHtml).toContain(
      'src="https://plausible.io/js/pa-IvadW-ZiJU71wFTpSyL7C.js"',
    );
    expect(productionHtml).toContain('plausible.init()');
    expect(productionHtml.match(/data-nscript="beforeInteractive"/g)).toHaveLength(2);
    expect(developmentHtml).not.toContain('plausible.io');
    expect(developmentHtml).not.toContain('plausible.init()');
    expect(developmentHtml).not.toContain('data-nscript="beforeInteractive"');
  });
});
