import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { forgetPlans } from './memory';
import { PlayScreen } from './PlayScreen';
import { skipMap, targetsRegion, ROUTE_IMAGE, routeProps } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-03 R0-2 and acceptance 2: a fall's reason is on the first
// page, stays until the next move, Undo, Redo or Esc (arming another limb keeps it), and on a
// phone the COACH strip opens by itself for it.

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

const FALL = "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first";
const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
const verdict = () => document.querySelector('.play-verdict')!;
const coach = () => screen.getByRole('region', { name: 'Coach' });
const stage = () => screen.getByRole('region', { name: 'Wall' });
const target = (label: string) =>
  within(targetsRegion(/^Targets for/)).getByRole('button', { name: label });

/** On a phone the target list is in the ☰ drawer (U3): open it once. */
function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: 'Hints and tools' }));
}

function openAndFall(over: Parameters<typeof routeProps>[0] = {}) {
  render(<PlayScreen {...routeProps(over)} />);
  skipMap();
  fireEvent.click(limb('LH'));
  fireEvent.click(target('7F'));
  expect(stage()).toHaveAttribute('data-preview', 'fall');
}

describe('R0-2: the reason on the first page', () => {
  it('the COACH’s first page is the verdict and its reason together', () => {
    openAndFall();
    expect(coach()).toHaveAttribute('data-page', '1');
    expect(coach()).toHaveAttribute('data-pages', '1');
    expect(coach().querySelector('.play-coach-text')).toHaveTextContent(FALL);
    expect(verdict()).toHaveTextContent(FALL);
  });

  it('keeps Numbers on a page of its own', () => {
    openAndFall({ profile: { level: 'pro', hints: false, numbers: true } });
    expect(coach()).toHaveAttribute('data-pages', '2');
    expect(coach()).toHaveAttribute('data-page', '1');
    expect(coach().querySelector('.play-coach-text')).toHaveTextContent(FALL);
  });
});

describe('R0-2: the reason stays until the next move, Undo, Redo or Esc', () => {
  it('arming another limb keeps it', () => {
    openAndFall();
    fireEvent.click(limb('RH'));
    expect(verdict()).toHaveTextContent(FALL);
    expect(coach().querySelector('.play-coach-text')).toHaveTextContent(FALL);
    fireEvent.keyDown(document.body, { code: 'KeyA', key: 'a' });
    expect(verdict()).toHaveTextContent(FALL);
  });

  it('the same limb pressed again is still the current try', () => {
    openAndFall();
    fireEvent.click(limb('LH'));
    expect(stage()).toHaveAttribute('data-preview', 'fall');
    expect(verdict().textContent).toBe(FALL);
  });

  it('a tap that finds nothing doesn’t erase it either (its hint has its own line)', () => {
    openAndFall();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('7F')); // a rejection replaces it: a new attempt
    expect(verdict()).toHaveTextContent('The finish is for hands');
  });

  it('the next move replaces it', () => {
    openAndFall();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    expect(verdict()).toHaveTextContent('Left hand to 3: holds');
  });

  it('Esc replaces it', () => {
    openAndFall();
    fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' });
    expect(verdict()).toHaveTextContent('Start: Balanced: this position can be held');
  });

  it('Undo and Redo replace it', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    expect(verdict()).toHaveTextContent("you'd fall");
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(verdict()).not.toHaveTextContent("you'd fall");
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    expect(verdict()).toHaveTextContent("you'd fall");
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(verdict()).toHaveTextContent('Left hand to 3: holds');
  });
});

describe('R0-2 on a phone: the COACH strip opens by itself', () => {
  it('on a fall preview, and folds back to the player’s choice afterwards', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    expect(coach()).toHaveAttribute('data-strip', 'true');
    openDrawer();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    expect(coach()).not.toHaveAttribute('data-strip');
    expect(coach().querySelector('.play-coach-text')).toHaveTextContent(FALL);
    // Esc: back to the start verdict, and the strip the player had.
    fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' });
    expect(coach()).toHaveAttribute('data-strip', 'true');
  });

  it('on a rejection', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    openDrawer();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('7F'));
    expect(verdict()).toHaveTextContent('The finish is for hands');
    expect(coach()).not.toHaveAttribute('data-strip');
  });

  it('the player can still fold it, and their choice is kept otherwise', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    openDrawer();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    fireEvent.click(within(coach()).getByRole('button', { name: 'Fold the coach to one line' }));
    expect(coach()).toHaveAttribute('data-strip', 'true');
    // A held move: no reason to open for, so the player's choice (folded) stays.
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    expect(verdict()).toHaveTextContent('Left hand to 3: holds');
    expect(coach()).toHaveAttribute('data-strip', 'true');
  });
});

// Review 3: a repeated fall (the same blocked hold tapped again) must answer: it re-opens a
// strip the player folded and restarts the COACH's reveal. The fold is keyed on the attempt, not
// on the words.
describe('a repeated fall answers (R0 review 3)', () => {
  it('re-opens the folded strip on a phone, for the same words', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    openDrawer();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    fireEvent.click(within(coach()).getByRole('button', { name: /one line/ }));
    expect(coach()).toHaveAttribute('data-strip', 'true');
    fireEvent.click(target('7F')); // the same blocked hold again
    expect(verdict()).toHaveTextContent(FALL);
    expect(coach()).not.toHaveAttribute('data-strip');
  });

  it('restarts the COACH’s reveal, so the same words visibly come again', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    openDrawer();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    fireEvent.click(coach()); // skip the reveal
    expect(coach()).toHaveAttribute('data-revealed', 'all');
    const first = coach().getAttribute('data-attempt');
    fireEvent.click(target('7F'));
    expect(coach().getAttribute('data-attempt')).not.toBe(first);
    expect(coach()).not.toHaveAttribute('data-revealed', 'all');
  });
});
