import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FalGenerationWorkspace from '../../components/FalGenerationWorkspace';
import GenerationInterface from '../../components/GenerationInterface';
import KieGenerationWorkspace from '../../components/KieGenerationWorkspace';
import { useAppStore } from '../../store/useAppStore';
import { useDraftStore } from '../../store/useDraftStore';
import { useSeedFrameStore } from '../../store/useSeedFrameStore';
import { FEATURES, type Feature } from '../../types';

vi.mock('@/lib/fal/browser', () => ({
  cancelFalJob: vi.fn(),
  runFalImage: vi.fn(),
  submitFalJob: vi.fn(),
  uploadFalFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/kie/browser', () => ({
  submitKieJob: vi.fn(),
  uploadKieFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/micro-ai/browser', () => ({
  requestPromptSlug: vi.fn().mockResolvedValue(null),
  requestExamplePrompt: vi.fn().mockResolvedValue('An unused example prompt'),
}));

vi.mock('@/lib/gallery/capture', () => ({
  resultBlob: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
}));

const multiImageCompose = FEATURES.find((feature) => feature.id === 'multi-image-compose')!;

/**
 * jsdom has no DragEvent and no DataTransfer, so a drop is fired with a stand-in carrying
 * only what the code reads: the file list, the advertised types, and getData.
 */
function drop(
  element: Element,
  { files = [], data = {} }: { files?: File[]; data?: Record<string, string> }
) {
  const dataTransfer = {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: [...(files.length ? ['Files'] : []), ...Object.keys(data)],
    getData: (type: string) => data[type] ?? '',
    dropEffect: 'none',
  };
  fireEvent.drop(element, { dataTransfer });
  return dataTransfer;
}

function dragEnter(element: Element, types: string[]) {
  fireEvent.dragEnter(element, {
    dataTransfer: { files: [], items: [], types, getData: () => '', dropEffect: 'none' },
  });
}

function renderFeature(feature: Feature = multiImageCompose) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GenerationInterface
        feature={feature}
        apiKey="gemini-key"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    </QueryClientProvider>
  );
}

function pngResponse(type = 'image/png') {
  return new Response(new Blob(['bytes'], { type }), {
    status: 200,
    headers: { 'Content-Type': type },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:reference-preview'),
      revokeObjectURL: vi.fn(),
    })
  );
  useAppStore.setState({
    apiKey: 'gemini-key',
    falApiKey: 'fal-key-secret',
    kieApiKey: 'kie-key-secret',
    videoEngine: 'fal',
    falVideoModel: 'veo-3-1-fast',
  });
  useDraftStore.getState().reset();
  useSeedFrameStore.getState().clearSeedFrame();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('drop zones', () => {
  it('adds a file dropped on the fal reference zone', async () => {
    render(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );

    const zone = screen.getByRole('button', { name: /Choose an image/ });
    drop(zone, { files: [new File(['image'], 'portrait.png', { type: 'image/png' })] });

    expect(await screen.findByAltText('Reference 1')).toHaveAttribute('src', 'blob:reference-preview');
  });

  it('fetches an image dragged from another tab into the fal zone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pngResponse('image/jpeg'));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );

    const zone = screen.getByRole('button', { name: /Choose an image/ });
    drop(zone, { data: { 'text/uri-list': 'https://example.com/pictures/tiger.jpg' } });

    expect(await screen.findByAltText('Reference 1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/fetch-image', expect.objectContaining({ method: 'POST' }));
    expect(useDraftStore.getState().references[0].file.name).toBe('tiger.jpg');
  });

  it('rejects an unusable file with the zone’s own message', async () => {
    render(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );

    drop(screen.getByRole('button', { name: /Choose an image/ }), {
      files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a PNG, JPEG, WebP, or AVIF image');
    expect(useDraftStore.getState().references).toHaveLength(0);
  });

  it('reports a drop that carries nothing usable', async () => {
    render(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );

    drop(screen.getByRole('button', { name: /Choose an image/ }), {
      data: { 'text/plain': 'some words dragged out of a paragraph' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Drop an image file');
  });

  it('highlights the fal zone while a file drag is over it', () => {
    render(
      <FalGenerationWorkspace inputMode="image" onBack={() => undefined} onOpenConnections={() => undefined} />
    );

    const zone = screen.getByRole('button', { name: /Choose an image/ });
    dragEnter(zone, ['Files']);
    expect(screen.getByRole('button', { name: 'Drop to use as a source' })).toBe(zone);

    fireEvent.dragLeave(zone);
    expect(screen.getByRole('button', { name: /Choose an image/ })).toBe(zone);
  });

  it('adds a file dropped on the Kie reference zone', async () => {
    render(
      <KieGenerationWorkspace
        mediaType="image"
        inputMode="image"
        onBack={() => undefined}
        onOpenConnections={() => undefined}
      />
    );

    drop(screen.getByRole('button', { name: /Drop, upload, or paste/ }), {
      files: [new File(['image'], 'seed.png', { type: 'image/png' })],
    });

    expect(await screen.findByAltText('Reference 1')).toBeInTheDocument();
  });

  it('adds a file dropped on the image feature zone', async () => {
    renderFeature();

    drop(screen.getByRole('button', { name: /Drop or click to upload/ }), {
      files: [new File(['image'], 'left.png', { type: 'image/png' })],
    });

    await waitFor(() => expect(useDraftStore.getState().references).toHaveLength(1));
  });

  it('tells the image feature zone when a drop carries no image', async () => {
    renderFeature();

    drop(screen.getByRole('button', { name: /Drop or click to upload/ }), {
      files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
    });

    expect(await screen.findByText(/Drop an image file/)).toBeInTheDocument();
    expect(useDraftStore.getState().references).toHaveLength(0);
  });
});
