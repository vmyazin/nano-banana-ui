import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryOverlay from '../../components/LibraryOverlay';
import type { GalleryRecord } from '../../lib/gallery/storage';
import { useDraftStore } from '../../store/useDraftStore';
import { useGalleryStore } from '../../store/useGalleryStore';
import { useAccountStore } from '../../store/useAccountStore';

vi.mock('../../components/account/AccountLibrary', () => ({
  default: ({ownerId}:{ownerId:string}) => <div data-testid="cloud-library">Cloud assets for {ownerId}</div>,
}));

function record(overrides: Partial<GalleryRecord> = {}): GalleryRecord {
  return {
    id: 'image-1',
    kind: 'image',
    createdAt: 1,
    prompt: 'Moonlit palms moving in a warm wind',
    slug: 'moonlit-palms',
    provider: 'gemini',
    controlValues: {},
    mimeType: 'image/png',
    blob: new Blob(['png'], { type: 'image/png' }),
    bytes: 3,
    ...overrides,
  };
}

describe('LibraryOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let created = 0;
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:library-${++created}`),
      revokeObjectURL: vi.fn(),
    }));
    useDraftStore.getState().reset();
    useGalleryStore.setState({ records: [], hydrated: true, storageError: null });
    useAccountStore.setState({session:null,status:'ready',epoch:0,jobs:[],assets:[]});
  });

  it('presents a focused image-only picker without library management', () => {
    useGalleryStore.setState({
      records: [
        record(),
        record({
          id: 'video-1',
          kind: 'video',
          slug: 'moving-palms',
          mimeType: 'video/mp4',
          blob: new Blob(['video'], { type: 'video/mp4' }),
          posterBlob: new Blob(['poster'], { type: 'image/png' }),
          bytes: 5,
        }),
      ],
    });

    render(
      <LibraryOverlay
        open
        onOpenChange={() => undefined}
        purpose="pick-image"
        referenceLimit={2}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Choose from library' })).toBeInTheDocument();
    expect(screen.getByText('moonlit palms')).toBeInTheDocument();
    expect(screen.queryByText('moving palms')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear library' })).toBeNull();
    expect(screen.getByText('1 stored image')).toBeInTheDocument();
  });

  it('closes after a contextual image is used', async () => {
    useGalleryStore.setState({ records: [record()] });
    const onOpenChange = vi.fn();
    render(
      <LibraryOverlay
        open
        onOpenChange={onOpenChange}
        purpose="pick-image"
        referenceLimit={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use image' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(useDraftStore.getState().references).toHaveLength(1);
  });

  it('keeps the normal library tabs and management by default', () => {
    useGalleryStore.setState({ records: [record()] });

    render(<LibraryOverlay open onOpenChange={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'results' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'prompts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear library' })).toBeInTheDocument();
  });

  it('offers cloud and browser sources only while signed in', () => {
    useGalleryStore.setState({ records: [record()] });
    useAccountStore.getState().applySession({account:{id:'owner-1',name:'Owner',email:'owner@example.test'},googleEnabled:true,localSignIn:false,providers:[],connections:[]});
    render(<LibraryOverlay open onOpenChange={() => undefined} />);

    expect(screen.getByTestId('cloud-library')).toHaveTextContent('owner-1');
    expect(screen.getByRole('button',{name:'Cloud account'})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:'This browser'}));
    expect(screen.getByText('moonlit palms')).toBeInTheDocument();
    expect(screen.queryByTestId('cloud-library')).toBeNull();
  });

  it('returns to the browser library when the account disappears', () => {
    useGalleryStore.setState({ records: [record()] });
    useAccountStore.getState().applySession({account:{id:'owner-1',name:'Owner',email:'owner@example.test'},googleEnabled:true,localSignIn:false,providers:[],connections:[]});
    render(<LibraryOverlay open onOpenChange={() => undefined} />);
    expect(screen.getByTestId('cloud-library')).toBeInTheDocument();

    act(()=>useAccountStore.getState().applySession({account:null,googleEnabled:true,localSignIn:false,providers:[],connections:[]}));
    expect(screen.getByText('moonlit palms')).toBeInTheDocument();
    expect(screen.queryByRole('group',{name:'Library source'})).toBeNull();
  });
});
