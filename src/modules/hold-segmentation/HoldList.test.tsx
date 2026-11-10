import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { HoldList } from './HoldList';
import type { HoldMask } from './types';

const image = { id: 'img', width: 10, height: 10, pixels: {} as ImageData } as WorkingImage;
const hold = (id: string, order: number): HoldMask =>
  ({ id, order, role: 'route', bbox: { x: 0, y: 0, w: 2, h: 2 } }) as HoldMask;

function setup(n = 3) {
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    image,
    holds: Array.from({ length: n }, (_, i) => hold(`h${i}`, i)),
  });
  render(<HoldList />);
}

const row = (n: number) => screen.getByRole('group', { name: `Hold ${n}` });

describe('HoldList', () => {
  it('lists holds in selection order with a role radio group each', () => {
    setup();
    for (const n of [1, 2, 3]) {
      expect(within(row(n)).getByRole('radio', { name: 'Route' })).toBeChecked();
    }
  });

  it("changes a hold's role from its radio group (the progress strip reports the route state)", () => {
    setup();
    fireEvent.click(within(row(1)).getByRole('radio', { name: 'Start' }));
    fireEvent.click(within(row(3)).getByRole('radio', { name: 'Finish' }));
    expect(within(row(1)).getByRole('radio', { name: 'Start' })).toBeChecked();
    expect(within(row(3)).getByRole('radio', { name: 'Finish' })).toBeChecked();
    expect(useAppStore.getState().holds.map((h) => h.role)).toEqual(['start', 'route', 'finish']);
  });

  it('rejects a third start with a message', () => {
    setup(3);
    fireEvent.click(within(row(1)).getByRole('radio', { name: 'Start' }));
    fireEvent.click(within(row(2)).getByRole('radio', { name: 'Start' }));
    fireEvent.click(within(row(3)).getByRole('radio', { name: 'Start' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Max 2 start holds');
    expect(within(row(3)).getByRole('radio', { name: 'Route' })).toBeChecked();
  });

  it('removes a hold with its labeled button', () => {
    setup(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove hold 2' }));
    expect(useAppStore.getState().holds.map((h) => h.id)).toEqual(['h0']);
  });

  it('shows nothing when no hold is selected', () => {
    setup(0);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders extra per-row info supplied by the app (e.g. chalk level)', () => {
    useAppStore.setState({ ...useAppStore.getInitialState(), image, holds: [hold('h0', 0)] });
    render(<HoldList rowExtra={(h) => `extra for ${h.id}`} />);
    expect(within(row(1)).getByText('extra for h0')).toBeInTheDocument();
  });
});

describe('HoldList ↔ wall linking', () => {
  beforeEach(() =>
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      image,
      holds: [hold('h0', 0), hold('h1', 1)],
    }),
  );

  it('focuses a hold while its row is hovered or keyboard-focused', () => {
    render(<HoldList />);
    fireEvent.mouseEnter(row(2));
    expect(useAppStore.getState().focusedHold).toEqual({ id: 'h1', from: 'list' });
    fireEvent.mouseLeave(row(2));
    expect(useAppStore.getState().focusedHold).toBeNull();
    fireEvent.focus(within(row(1)).getByRole('radio', { name: 'Start' }));
    expect(useAppStore.getState().focusedHold).toEqual({ id: 'h0', from: 'list' });
  });

  it('marks the focused row, whichever side focused it', () => {
    useAppStore.setState({ focusedHold: { id: 'h1', from: 'wall' } });
    render(<HoldList />);
    expect(row(2).closest('li')).toHaveAttribute('data-focused', 'true');
    expect(row(1).closest('li')).not.toHaveAttribute('data-focused');
  });
});
