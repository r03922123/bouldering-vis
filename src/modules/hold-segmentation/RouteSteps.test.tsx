import { act, render, screen } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { MOMENT_MS, routeStep, RouteSteps } from './RouteSteps';
import type { HoldMask, HoldRole } from './types';

const hold = (id: string, order: number, role: HoldRole = 'route'): HoldMask =>
  ({ id, order, role }) as HoldMask;

function setHolds(roles: HoldRole[], shown = false) {
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    holds: roles.map((role, i) => hold(`h${i}`, i, role)),
    analysisTriggered: shown,
  });
}

const step = (n: number) => screen.getAllByRole('listitem')[n - 1]!;
const moment = () => document.querySelector('.route-moment')!;

describe('routeStep', () => {
  it('asks for holds until there are two, then for roles, then to show the route', () => {
    expect(routeStep([], false)).toBe('pick');
    expect(routeStep([hold('a', 0)], false)).toBe('pick');
    expect(routeStep([hold('a', 0), hold('b', 1)], false)).toBe('tag');
    const complete = [hold('a', 0, 'start'), hold('b', 1, 'finish')];
    expect(routeStep(complete, false)).toBe('show');
    expect(routeStep(complete, true)).toBe('done');
  });
});

describe('RouteSteps', () => {
  it('lights step 1 with an invitation when nothing is selected', () => {
    setHolds([]);
    render(<RouteSteps />);
    expect(step(1)).toHaveAttribute('aria-current', 'step');
    expect(step(1)).toHaveTextContent('Tap holds on the wall');
    expect(step(2)).toHaveAttribute('data-state', 'todo');
  });

  it('moves to step 2 with the start/finish count once two holds exist', () => {
    setHolds(['route', 'route', 'route']);
    render(<RouteSteps />);
    expect(step(1)).toHaveAttribute('data-state', 'done');
    expect(step(1)).toHaveTextContent('3 holds');
    expect(step(2)).toHaveAttribute('aria-current', 'step');
    expect(step(2)).toHaveTextContent('start 0 of 1–2 · finish 0 of 1');
  });

  it('shows Route ready and lights Show route when the roles are complete', () => {
    setHolds(['start', 'route', 'finish']);
    render(<RouteSteps />);
    expect(step(2)).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('Route ready')).toBeInTheDocument();
    expect(step(3)).toHaveAttribute('aria-current', 'step');
    expect(step(3)).toHaveTextContent('Press Show route');
  });

  it('marks everything done once a route view has been opened', () => {
    setHolds(['start', 'route', 'finish'], true);
    render(<RouteSteps />);
    expect(step(3)).toHaveAttribute('data-state', 'done');
    expect(step(3)).toHaveTextContent('Shown');
  });

  it('announces the moment the route completes, then falls quiet', () => {
    vi.useFakeTimers();
    try {
      setHolds(['route', 'route', 'route']);
      render(<RouteSteps />);
      expect(moment()).toHaveTextContent('');
      act(() => setHolds(['start', 'route', 'finish']));
      expect(moment()).toHaveTextContent('Route set: 3 holds');
      act(() => vi.advanceTimersByTime(MOMENT_MS + 1));
      expect(moment()).toHaveTextContent('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not celebrate a route that was already complete when it mounted', () => {
    setHolds(['start', 'route', 'finish']);
    render(<RouteSteps />);
    expect(moment()).toHaveTextContent('');
  });
});
