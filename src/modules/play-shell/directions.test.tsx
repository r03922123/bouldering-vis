import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  checkStart,
  createStanceCache,
  defaultStart,
  type MoveContext,
  type Plan,
} from '../beta-moves';
import { useAppStore } from '../../store/app';
import { resetViewAids } from './aids';
import { SYNTHETIC } from './synthetic.fixture';
import {
  angleOfBearing,
  applyEdits,
  bearingOf,
  clampGrip,
  LIFTED_SHARE,
  pullWords,
  rotateTo,
  withoutEdit,
  type Edits,
} from './directions';
import { EDIT_ARROW_CSS, FINE_GRIP_STEP, GRIP_STEP, TURN_STEP } from './DirectionMap';
import { glyphFor } from './hints';
import { forgetPlans } from './memory';
import { boxAt, contextFor, startPlan } from './play';
import { PlayScreen } from './PlayScreen';
import {
  canvasHarness,
  openMap,
  targetsRegion,
  ROUTE_FULL,
  ROUTE_IMAGE,
  routeProps,
} from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-02 E1 and acceptance 8–12: the direction map before every
// plan, rotation (a custom pull, forceSource 'user'), translation (RouteHold.grip), Reset, the
// plan restarting, and the keyboard path. The baked level never changes.

vi.setConfig({ testTimeout: 60_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
const hold = (label: string) => ctx.holds.find((h) => h.label === label)!;
const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 3));

/** What the referee says at the start on the synthetic route with `edits` applied, without the screen. */
function refereeStart(edits: Edits) {
  const c = (contextFor(applyEdits(SYNTHETIC, edits)) as { value: MoveContext }).value;
  return checkStart(defaultStart(c), c, createStanceCache());
}

describe('rotateTo (rotation keeps the out-of-wall part)', () => {
  it('turns only the in-plane angle: z and the in-plane length stay', () => {
    close(rotateTo([0.6, 0, -0.8], Math.PI / 2), [0, 0.6, -0.8]);
    close(rotateTo([0, 1, 0], Math.PI), [-1, 0, 0]);
    const d = rotateTo([0.0027, 0.9996, -0.0277], 0);
    expect(d[2]).toBeCloseTo(-0.0277, 3);
    expect(Math.hypot(...d)).toBeCloseTo(1, 3);
  });

  it('gives no pull yet a pull along the wall, and a push into the wall an angle to turn', () => {
    close(rotateTo(null, Math.PI / 2), [0, 1, 0]);
    // Straight into the wall (⊗) has no angle; turned, it becomes the shortest drawn arrow.
    const into = rotateTo([0, 0, -1], 0);
    expect(glyphFor(into)).toBe('arrow');
    expect(Math.hypot(into[0], into[1])).toBeCloseTo(LIFTED_SHARE, 3);
    expect(into[2]).toBeLessThan(0);
    expect(Math.hypot(...into)).toBeCloseTo(1, 3);
    const out = rotateTo([0, 0.1, 0.99], Math.PI);
    expect(glyphFor(out)).toBe('arrow');
    expect(out[2]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(0);
  });

  it('bearings: 0 up, 90 right, 180 down; and back', () => {
    expect(bearingOf([0, -1, 0])).toBe(0);
    expect(bearingOf([1, 0, 0])).toBe(90);
    expect(bearingOf([0, 1, 0])).toBe(180);
    expect(bearingOf(null)).toBeNull();
    expect(bearingOf(rotateTo([0, 1, 0], angleOfBearing(225)))).toBe(225);
    expect(pullWords([0, 1, 0])).toBe('Pulls down (180°)');
    expect(pullWords(null)).toBe('No single pull');
    expect(pullWords([0, 0, -1])).toBe('Pushes into the wall');
  });
});

describe('applyEdits and clampGrip', () => {
  it('a custom pull becomes dir with forceSource user; a grip point is set; the level is untouched', () => {
    const before = structuredClone(SYNTHETIC);
    const id = hold('2').id;
    const wall = applyEdits(SYNTHETIC, { [id]: { custom: [1, 0, 0], grip: { x: 900, y: 580 } } });
    const h = wall.holds.find((x) => x.id === id)!;
    expect(h).toMatchObject({ dir: [1, 0, 0], forceSource: 'user', grip: { x: 900, y: 580 } });
    expect(wall.holds.filter((x) => x.id !== id)).toEqual(
      SYNTHETIC.holds.filter((x) => x.id !== id),
    );
    expect(SYNTHETIC).toEqual(before);
    expect(applyEdits(SYNTHETIC, {})).toBe(SYNTHETIC);
  });

  it('withoutEdit drops one part or the whole hold', () => {
    const e: Edits = { a: { custom: [1, 0, 0], grip: { x: 1, y: 2 } } };
    expect(withoutEdit(e, 'a', 'grip')).toEqual({ a: { custom: [1, 0, 0] } });
    expect(withoutEdit(withoutEdit(e, 'a', 'grip'), 'a', 'custom')).toEqual({});
    expect(withoutEdit(e, 'a', 'all')).toEqual({});
  });

  it('clamps a grip point into the hold’s box, and onto its mask when it has one', () => {
    const bbox = { x: 10, y: 10, w: 5, h: 4 };
    expect(clampGrip({ x: 0, y: 30 }, { bbox })).toEqual({ x: 10, y: 13 });
    // Inside the box a point stays where it was put, to the referee's 0.1 px (review finding 3).
    expect(clampGrip({ x: 12.4, y: 11.6 }, { bbox })).toEqual({ x: 12.4, y: 11.6 });
    expect(clampGrip({ x: 12.43, y: 11.66 }, { bbox })).toEqual({ x: 12.4, y: 11.7 });
    // A mask that is only the box's right column: a point left of it goes onto the mask.
    const width = 20;
    const mask = new Uint8Array(20 * 20);
    for (let y = 10; y < 14; y++) mask[y * width + 14] = 1;
    expect(clampGrip({ x: 10, y: 11 }, { bbox, mask, width })).toEqual({ x: 14, y: 11 });
    expect(clampGrip({ x: 14, y: 12 }, { bbox, mask, width })).toEqual({ x: 14, y: 12 });
  });
});

describe('PlayScreen: the direction map (E1)', () => {
  beforeEach(() => {
    forgetPlans();
    resetViewAids();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState({ image: ROUTE_IMAGE });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const stage = () => screen.getByRole('region', { name: 'Wall' });
  const panel = () => screen.getByRole('region', { name: 'Do these directions look right?' });
  const edits = () => JSON.parse(stage().dataset.edits ?? '{}') as Edits;
  const slider = (label: string) => screen.getByRole('slider', { name: `Pull of hold ${label}` });
  const grip = (label: string) =>
    screen.getByRole('button', { name: new RegExp(`^Grip point of hold ${label}:`) });
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });

  it('never opens by itself on a baked level: Plan starts on the tray (SPEC-launch-wall-2 R7)', () => {
    render(<PlayScreen {...routeProps()} />);
    expect(stage()).toHaveAttribute('data-map', 'closed');
    expect(screen.getByRole('group', { name: 'Moves' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start planning' })).toBeNull();
  });

  it('opens on a baked level from "Check directions", with the start shown, until "Start planning" (acceptance 8, R7)', () => {
    render(<PlayScreen {...routeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check directions' }));
    expect(stage()).toHaveAttribute('data-map', 'check');
    expect(stage()).toHaveAttribute('data-verdict', 'hold');
    expect(within(panel()).getByRole('button', { name: 'Edit directions' })).toBeInTheDocument();
    // No tray while the map is open, and the limb keys wait too.
    expect(screen.queryByRole('group', { name: 'Moves' })).toBeNull();
    fireEvent.keyDown(document.body, { code: 'KeyQ', key: 'q' });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Start planning' }));
    expect(stage()).toHaveAttribute('data-map', 'closed');
    expect(limb('LH')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens before the plan on a route tagged in Play, every time it goes into Plan', () => {
    render(<PlayScreen {...routeProps({ level: null, tagReady: true, tagged: SYNTHETIC })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    expect(stage()).toHaveAttribute('data-map', 'check');
    fireEvent.click(screen.getByRole('button', { name: 'Start planning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    expect(stage()).toHaveAttribute('data-map', 'check');
  });

  it('draws an arrow per hold equal to the referee’s dir (acceptance 8)', () => {
    useAppStore.setState({ image: ROUTE_FULL });
    const h = canvasHarness();
    render(<PlayScreen {...routeProps({ photo: ROUTE_FULL })} />);
    openMap();
    act(() => h.flush());
    const layer = document.querySelector<HTMLElement>('svg.play-arrows[data-arrows]')!;
    // Against the level file itself, not the context the arrows are drawn from (review): the
    // route holds in order, each with the dir it was recorded with.
    const level = [...SYNTHETIC.holds].sort((a, b) => a.order - b.order);
    expect(JSON.parse(layer.dataset.arrows!)).toEqual(level.map((x) => ({ id: x.id, dir: x.dir })));
  });

  it('turning a pull by keyboard sets a custom pull the referee then uses (acceptance 9, 12)', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    const before = stage().dataset.loads;
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    const s = slider('1S');
    expect(s).toHaveAttribute('aria-valuenow', '180');
    expect(s).toHaveAttribute('aria-valuetext', 'Pulls down (180°)');
    for (let i = 0; i < 6; i++) fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(slider('1S')).toHaveAttribute('aria-valuenow', String(180 + 6 * TURN_STEP));
    const e = edits();
    const id = hold('1S').id;
    close(e[id]!.custom!, rotateTo([0, 1, 0], angleOfBearing(270)));
    // The next check is the referee's on the edited holds: the shares it gives are the screen's.
    const want = refereeStart(e);
    expect(JSON.parse(stage().dataset.loads!)).toEqual(want.loads);
    expect(stage().dataset.loads).not.toBe(before);
    expect(stage()).toHaveAttribute('data-verdict', want.verdict);
  });

  it('dragging an arrowhead turns the pull; the out-of-wall part stays (acceptance 9)', () => {
    useAppStore.setState({ image: ROUTE_FULL });
    const hz = canvasHarness();
    const id = hold('5').id;
    render(<PlayScreen {...routeProps({ photo: ROUTE_FULL })} />);
    openMap();
    act(() => hz.flush());
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    act(() => hz.flush());
    const head = document.querySelector<HTMLElement>(`.play-dir-head[data-hold="${id}"]`)!;
    const base = document.querySelector<HTMLElement>(`.play-dir-base[data-hold="${id}"]`)!;
    const b = { x: parseFloat(base.style.left), y: parseFloat(base.style.top) };
    const hd = { x: parseFloat(head.style.left), y: parseFloat(head.style.top) };
    expect(Math.hypot(hd.x - b.x, hd.y - b.y)).toBeCloseTo(EDIT_ARROW_CSS);
    fireEvent.pointerDown(head, { clientX: hd.x, clientY: hd.y, pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: b.x - 30, clientY: b.y, pointerId: 1 });
    // A drag previews only; the release commits.
    expect(stage()).not.toHaveAttribute('data-edits');
    fireEvent.pointerUp(head, { clientX: b.x - 30, clientY: b.y, pointerId: 1 });
    const d = edits()[id]!.custom!;
    const was = hold('5').dir!;
    expect(d[2]).toBeCloseTo(was[2], 3);
    expect(Math.atan2(d[1], d[0])).toBeCloseTo(Math.PI, 3);
    expect(slider('5')).toHaveAttribute('aria-valuenow', '270');
  });

  /** The synthetic route in edit mode on the full-size photo, with hold `label`'s two handles. */
  function editHandles(label: string, { edit = true } = {}) {
    useAppStore.setState({ image: ROUTE_FULL });
    const hz = canvasHarness();
    const id = hold(label).id;
    render(<PlayScreen {...routeProps({ photo: ROUTE_FULL })} />);
    openMap();
    act(() => hz.flush());
    if (edit) fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    act(() => hz.flush());
    const el = (kind: string) =>
      document.querySelector<HTMLElement>(`.play-dir-${kind}[data-hold="${id}"]`)!;
    const at = (kind: string) => ({
      x: parseFloat(el(kind).style.left),
      y: parseFloat(el(kind).style.top),
    });
    return { id, el, at, hz };
  }
  const drawn = () =>
    JSON.parse(
      document.querySelector<HTMLElement>('svg.play-arrows[data-arrows]')!.dataset.arrows!,
    ) as { id: string; dir: number[] | null }[];

  const hintLayer = () => document.querySelector<HTMLElement>('svg.play-arrows')!;
  it('re-review 1: at 375 px, a dropped arrow (hold 7F) is named and its pull put in words', () => {
    // The harness's photo box is a 375 px phone's (343 × 257, 2 CSS px an art px), where 7F's
    // down arrow runs into hold 6's badge below it: no room for its arrow.
    const { hz } = editHandles('7F', { edit: false });
    act(() => hz.flush());
    const id7 = hold('7F').id;
    expect(hintLayer().dataset.droppedArrows?.split(',')).toContain(id7);
    const words = within(panel()).getByRole('list', { name: 'Pulls not drawn on the photo' });
    expect(words).toHaveTextContent('Hold 7F: pulls down (180°)');
    // The holds whose arrows are drawn aren't listed.
    expect(words).not.toHaveTextContent('Hold 6:');
    // Edit mode: its 56 px arrow has no room either, and the hold list has its words.
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    act(() => hz.flush());
    expect(hintLayer().dataset.droppedArrows?.split(',')).toContain(id7);
    expect(slider('7F')).toHaveAttribute('aria-valuetext', 'Pulls down (180°)');
  });

  it('review 2: a twitch under 6 px on a handle commits nothing, and keeps the plan', () => {
    const { el, at } = editHandles('5');
    for (const kind of ['head', 'base']) {
      const p = at(kind);
      // Pressed 5 px off the handle's centre, then a 2 px twitch: not a drag.
      fireEvent.pointerDown(el(kind), { clientX: p.x + 5, clientY: p.y, pointerId: 1 });
      fireEvent.pointerMove(el(kind), { clientX: p.x + 7, clientY: p.y + 1, pointerId: 1 });
      fireEvent.pointerUp(el(kind), { clientX: p.x + 7, clientY: p.y + 1, pointerId: 1 });
      expect(stage(), kind).not.toHaveAttribute('data-edits');
    }
  });

  it('review 2: a drag moves the handle by the pointer’s movement, not to where it was pressed', () => {
    const { id, el, at } = editHandles('5');
    const p = at('head');
    // Pressed 12 px right of the arrowhead, then dragged straight down 30 px: the head moves
    // straight down too, so the pull still points down.
    fireEvent.pointerDown(el('head'), { clientX: p.x + 12, clientY: p.y, pointerId: 1 });
    fireEvent.pointerMove(el('head'), { clientX: p.x + 12, clientY: p.y + 15, pointerId: 1 });
    fireEvent.pointerUp(el('head'), { clientX: p.x + 12, clientY: p.y + 30, pointerId: 1 });
    const d = edits()[id]!.custom!;
    expect(Math.atan2(d[1], d[0])).toBeCloseTo(Math.PI / 2, 2);
    // The base dot the same way: pressed 3 px below its centre and moved 10 px right, the grip
    // moves right only (to the box's edge, where it stops); pressed point taken as-is, it would
    // also have dropped 3 px (13 image px here).
    const b = at('base');
    const c = hold('5').centroid;
    const box = boxAt(ctx, c);
    fireEvent.pointerDown(el('base'), { clientX: b.x - 8, clientY: b.y + 3, pointerId: 2 });
    fireEvent.pointerMove(el('base'), { clientX: b.x + 2, clientY: b.y + 3, pointerId: 2 });
    fireEvent.pointerUp(el('base'), { clientX: b.x + 2, clientY: b.y + 3, pointerId: 2 });
    const g = edits()[id]!.grip!;
    expect(g.x).toBe(Math.floor(box.x + box.w - 1e-9));
    expect(Math.abs(g.y - c.y)).toBeLessThanOrEqual(0.5);
  });

  it('review 2: a lost pointer capture drops the drag’s preview', () => {
    const { id, el, at } = editHandles('5');
    const was = drawn().find((a) => a.id === id)!.dir;
    const p = at('head');
    fireEvent.pointerDown(el('head'), { clientX: p.x, clientY: p.y, pointerId: 1 });
    fireEvent.pointerMove(el('head'), { clientX: p.x - 40, clientY: p.y - 40, pointerId: 1 });
    expect(drawn().find((a) => a.id === id)!.dir).not.toEqual(was);
    fireEvent.lostPointerCapture(el('head'), { pointerId: 1 });
    expect(drawn().find((a) => a.id === id)!.dir).toEqual(was);
    fireEvent.pointerUp(el('head'), { clientX: p.x - 40, clientY: p.y - 40, pointerId: 1 });
    expect(stage()).not.toHaveAttribute('data-edits');
  });

  it('review suggestion: a drag’s preview never outlives edit mode', () => {
    const { id, el, at } = editHandles('5');
    const was = drawn().find((a) => a.id === id)!.dir;
    const p = at('head');
    fireEvent.pointerDown(el('head'), { clientX: p.x, clientY: p.y, pointerId: 1 });
    fireEvent.pointerMove(el('head'), { clientX: p.x - 40, clientY: p.y, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check directions' }));
    expect(drawn().find((a) => a.id === id)!.dir).toEqual(was);
  });

  it('review suggestion: four nudge buttons move the grip, for screen readers too', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    const h = hold('1S');
    const nudge = (dir: string) =>
      screen.getByRole('button', { name: `Move hold 1S’s grip ${dir}` });
    fireEvent.click(nudge('right'));
    fireEvent.click(nudge('up'));
    const g = edits()[h.id]!.grip!;
    expect(g.x).toBeCloseTo(h.centroid.x + GRIP_STEP, 5);
    expect(g.y).toBeCloseTo(h.centroid.y - GRIP_STEP, 5);
    fireEvent.click(nudge('left'));
    fireEvent.click(nudge('down'));
    // Back on the centre: no edit (review 3), and the grip's words say so.
    expect(stage()).not.toHaveAttribute('data-edits');
    expect(grip('1S')).toHaveAccessibleName(/Grip: the hold’s centre$/);
  });

  it('review 3: a key that changes nothing (at the clamp edge) leaves a plan in progress alone', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    for (let i = 0; i < 20; i++) fireEvent.keyDown(grip('1S'), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(limb('LH'));
    fireEvent.click(
      within(targetsRegion(/^Targets for/)).getByRole('button', {
        name: '3',
      }),
    );
    expect(stage()).toHaveAttribute('data-moves', '1');
    const e = stage().dataset.edits;
    fireEvent.click(screen.getByRole('button', { name: 'Check directions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    fireEvent.keyDown(grip('1S'), { key: 'ArrowRight' });
    expect(stage().dataset.edits).toBe(e);
    expect(stage()).toHaveAttribute('data-moves', '1');
  });

  it('review 3: a grip moved back to the hold’s centre is no edit at all', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    fireEvent.keyDown(grip('1S'), { key: 'ArrowRight' });
    expect(stage()).toHaveAttribute('data-edits');
    fireEvent.keyDown(grip('1S'), { key: 'ArrowLeft' });
    expect(stage()).not.toHaveAttribute('data-edits');
    expect(screen.getByRole('button', { name: 'Reset hold 1S' })).toBeDisabled();
  });

  it('review 3: a base-dot drag that ends where it began stores no grip', () => {
    const { el, at } = editHandles('5');
    const b = at('base');
    fireEvent.pointerDown(el('base'), { clientX: b.x, clientY: b.y, pointerId: 1 });
    fireEvent.pointerMove(el('base'), { clientX: b.x + 1, clientY: b.y + 20, pointerId: 1 });
    fireEvent.pointerUp(el('base'), { clientX: b.x, clientY: b.y, pointerId: 1 });
    expect(stage()).not.toHaveAttribute('data-edits');
  });

  it('moving the grip point keeps it in the hold box, and the referee contacts it (acceptance 10, 12)', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    const h = hold('1S');
    const box = boxAt(ctx, h.centroid);
    // One step: 1S's box (0.05 H ≈ 20 px wide) leaves room for one 5 px step right of its centre.
    fireEvent.keyDown(grip('1S'), { key: 'ArrowRight' });
    fireEvent.keyDown(grip('1S'), { key: 'ArrowUp', shiftKey: true });
    const g = edits()[h.id]!.grip!;
    expect(g.x).toBeCloseTo(h.centroid.x + GRIP_STEP, 5);
    expect(g.y).toBeCloseTo(h.centroid.y - FINE_GRIP_STEP, 5);
    expect(grip('1S')).toHaveAccessibleName(/Grip: 5 px right, 1 px up of the centre$/);
    // Far past the box's edge, it stops at the edge.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(grip('1S'), { key: 'ArrowRight' });
    expect(edits()[h.id]!.grip!.x).toBe(Math.floor(box.x + box.w - 1e-9));
    // The left hand starts on 1S: the referee's contact for it is the grip point now.
    const want = refereeStart(edits());
    expect(want.contacts.lh!.point.slice(0, 2)).toEqual([edits()[h.id]!.grip!.x, g.y]);
    expect(JSON.parse(stage().dataset.loads!)).toEqual(want.loads);
  });

  it('Reset restores the referee’s default; any change restarts the plan (acceptance 11)', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    const start = { ...stage().dataset };
    fireEvent.click(screen.getByRole('button', { name: 'Start planning' }));
    fireEvent.click(limb('LH'));
    fireEvent.click(
      within(targetsRegion(/^Targets for/)).getByRole('button', {
        name: '3',
      }),
    );
    expect(stage()).toHaveAttribute('data-moves', '1');
    // Back to the map from Plan: a change says it restarts the plan, and does.
    fireEvent.click(screen.getByRole('button', { name: 'Check directions' }));
    expect(panel()).toHaveTextContent('Changing one starts your plan again.');
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    fireEvent.keyDown(slider('6'), { key: 'ArrowLeft' });
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(screen.getByRole('button', { name: 'Reset hold 6' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset hold 5' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset hold 6' }));
    expect(stage()).not.toHaveAttribute('data-edits');
    expect(stage().dataset.loads).toBe(start.loads);
    expect(stage().dataset.assignment).toBe(start.assignment);
    // Still a fresh plan: the reset is a change too, and the old plan doesn't come back.
    expect(stage()).toHaveAttribute('data-moves', '0');
    fireEvent.keyDown(slider('1S'), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(stage()).not.toHaveAttribute('data-edits');
  });

  it('keeps the edits and their plan across "◀ Gym"', () => {
    const first = render(<PlayScreen {...routeProps()} />);
    openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    fireEvent.keyDown(slider('1S'), { key: 'ArrowLeft' });
    const e = stage().dataset.edits;
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(limb('LH'));
    fireEvent.click(
      within(targetsRegion(/^Targets for/)).getByRole('button', {
        name: '3',
      }),
    );
    first.unmount();
    render(<PlayScreen {...routeProps()} />);
    expect(stage().dataset.edits).toBe(e);
    expect(stage()).toHaveAttribute('data-moves', '1');
    expect(stage()).toHaveAttribute('data-map', 'closed');
  });

  it('never changes the plan’s start or the level on a plain look ("Start planning" only)', () => {
    const before = structuredClone(SYNTHETIC);
    render(<PlayScreen {...routeProps()} />);
    openMap();
    const fresh = (startPlan(ctx) as { value: Plan }).value.beta.steps[0];
    expect(JSON.parse(stage().dataset.assignment!)).toEqual(fresh);
    fireEvent.click(screen.getByRole('button', { name: 'Start planning' }));
    expect(SYNTHETIC).toEqual(before);
    expect(stage()).not.toHaveAttribute('data-edits');
  });
});
