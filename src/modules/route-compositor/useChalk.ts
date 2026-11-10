import { useMemo } from 'react';
import { useAppStore } from '../../store/app';
import { chalkHatch, detectChalk, type ChalkInfo } from './chalk';

// Keyed by mask: a role change copies the hold but keeps its mask, so chalk isn't recomputed.
const cache = new WeakMap<Uint8Array, ChalkInfo>();

/** Chalk info for every selected hold, by hold id. */
export function useChalk(): Map<string, ChalkInfo> {
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  return useMemo(() => {
    const out = new Map<string, ChalkInfo>();
    if (!image) return out;
    for (const h of holds) {
      let info = cache.get(h.mask);
      if (!info) {
        info = detectChalk(image.pixels, h);
        cache.set(h.mask, info);
      }
      out.set(h.id, info);
    }
    return out;
  }, [image, holds]);
}

/** The cyan hatch layer for the canvas, or null when Show chalk is off. */
export function useChalkOverlay(chalk: Map<string, ChalkInfo>): ImageData | null {
  const image = useAppStore((s) => s.image);
  const show = useAppStore((s) => s.showChalk);
  return useMemo(() => {
    if (!image || !show || !chalk.size) return null;
    return chalkHatch([...chalk.values()], image.width, image.height);
  }, [image, show, chalk]);
}
