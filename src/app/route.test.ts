import { parseRoute, routeHash } from './route';

describe('parseRoute', () => {
  // SPEC-launch-wall-2 R3: the app opens straight into Wall 2; the gym stays at #/gym.
  const front = { name: 'wall', id: 'wall-b' };

  it('opens Wall 2 for an empty hash or #/', () => {
    expect(parseRoute('')).toEqual(front);
    expect(parseRoute('#')).toEqual(front);
    expect(parseRoute('#/')).toEqual(front);
  });

  it('opens the gym for #/gym', () => {
    expect(parseRoute('#/gym')).toEqual({ name: 'gym' });
  });

  it('opens the Setting Room for #/studio', () => {
    expect(parseRoute('#/studio')).toEqual({ name: 'studio' });
  });

  it('opens a wall for #/wall/<id>: a sample, or your own photo', () => {
    expect(parseRoute('#/wall/wall-b')).toEqual({ name: 'wall', id: 'wall-b' });
    expect(parseRoute('#/wall/mine')).toEqual({ name: 'wall', id: 'mine' });
  });

  it('opens Wall 2 for Wall 1, which no longer ships (SPEC-launch-wall-2 R1, SC 2)', () => {
    expect(parseRoute('#/wall/wall-a')).toEqual(front);
  });

  it('opens Wall 2 for a wall it doesn’t know (review finding 5)', () => {
    expect(parseRoute('#/wall/foo')).toEqual(front);
    expect(parseRoute('#/wall/my%20wall')).toEqual(front);
  });

  it('falls back to Wall 2 for anything it does not know', () => {
    expect(parseRoute('#/nowhere')).toEqual(front);
    expect(parseRoute('#/wall/')).toEqual(front);
    expect(parseRoute('#/studio/extra')).toEqual(front);
    expect(parseRoute('#/gym/extra')).toEqual(front);
    expect(parseRoute('#/wall/%E0%A4%A')).toEqual(front);
  });
});

describe('routeHash', () => {
  it('round-trips every route through parseRoute', () => {
    for (const route of [
      { name: 'gym' },
      { name: 'studio' },
      { name: 'wall', id: 'wall-b' },
      { name: 'wall', id: 'mine' },
    ] as const) {
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });

  it('writes the gym as #/gym', () => {
    expect(routeHash({ name: 'gym' })).toBe('#/gym');
  });
});
