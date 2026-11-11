import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { targetAt, type MoveContext } from '../beta-moves';
import { useAppStore } from '../../store/app';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor } from './play';
import { PlayScreen } from './PlayScreen';
import { canvasHarness, ROUTE_FULL, routeProps, targetsRegion } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-02 K2 and acceptance 2: hovering the photo with a mouse
// outlines the target a click would pick (the same 24 CSS px nearest rule as a tap) and names it;
// the click commits it. Touch is unchanged.

vi.setConfig({ testTimeout: 30_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
let harness: ReturnType<typeof canvasHarness>;

beforeEach(() => {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_FULL });
  harness = canvasHarness();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open() {
  const view = render(<PlayScreen {...routeProps({ photo: ROUTE_FULL })} />);
  act(() => harness.flush());
  const start = screen.queryByRole('button', { name: 'Start planning' });
  if (start) fireEvent.click(start);
  act(() => harness.flush());
  return view;
}
const taps = () => document.querySelector<HTMLElement>('.play-taps')!;
const stage = () => screen.getByRole('region', { name: 'Wall' });
const view = () => {
  const d = taps().dataset;
  return { scale: Number(d.scale), tx: Number(d.tx), ty: Number(d.ty) };
};
/** The screen point (CSS px in the photo box) of an image point. */
const at = (x: number, y: number) => {
  const v = view();
  return { clientX: x * v.scale + v.tx, clientY: y * v.scale + v.ty };
};
const hold = (label: string) => ctx.holds.find((h) => h.label === label)!;
const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });

it('outlines and names the hold a click would pick, and the click commits it (acceptance 2)', () => {
  open();
  fireEvent.click(limb('LH'));
  const h3 = hold('3');
  // 10 image px off the hold's centre is still within the 24 CSS px tap radius.
  const p = at(h3.centroid.x + 10, h3.centroid.y - 10);
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...p });
  expect(stage()).toHaveAttribute('data-hover', h3.id);
  expect(document.querySelector('.play-hover-label')).toHaveTextContent('3');
  fireEvent.pointerDown(taps(), { pointerType: 'mouse', ...p });
  fireEvent.pointerUp(taps(), { pointerType: 'mouse', ...p });
  expect(stage()).toHaveAttribute('data-moves', '1');
  expect(JSON.parse(stage().dataset.assignment!).lh).toBe(h3.id);
  // The move is in: no limb is waiting, so nothing is outlined.
  expect(stage()).not.toHaveAttribute('data-hover');
  expect(document.querySelector('.play-hover-label')).toBeNull();
});

it('picks exactly what targetAt picks for the same point and radius', () => {
  open();
  fireEvent.click(limb('LF'));
  const step = JSON.parse(stage().dataset.assignment!);
  const v = view();
  const seen: (string | undefined)[] = [];
  // Two wall footholds, a free route hold (3), hold 2 (the right hand's: the foot gets 3), the
  // finish (feet skip it: the foot gets 6) and bare wall (nothing).
  for (const [x, y] of [
    [726, 739],
    [641, 931],
    [774.7, 464.6],
    [865.9, 520.3],
    [806.4, 143],
    [1300, 120],
  ] as const) {
    fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...at(x, y) });
    const got = targetAt(ctx, step, 'lf', { x, y }, 24 / v.scale);
    // R0-1 (amendment 2026-11-03): a foot tap on bare wall finds nothing; targetAt's smear
    // fallback is the target list's "Smear", never a tap or a hover.
    const want = got?.startsWith('smear:') ? undefined : got;
    expect(stage().dataset.hover ?? undefined, `${x},${y}`).toBe(want ?? undefined);
    seen.push(want ?? undefined);
  }
  // The points reach every kind of answer: a wall foothold, a route hold, and nothing.
  expect(seen.some((t) => t?.startsWith('wf:'))).toBe(true);
  expect(seen.some((t) => ctx.holds.some((h) => h.id === t))).toBe(true);
  expect(seen).toContain(undefined);
});

it('outlines nothing off every hold, with no limb picked, or after the pointer leaves', () => {
  open();
  const h3 = hold('3');
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...at(h3.centroid.x, h3.centroid.y) });
  expect(stage()).not.toHaveAttribute('data-hover');
  fireEvent.click(limb('LH'));
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...at(100, 1100) });
  expect(stage()).not.toHaveAttribute('data-hover');
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...at(h3.centroid.x, h3.centroid.y) });
  expect(stage()).toHaveAttribute('data-hover', h3.id);
  fireEvent.pointerLeave(taps(), { pointerType: 'mouse' });
  expect(stage()).not.toHaveAttribute('data-hover');
});

it('leaves touch unchanged: a finger never previews (WCAG 3.2.1, nothing happens on hover)', () => {
  open();
  fireEvent.click(limb('LH'));
  const h3 = hold('3');
  fireEvent.pointerMove(taps(), { pointerType: 'touch', ...at(h3.centroid.x, h3.centroid.y) });
  expect(stage()).not.toHaveAttribute('data-hover');
  // Hovering changes nothing in the plan either.
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...at(h3.centroid.x, h3.centroid.y) });
  expect(stage()).toHaveAttribute('data-moves', '0');
  expect(limb('LH')).toHaveAttribute('aria-pressed', 'true');
});

it('review suggestion: a hover from before a move doesn’t come back when the limb is picked again', () => {
  open();
  fireEvent.click(limb('LH'));
  const h3 = hold('3');
  const p = at(h3.centroid.x, h3.centroid.y);
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...p });
  expect(stage()).toHaveAttribute('data-hover', h3.id);
  fireEvent.pointerDown(taps(), { pointerType: 'mouse', ...p });
  fireEvent.pointerUp(taps(), { pointerType: 'mouse', ...p });
  expect(stage()).toHaveAttribute('data-moves', '1');
  // A new step: the old hover (another stance) is gone until the mouse moves again.
  fireEvent.click(limb('LH'));
  expect(stage()).not.toHaveAttribute('data-hover');
  expect(document.querySelector('.play-hover-label')).toBeNull();
});

it('re-review 2: after Undo and a different move, the old hover doesn’t come back', () => {
  open();
  const list = (name: string) =>
    within(targetsRegion(/^Targets for/)).getByRole('button', { name });
  // Move A (left foot), then the left hand hovers hold 3 on that stance.
  fireEvent.click(limb('LF'));
  fireEvent.click(list('Wall foothold 23'));
  fireEvent.click(limb('LH'));
  const h3 = hold('3');
  fireEvent.pointerMove(taps(), { pointerType: 'mouse', ...at(h3.centroid.x, h3.centroid.y) });
  expect(stage()).toHaveAttribute('data-hover', h3.id);
  // Undo, then a different move B (right foot): the plan is as long as before, on another stance.
  fireEvent.click(limb('LH'));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  fireEvent.click(limb('RF'));
  fireEvent.click(list('Wall foothold 21'));
  expect(stage()).toHaveAttribute('data-moves', '1');
  fireEvent.click(limb('LH'));
  expect(stage()).not.toHaveAttribute('data-hover');
});
