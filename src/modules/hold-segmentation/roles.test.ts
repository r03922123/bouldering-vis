import { badgeColor, badgeLabels, routeStatus, setRole } from './roles';
import type { HoldMask, HoldRole } from './types';

const hold = (id: string, role: HoldRole, order: number) => ({ id, role, order }) as HoldMask;
const roles = (hs: HoldMask[]) => Object.fromEntries(hs.map((h) => [h.id, h.role]));

describe('routeStatus', () => {
  it('is incomplete without a start or a finish', () => {
    expect(routeStatus([hold('a', 'route', 0)])).toEqual({
      startCount: 0,
      finishCount: 0,
      complete: false,
    });
  });

  it('is complete with 1 start and 1 finish', () => {
    expect(routeStatus([hold('a', 'start', 0), hold('b', 'finish', 1)]).complete).toBe(true);
  });

  it('is complete with 2 starts and 1 finish', () => {
    const s = routeStatus([hold('a', 'start', 0), hold('b', 'start', 1), hold('c', 'finish', 2)]);
    expect(s).toEqual({ startCount: 2, finishCount: 1, complete: true });
  });
});

describe('setRole', () => {
  it('tags a hold as start', () => {
    const r = setRole([hold('a', 'route', 0)], 'a', 'start');
    expect(roles(r as HoldMask[])).toEqual({ a: 'start' });
  });

  it('rejects a third start', () => {
    const hs = [hold('a', 'start', 0), hold('b', 'start', 1), hold('c', 'route', 2)];
    expect(setRole(hs, 'c', 'start')).toEqual({ error: 'max-start' });
  });

  it('allows re-tagging one of the two starts as start (no change)', () => {
    const hs = [hold('a', 'start', 0), hold('b', 'start', 1)];
    expect(roles(setRole(hs, 'a', 'start') as HoldMask[])).toEqual({ a: 'start', b: 'start' });
  });

  it('moves finish to the new hold; the old finish becomes route', () => {
    const hs = [hold('a', 'finish', 0), hold('b', 'route', 1)];
    expect(roles(setRole(hs, 'b', 'finish') as HoldMask[])).toEqual({ a: 'route', b: 'finish' });
  });

  it('sets a hold back to route', () => {
    const hs = [hold('a', 'start', 0)];
    expect(roles(setRole(hs, 'a', 'route') as HoldMask[])).toEqual({ a: 'route' });
  });

  it('does not mutate the input', () => {
    const hs = [hold('a', 'route', 0)];
    setRole(hs, 'a', 'start');
    expect(hs[0]!.role).toBe('route');
  });
});

describe('badgeLabels', () => {
  it('numbers every hold by selection order and adds S/F for start and finish', () => {
    const labels = badgeLabels([
      hold('a', 'start', 0),
      hold('b', 'route', 1),
      hold('c', 'start', 2),
      hold('d', 'finish', 3),
    ]);
    expect(Object.fromEntries(labels)).toEqual({ a: '1S', b: '2', c: '3S', d: '4F' });
  });

  it('numbers by order even when the array is out of order, matching the hold list', () => {
    const labels = badgeLabels([hold('late', 'route', 7), hold('early', 'finish', 2)]);
    expect(Object.fromEntries(labels)).toEqual({ early: '1F', late: '2' });
  });

  it('renumbers after a removal', () => {
    const labels = badgeLabels([hold('a', 'route', 0), hold('c', 'route', 2)]);
    expect(Object.fromEntries(labels)).toEqual({ a: '1', c: '2' });
  });
});

describe('badgeColor', () => {
  it('is green for starts, red for the finish and slate otherwise', () => {
    expect(badgeColor('1S')).toBe('#16a34a');
    expect(badgeColor('4F')).toBe('#e11d48');
    expect(badgeColor('2')).toBe('#475569');
  });
});
