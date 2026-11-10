import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { DirectionControl } from './DirectionControl';
import type { Force } from './force';

const auto: Force = { dir: [0, 1, 0], source: 'type', cue: 'Pull down into the incut' };

describe('DirectionControl', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('says the direction in words and offers a labeled Pull selector on Auto', () => {
    render(<DirectionControl holdId="a" force={auto} />);
    expect(screen.getByText('Pull down into the incut')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Pull direction' })).toHaveValue('');
  });

  it('stores a correction and can go back to Auto', () => {
    render(<DirectionControl holdId="a" force={auto} />);
    const select = screen.getByRole('combobox', { name: 'Pull direction' });
    fireEvent.change(select, { target: { value: 'left' } });
    expect(useAppStore.getState().pullOverrides['a']).toBe('left');
    fireEvent.change(select, { target: { value: '' } });
    expect(useAppStore.getState().pullOverrides['a']).toBeUndefined();
  });

  it('still lets the user set a direction when the model has none (pinch, volume)', () => {
    render(<DirectionControl holdId="a" force={{ dir: null, source: 'none', cue: null }} />);
    expect(
      screen.getByText('No single pull direction. Set one if you know it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Pull direction' })).toBeInTheDocument();
  });

  it('shows a direction drawn in 3D as "Pull: drawn", and Auto clears it', () => {
    useAppStore.getState().setPullOverride('a', { custom: [0.3, 0.95, 0] });
    render(<DirectionControl holdId="a" force={auto} />);
    const select = screen.getByRole('combobox', { name: 'Pull direction' });
    expect(select).toHaveValue('drawn');
    expect(screen.getByRole('option', { name: 'Pull: drawn' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '' } });
    expect(useAppStore.getState().pullOverrides['a']).toBeUndefined();
  });

  it('offers no "drawn" option when nothing was drawn', () => {
    render(<DirectionControl holdId="a" force={auto} />);
    expect(screen.queryByRole('option', { name: 'Pull: drawn' })).not.toBeInTheDocument();
  });
});
