import { useMemo } from 'react';
import { useAppStore } from '../../store/app';
import { holdGeometry, type HoldGeometry } from './geometry';

/** Geometry for every selected hold once the image's depth map is ready. */
export function useHoldGeometry(): Map<string, HoldGeometry> {
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  const depth = useAppStore((s) => s.depth);
  return useMemo(() => {
    const out = new Map<string, HoldGeometry>();
    if (!image || !depth || depth.imageId !== image.id) return out;
    for (const h of holds) out.set(h.id, holdGeometry(h, holds, depth));
    return out;
  }, [image, holds, depth]);
}
