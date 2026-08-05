import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LastFrameActions from '../components/LastFrameActions';
import { useSeedFrameStore } from '../store/useSeedFrameStore';

const { extractLastFrameMock } = vi.hoisted(() => ({ extractLastFrameMock: vi.fn() }));

vi.mock('../lib/video-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/video-frame')>()),
  extractLastFrame: extractLastFrameMock,
}));

const VIDEO_URL = 'https://v3.fal.media/files/tiger/result.mp4';

function renderActions(filenameBase = 'neon-tiger-in-the-rain', onContinue?: () => void) {
  return render(
    <LastFrameActions videoUrl={VIDEO_URL} filenameBase={filenameBase} onContinue={onContinue} />
  );
}

function stubClipboard(write = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('ClipboardItem', class {
    constructor(public readonly items: Record<string, unknown>) {}
  });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
  return write;
}

describe('LastFrameActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSeedFrameStore.getState().clearSeedFrame();
    extractLastFrameMock.mockResolvedValue(new Blob(['frame'], { type: 'image/png' }));
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:last-frame'),
      revokeObjectURL: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('saves the frame beside the clip it came from', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderActions();

    fireEvent.click(screen.getByRole('button', { name: /Save last frame/ }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledOnce());
    expect(extractLastFrameMock).toHaveBeenCalledWith(VIDEO_URL);
    const link = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe('neon-tiger-in-the-rain-last-frame.png');
    expect(link.href).toBe('blob:last-frame');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:last-frame');
  });

  it('decodes the video once even when both actions are used', async () => {
    stubClipboard();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderActions();

    fireEvent.click(screen.getByRole('button', { name: /Save last frame/ }));
    await waitFor(() => expect(extractLastFrameMock).toHaveBeenCalledOnce());

    fireEvent.click(await screen.findByRole('button', { name: /Copy last frame/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/ })).toBeTruthy());

    expect(extractLastFrameMock).toHaveBeenCalledOnce();
  });

  it('writes a PNG clipboard item and confirms the copy', async () => {
    const write = stubClipboard();
    renderActions();

    fireEvent.click(await screen.findByRole('button', { name: /Copy last frame/ }));

    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    const [item] = write.mock.calls[0][0] as Array<{ items: Record<string, unknown> }>;
    // Safari only honours a write started in the gesture's task, so the item
    // must carry the pending extraction rather than a resolved blob.
    expect(item.items['image/png']).toBeInstanceOf(Promise);
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeTruthy();
  });

  it('offers only saving when the browser cannot copy images', async () => {
    renderActions();

    expect(await screen.findByRole('button', { name: /Save last frame/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copy last frame/ })).toBeNull();
  });

  it('hands the frame to the seed store and switches workspace mode', async () => {
    const onContinue = vi.fn();
    renderActions('neon-tiger-in-the-rain', onContinue);

    fireEvent.click(screen.getByRole('button', { name: /Continue from last frame/ }));

    await waitFor(() => expect(onContinue).toHaveBeenCalledOnce());
    const seed = useSeedFrameStore.getState().seed;
    expect(seed?.file.name).toBe('neon-tiger-in-the-rain-last-frame.png');
    expect(seed?.file.type).toBe('image/png');
    expect(seed?.sourceLabel).toBe('neon-tiger-in-the-rain');
  });

  it('omits the continue action where no follow-on clip is possible', () => {
    renderActions();
    expect(screen.queryByRole('button', { name: /Continue from last frame/ })).toBeNull();
  });

  it('leaves the seed store untouched when the frame cannot be read', async () => {
    extractLastFrameMock.mockRejectedValue(new Error('Unable to read the last frame of this video.'));
    const onContinue = vi.fn();
    renderActions('neon-tiger-in-the-rain', onContinue);

    fireEvent.click(screen.getByRole('button', { name: /Continue from last frame/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
    expect(useSeedFrameStore.getState().seed).toBeNull();
  });

  it('reports a frame that could not be read', async () => {
    extractLastFrameMock.mockRejectedValue(new Error('Unable to read the last frame of this video.'));
    renderActions();

    fireEvent.click(screen.getByRole('button', { name: /Save last frame/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to read the last frame of this video.'
    );
  });
});
