import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FalRunCost from '@/components/FalRunCost';
import { falSecondsFrom } from '@/lib/fal/pricing';
import { falRunCost } from '@/lib/fal/run-cost';

describe('falSecondsFrom', () => {
  it('reads every shape a fal duration control takes', () => {
    // 5, '10' and '8s' all appear across these models; Number('8s') is NaN,
    // which is how an estimate quietly went missing.
    expect(falSecondsFrom(5)).toBe(5);
    expect(falSecondsFrom('10')).toBe(10);
    expect(falSecondsFrom('8s')).toBe(8);
  });

  it('refuses anything that is not a positive length', () => {
    expect(falSecondsFrom(undefined)).toBeUndefined();
    expect(falSecondsFrom('auto')).toBeUndefined();
    expect(falSecondsFrom(0)).toBeUndefined();
    expect(falSecondsFrom(-4)).toBeUndefined();
    expect(falSecondsFrom(true)).toBeUndefined();
  });
});

describe('falRunCost', () => {
  it('prices a run from the model and mode the workspace holds', () => {
    // Veo 3.1 Fast: $0.15/s with audio, over 8 seconds.
    const cost = falRunCost('veo-3-1-fast', 'video', 'text', '720p', true, 8);
    expect(cost?.costUsd).toBeCloseTo(1.2, 5);
  });

  it('costs less with audio off, as the vendor publishes it', () => {
    expect(falRunCost('veo-3-1-fast', 'video', 'text', '720p', false, 8)?.costUsd).toBeCloseTo(0.8, 5);
  });

  it('says nothing for a model it cannot resolve', () => {
    expect(falRunCost('not-a-model', 'video', 'text', '720p', true, 8)).toBeNull();
  });
});

describe('<FalRunCost />', () => {
  it('puts the total where the press happens', () => {
    render(
      <FalRunCost modelId="veo-3-1-fast" mediaType="video" inputMode="text" resolution="720p" audio duration="8s" />
    );
    expect(screen.getByText(/~\$1\.20/)).toBeInTheDocument();
  });

  it('renders nothing rather than a guess when the rate is unpublished', () => {
    const { container } = render(
      <FalRunCost modelId="not-a-model" mediaType="video" inputMode="text" duration="8s" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the duration is unreadable', () => {
    const { container } = render(
      <FalRunCost modelId="veo-3-1-fast" mediaType="video" inputMode="text" resolution="720p" audio duration="auto" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
