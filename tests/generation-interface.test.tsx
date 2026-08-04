import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationInterface from '../components/GenerationInterface';
import { runFalImage } from '../lib/fal/browser';
import { useAppStore } from '../store/useAppStore';
import { FEATURES, type Feature } from '../types';

vi.mock('@/lib/fal/browser', () => ({
  runFalImage: vi.fn(),
}));

vi.mock('@/components/KieGenerationWorkspace', () => ({
  default: ({ engineSelector }: { engineSelector?: ReactNode }) => (
    <div data-testid="kie-workspace">
      <h2>Kie page title</h2>
      {engineSelector}
    </div>
  ),
}));

const textToImage = FEATURES.find((feature) => feature.id === 'text-to-image')!;
const searchGrounding = FEATURES.find((feature) => feature.id === 'search-grounding')!;
const multiImageCompose = FEATURES.find((feature) => feature.id === 'multi-image-compose')!;
const mockedRunFalImage = vi.mocked(runFalImage);

function renderInterface(
  feature: Feature = textToImage,
  options: {
    apiKey?: string;
    onBack?: () => void;
    onOpenConnections?: () => void;
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GenerationInterface
        feature={feature}
        apiKey={options.apiKey ?? ''}
        onBack={options.onBack ?? (() => undefined)}
        onOpenConnections={options.onOpenConnections ?? (() => undefined)}
      />
    </QueryClientProvider>
  );
}

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

describe('GenerationInterface fal image generation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockedRunFalImage.mockReset();
    useAppStore.setState({
      engine: 'fal',
      apiKey: 'gemini_test_key',
      cfAccountId: 'cf_account',
      cfToken: 'cf_token',
      kieApiKey: 'kie_test_key',
      falApiKey: 'fal_id:fal_secret',
    });
  });

  it('offers fal Nano Banana 2 for every image feature', () => {
    for (const feature of FEATURES) {
      const view = renderInterface(feature);

      expect(
        screen.getByRole('button', { name: /fal\.ai.*Nano Banana 2/i })
      ).toBeTruthy();

      view.unmount();
    }
  });

  it('routes text-only generation through fal with the exact mapped values', async () => {
    useAppStore.setState({ engine: 'gemini' });
    mockedRunFalImage.mockResolvedValue({
      url: 'https://v3.fal.media/files/editorial-still-life.webp',
      mimeType: 'image/webp',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderInterface(searchGrounding);

    fireEvent.click(screen.getByRole('button', { name: /fal\.ai.*Nano Banana 2/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'A bright editorial still life' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '2K' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));

    await waitFor(() => expect(mockedRunFalImage).toHaveBeenCalledTimes(1));
    expect(mockedRunFalImage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'fal_id:fal_secret',
        prompt: 'A bright editorial still life',
        dataUrls: [],
        values: {
          aspect_ratio: '16:9',
          resolution: '2K',
          enable_web_search: true,
        },
        signal: expect.any(AbortSignal),
      }),
      {}
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/generate', expect.anything());
    expect(screen.getByAltText('Generated').getAttribute('src')).toBe(
      'https://v3.fal.media/files/editorial-still-life.webp'
    );
  });

  it('passes multiple uploaded reference data URLs unchanged', async () => {
    mockedRunFalImage.mockResolvedValue({
      url: 'https://v3.fal.media/files/composite.png',
      mimeType: 'image/png',
    });
    renderInterface(multiImageCompose);
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.webp', { type: 'image/webp' });

    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [first, second] },
    });
    await waitFor(() => expect(screen.getByAltText('Upload 2')).toBeTruthy());
    const expectedDataUrls = [
      screen.getByAltText('Upload 1').getAttribute('src'),
      screen.getByAltText('Upload 2').getAttribute('src'),
    ];
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Blend both references naturally' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));

    await waitFor(() => expect(mockedRunFalImage).toHaveBeenCalledTimes(1));
    expect(mockedRunFalImage.mock.calls[0][0].dataUrls).toEqual(expectedDataUrls);
    expect(expectedDataUrls).toEqual([
      'data:image/png;base64,Zmlyc3Q=',
      'data:image/webp;base64,c2Vjb25k',
    ]);
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
  ])('downloads a remote %s result using a safe .%s filename', async (mimeType, extension) => {
    const resultUrl = `https://v3.fal.media/files/result-${extension}`;
    mockedRunFalImage.mockResolvedValue({ url: resultUrl, mimeType });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['image'], { type: mimeType }), {
        status: 200,
        headers: { 'Content-Type': mimeType },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:download-image');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderInterface();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Glowing canyon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
    await waitFor(() => expect(screen.getByAltText('Generated')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Download Image' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const link = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(fetchMock).toHaveBeenCalledWith(resultUrl, expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(link.href).toBe('blob:download-image');
    expect(link.download).toBe(`glowing-canyon.${extension}`);
    expect(link.download).not.toContain('fal_id:fal_secret');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download-image');
  });

  it('opens API connections instead of submitting when the fal key is missing', () => {
    useAppStore.setState({ falApiKey: '' });
    const onOpenConnections = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderInterface(textToImage, { onOpenConnections });

    expect(screen.getByText('Connect your fal API key to use this engine.')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A paper city' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));

    expect(onOpenConnections).toHaveBeenCalledTimes(1);
    expect(mockedRunFalImage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Connect your fal API key first in API connections.')
    ).toBeTruthy();
  });

  it('renders a safe fal error without falling back or exposing the key', async () => {
    mockedRunFalImage.mockRejectedValue(
      new Error('Provider rejected fal_id:fal_secret at https://queue.fal.run?key=fal_id:fal_secret')
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    renderInterface();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A quiet harbor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));

    await waitFor(() =>
      expect(screen.getByText('Unable to generate this image with fal. Please try again.')).toBeTruthy()
    );
    expect(mockedRunFalImage).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('fal_id:fal_secret');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('fal_id:fal_secret');
    expect(JSON.stringify(consoleLog.mock.calls)).not.toContain('fal_id:fal_secret');
  });

  it('aborts fal locally on back navigation and ignores a stale completion', async () => {
    let resolveRun!: (result: { url: string; mimeType?: string }) => void;
    mockedRunFalImage.mockImplementation(
      () => new Promise((resolve) => { resolveRun = resolve; })
    );
    const onBack = vi.fn();
    renderInterface(textToImage, { onBack });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A distant lighthouse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
    await waitFor(() => expect(mockedRunFalImage).toHaveBeenCalledTimes(1));
    const signal = mockedRunFalImage.mock.calls[0][0].signal!;
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolveRun({
        url: 'https://v3.fal.media/files/stale.png',
        mimeType: 'image/png',
      });
      await Promise.resolve();
    });
    expect(screen.queryByAltText('Generated')).toBeNull();
  });

  it('aborts an in-flight fal generation when the component unmounts', async () => {
    mockedRunFalImage.mockImplementation(() => new Promise(() => undefined));
    const view = renderInterface();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A glass pavilion' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
    await waitFor(() => expect(mockedRunFalImage).toHaveBeenCalledTimes(1));
    const signal = mockedRunFalImage.mock.calls[0][0].signal!;
    view.unmount();

    expect(signal.aborted).toBe(true);
  });

  it('shows the fal usage-rate provider line without a hard-coded price', () => {
    renderInterface();

    expect(screen.getByText('fal usage rates apply · Nano Banana 2')).toBeTruthy();
    expect(screen.queryByText(/\$\d/)).toBeNull();
  });

  it.each([
    ['HTTP failure', () => Promise.resolve(new Response('', { status: 503 }))],
    ['network failure', () => Promise.reject(new Error('network includes fal_id:fal_secret'))],
    [
      'invalid MIME',
      () => Promise.resolve(new Response('not an image', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })),
    ],
  ])('reports a stable safe download error for %s', async (_name, downloadResponse) => {
    mockedRunFalImage.mockResolvedValue({
      url: 'https://v3.fal.media/files/download.png',
      mimeType: 'image/png',
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(downloadResponse));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderInterface();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A clean poster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
    await waitFor(() => expect(screen.getByAltText('Generated')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Download Image' }));

    await waitFor(() =>
      expect(screen.getByText('Unable to download this image. Please try again.')).toBeTruthy()
    );
    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('fal_id:fal_secret');
  });

  it('preserves the direct data-URL download flow for existing providers', async () => {
    useAppStore.setState({ engine: 'gemini' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        imageData: 'cG5n',
        mimeType: 'image/png',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderInterface();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Existing provider image' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
    await waitFor(() => expect(screen.getByAltText('Generated')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Download Image' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const link = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(link.href).toBe('data:image/png;base64,cG5n');
    expect(link.download).toBe('existing-provider-image.png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/generate', expect.anything());
  });
});
