import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import LandingIntro from '@/components/marketing/LandingIntro';
import { ENGINES } from '@/lib/engines/registry';

/**
 * The about section folds below its first paragraph. The fold must never
 * become a conditional render: the engine list is the crawlable copy of the
 * page, and it has to be in the markup before anyone clicks.
 */
describe('the about section fold', () => {
  it('starts collapsed, with the folded half already in the document', () => {
    render(<LandingIntro />);

    const button = screen.getByRole('button', { name: /learn about scene assembly/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).toHaveAttribute('inert');
    for (const engine of ENGINES) expect(panel).toHaveTextContent(engine.label);
  });

  it('opens on click and lets the links inside be reached', async () => {
    render(<LandingIntro />);
    const button = screen.getByRole('button', { name: /learn about scene assembly/i });

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).not.toHaveAttribute('inert');
    expect(screen.getByRole('link', { name: 'Open the studio' })).toBeInTheDocument();
  });
});
