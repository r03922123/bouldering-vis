import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  checkMove,
  checkStart,
  createStanceCache,
  decodeBeta,
  newPlan,
  type MoveContext,
  type Plan,
} from '../beta-moves';
import { useAppStore } from '../../store/app';
import { betaText, SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { carriedLine, carryPlan, contextFor, type PlayWall } from './play';
import { PlayScreen } from './PlayScreen';
import { skipMap, targetsRegion, ROUTE_IMAGE, routeProps } from './screen.fixture';

// Review 8 (game designer, HIGH): on a tagged wall the plan silently went back to 0 moves.
// Root cause: Plan opens once depth and the wall footholds are in, but the hold types (CLIP) can
// land after; each type changes the route's context (its key has every hold's type), and the plan
// belongs to one context, so it started again at defaultStart with no message. The fix keeps the
// moves: the plan made on the old context is re-checked on the new one, the moves that still hold
// stay, and the screen says what changed. Never a silent reset.

vi.setConfig({ testTimeout: 60_000 });

const ctxOf = (w: PlayWall) => (contextFor(w) as { value: MoveContext }).value;
/** The synthetic route as a tagged route before its types came in: every type unknown. */
const UNTYPED: PlayWall = {
  ...SYNTHETIC,
  holds: SYNTHETIC.holds.map((h) => ({ ...h, type: null })),
};

beforeEach(() => {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_IMAGE });
});

const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
const stage = () => screen.getByRole('region', { name: 'Wall' });
const target = (label: string) =>
  within(targetsRegion(/^Targets for/)).getByRole('button', { name: label });
const tagged = (wall: PlayWall) =>
  routeProps({
    wallId: 'tagged',
    title: 'Wall 2',
    level: null,
    tagReady: true,
    tagged: wall,
  });

it('the root cause: a hold type landing changes the route’s context', () => {
  expect(ctxOf(UNTYPED).key).not.toBe(ctxOf(SYNTHETIC).key);
  expect(ctxOf(UNTYPED).holds.map((h) => h.id)).toEqual(ctxOf(SYNTHETIC).holds.map((h) => h.id));
});

describe('the plan survives the analysis landing after Plan opened (review 8)', () => {
  function twoMoves() {
    const view = render(<PlayScreen {...tagged(UNTYPED)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    skipMap();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('Wall foothold 23'));
    fireEvent.click(limb('RF'));
    fireEvent.click(target('Wall foothold 25'));
    expect(stage()).toHaveAttribute('data-moves', '2');
    return view;
  }

  it('keeps the moves, Undo and the stance when the types come in', () => {
    const view = twoMoves();
    const before = stage().dataset.assignment;
    view.rerender(<PlayScreen {...tagged(SYNTHETIC)} />);
    expect(stage()).toHaveAttribute('data-moves', '2');
    expect(stage().dataset.assignment).toBe(before);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('says so: never a silent change', () => {
    const view = twoMoves();
    view.rerender(<PlayScreen {...tagged(SYNTHETIC)} />);
    expect(document.querySelector('.play-hint')).toHaveTextContent(
      'The wall’s analysis finished: your 2 moves were checked again and still hold',
    );
  });

  it('the next move goes on from there', () => {
    const view = twoMoves();
    view.rerender(<PlayScreen {...tagged(SYNTHETIC)} />);
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    expect(stage()).toHaveAttribute('data-moves', '3');
  });
});

// Re-review 1: the plan must survive a return to the wall too. Two moves on context A, back
// to the gym before the types land, the wall opened again (the plan remembered under A shows),
// then the types land (context B): the session state is gone, so the carry comes from memory.
describe('the plan survives a return to the wall, then the analysis landing (re-review 1)', () => {
  function twoMovesThenLeave() {
    const first = render(<PlayScreen {...tagged(UNTYPED)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    skipMap();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('Wall foothold 23'));
    fireEvent.click(limb('RF'));
    fireEvent.click(target('Wall foothold 25'));
    expect(stage()).toHaveAttribute('data-moves', '2');
    const at = stage().dataset.assignment;
    first.unmount(); // ◀ Gym
    return at;
  }
  const reopen = (wall: PlayWall) => {
    const view = render(<PlayScreen {...tagged(wall)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    return view;
  };

  it('back on the wall, then the types land: the moves are kept and the screen says so', () => {
    const at = twoMovesThenLeave();
    const view = reopen(UNTYPED);
    expect(stage()).toHaveAttribute('data-moves', '2');
    view.rerender(<PlayScreen {...tagged(SYNTHETIC)} />);
    expect(stage()).toHaveAttribute('data-moves', '2');
    expect(stage().dataset.assignment).toBe(at);
    expect(document.querySelector('.play-hint')).toHaveTextContent(
      'The wall’s analysis finished: your 2 moves were checked again and still hold',
    );
  });

  it('the types landed while away: opening the wall again carries the plan', () => {
    twoMovesThenLeave();
    reopen(SYNTHETIC);
    expect(stage()).toHaveAttribute('data-moves', '2');
    expect(document.querySelector('.play-hint')).toHaveTextContent(/checked again and still hold/);
  });

  it('leaving again before any action and coming back keeps it (the carry is not lost)', () => {
    twoMovesThenLeave();
    reopen(SYNTHETIC).unmount();
    reopen(SYNTHETIC);
    expect(stage()).toHaveAttribute('data-moves', '2');
  });

  it('a route edit still starts the plan again on purpose', () => {
    twoMovesThenLeave();
    reopen(UNTYPED);
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear the plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    expect(stage()).toHaveAttribute('data-moves', '0');
  });
});

describe('carryPlan: the old plan re-checked on the new context', () => {
  const beta = (c: MoveContext, text = betaText('reference')) => decodeBeta(text, c)!;
  /** Both feet onto wall footholds, then the left hand up: a plan that stands on wall feet. */
  const FEET_FIRST =
    '1S,2,wf:699:863,wf:922:786;1S,2,wf:726:739,wf:922:786;1S,2,wf:726:739,wf:1125:816;' +
    '3,2,wf:726:739,wf:1125:816';
  const planOf = (c: MoveContext, n: number, text?: string): Plan => {
    const steps = beta(c, text).steps.slice(0, n + 1);
    const past = steps.slice(0, -1).map((_, i) => ({ steps: steps.slice(0, i + 1) }));
    return { ...newPlan(c, steps[0]!), beta: { steps }, past };
  };

  it('keeps every move that still holds, with its Undo history', () => {
    const from = ctxOf(UNTYPED);
    const to = ctxOf(SYNTHETIC);
    const out = carryPlan(planOf(from, 4), to, createStanceCache())!;
    expect(out.kept).toBe(4);
    expect(out.total).toBe(4);
    expect(out.plan.beta.steps).toEqual(beta(from).steps.slice(0, 5));
    expect(out.plan.past).toHaveLength(4);
    expect(out.dropped).toBeNull();
  });

  it('stops at the first move the referee no longer holds, and says why', () => {
    // The wall footholds came in again without one the plan steps on (a re-run of the analysis):
    // the first move onto it is no longer a legal shape, and everything before it stays.
    const from = ctxOf(SYNTHETIC);
    const plan = planOf(from, 3, FEET_FIRST);
    const steps = plan.beta.steps;
    const used = (i: number) => Object.values(steps[i]!).filter((t) => t?.startsWith('wf:'));
    const gone = steps
      .slice(1)
      .flatMap((_, k) => used(k + 1))
      .find((t) => !used(0).includes(t))!;
    const firstOn = steps.findIndex((s) => Object.values(s).includes(gone));
    const to = ctxOf({ ...SYNTHETIC, wallFeet: SYNTHETIC.wallFeet.filter((f) => f.id !== gone) });
    const out = carryPlan(plan, to, createStanceCache())!;
    expect(firstOn).toBeGreaterThan(0);
    // The referee holds every move before it on the new context.
    const cache = createStanceCache();
    expect(checkStart(steps[0]!, to, cache).verdict).not.toBe('fall');
    for (let i = 1; i < firstOn; i++) {
      expect(checkMove(steps[i - 1]!, steps[i]!, to, cache).verdict).not.toBe('fall');
    }
    expect(out.kept).toBe(firstOn - 1);
    expect(out.plan.beta.steps).toEqual(steps.slice(0, firstOn));
    expect(out.dropped).toEqual({ move: firstOn, reason: 'That isn’t on this route' });
    expect(carriedLine(out)).toBe(
      `The wall’s analysis finished: move ${firstOn} no longer holds (That isn’t on this route), so your plan is ${firstOn > 1 ? `back to move ${firstOn - 1}` : 'back at the start'}`,
    );
  });
});

// Re-review 5: the old start isn't a legal start on the new context (a foothold it stands
// on is gone): the plan goes back to the default start, and says so.
describe('a start that no longer fits (re-review 5)', () => {
  const startFeet = (c: MoveContext) => newPlan(c).beta.steps[0]!;

  it('carryPlan falls back to the default start and the line says why', () => {
    const from = ctxOf(SYNTHETIC);
    const start = startFeet(from);
    const gone = [start.lf, start.rf].find((t) => t?.startsWith('wf:'))!;
    const to = ctxOf({ ...SYNTHETIC, wallFeet: SYNTHETIC.wallFeet.filter((f) => f.id !== gone) });
    const fallback = newPlan(to);
    const old: Plan = { ...newPlan(from), beta: { steps: [start, start] } };
    const out = carryPlan(old, to, createStanceCache(), fallback)!;
    expect(out.plan).toBe(fallback);
    expect(out.kept).toBe(0);
    expect(carriedLine(out)).toBe(
      'The wall’s analysis finished: your start no longer fits this wall — it was reset to the default start',
    );
  });

  it('on the screen: never a silent reset', () => {
    const view = render(<PlayScreen {...tagged(UNTYPED)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    skipMap();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    expect(stage()).toHaveAttribute('data-moves', '1');
    const start = JSON.parse(stage().dataset.assignment!);
    const gone = [start.lf, start.rf].find((t: string | null) => t?.startsWith('wf:'));
    view.rerender(
      <PlayScreen
        {...tagged({ ...SYNTHETIC, wallFeet: SYNTHETIC.wallFeet.filter((f) => f.id !== gone) })}
      />,
    );
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(document.querySelector('.play-hint')).toHaveTextContent(
      'The wall’s analysis finished: your start no longer fits this wall — it was reset to the default start',
    );
  });
});
