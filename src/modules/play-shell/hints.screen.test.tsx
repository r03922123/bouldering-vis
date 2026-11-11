import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MoveContext } from '../beta-moves';
import { useAppStore } from '../../store/app';
import { resetViewAids } from './aids';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor } from './play';
import { PlayScreen } from './PlayScreen';
import { canvasHarness, ROUTE_FULL, routeProps } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-02 H1: "Hold directions" in Aids draws the referee's pull on
// each route hold. A view aid only: the plan and the verdict never change.

vi.setConfig({ testTimeout: 30_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
let harness: ReturnType<typeof canvasHarness>;

beforeEach(() => {
  forgetPlans();
  resetViewAids();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_FULL });
  harness = canvasHarness();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(profile = routeProps().profile) {
  render(<PlayScreen {...routeProps({ photo: ROUTE_FULL, profile })} />);
  act(() => harness.flush());
  const start = screen.queryByRole('button', { name: 'Start planning' });
  if (start) fireEvent.click(start);
  act(() => harness.flush());
}
const arrowsLayer = () => document.querySelector<SVGElement>('svg.play-arrows[data-arrows]');
const stage = () => screen.getByRole('region', { name: 'Wall' });

it('is off by default for a gym climber, and the switch draws the referee’s dir per hold', () => {
  open();
  expect(arrowsLayer()).toBeNull();
  const before = { ...stage().dataset };
  const sw = screen.getByRole('switch', { name: 'Hold directions' });
  expect(sw).not.toBeChecked();
  fireEvent.click(sw);
  expect(sw).toBeChecked();
  const drawn = JSON.parse(arrowsLayer()!.dataset.arrows!) as { id: string; dir: unknown }[];
  expect(drawn).toEqual(ctx.holds.map((h) => ({ id: h.id, dir: h.dir })));
  // Showing the directions changes nothing the referee decided.
  expect({ ...stage().dataset }).toEqual(before);
  fireEvent.click(sw);
  expect(arrowsLayer()).toBeNull();
});

it('starts on for a beginner, whose profile has hints on, and can be turned off', () => {
  open({ level: 'beginner', hints: true, numbers: false });
  expect(screen.getByRole('switch', { name: 'Hold directions' })).toBeChecked();
  expect(arrowsLayer()).not.toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: 'Hold directions' }));
  expect(arrowsLayer()).toBeNull();
});
