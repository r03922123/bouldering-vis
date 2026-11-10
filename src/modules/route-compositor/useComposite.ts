import { useMemo } from 'react';
import { useAppStore } from '../../store/app';
import { compositeRoute } from './composite';

/** The Route view image, built only while Route or 3D view (Route colors) is showing. */
export function useComposite(otherHoldsMask: Uint8Array | null): ImageData | null {
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  const showOtherHolds = useAppStore((s) => s.showOtherHolds);
  const active = useAppStore((s) => s.view === 'route' || s.view === '3d');
  return useMemo(() => {
    if (!image || !active) return null;
    const others = otherHoldsMask ?? new Uint8Array(image.width * image.height);
    return compositeRoute(image.pixels, holds, others, { showOtherHolds });
  }, [image, holds, showOtherHolds, otherHoldsMask, active]);
}
