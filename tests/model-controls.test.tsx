import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelControls, { type ModelControlField } from '../components/ModelControls';

const renderControls = (
  fields: ModelControlField[],
  values: Record<string, string | number | boolean>,
  onChange = vi.fn(),
  namespace = 'test-controls'
) => {
  render(
    <ModelControls
      namespace={namespace}
      fields={fields}
      values={values}
      onChange={onChange}
    />
  );

  return onChange;
};

describe('ModelControls', () => {
  it('exposes only value-based model control field types', () => {
    const supportedTypes: ModelControlField['type'][] = ['text', 'number', 'boolean', 'select'];

    expect(supportedTypes).not.toContain('file');

    // @ts-expect-error File selection is handled by provider workspaces, not ModelControls.
    const fileField: ModelControlField = { key: 'source', label: 'Source', type: 'file' };
    expect(fileField).toBeTruthy();
  });

  it('renders a labelled text field with its description and current value', () => {
    const onChange = renderControls(
      [{ key: 'negative_prompt', label: 'Negative prompt', type: 'text', description: 'What to avoid.' }],
      { negative_prompt: 'blur' }
    );

    const input = screen.getByRole('textbox', { name: 'Negative prompt' });
    expect((input as HTMLInputElement).value).toBe('blur');
    expect(input).toHaveAccessibleDescription('What to avoid.');
    expect(screen.getByText('What to avoid.')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'noise' } });

    expect(onChange).toHaveBeenCalledWith('negative_prompt', 'noise');
  });

  it('preserves number constraints and emits only finite numbers', () => {
    const onChange = renderControls(
      [{ key: 'guidance', label: 'Guidance', type: 'number', min: 1, max: 20, step: 0.5 }],
      { guidance: 7.5 }
    );
    const input = screen.getByRole('spinbutton', { name: 'Guidance' }) as HTMLInputElement;

    expect(input.min).toBe('1');
    expect(input.max).toBe('20');
    expect(input.step).toBe('0.5');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'not-a-number' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '8.5' } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('guidance', 8.5);
    expect(Number.isFinite(onChange.mock.calls[0][1])).toBe(true);
  });

  it('renders an accessible checkbox and emits its boolean state', () => {
    const onChange = renderControls(
      [{ key: 'enhance', label: 'Enhance prompt', type: 'boolean', description: 'Adds model detail.' }],
      { enhance: false }
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Enhance prompt' });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Adds model detail.')).toBeTruthy();

    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith('enhance', true);
  });

  it('renders declared select options and preserves their value types', () => {
    const onChange = renderControls(
      [
        {
          key: 'count',
          label: 'Count',
          type: 'select',
          options: [{ label: 'Two', value: 2 }, { label: 'Four', value: 4 }],
        },
        {
          key: 'quality',
          label: 'Quality',
          type: 'select',
          options: [{ label: 'Draft', value: 'draft' }, { label: 'Final', value: 'final' }],
        },
      ],
      { count: 2, quality: 'draft' }
    );

    const count = screen.getByRole('combobox', { name: 'Count' });
    expect(within(count).getAllByRole('option').map((option) => option.textContent)).toEqual(['Two', 'Four']);

    const countOptions = within(count).getAllByRole('option') as HTMLOptionElement[];
    const quality = screen.getByRole('combobox', { name: 'Quality' });
    const qualityOptions = within(quality).getAllByRole('option') as HTMLOptionElement[];
    fireEvent.change(count, { target: { value: countOptions[1].value } });
    fireEvent.change(quality, { target: { value: qualityOptions[1].value } });

    expect(onChange).toHaveBeenNthCalledWith(1, 'count', 4);
    expect(onChange).toHaveBeenNthCalledWith(2, 'quality', 'final');
  });

  it('distinguishes select options whose values stringify identically', () => {
    const onChange = renderControls(
      [{
        key: 'version',
        label: 'Version',
        type: 'select',
        options: [{ label: 'Numeric one', value: 1 }, { label: 'String one', value: '1' }],
      }],
      { version: 1 }
    );
    const select = screen.getByRole('combobox', { name: 'Version' }) as HTMLSelectElement;
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];

    expect(select.selectedOptions[0].textContent).toBe('Numeric one');

    fireEvent.change(select, { target: { value: options[1].value } });
    fireEvent.change(select, { target: { value: options[0].value } });

    expect(onChange).toHaveBeenNthCalledWith(1, 'version', '1');
    expect(onChange).toHaveBeenNthCalledWith(2, 'version', 1);
  });

  it('renders resolution through the horizontal segmented toggle and emits the declared option value', () => {
    const onChange = renderControls(
      [{
        key: 'resolution',
        label: 'Resolution',
        type: 'select',
        description: 'Output size.',
        options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }],
      }],
      { resolution: '1K' }
    );

    const group = screen.getByRole('radiogroup', { name: 'Resolution' });
    expect(group.className).toContain('flex');
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['1K', '2K']);
    expect(screen.getByRole('radio', { name: '1K' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Output size.')).toBeTruthy();
    expect(group).toHaveAccessibleDescription('Output size.');

    fireEvent.click(screen.getByRole('radio', { name: '2K' }));

    expect(onChange).toHaveBeenCalledWith('resolution', '2K');
  });

  it('preserves exact numeric and string values for resolution controls', () => {
    const onChange = renderControls(
      [{
        key: 'resolution',
        label: 'Typed resolution',
        type: 'select',
        defaultValue: '1',
        options: [{ label: 'Numeric one', value: 1 }, { label: 'String one', value: '1' }],
      }],
      {}
    );
    const numeric = screen.getByRole('radio', { name: 'Numeric one' });
    const string = screen.getByRole('radio', { name: 'String one' });

    expect(numeric.getAttribute('aria-checked')).toBe('false');
    expect(string.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(numeric);

    expect(onChange).toHaveBeenCalledWith('resolution', 1);
  });

  it('keeps colliding sanitized keys and duplicate namespaces uniquely associated', () => {
    const fields: ModelControlField[] = [
      { key: 'prompt/style', label: 'Slash style', type: 'text', description: 'Slash description.' },
      { key: 'prompt style', label: 'Space style', type: 'text', description: 'Space description.' },
    ];
    const { container } = render(
      <>
        <ModelControls namespace="same:model namespace" fields={fields} values={{}} onChange={() => undefined} />
        <ModelControls namespace="same:model namespace" fields={fields} values={{}} onChange={() => undefined} />
      </>
    );

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const descriptions = Array.from(container.querySelectorAll<HTMLElement>('[id$="-description"]'));
    const allIds = [...inputs.map((input) => input.id), ...descriptions.map((description) => description.id)];
    const labels = Array.from(container.querySelectorAll<HTMLLabelElement>('label'));

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(inputs.every((input) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(input.id))).toBe(true);
    inputs.forEach((input) => {
      expect(labels.some((label) => label.htmlFor === input.id)).toBe(true);
      const descriptionId = input.getAttribute('aria-describedby');
      expect(descriptionId).toBeTruthy();
      expect(descriptions.some((description) => description.id === descriptionId)).toBe(true);
    });
  });

  it('resolves defaults consistently and restores them after controlled values are removed', () => {
    const fields: ModelControlField[] = [
      { key: 'caption', label: 'Caption', type: 'text', defaultValue: 'cinematic' },
      { key: 'safe', label: 'Safety check', type: 'boolean', defaultValue: true },
      { key: 'quality', label: 'Quality', type: 'select', defaultValue: 'draft', options: [{ label: 'Draft', value: 'draft' }, { label: 'Final', value: 'final' }] },
      { key: 'count', label: 'Count', type: 'select', defaultValue: 1, options: [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }] },
      { key: 'seed', label: 'Seed', type: 'number', defaultValue: 0 },
      { key: 'resolution', label: 'Resolution', type: 'select', defaultValue: '2K', options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }] },
    ];
    const onChange = vi.fn();
    const { rerender } = render(
      <ModelControls namespace="defaults" fields={fields} values={{}} onChange={onChange} />
    );
    const expectDefaults = () => {
      expect((screen.getByRole('textbox', { name: 'Caption' }) as HTMLInputElement).value).toBe('cinematic');
      expect((screen.getByRole('checkbox', { name: 'Safety check' }) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByRole('combobox', { name: 'Quality' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('Draft');
      expect((screen.getByRole('combobox', { name: 'Count' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('One');
      expect((screen.getByRole('spinbutton', { name: 'Seed' }) as HTMLInputElement).value).toBe('0');
      expect(screen.getByRole('radio', { name: '2K' }).getAttribute('aria-checked')).toBe('true');
    };

    expectDefaults();

    rerender(
      <ModelControls
        namespace="defaults"
        fields={fields}
        values={{ caption: 'sharp', safe: false, quality: 'final', count: 2, seed: 7, resolution: '1K' }}
        onChange={onChange}
      />
    );
    expect((screen.getByRole('textbox', { name: 'Caption' }) as HTMLInputElement).value).toBe('sharp');
    expect((screen.getByRole('checkbox', { name: 'Safety check' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Quality' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('Final');
    expect((screen.getByRole('combobox', { name: 'Count' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('Two');
    expect((screen.getByRole('spinbutton', { name: 'Seed' }) as HTMLInputElement).value).toBe('7');
    expect(screen.getByRole('radio', { name: '1K' }).getAttribute('aria-checked')).toBe('true');

    rerender(<ModelControls namespace="defaults" fields={fields} values={{}} onChange={onChange} />);
    expectDefaults();
  });

  it('falls back to type-compatible defaults for invalid controlled value shapes', () => {
    renderControls(
      [
        { key: 'caption', label: 'Caption', type: 'text', defaultValue: 'fallback' },
        { key: 'seed', label: 'Seed', type: 'number', defaultValue: 0 },
        { key: 'safe', label: 'Safe', type: 'boolean', defaultValue: false },
        { key: 'quality', label: 'Quality', type: 'select', defaultValue: 'draft', options: [{ label: 'Draft', value: 'draft' }] },
      ],
      { caption: true, seed: '7', safe: 'true', quality: true }
    );

    expect((screen.getByRole('textbox', { name: 'Caption' }) as HTMLInputElement).value).toBe('fallback');
    expect((screen.getByRole('spinbutton', { name: 'Seed' }) as HTMLInputElement).value).toBe('0');
    expect((screen.getByRole('checkbox', { name: 'Safe' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Quality' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('Draft');
  });

  it('renders no controls for an empty field list', () => {
    const { container } = render(
      <ModelControls namespace="empty" fields={[]} values={{}} onChange={() => undefined} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
