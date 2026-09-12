import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import GenerationWorkspaceLayout from '@/components/GenerationWorkspaceLayout';

it('keeps setup, prompt, submission feedback, and results in reading order', () => {
  render(
    <GenerationWorkspaceLayout
      setup={<button>Configure model</button>}
      prompt={<textarea aria-label="Prompt" />}
      actions={<><button>Generate</button><p role="alert">Retry in 10 seconds</p></>}
      results={<h2>Results</h2>}
    />,
  );
  const sequence = [
    screen.getByRole('button', { name: 'Configure model' }),
    screen.getByRole('textbox', { name: 'Prompt' }),
    screen.getByRole('button', { name: 'Generate' }),
    screen.getByRole('alert'),
    screen.getByRole('heading', { name: 'Results' }),
  ];
  sequence.slice(1).forEach((element, index) => {
    expect(sequence[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
