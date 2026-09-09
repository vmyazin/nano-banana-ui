import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_GALLERY_BUDGET } from '../../lib/gallery/eviction';
import { useGalleryStore } from '../../store/useGalleryStore';
import { renderWorkspace, setupTimelineTest, video } from './helpers';

const rail = () => screen.getByRole('list');

/**
 * The rail is the first cell of the workspace grid, so its height is the page's
 * height on narrow layouts — everything else (preview, track, Export) sits
 * below it. A library of any real size therefore has to scroll inside the rail
 * rather than push the editor off the bottom of the screen.
 */
describe('the clip rail is bounded by its own scroll region', () => {
  beforeEach(() => setupTimelineTest());

  it('caps its height and scrolls internally rather than growing the page', () => {
    useGalleryStore.setState({
      records: Array.from({ length: 30 }, (_, index) =>
        video({ id: `v${index}`, slug: `clip-${index}`, blob: new Blob(['x']), bytes: 1 })
      ),
      hydrated: true,
    });
    renderWorkspace();

    const list = rail();
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-/);
    // A flick through the rail must not carry on into the page underneath it.
    expect(list.className).toMatch(/dialog-scroll-region/);
  });

  it('counts what is in the rail, now that its length no longer shows it', () => {
    useGalleryStore.setState({
      records: Array.from({ length: 12 }, (_, index) =>
        video({ id: `v${index}`, slug: `clip-${index}`, blob: new Blob(['x']), bytes: 1 })
      ),
      hydrated: true,
    });
    renderWorkspace();

    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

describe('the clip rail says how long each clip is', () => {
  beforeEach(() => setupTimelineTest());

  it('shows a measured duration, so a clip is not picked blind', () => {
    useGalleryStore.setState({
      records: [video({ id: 'v1', slug: 'long-one', blob: new Blob(['x']), bytes: 1, durationSeconds: 65 })],
      hydrated: true,
    });
    renderWorkspace();

    expect(within(rail()).getByText('1:05')).toBeInTheDocument();
  });

  it('says nothing at all for a clip nothing has measured yet', () => {
    // A generated clip has no duration until it has been acquired once. An
    // empty line beats inventing a number.
    useGalleryStore.setState({
      records: [video({ id: 'v1', slug: 'unmeasured', blob: new Blob(['x']), bytes: 1 })],
      hydrated: true,
    });
    renderWorkspace();

    expect(within(rail()).queryByText(/^\d+:\d\d$/)).not.toBeInTheDocument();
  });
});

/**
 * Filling the gallery budget is what makes `lib/gallery/eviction` reclaim
 * unpinned files — which is precisely how a clip already on this timeline
 * becomes `missing`. The meter has to look different at that point.
 */
describe('the storage meter warns before eviction starts', () => {
  beforeEach(() => setupTimelineTest());

  const seedAtPercent = (percent: number) =>
    useGalleryStore.setState({
      records: [
        video({
          id: 'big',
          blob: new Blob(['x']),
          bytes: Math.round(DEFAULT_GALLERY_BUDGET.maxBytes * (percent / 100)),
        }),
      ],
      hydrated: true,
    });

  it('stays quiet while there is room', () => {
    seedAtPercent(20);
    renderWorkspace();

    expect(document.querySelector('[data-storage-pressure="fine"]')).toBeTruthy();
    expect(screen.queryByText(/nearly full/i)).not.toBeInTheDocument();
  });

  it('warns in words, not only in colour, as the budget fills', () => {
    seedAtPercent(80);
    renderWorkspace();

    expect(document.querySelector('[data-storage-pressure="high"]')).toBeTruthy();
    expect(screen.getByText(/nearly full/i)).toBeInTheDocument();
  });

  it('escalates once eviction is imminent', () => {
    seedAtPercent(95);
    renderWorkspace();

    expect(document.querySelector('[data-storage-pressure="critical"]')).toBeTruthy();
  });
});
