import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import AutoExpandingPrompt from '@/components/AutoExpandingPrompt';

describe('AutoExpandingPrompt', () => {
  it('is controlled, starts at two rows, and grows to its scroll height', () => {
    const onChange = vi.fn();

    function Harness() {
      const [value, setValue] = useState('');
      return (
        <AutoExpandingPrompt
          aria-label="Prompt"
          value={value}
          onChange={(event) => {
            onChange(event);
            setValue(event.target.value);
          }}
        />
      );
    }

    render(<Harness />);
    const prompt = screen.getByLabelText('Prompt') as HTMLTextAreaElement;

    expect(prompt.rows).toBe(2);
    expect(prompt).toHaveClass('max-h-[16.25rem]', 'overflow-y-auto', 'resize-none', 'w-full');

    Object.defineProperty(prompt, 'scrollHeight', { configurable: true, value: 96 });
    fireEvent.change(prompt, { target: { value: 'First line\nSecond line' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveValue('First line\nSecond line');
    expect(prompt.style.height).toBe('96px');
  });
});
