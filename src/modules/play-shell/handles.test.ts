import { annotateHolds, EDIT_TIP, handlesOf, type Annotation } from './annotate';

// PR #15 review 3: in E1 edit mode the 44 px head handle sits on the drawn arrow's tip, wherever
// the box or the badges put it, and the base handle on the grip point.

const view = { scale: 1, tx: 0, ty: 0 };
const hold = {
  id: 'h',
  label: '1',
  base: { x: 100, y: 100 },
  dir: [0, 1, 0] as [number, number, number],
  user: false,
};
const tipOf = (a: Annotation) => (a.kind === 'arrow' ? a.tip : null);

it('puts the head handle on the tip for a big box (the tip beyond EDIT_TIP)', () => {
  const box = { x: 40, y: 40, w: 120, h: 120 };
  const a = annotateHolds([hold], view, { boxes: () => box, badges: [], edit: true })
    .annotations[0]!;
  const tip = tipOf(a)!;
  expect(tip.y).toBeGreaterThan(160);
  const h = handlesOf(a, hold, view);
  expect(h.head.x).toBeCloseTo(tip.x, 5);
  expect(h.head.y).toBeCloseTo(tip.y, 5);
  expect(h.base).toEqual({ x: 100, y: 100 });
});

it('puts the head handle on the tip of an arrow a badge cuts short', () => {
  const box = { x: 95, y: 95, w: 10, h: 10 };
  const badges = [{ x: 100, y: 145, r: 12 }];
  const a = annotateHolds([hold], view, { boxes: () => box, badges, edit: true }).annotations[0]!;
  const tip = tipOf(a)!;
  // Cut short by the badge: well before an uncut edit arrow's EDIT_TIP (y 156).
  expect(tip.y).toBeLessThan(100 + EDIT_TIP - 10);
  const h = handlesOf(a, hold, view);
  expect(h.head.y).toBeCloseTo(tip.y, 5);
});

it('keeps a hold with no drawn arrow’s head handle EDIT_TIP from its grip, along its pull', () => {
  const none = { ...hold, dir: null };
  const a = annotateHolds([none], view, {
    boxes: () => ({ x: 95, y: 95, w: 10, h: 10 }),
    badges: [],
    edit: true,
  }).annotations[0]!;
  expect(handlesOf(a, none, view).head).toEqual({ x: 100, y: 100 + EDIT_TIP });
});
