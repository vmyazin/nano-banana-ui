import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationInterface from '../components/GenerationInterface';
import { cancelFalJob, runFalImage } from '../lib/fal/browser';
import { useAppStore } from '../store/useAppStore';
import { FEATURES, type Feature } from '../types';

vi.mock('@/lib/fal/browser', () => ({
  cancelFalJob: vi.fn(),
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
const mockedCancelFalJob = vi.mocked(cancelFalJob);

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    mockedCancelFalJob.mockReset();
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

  it.each(['resolve', 'reject'] as const)(
    'silently ignores a stale generation that %s after a newer run starts',
    async (staleOutcome) => {
      const firstRun = deferred<{ url: string; mimeType?: string }>();
      const secondRun = deferred<{ url: string; mimeType?: string }>();
      mockedRunFalImage
        .mockImplementationOnce(() => firstRun.promise)
        .mockImplementationOnce(() => secondRun.promise);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const toastError = vi.spyOn(toast, 'error');
      const toastSuccess = vi.spyOn(toast, 'success');
      renderInterface();

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Two queued scenes' } });
      const generateButton = screen.getByRole('button', { name: 'Generate Image' });
      act(() => {
        generateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        generateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      await waitFor(() => expect(mockedRunFalImage).toHaveBeenCalledTimes(2));
      const firstSignal = mockedRunFalImage.mock.calls[0][0].signal!;
      const secondSignal = mockedRunFalImage.mock.calls[1][0].signal!;
      expect(firstSignal.aborted).toBe(true);
      expect(secondSignal.aborted).toBe(false);

      await act(async () => {
        if (staleOutcome === 'resolve') {
          firstRun.resolve({
            url: 'https://v3.fal.media/files/stale.png',
            mimeType: 'image/png',
          });
        } else {
          firstRun.reject(new Error('stale fal_id:fal_secret failure'));
        }
        await Promise.resolve();
      });

      expect(screen.queryByAltText('Generated')).toBeNull();
      expect(screen.queryByText('Unable to generate this image with fal. Please try again.')).toBeNull();
      expect(toastError).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Generating Magic...' }).hasAttribute('disabled')).toBe(true);
      expect(mockedCancelFalJob).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockedRunFalImage).toHaveBeenCalledTimes(2);

      await act(async () => {
        secondRun.resolve({
          url: 'https://v3.fal.media/files/current.png',
          mimeType: 'image/png',
        });
      });

      await waitFor(() =>
        expect(screen.getByAltText('Generated').getAttribute('src')).toBe(
          'https://v3.fal.media/files/current.png'
        )
      );
      expect(toastError).not.toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledTimes(1);
      expect(mockedCancelFalJob).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['back navigation', 'resolve'],
    ['back navigation', 'reject'],
    ['component unmount', 'resolve'],
    ['component unmount', 'reject'],
  ] as const)(
    'silently ignores a fal run that completes after %s via %s',
    async (exitMode, lateOutcome) => {
      const run = deferred<{ url: string; mimeType?: string }>();
      mockedRunFalImage.mockImplementation(() => run.promise);
      const onBack = vi.fn();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const toastError = vi.spyOn(toast, 'error');
      const toastSuccess = vi.spyOn(toast, 'success');
      const view = renderInterface(textToImage, { onBack });

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A distant lighthouse' } });
      fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
      await waitFor(() => expect(mockedRunFalImage).toHaveBeenCalledTimes(1));
      const signal = mockedRunFalImage.mock.calls[0][0].signal!;

      if (exitMode === 'back navigation') {
        fireEvent.click(screen.getByRole('button', { name: '← Back' }));
        expect(onBack).toHaveBeenCalledTimes(1);
      } else {
        view.unmount();
      }
      expect(signal.aborted).toBe(true);

      await act(async () => {
        if (lateOutcome === 'resolve') {
          run.resolve({
            url: 'https://v3.fal.media/files/stale.png',
            mimeType: 'image/png',
          });
        } else {
          run.reject(new Error('late fal_id:fal_secret failure'));
        }
        await Promise.resolve();
      });

      expect(screen.queryByAltText('Generated')).toBeNull();
      expect(screen.queryByText('Unable to generate this image with fal. Please try again.')).toBeNull();
      expect(toastError).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(mockedCancelFalJob).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockedRunFalImage).toHaveBeenCalledTimes(1);
    }
  );

  it('shows the fal usage-rate provider line without a hard-coded price', () => {
    renderInterface();

    expect(screen.getByText('fal usage rates apply · Nano Banana 2')).toBeTruthy();
    expect(screen.queryByText(/\$\d/)).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)(
    'silently discards an older remote download that %s after a newer download starts',
    async (staleOutcome) => {
      mockedRunFalImage.mockResolvedValue({
        url: 'https://v3.fal.media/files/download-race.png',
        mimeType: 'image/png',
      });
      const firstDownload = deferred<Response>();
      const secondDownload = deferred<Response>();
      const fetchMock = vi.fn()
        .mockImplementationOnce(() => firstDownload.promise)
        .mockImplementationOnce(() => secondDownload.promise);
      vi.stubGlobal('fetch', fetchMock);
      const createObjectURL = vi.fn(() => 'blob:current-download');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const toastError = vi.spyOn(toast, 'error');
      renderInterface();

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Download race' } });
      fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
      await waitFor(() => expect(screen.getByAltText('Generated')).toBeTruthy());
      const downloadButton = screen.getByRole('button', { name: 'Download Image' });
      fireEvent.click(downloadButton);
      fireEvent.click(downloadButton);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
      const secondSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;
      expect(firstSignal.aborted).toBe(true);
      expect(secondSignal.aborted).toBe(false);

      await act(async () => {
        if (staleOutcome === 'resolve') {
          firstDownload.resolve(new Response(new Blob(['stale'], { type: 'image/png' }), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          }));
        } else {
          firstDownload.reject(new Error('stale download fal_id:fal_secret failure'));
        }
        await Promise.resolve();
      });

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(clickSpy).not.toHaveBeenCalled();
      expect(screen.queryByText('Unable to download this image. Please try again.')).toBeNull();
      expect(toastError).not.toHaveBeenCalled();

      await act(async () => {
        secondDownload.resolve(new Response(new Blob(['current'], { type: 'image/png' }), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }));
      });

      await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:current-download');
      expect(screen.queryByText('Unable to download this image. Please try again.')).toBeNull();
      expect(toastError).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['back navigation', 'resolve'],
    ['back navigation', 'reject'],
    ['component unmount', 'resolve'],
    ['component unmount', 'reject'],
  ] as const)(
    'silently discards a remote download that finishes after %s via %s',
    async (exitMode, lateOutcome) => {
      mockedRunFalImage.mockResolvedValue({
        url: 'https://v3.fal.media/files/late-download.png',
        mimeType: 'image/png',
      });
      const download = deferred<Response>();
      const fetchMock = vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >().mockImplementation(() => download.promise);
      vi.stubGlobal('fetch', fetchMock);
      const createObjectURL = vi.fn(() => 'blob:late-download');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const toastError = vi.spyOn(toast, 'error');
      const onBack = vi.fn();
      const view = renderInterface(textToImage, { onBack });

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Late download' } });
      fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
      await waitFor(() => expect(screen.getByAltText('Generated')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Download Image' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const signal = fetchMock.mock.calls[0]![1]!.signal as AbortSignal;

      if (exitMode === 'back navigation') {
        fireEvent.click(screen.getByRole('button', { name: '← Back' }));
        expect(onBack).toHaveBeenCalledTimes(1);
      } else {
        view.unmount();
      }
      expect(signal.aborted).toBe(true);

      await act(async () => {
        if (lateOutcome === 'resolve') {
          download.resolve(new Response(new Blob(['late'], { type: 'image/png' }), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          }));
        } else {
          download.reject(new Error('late download failure fal_id:fal_secret'));
        }
        await Promise.resolve();
      });

      expect(createObjectURL).not.toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(clickSpy).not.toHaveBeenCalled();
      expect(screen.queryByText('Unable to download this image. Please try again.')).toBeNull();
      expect(toastError).not.toHaveBeenCalled();
    }
  );

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
