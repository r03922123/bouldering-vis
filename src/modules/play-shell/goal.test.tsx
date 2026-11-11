import { fireEvent, render, screen, within } from '@testing-library/react';
import type { MoveContext } from '../beta-moves';
import { useAppStore } from '../../store/app';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor, goalText } from './play';
import { PlayScreen } from './PlayScreen';
import { openMap, skipMap, targetsRegion, ROUTE_IMAGE, routeProps } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-03 R0-4 and acceptance 4: the goal from the first frame. The
// COACH's first page on entering Plan is the goal, then the start verdict; the header keeps a goal
// line at every width, first in the reading order.

vi.setConfig({ testTimeout: 30_000 });

function phone() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_IMAGE });
});
afterEach(() => vi.unstubAllGlobals());

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
const coach = () => screen.getByRole('region', { name: 'Coach' });
const coachText = () => coach().querySelector('.play-coach-text')!.textContent;
const goal = () => within(screen.getByRole('banner')).getByText(/both hands on 7F/);
/** An element's text without the parts matching `drop` (what is seen, or what is read). */
const textWithout = (el: Element, drop: string) => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll(drop).forEach((n) => n.remove());
  return c.textContent!.replace(/\s+/g, ' ').trim();
};
const seen = (el: Element) => textWithout(el, '.visually-hidden');
const read = (el: Element) => textWithout(el, '[aria-hidden="true"]');

describe('goalText (R0-4)', () => {
  it('is both hands on the route’s finish, by its label', () => {
    expect(goalText(ctx)).toBe('both hands on 7F');
  });
});

describe('the goal on the synthetic route (acceptance 4)', () => {
  for (const [name, setup] of [
    ['wide', () => {}],
    ['phone', phone],
  ] as const) {
    it(`${name}: the header says it before any move, on the direction map and in Plan`, () => {
      setup();
      render(<PlayScreen {...routeProps()} />);
      openMap();
      expect(seen(goal())).toBe('Goal · both hands on 7F');
      skipMap();
      expect(seen(goal())).toBe('Goal · both hands on 7F');
    });
  }

  it('a screen reader hears it as “Goal: both hands on 7F”, before the verdict and the pad', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    const g = goal();
    // The "·" is drawn, a colon is read.
    expect(read(g)).toBe('Goal: both hands on 7F');
    const live = document.querySelector('.play-verdict')!;
    const pad = screen.getByRole('group', { name: 'Moves' });
    for (const later of [live, pad]) {
      expect(g.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('the COACH’s first page is the goal, then the start verdict', () => {
    render(<PlayScreen {...routeProps()} />);
    expect(coach()).toHaveAttribute('data-page', '1');
    expect(coach()).toHaveAttribute('data-pages', '2');
    fireEvent.click(coach()); // skip the reveal
    expect(coachText()).toBe('Goal: both hands on 7F');
    fireEvent.click(within(coach()).getByRole('button', { name: 'Next coach line' }));
    fireEvent.click(coach());
    expect(coach()).toHaveAttribute('data-page', '2');
    expect(coachText()).toBe('Start: Balanced: this position can be held');
  });

  it('after a move the COACH shows the move; the header keeps the goal', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    fireEvent.click(screen.getByRole('button', { name: /^LH\b/ }));
    fireEvent.click(within(targetsRegion(/^Targets for/)).getByRole('button', { name: '3' }));
    expect(coach()).toHaveAttribute('data-pages', '1');
    expect(seen(goal())).toBe('Goal · both hands on 7F');
  });

  it('a fall preview from the start shows its reason first, not the goal', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    fireEvent.click(screen.getByRole('button', { name: /^LH\b/ }));
    fireEvent.click(within(targetsRegion(/^Targets for/)).getByRole('button', { name: '7F' }));
    expect(coach()).toHaveAttribute('data-pages', '1');
    fireEvent.click(coach());
    expect(coachText()).toMatch(/^Left hand to 7F: you'd fall\. /);
  });

  it('the live region stays the referee’s verdict (S12)', () => {
    render(<PlayScreen {...routeProps()} />);
    expect(document.querySelector('.play-verdict')).toHaveTextContent(
      /^Start: Balanced: this position can be held$/,
    );
  });
});
