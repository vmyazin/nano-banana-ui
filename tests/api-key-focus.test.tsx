import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ApiKeyConfig from '@/components/ApiKeyConfig';

/**
 * A workspace that cannot run asks for one specific key, so the dialog it opens
 * points at that card rather than leaving it to be found among a dozen others.
 */
describe('the API connections dialog opened for one provider', () => {
  it('outlines that provider’s card and puts the cursor in its field', async () => {
    render(<ApiKeyConfig open onOpenChange={() => undefined} focusProvider="atlas" />);

    const card = document.querySelector('[data-provider="atlas"]');
    expect(card).toHaveClass('border-2', 'border-[var(--neon-cyan)]');
    expect(document.querySelector('[data-provider="comet"]')).toHaveClass('border');
    expect(document.querySelector('[data-provider="comet"]')).not.toHaveClass('border-2');

    await waitFor(() =>
      expect(screen.getByLabelText('Atlas Cloud API key')).toHaveFocus()
    );
  });

  it('leaves every card plain when opened from the header', async () => {
    render(<ApiKeyConfig open onOpenChange={() => undefined} />);

    expect(document.querySelectorAll('.border-2')).toHaveLength(0);
    await waitFor(() => expect(screen.getByLabelText('Atlas Cloud API key')).not.toHaveFocus());
  });
});
