import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SegmentedToggleGroup from '../components/SegmentedToggleGroup';

const options = [
  { label: 'First', value: 'first' },
  { label: 'Second', value: 2 },
  { label: 'Third', value: 'third' },
];

describe('SegmentedToggleGroup', () => {
  it('applies its optional accessible description to the radiogroup', () => {
    render(
      <>
        <p id="quality-description">Controls output quality.</p>
        <SegmentedToggleGroup
          label="Quality"
          ariaDescribedBy="quality-description"
          options={options}
          value="first"
          onChange={() => undefined}
        />
      </>
    );

    expect(screen.getByRole('radiogroup', { name: 'Quality' })).toHaveAccessibleDescription(
      'Controls output quality.'
    );
  });

  it.each([
    { key: 'ArrowRight', from: 'Third', to: 'First', value: 'first' },
    { key: 'ArrowDown', from: 'Third', to: 'First', value: 'first' },
    { key: 'ArrowLeft', from: 'First', to: 'Third', value: 'third' },
    { key: 'ArrowUp', from: 'First', to: 'Third', value: 'third' },
  ])('handles $key with wraparound, selection, and focus', ({ key, from, to, value }) => {
    const onChange = vi.fn();
    render(
      <SegmentedToggleGroup
        label="Quality"
        options={options}
        value={from === 'First' ? 'first' : 'third'}
        onChange={onChange}
      />
    );
    const current = screen.getByRole('radio', { name: from });
    const next = screen.getByRole('radio', { name: to });
    current.focus();
    const event = createEvent.keyDown(current, { key, cancelable: true });

    fireEvent(current, event);

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith(value);
    expect(document.activeElement).toBe(next);
  });

  it('preserves click selection and button semantics', () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggleGroup
        label="Quality"
        options={options}
        value="first"
        onChange={onChange}
      />
    );

    const second = screen.getByRole('radio', { name: 'Second' });
    expect(second).toHaveAttribute('type', 'button');
    fireEvent.click(second);

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('preserves exact numeric and string option identity for selection, arrows, and clicks', () => {
    const typedOptions = [
      { label: 'Numeric one', value: 1 },
      { label: 'String one', value: '1' },
    ];
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedToggleGroup
        label="Typed value"
        options={typedOptions}
        value={1}
        onChange={onChange}
      />
    );
    const numeric = screen.getByRole('radio', { name: 'Numeric one' });
    const string = screen.getByRole('radio', { name: 'String one' });

    expect(screen.getAllByRole('radio').filter((radio) => radio.getAttribute('aria-checked') === 'true')).toEqual([numeric]);
    numeric.focus();
    fireEvent.keyDown(numeric, { key: 'ArrowRight' });
    fireEvent.click(numeric);
    expect(onChange).toHaveBeenNthCalledWith(1, '1');
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
    expect(document.activeElement).toBe(string);

    rerender(
      <SegmentedToggleGroup
        label="Typed value"
        options={typedOptions}
        value="1"
        onChange={onChange}
      />
    );
    expect(screen.getAllByRole('radio').filter((radio) => radio.getAttribute('aria-checked') === 'true')).toEqual([string]);
    string.focus();
    fireEvent.keyDown(string, { key: 'ArrowRight' });
    fireEvent.click(string);
    expect(onChange).toHaveBeenNthCalledWith(3, 1);
    expect(onChange).toHaveBeenNthCalledWith(4, '1');
    expect(document.activeElement).toBe(numeric);
  });
});
