import { contactsOf } from './contacts';
import {
  ladder,
  ladderHolds,
  ladderStart,
  LADDER_PHOTO,
  moveTo,
  routeHold,
  step,
} from './fixtures';
import { makeContext } from './context';
import { validateShape } from './shape';
import { defaultStart } from './start';
import type { BetaStep, MoveContext, ShapeCheck } from './types';

// Solver-backed checks are slow on a loaded machine; correctness, not speed, is tested here.
vi.setConfig({ testTimeout: 60_000 });

const ids = () => crypto.randomUUID();
const ctx = ladder({ ids, wallFeet: [{ id: 'wf:300:1500', point: [300, 1500] }] });
const start = ladderStart(ctx);
const id = (label: string) => step(ctx, { lh: label }).lh;
const rejected = (c: ShapeCheck) => (c.ok ? null : { reason: c.reason, text: c.text });

describe('validateShape (AC 2)', () => {
  it.each<[string, () => ShapeCheck, string, string]>([
    [
      'no limb changed',
      () => validateShape(start, { ...start }, ctx),
      'no-change',
      'Already there',
    ],
    [
      'three limbs',
      () => validateShape(start, moveTo(start, { lh: id('3'), rh: id('4'), lf: id('10') }), ctx),
      'too-many-limbs',
      'Move one or two limbs at a time',
    ],
    [
      'four limbs',
      () => validateShape(start, { lh: id('3'), rh: id('4'), lf: id('10'), rf: id('11') }, ctx),
      'too-many-limbs',
      'Move one or two limbs at a time',
    ],
    [
      'a hold that isn’t on the route',
      () => validateShape(start, moveTo(start, { rh: 'no-such-hold' }), ctx),
      'unknown-target',
      'That isn’t on this route',
    ],
    [
      'an unlisted wall foothold',
      () => validateShape(start, moveTo(start, { lf: 'wf:1:1' }), ctx),
      'unknown-target',
      'That isn’t on this route',
    ],
    [
      'a malformed smear',
      () => validateShape(start, moveTo(start, { lf: 'smear:1.5:2' }), ctx),
      'unknown-target',
      'That isn’t on this route',
    ],
    [
      'climber-stance’s wall smear',
      () => validateShape(start, moveTo(start, { lf: 'wall' }), ctx),
      'unknown-target',
      'That isn’t on this route',
    ],
    [
      'a smear off the photo',
      () => validateShape(start, moveTo(start, { lf: 'smear:400:2000' }), ctx),
      'off-photo',
      'That’s off the photo',
    ],
    [
      'a hand on a smear',
      () => validateShape(start, moveTo(start, { rh: 'smear:600:900' }), ctx),
      'hand-needs-hold',
      'Hands need a hold from the route',
    ],
    [
      'a hand on a wall foothold',
      () => validateShape(start, moveTo(start, { rh: 'wf:300:1500' }), ctx),
      'hand-needs-hold',
      'Hands need a hold from the route',
    ],
    [
      'a foot on the finish',
      () => validateShape(start, moveTo(start, { lf: id('7F') }), ctx),
      'finish-hands-only',
      'The finish is for hands',
    ],
    [
      'a foot on a wall foothold, marked feet',
      () => {
        const marked = ladder({
          holds: ctx.holds,
          rules: { feet: 'marked' },
          wallFeet: ctx.wallFeet,
        });
        return validateShape(start, moveTo(start, { lf: 'wf:300:1500' }), marked);
      },
      'feet-marked-only',
      'Feet on marked holds only on this route',
    ],
    [
      'a foot on the hold a hand is on',
      () => validateShape(start, moveTo(start, { lf: start.rh }), ctx),
      'hand-foot-share',
      'A hand and a foot can’t share a hold',
    ],
    [
      'a hand onto a foot’s hold',
      () => validateShape(start, moveTo(start, { rh: start.rf }), ctx),
      'hand-foot-share',
      'A hand and a foot can’t share a hold',
    ],
  ])('%s', (_, check, reason, text) => {
    expect(rejected(check())).toEqual({ reason, text });
  });

  it('accepts a legal one-limb move and returns it', () => {
    const c = validateShape(start, moveTo(start, { rh: id('4') }), ctx);
    expect(c).toMatchObject({ ok: true, move: { kind: 'hand', limbs: ['rh'] } });
  });

  it('accepts a wall foothold and a smear on the photo for a foot', () => {
    expect(validateShape(start, moveTo(start, { lf: 'wf:300:1500' }), ctx).ok).toBe(true);
    expect(validateShape(start, moveTo(start, { rf: 'smear:700:1999' }), ctx).ok).toBe(true);
  });

  it('lets two feet share a hold, and two hands match', () => {
    expect(validateShape(start, moveTo(start, { lf: start.rf }), ctx).ok).toBe(true);
    expect(validateShape(start, moveTo(start, { lh: start.rh }), ctx).ok).toBe(true);
  });

  it('applies the first rule that fires', () => {
    // Three limbs, one of them onto an unknown hold: the limb count comes first.
    const c = validateShape(start, moveTo(start, { lh: 'nope', rh: id('4'), lf: id('10') }), ctx);
    expect(rejected(c)?.reason).toBe('too-many-limbs');
  });
});

describe('start rules (AC 3)', () => {
  const START_TEXT = 'Start with your hands on the start holds';
  const check = (c: MoveContext, s: BetaStep) => rejected(validateShape(null, s, c));

  it('with two start holds, both need a hand', () => {
    expect(check(ctx, step(ctx, { lh: '1S', rh: '2S' }))).toBeNull();
    expect(check(ctx, step(ctx, { lh: '2S', rh: '1S' }))).toBeNull();
    expect(check(ctx, step(ctx, { lh: '1S', rh: '3' }))).toEqual({
      reason: 'start-hands',
      text: START_TEXT,
    });
    expect(check(ctx, step(ctx, { lh: '1S', rh: '1S' }))?.reason).toBe('start-hands');
  });

  it('with one start hold: split or matched, never the finish or off', () => {
    const one = ladder({
      holds: ladderHolds(ids).map((h) => (h.label === '2S' ? { ...h, role: 'route' as const } : h)),
    });
    expect(check(one, step(one, { lh: '3', rh: '1S' }))).toBeNull();
    expect(check(one, step(one, { lh: '1S', rh: '1S' }))).toBeNull();
    expect(check(one, step(one, { lh: '7F', rh: '1S' }))?.reason).toBe('start-hands');
    expect(check(one, step(one, { lh: '1S', rh: null }))?.reason).toBe('start-hands');
    expect(check(one, step(one, { lh: '3', rh: '4' }))?.reason).toBe('start-hands');
  });

  it('lets the feet start on any foot target, or off', () => {
    expect(check(ctx, step(ctx, { lh: '1S', rh: '2S', lf: 'wf:300:1500', rf: null }))).toBeNull();
    expect(check(ctx, step(ctx, { lh: '1S', rh: '2S', lf: 'smear:400:1600' }))).toBeNull();
  });

  it('checks the start’s targets too', () => {
    expect(check(ctx, step(ctx, { lh: '1S', rh: '2S', lf: '7F' }))?.reason).toBe(
      'finish-hands-only',
    );
  });

  it('gives no move for a start', () => {
    expect(validateShape(null, start, ctx)).toEqual({ ok: true, move: null });
  });
});

describe('defaultStart', () => {
  const handsOnly = () =>
    ladder({
      holds: ladderHolds(ids).filter((h) =>
        ['1S', '2S', '3', '4', '5', '6', '7F'].includes(h.label),
      ),
    });

  it('stands on the ladder’s footholds', () => {
    expect(defaultStart(ctx)).toEqual(ladderStart(ctx));
  });

  it('never returns climber-stance’s wall smear, and its start passes the shape rules', () => {
    const c = handsOnly();
    const s = defaultStart(c);
    expect(Object.values(s)).not.toContain('wall');
    expect(s.lf).toMatch(/^smear:\d+:\d+$/);
    expect(validateShape(null, s, c)).toEqual({ ok: true, move: null });
  });

  // AC 4: smears carry their own point, so a kept smear never slides when a hand moves.
  it('keeps both smear points fixed while the hands move (AC 4)', () => {
    const c = handsOnly();
    const s0 = defaultStart(c);
    const s1 = moveTo(s0, { rh: step(c, { rh: '4' }).rh });
    const s2 = moveTo(s1, { lh: step(c, { lh: '3' }).lh });
    const feet = (s: BetaStep) => {
      const k = contactsOf(s, c);
      return [k.lf!.point, k.rf!.point];
    };
    expect(feet(s1)).toEqual(feet(s0));
    expect(feet(s2)).toEqual(feet(s0));
  });

  it('dangles the feet on a steep overhang with nothing to stand on', () => {
    const c = ladder({ holds: handsOnly().holds, wallAngleDeg: 35 });
    expect(defaultStart(c)).toMatchObject({ lf: null, rf: null });
  });

  it('stands on a wall foothold when one is where a foot goes', () => {
    const c = ladder({
      holds: handsOnly().holds,
      wallFeet: [
        { id: 'wf:290:1580', point: [290, 1580] },
        { id: 'wf:710:1580', point: [710, 1580] },
      ],
    });
    expect(defaultStart(c)).toMatchObject({ lf: 'wf:290:1580', rf: 'wf:710:1580' });
  });

  it('ignores wall footholds when feet are on marked holds only', () => {
    const c = ladder({
      holds: handsOnly().holds,
      rules: { feet: 'marked' },
      wallFeet: [{ id: 'wf:290:1580', point: [290, 1580] }],
    });
    expect(defaultStart(c).lf).toMatch(/^smear:/);
  });

  // AC 6: start holds near the photo's bottom keep the smears on the photo.
  it('keeps every contact on the photo when the start is near the bottom (AC 6)', () => {
    const y = LADDER_PHOTO.height - 100;
    const c = makeContext({
      holds: [
        routeHold(0, '1S', 400, y, 'start', ids()),
        routeHold(1, '2S', 600, y, 'start', ids()),
        routeHold(2, '3F', 500, y - 600, 'finish', ids()),
      ],
      wallFeet: [],
      height: 1000,
      wallAngleDeg: 0,
      photo: LADDER_PHOTO,
    });
    const s = defaultStart(c);
    expect(validateShape(null, s, c).ok).toBe(true);
    for (const contact of Object.values(contactsOf(s, c))) {
      const [x, py] = contact!.point;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(LADDER_PHOTO.width);
      expect(py).toBeLessThan(LADDER_PHOTO.height);
    }
  });
});
