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

    fireEvent.change(count, { target: { value: '4' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Quality' }), { target: { value: 'final' } });

    expect(onChange).toHaveBeenNthCalledWith(1, 'count', 4);
    expect(onChange).toHaveBeenNthCalledWith(2, 'quality', 'final');
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

    fireEvent.click(screen.getByRole('radio', { name: '2K' }));

    expect(onChange).toHaveBeenCalledWith('resolution', '2K');
  });

  it('keeps IDs safe and unique across component instances while linking labels to controls', () => {
    const field: ModelControlField = { key: 'prompt.style/value', label: 'Style', type: 'text' };
    render(
      <>
        <ModelControls namespace="same:model namespace" fields={[field]} values={{ 'prompt.style/value': '' }} onChange={() => undefined} />
        <ModelControls namespace="same:model namespace" fields={[field]} values={{ 'prompt.style/value': '' }} onChange={() => undefined} />
      </>
    );

    const inputs = screen.getAllByRole('textbox', { name: 'Style' }) as HTMLInputElement[];
    const labels = screen.getAllByText('Style').map((labelText) => labelText.closest('label'));

    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(inputs.every((input) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(input.id))).toBe(true);
    expect(labels.map((label) => label?.htmlFor)).toEqual(inputs.map((input) => input.id));
  });

  it('retains the existing bare file control and text fallback for unknown field types', () => {
    const fields = [
      { key: 'source', label: 'Source file', type: 'file', description: 'Choose a source.' },
      { key: 'legacy', label: 'Legacy option', type: 'legacy' },
    ] as unknown as ModelControlField[];
    renderControls(fields, { legacy: 'kept' });

    expect(screen.getByLabelText('Source file')).toHaveProperty('type', 'file');
    expect(screen.getByText('Choose a source.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Legacy option' }) as HTMLInputElement).value).toBe('kept');
  });

  it('renders no controls for an empty field list', () => {
    const { container } = render(
      <ModelControls namespace="empty" fields={[]} values={{}} onChange={() => undefined} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
