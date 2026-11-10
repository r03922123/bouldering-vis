import { fireEvent, render, screen } from '@testing-library/react';
import type { HoldMask } from '../hold-segmentation';
import { useAppStore } from '../../store/app';
import { ViewToggles } from './ViewToggles';

const hold = (id: string, role: HoldMask['role']) => ({ id, role, order: 0 }) as HoldMask;

describe('ViewToggles', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('switches between Original and Route views', () => {
    render(<ViewToggles />);
    fireEvent.click(screen.getByRole('radio', { name: 'Route' }));
    expect(useAppStore.getState().view).toBe('route');
    fireEvent.click(screen.getByRole('radio', { name: 'Original' }));
    expect(useAppStore.getState().view).toBe('original');
  });

  it('highlights Show route only when the route is complete, and it opens Route view', () => {
    useAppStore.setState({ holds: [hold('a', 'start')] });
    const { rerender } = render(<ViewToggles />);
    expect(screen.getByRole('button', { name: 'Show route' })).not.toHaveClass('primary');
    useAppStore.setState({ holds: [hold('a', 'start'), hold('b', 'finish')] });
    rerender(<ViewToggles />);
    const show = screen.getByRole('button', { name: 'Show route' });
    expect(show).toHaveClass('primary');
    fireEvent.click(show);
    expect(useAppStore.getState().view).toBe('route');
  });

  it('toggles Show other holds and Outlines (both on by default)', () => {
    render(<ViewToggles />);
    const other = screen.getByRole('switch', { name: 'Show other holds' });
    const outlines = screen.getByRole('switch', { name: 'Outlines' });
    expect(other).toBeChecked();
    expect(outlines).toBeChecked();
    fireEvent.click(other);
    fireEvent.click(outlines);
    expect(useAppStore.getState().showOtherHolds).toBe(false);
    expect(useAppStore.getState().showOutlines).toBe(false);
  });

  it('never changes the view by itself when holds change', () => {
    render(<ViewToggles />);
    useAppStore.setState({ holds: [hold('a', 'start'), hold('b', 'finish')] });
    expect(useAppStore.getState().view).toBe('original');
  });

  it('toggles Show chalk (on by default)', () => {
    render(<ViewToggles />);
    const chalk = screen.getByRole('switch', { name: 'Show chalk' });
    expect(chalk).toBeChecked();
    fireEvent.click(chalk);
    expect(useAppStore.getState().showChalk).toBe(false);
  });

  it('keeps the layer switches inside a Layers menu', () => {
    render(<ViewToggles />);
    const layers = screen.getByText('Layers').closest('details')!;
    expect(layers).not.toBeNull();
    for (const name of ['Show other holds', 'Outlines', 'Show chalk', 'Arrows']) {
      expect(layers.contains(screen.getByRole('switch', { name }))).toBe(true);
    }
  });
});
