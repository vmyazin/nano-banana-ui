import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ReferenceStack, { type ReferenceStackItem } from '../components/ReferenceStack';

const items: ReferenceStackItem[] = [
  { id: 'a', src: '/a.png', alt: 'Reference 1', removeLabel: 'Remove reference 1' },
  { id: 'b', src: '/b.png', alt: 'Reference 2', removeLabel: 'Remove reference 2' },
  { id: 'c', src: '/c.png', alt: 'Reference 3', removeLabel: 'Remove reference 3' },
];

describe('ReferenceStack', () => {
  it('renders every item with its alt text and remove label', () => {
    render(<ReferenceStack items={items} onRemove={vi.fn()} />);

    expect(screen.getByAltText('Reference 1')).toBeInTheDocument();
    expect(screen.getByAltText('Reference 2')).toBeInTheDocument();
    expect(screen.getByAltText('Reference 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove reference 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove reference 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove reference 3' })).toBeInTheDocument();
  });

  it('opens the lightbox for the clicked thumbnail, showing that item full size', () => {
    render(<ReferenceStack items={items} onRemove={vi.fn()} />);

    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();

    fireEvent.click(screen.getByAltText('Reference 2'));

    const dialog = screen.getByRole('dialog', { name: 'Image preview' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByAltText('Reference 2, full size')).toBeInTheDocument();
    expect(screen.queryByAltText('Reference 1, full size')).toBeNull();
  });

  it('closes the lightbox on Escape', async () => {
    render(<ReferenceStack items={items} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByAltText('Reference 1'));
    expect(await screen.findByAltText('Reference 1, full size')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByAltText('Reference 1, full size')).toBeNull());
  });

  it('opens the lightbox via the "View full screen" button', () => {
    render(<ReferenceStack items={items} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Reference 3 full screen' }));

    expect(screen.getByAltText('Reference 3, full size')).toBeInTheDocument();
  });

  it('calls onRemove with the item index and does not open the lightbox', () => {
    const onRemove = vi.fn();
    render(<ReferenceStack items={items} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove reference 2' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull();
  });

  it('renders nothing for an empty items array', () => {
    const { container } = render(<ReferenceStack items={[]} onRemove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
