import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApiKeyConfig from '../../components/ApiKeyConfig';
import { useAppStore } from '../../store/useAppStore';

describe('Kie API connection', () => {
  beforeEach(() => {
    useAppStore.setState({ apiKey: '', kieApiKey: '' });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('validates and persists a Kie key only after the credit check succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, credits: 12 }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();

    render(<ApiKeyConfig open onOpenChange={onOpenChange} />);
    await waitFor(() => expect(screen.getByLabelText('Kie API key')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Kie API key'), { target: { value: 'kie_test_key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/kie/validate',
      expect.objectContaining({ method: 'POST' })
    ));
    expect(useAppStore.getState().kieApiKey).toBe('kie_test_key');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
