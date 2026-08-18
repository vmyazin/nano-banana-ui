import { describe, expect, it } from 'vitest';

import { reorderHint, reorderIntent } from '@/lib/timeline/reorder';

const alt = { altKey: true };

describe('keyboard reordering', () => {
  it('moves earlier on left or up, later on right or down', () => {
    // Two layouts, one policy: the track runs horizontally, the list
    // vertically, and either axis of arrow does the obvious thing.
    expect(reorderIntent('ArrowLeft', alt, 2, 4)).toEqual({ toIndex: 1 });
    expect(reorderIntent('ArrowUp', alt, 2, 4)).toEqual({ toIndex: 1 });
    expect(reorderIntent('ArrowRight', alt, 2, 4)).toEqual({ toIndex: 3 });
    expect(reorderIntent('ArrowDown', alt, 2, 4)).toEqual({ toIndex: 3 });
  });

  it('jumps to either end with Home and End', () => {
    expect(reorderIntent('Home', alt, 3, 4)).toEqual({ toIndex: 0 });
    expect(reorderIntent('End', alt, 1, 4)).toEqual({ toIndex: 3 });
  });

  it('stops at the ends rather than wrapping', () => {
    expect(reorderIntent('ArrowLeft', alt, 0, 4)).toBeNull();
    expect(reorderIntent('ArrowRight', alt, 3, 4)).toBeNull();
    expect(reorderIntent('Home', alt, 0, 4)).toBeNull();
    expect(reorderIntent('End', alt, 3, 4)).toBeNull();
  });

  it('leaves the bare arrows to the browser', () => {
    // Focus movement and track scrolling are theirs; stealing them would break
    // keyboard navigation in the name of fixing keyboard reordering.
    expect(reorderIntent('ArrowLeft', { altKey: false }, 2, 4)).toBeNull();
    expect(reorderIntent('ArrowRight', { altKey: false }, 2, 4)).toBeNull();
  });

  it('ignores combinations that belong to the OS or the browser', () => {
    expect(reorderIntent('ArrowLeft', { altKey: true, metaKey: true }, 2, 4)).toBeNull();
    expect(reorderIntent('ArrowLeft', { altKey: true, ctrlKey: true }, 2, 4)).toBeNull();
  });

  it('ignores keys that are not a move', () => {
    expect(reorderIntent('Enter', alt, 1, 4)).toBeNull();
    expect(reorderIntent('a', alt, 1, 4)).toBeNull();
  });

  it('announces the position and how to change it', () => {
    expect(reorderHint(2, 5, 'neon tiger')).toBe(
      'neon tiger, clip 2 of 5. Press Alt with an arrow key to move it.'
    );
  });
});
