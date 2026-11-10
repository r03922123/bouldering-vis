import { renderHook } from '@testing-library/react';
import type { HoldMask } from '../modules/hold-segmentation';
import { forceWithOverride, type HoldGeometry, type PullOverride } from '../modules/hold-geometry';
import { useAppStore } from '../store/app';
import { useRouteHolds } from './useRouteHolds';

// Pins the Studio's derivation (it moved out of App.tsx unchanged; SPEC-play-shell S3), so Play and
// the Studio can never disagree about a hold's type or force.

const geometry = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock('../modules/hold-geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/hold-geometry')>()),
  useHoldGeometry: () => geometry.map,
}));

const hold = (id: string, x: number): HoldMask =>
  ({ id, centroid: { x, y: 100 }, bbox: { x, y: 100, w: 1, h: 1 }, role: 'route' }) as HoldMask;

const geo = (holdId: string): HoldGeometry => ({
  holdId,
  normal: [0, -0.6, 0.8],
  wallNormal: [0, 0, 1],
  consistency: 0.9,
  orientation: 'up' as HoldGeometry['orientation'],
  facing: 'up' as HoldGeometry['facing'],
});

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  geometry.map = new Map([
    ['a', geo('a')],
    ['b', geo('b')],
  ]);
  useAppStore.setState({
    holds: [hold('a', 100), hold('b', 300), hold('c', 500)],
    classifications: {
      a: { holdId: 'a', top: [{ type: 'jug', prob: 0.9 }] },
      b: { holdId: 'b', top: [{ type: 'crimp', prob: 0.8 }] },
    },
    classOverrides: { b: 'sloper' },
  });
});

describe('useRouteHolds', () => {
  it("takes each hold's type from CLIP, the user's override winning, null when unknown", () => {
    const { result } = renderHook(() => useRouteHolds());
    expect([...result.current.types]).toEqual([
      ['a', 'jug'],
      ['b', 'sloper'],
      ['c', null],
    ]);
  });

  it('gives a force per hold with geometry, sidepulls pulling toward the mean hold x', () => {
    useAppStore.setState({ pullOverrides: {} });
    const { result } = renderHook(() => useRouteHolds());
    const bodyX = (100 + 300 + 500) / 3;
    expect([...result.current.forces.keys()]).toEqual(['a', 'b']);
    expect(result.current.forces.get('a')).toEqual(forceWithOverride(geo('a'), 'jug', null, bodyX));
    expect(result.current.forces.get('b')).toEqual(
      forceWithOverride(geo('b'), 'sloper', null, bodyX),
    );
  });

  it("passes the user's drawn pull through", () => {
    const pull: PullOverride = 'up';
    useAppStore.setState({ pullOverrides: { a: pull } });
    const { result } = renderHook(() => useRouteHolds());
    const bodyX = (100 + 300 + 500) / 3;
    expect(result.current.forces.get('a')).toEqual(forceWithOverride(geo('a'), 'jug', pull, bodyX));
  });

  it("maps each hold with geometry to its wall's normal", () => {
    const { result } = renderHook(() => useRouteHolds());
    expect([...result.current.wallNormals]).toEqual([
      ['a', [0, 0, 1]],
      ['b', [0, 0, 1]],
    ]);
    expect(result.current.geometry).toBe(geometry.map);
  });
});
