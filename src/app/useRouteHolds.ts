import { useMemo } from 'react';
import { effectiveClassification } from '../modules/hold-classification';
import { forceWithOverride, type Force, useHoldGeometry } from '../modules/hold-geometry';
import { useAppStore } from '../store/app';

/**
 * Each route hold's effective type, force and wall normal, as the Studio derives them. Shared by
 * the Studio and Play (SPEC-play-shell S3), so the two can never disagree about a hold.
 */
export function useRouteHolds() {
  const holds = useAppStore((s) => s.holds);
  const geometry = useHoldGeometry();
  const classifications = useAppStore((s) => s.classifications);
  const overrides = useAppStore((s) => s.classOverrides);
  // Effective type per hold (the user's override wins): drives the force rule.
  const types = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const h of holds) {
      const c = classifications[h.id];
      const override = overrides[h.id] ?? null;
      m.set(h.id, c ? effectiveClassification(c, override).effectiveType : override);
    }
    return m;
  }, [holds, classifications, overrides]);
  // The one direction per hold: the recommended force (normal + effective type).
  const pulls = useAppStore((s) => s.pullOverrides);
  const forces = useMemo(() => {
    const m = new Map<string, Force>();
    // The climber's body is roughly over the middle of the route: sidepulls pull toward it.
    const bodyX = holds.length
      ? holds.reduce((sum, h) => sum + h.centroid.x, 0) / holds.length
      : undefined;
    for (const [id, g] of geometry) {
      m.set(id, forceWithOverride(g, types.get(id) ?? null, pulls[id] ?? null, bodyX));
    }
    return m;
  }, [geometry, types, pulls, holds]);
  const wallNormals = useMemo(
    () => new Map([...geometry].map(([id, g]) => [id, g.wallNormal] as const)),
    [geometry],
  );
  return { geometry, types, forces, wallNormals };
}
