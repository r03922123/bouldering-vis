import { fireEvent, render, screen } from '@testing-library/react';
import { fakeMlClient } from '../../../tests/fakeClient';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { SelectionCanvas } from './SelectionCanvas';

const image: WorkingImage = {
  id: 'img',
  pixels: { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) } as ImageData,
  width: 8,
  height: 6,
  scale: 1,
  sourceName: 'wall.jpg',
};

describe('SelectionCanvas', () => {
  beforeEach(() => useAppStore.setState({ ...useAppStore.getInitialState(), image }));

  it('shows "Preparing image…" until the embedding is ready', async () => {
    render(<SelectionCanvas client={fakeMlClient()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing image…');
    await screen.findByText('Tap a hold to add it to your route.');
    expect(useAppStore.getState().samStatus).toBe('ready');
  });

  it('acknowledges a press at once, before any model call, and clears it on release', () => {
    render(<SelectionCanvas client={fakeMlClient()} />);
    const c = screen.getByRole('img', { name: 'Wall photo' });
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 3, clientY: 3 });
    expect(c).toHaveAttribute('data-pressed', 'true');
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 3, clientY: 3 });
    expect(c).not.toHaveAttribute('data-pressed');
  });

  it('drops the press mark once the pointer starts to drag (a pan, not a tap)', () => {
    render(<SelectionCanvas client={fakeMlClient()} />);
    const c = screen.getByRole('img', { name: 'Wall photo' });
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 3, clientY: 3 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 40, clientY: 40 });
    expect(c).not.toHaveAttribute('data-pressed');
  });

  it('labels the canvas for assistive technology', () => {
    render(<SelectionCanvas client={fakeMlClient()} />);
    expect(screen.getByRole('img', { name: 'Wall photo' })).toBeInTheDocument();
  });
});
