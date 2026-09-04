import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FeatureSelector from '../components/FeatureSelector';
import { enginesForFeature } from '../lib/engines/registry';
import { FEATURES } from '../types';

/**
 * The cards choose a *mode*, not a model. Naming the engine here put the same
 * "Gemini 3 Pro" on all six cards, which cannot discriminate between them, and
 * the "+N" counted providers the user has no way to act on until the engine
 * picker one step later. What is left has to be the things that change the
 * click: whether the mode costs nothing, and what it needs before it will run.
 */
describe('feature cards', () => {
  const renderCards = () =>
    render(<FeatureSelector selectedFeature={null} onFeatureSelect={() => undefined} />);

  it('names no model or provider on any card', () => {
    renderCards();

    for (const text of [/gemini/i, /flash/i, /nano banana/i, /pollinations/i, /cloudflare/i]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    // The "+N" provider count went with it.
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('flags the free mode, and only the modes that are actually free', () => {
    renderCards();

    // Neither free engine accepts an input image, so exactly the modes that
    // need no image can run for nothing. Derived rather than hardcoded: this
    // asserts the badge tracks the registry, not today's engine list.
    const free = FEATURES.filter((feature) => enginesForFeature(feature).some((e) => e.free));
    expect(free.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Free option')).toHaveLength(free.length);
  });

  it('keeps the prerequisites that tell the user what a mode needs', () => {
    renderCards();

    const compose = FEATURES.find((feature) => feature.id === 'multi-image-compose');
    expect(compose?.maxImages).toBe(14);
    expect(screen.getByText('Up to 14 images')).toBeInTheDocument();
    expect(screen.getAllByText(/^Requires Images?$/).length).toBe(
      FEATURES.filter((feature) => feature.requiresImage).length
    );
  });

  it('still marks the special mode', () => {
    renderCards();
    expect(screen.getByText('Special')).toBeInTheDocument();
  });
});
