import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { CommandPalette } from '@/components/CommandPalette';

// cmdk measures its list with a ResizeObserver, which jsdom doesn't implement.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
// ...and it scrolls the selected row into view, which jsdom also lacks.
Element.prototype.scrollIntoView ??= () => {};

// One setter per URL param so a jump can be asserted on all three at once —
// image features and video modes are mutually exclusive views.
const setters: Record<string, ReturnType<typeof vi.fn>> = {
  feature: vi.fn(),
  workspace: vi.fn(),
  videoMode: vi.fn(),
};

vi.mock('nuqs', () => ({
  useQueryState: (key: string) => [null, setters[key]],
}));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function renderPalette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onOpenApiKey = vi.fn();
  const onOpenLibrary = vi.fn();
  render(
    <CommandPalette
      open
      onOpenChange={onOpenChange}
      onOpenApiKey={onOpenApiKey}
      onOpenLibrary={onOpenLibrary}
      {...props}
    />
  );
  return { onOpenChange, onOpenApiKey, onOpenLibrary };
}

describe('CommandPalette', () => {
  beforeEach(() => {
    Object.values(setters).forEach((setter) => setter.mockClear());
    push.mockClear();
  });

  it('describes each image feature with its blurb and what it needs', () => {
    renderPalette();

    expect(screen.getByText('Text to Image Generation')).toBeInTheDocument();
    expect(
      screen.getByText('Transform your ideas into stunning visuals instantly')
    ).toBeInTheDocument();
    expect(screen.getByText('Up to 14 images')).toBeInTheDocument();
  });

  it('jumps to a video mode, leaving the image workspace behind', () => {
    renderPalette();

    fireEvent.click(screen.getByText('Image to video'));

    expect(setters.workspace).toHaveBeenCalledWith('video');
    expect(setters.videoMode).toHaveBeenCalledWith('image');
    expect(setters.feature).toHaveBeenCalledWith(null);
  });

  it('clears the video workspace when jumping to an image feature', () => {
    renderPalette();

    fireEvent.click(screen.getByText('Style Transfer & Artistic Transformation'));

    expect(setters.workspace).toHaveBeenCalledWith(null);
    expect(setters.feature).toHaveBeenCalledWith('style-transfer');
  });

  it('opens the library on the section the command names', () => {
    const { onOpenLibrary } = renderPalette();

    fireEvent.click(screen.getByText('Saved prompts'));

    expect(onOpenLibrary).toHaveBeenCalledWith('prompts');
  });

  it('offers a jump to the spend page', () => {
    renderPalette();
    expect(screen.getByText('View spend')).toBeInTheDocument();

    fireEvent.click(screen.getByText('View spend'));

    expect(push).toHaveBeenCalledWith('/spend');
  });

  it('keeps a search on the rows that actually match the word', () => {
    renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Jump to a feature or action…'), {
      target: { value: 'video' },
    });

    expect(screen.getByText('Text to video')).toBeInTheDocument();
    // Fuzzy subsequence scoring used to surface these for "video".
    expect(screen.queryByText('Viral Thumbnail Generator')).not.toBeInTheDocument();
    expect(screen.queryByText('Real-Time Search Visualization')).not.toBeInTheDocument();
  });

  it('ranks a feature above the rest when the search is one of its aliases', () => {
    renderPalette();

    fireEvent.change(screen.getByPlaceholderText('Jump to a feature or action…'), {
      target: { value: 'anime' },
    });

    expect(screen.getByText('Style Transfer & Artistic Transformation')).toBeInTheDocument();
    expect(screen.queryByText('Multi-Image Composition Studio')).not.toBeInTheDocument();
  });

  it('opens engine docs in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPalette();

    fireEvent.click(screen.getByText('fal.ai docs'));

    expect(open).toHaveBeenCalledWith('https://fal.ai/docs', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
