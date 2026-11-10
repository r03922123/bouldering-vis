import { idle, step, STRIDE_MS, WALK_SPEED, type WalkState } from './walk';

const BOUNDS: [number, number] = [0, 400];
const at = (x: number): WalkState => idle(x, 1);

describe('step (SPEC-gym-hub G5, AC 4)', () => {
  it('walks towards a tapped spot at WALK_SPEED', () => {
    const s = step(at(100), { kind: 'goto', x: 200 }, 500, BOUNDS);
    expect(WALK_SPEED).toBe(0.072);
    expect(s.x).toBeCloseTo(100 + 0.072 * 500, 9);
    expect(s.targetX).toBe(200);
  });

  it('stops exactly on the target, without overshooting', () => {
    let s = step(at(100), { kind: 'goto', x: 110 }, 100, BOUNDS);
    s = step(s, null, 100, BOUNDS);
    s = step(s, null, 100, BOUNDS);
    expect(s.x).toBe(110);
    expect(s.targetX).toBeNull();
  });

  it('turns to face the way it walks', () => {
    expect(step(at(100), { kind: 'goto', x: 50 }, 16, BOUNDS).facing).toBe(-1);
    expect(step(idle(100, -1), { kind: 'goto', x: 150 }, 16, BOUNDS).facing).toBe(1);
  });

  it('never leaves the bounds', () => {
    expect(step(at(10), { kind: 'goto', x: -50 }, 10_000, BOUNDS).x).toBe(0);
    expect(step(at(390), { kind: 'hold', dir: 1 }, 10_000, BOUNDS).x).toBe(400);
  });

  it('walks while a direction key is held, and stops when it is let go', () => {
    const held = step(at(100), { kind: 'hold', dir: -1 }, 100, BOUNDS);
    expect(held.x).toBeCloseTo(100 - 7.2, 9);
    const let_go = step(held, { kind: 'hold', dir: 0 }, 100, BOUNDS);
    expect(let_go.x).toBe(held.x);
    expect(let_go.frame).toBe(0);
  });

  it('lets a held key take over from a tapped target', () => {
    const tapped = step(at(100), { kind: 'goto', x: 300 }, 16, BOUNDS);
    const held = step(tapped, { kind: 'hold', dir: -1 }, 16, BOUNDS);
    expect(held.targetX).toBeNull();
    expect(held.facing).toBe(-1);
  });

  it('keeps walking to a tapped target when no key is held', () => {
    const tapped = step(at(100), { kind: 'goto', x: 300 }, 16, BOUNDS);
    expect(step(tapped, { kind: 'hold', dir: 0 }, 16, BOUNDS).targetX).toBe(300);
  });

  it('advances the 4-frame walk cycle every 125 ms while moving, and rests on frame 0', () => {
    expect(STRIDE_MS).toBe(125);
    let s = step(at(0), { kind: 'goto', x: 400 }, 0, BOUNDS);
    const frames: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = step(s, null, 125, BOUNDS);
      frames.push(s.frame);
    }
    expect(frames).toEqual([1, 2, 3, 0, 1, 2]);
    expect(step(s, { kind: 'goto', x: s.x }, 16, BOUNDS).frame).toBe(0);
  });

  it('is deterministic: the same inputs give the same states', () => {
    const run = () => {
      let s = at(200);
      const out: WalkState[] = [];
      for (let i = 0; i < 100; i++) {
        const input =
          i === 0
            ? ({ kind: 'goto', x: 20 } as const)
            : i === 40
              ? ({ kind: 'hold', dir: 1 } as const)
              : null;
        s = step(s, input, 16 + (i % 3), BOUNDS);
        out.push(s);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('does not mutate the state it is given', () => {
    const s = at(100);
    const copy = { ...s };
    step(s, { kind: 'goto', x: 200 }, 100, BOUNDS);
    expect(s).toEqual(copy);
  });
});
