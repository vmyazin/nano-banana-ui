import { describe, expect, it } from 'vitest';

import { carryOverValues, isValueCompatible, type CarryOverField } from '../../lib/draft/carry-over';

const aspectRatio: CarryOverField = {
  key: 'aspect_ratio',
  type: 'select',
  options: ['auto', '16:9', '9:16', '21:9'].map((value) => ({ label: value, value })),
};
const narrowAspectRatio: CarryOverField = {
  key: 'aspect_ratio',
  type: 'select',
  options: ['16:9', '9:16'].map((value) => ({ label: value, value })),
};
const seed: CarryOverField = { key: 'seed', type: 'number' };
const expandPrompt: CarryOverField = { key: 'enable_prompt_expansion', type: 'boolean' };
const negativePrompt: CarryOverField = { key: 'negative_prompt', type: 'text' };

describe('isValueCompatible', () => {
  it.each([
    [aspectRatio, '16:9', true],
    [aspectRatio, '21:9', true],
    [narrowAspectRatio, '21:9', false],
    [seed, 42, true],
    [seed, '42', false],
    [seed, Number.NaN, false],
    [expandPrompt, true, true],
    [expandPrompt, 'true', false],
    [negativePrompt, 'blurry', true],
    [negativePrompt, 7, false],
  ])('%o accepting %p → %s', (field, value, expected) => {
    expect(isValueCompatible(field, value as never)).toBe(expected);
  });

  it('accepts anything of the right primitive type when a select declares no options', () => {
    expect(isValueCompatible({ key: 'mode', type: 'select' }, 'anything')).toBe(true);
  });
});

describe('carryOverValues', () => {
  it('keeps what the next model can express', () => {
    const carried = carryOverValues(
      [aspectRatio, seed, expandPrompt],
      { aspect_ratio: 'auto', seed: 0, enable_prompt_expansion: true },
      { aspect_ratio: '21:9', seed: 99, enable_prompt_expansion: false }
    );

    expect(carried).toEqual({ aspect_ratio: '21:9', seed: 99, enable_prompt_expansion: false });
  });

  it('falls back to the default when the next model cannot express the value', () => {
    // Wan offers 21:9; Veo does not. The switch must not send Veo something it rejects.
    const carried = carryOverValues(
      [narrowAspectRatio],
      { aspect_ratio: '16:9' },
      { aspect_ratio: '21:9' }
    );

    expect(carried).toEqual({ aspect_ratio: '16:9' });
  });

  it('ignores controls the next model does not have at all', () => {
    const carried = carryOverValues(
      [aspectRatio],
      { aspect_ratio: 'auto' },
      { aspect_ratio: '16:9', enable_prompt_expansion: false, duration: '10' }
    );

    expect(carried).toEqual({ aspect_ratio: '16:9' });
  });

  it('leaves defaults alone when nothing has been remembered yet', () => {
    const defaults = { aspect_ratio: 'auto', seed: 0 };
    expect(carryOverValues([aspectRatio, seed], defaults, {})).toEqual(defaults);
  });

  it('does not mutate the defaults it was handed', () => {
    const defaults = { aspect_ratio: 'auto' };
    carryOverValues([aspectRatio], defaults, { aspect_ratio: '16:9' });
    expect(defaults).toEqual({ aspect_ratio: 'auto' });
  });
});
