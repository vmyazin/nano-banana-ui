import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../../app/page';
import ApiKeyConfig from '../../components/ApiKeyConfig';
import { useAppStore } from '../../store/useAppStore';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('nuqs', () => ({ useQueryState: () => [null, vi.fn()] }));
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/FeatureSelector', () => ({ default: () => null }));
vi.mock('@/components/VideoWorkspace', () => ({ default: () => null }));

const GENERIC_FAL_ERROR = 'Unable to validate your fal API key.';

function setStoredKeys(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    apiKey: '',
    kieApiKey: '',
    falApiKey: '',
    hasHydrated: true,
    ...overrides,
  });
}

describe('fal API connection', () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredKeys();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('validates and saves a fal key without generating media', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )
    );

    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('fal API key'), {
      target: { value: 'id:secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/fal/validate',
        expect.objectContaining({ method: 'POST' })
      )
    );
    expect(useAppStore.getState().falApiKey).toBe('id:secret');
  });

  it('sends the candidate only in the validation POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('fal API key'), {
      target: { value: '  id:secret  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/fal/validate');
    expect(url).not.toContain('id:secret');
    expect(init).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'id:secret' }),
      })
    );
    expect(url).not.toMatch(/generate|upload|queue/);
  });

  it('validates a changed non-empty key before saving or closing', async () => {
    setStoredKeys({ falApiKey: 'old:secret' });
    let resolveValidation!: (response: Response) => void;
    const validation = new Promise<Response>((resolve) => {
      resolveValidation = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(validation);
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();

    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('old:secret'));
    fireEvent.change(input, { target: { value: 'new:secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().falApiKey).toBe('old:secret');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    resolveValidation(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await waitFor(() => expect(useAppStore.getState().falApiKey).toBe('new:secret'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not revalidate an unchanged existing fal key', async () => {
    setStoredKeys({ falApiKey: 'id:secret' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();

    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    await waitFor(() => expect(screen.getByLabelText('fal API key')).toHaveValue('id:secret'));
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().falApiKey).toBe('id:secret');
  });

  it('intentionally clears a saved fal key without validation', async () => {
    setStoredKeys({ falApiKey: 'id:secret' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();

    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('id:secret'));
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().falApiKey).toBe('');
  });

  it.each([401, 403])(
    'keeps the previous key and shows a safe route error after a %s response',
    async (status) => {
      setStoredKeys({ falApiKey: 'old:secret' });
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'This fal key is not authorized.' }), {
          status,
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      const onOpenChange = vi.fn();

      render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
      const input = await screen.findByLabelText('fal API key');
      await waitFor(() => expect(input).toHaveValue('old:secret'));
      fireEvent.change(input, { target: { value: 'candidate:secret' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('This fal key is not authorized.');
      expect(screen.queryByText('candidate:secret')).not.toBeInTheDocument();
      expect(useAppStore.getState().falApiKey).toBe('old:secret');
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    }
  );

  it.each([
    ['invalid JSON', () => Promise.resolve(new Response('{not-json', { status: 200 }))],
    [
      'a malformed success response',
      () => Promise.resolve(new Response(JSON.stringify({ success: 'yes' }), { status: 200 })),
    ],
    [
      'a malformed error response',
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false, error: { message: 'raw' } }), {
            status: 403,
          })
        ),
    ],
    ['a network exception', () => Promise.reject(new Error('candidate:secret leaked'))],
  ])('uses a stable safe error for %s', async (_label, fetchResult) => {
    setStoredKeys({ falApiKey: 'old:secret' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(fetchResult));
    const onOpenChange = vi.fn();

    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('old:secret'));
    fireEvent.change(input, { target: { value: 'candidate:secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_FAL_ERROR);
    expect(screen.queryByText(/candidate:secret leaked/)).not.toBeInTheDocument();
    expect(useAppStore.getState().falApiKey).toBe('old:secret');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it.each([
    ['an overlong route error', `Rejected: ${'x'.repeat(201)}`],
    ['a route error containing the candidate', 'Rejected candidate:secret'],
  ])('does not render %s', async (_label, routeError) => {
    setStoredKeys({ falApiKey: 'old:secret' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: routeError }), { status: 403 })
      )
    );

    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('old:secret'));
    fireEvent.change(input, { target: { value: 'candidate:secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_FAL_ERROR);
    expect(screen.queryByText(routeError)).not.toBeInTheDocument();
    expect(useAppStore.getState().falApiKey).toBe('old:secret');
  });

  it('reseeds from the saved fal key and clears validation errors when reopened', async () => {
    setStoredKeys({ falApiKey: 'old:secret' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'This fal key is not authorized.' }), {
          status: 401,
        })
      )
    );
    const onOpenChange = vi.fn();
    const { rerender } = render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('old:secret'));
    fireEvent.change(input, { target: { value: 'candidate:secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(<ApiKeyConfig open={false} onOpenChange={onOpenChange} />);
    rerender(<ApiKeyConfig open onOpenChange={onOpenChange} />);

    await waitFor(() => expect(screen.getByLabelText('fal API key')).toHaveValue('old:secret'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reveals and hides the fal key accessibly without rendering it as text', async () => {
    setStoredKeys({ falApiKey: 'id:secret' });
    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('id:secret'));

    expect(input).toHaveAttribute('type', 'password');
    expect(document.body.textContent).not.toContain('id:secret');
    fireEvent.click(screen.getByRole('button', { name: 'Show fal key' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide fal key' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('id:secret');
    fireEvent.click(screen.getByRole('button', { name: 'Hide fal key' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('prevents duplicate fal validation while a request is pending', async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    render(<ApiKeyConfig open onOpenChange={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('fal API key'), {
      target: { value: 'id:secret' },
    });
    const saveButton = screen.getByRole('button', { name: 'Save & close' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Validating…' })).toBeDisabled();
  });

  it('does not save or close after validation finishes on an unmounted dialog', async () => {
    setStoredKeys({ falApiKey: 'old:secret' });
    let resolveValidation!: (response: Response) => void;
    const validation = new Promise<Response>((resolve) => {
      resolveValidation = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(validation));
    const onOpenChange = vi.fn();

    const { unmount } = render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    const input = await screen.findByLabelText('fal API key');
    await waitFor(() => expect(input).toHaveValue('old:secret'));
    fireEvent.change(input, { target: { value: 'new:secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      resolveValidation(new Response(JSON.stringify({ success: true }), { status: 200 }));
      await validation;
    });

    expect(useAppStore.getState().falApiKey).toBe('old:secret');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it.each([
    ['Gemini', { apiKey: 'gemini-key' }],
    ['Kie', { kieApiKey: 'kie-key' }],
    ['fal', { falApiKey: 'fal-key' }],
  ])('treats a saved %s key as a connected API key', async (_provider, keyState) => {
    setStoredKeys(keyState);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    render(<Home />);

    expect(await screen.findByTitle('Update your API key')).toBeInTheDocument();
  });
});
