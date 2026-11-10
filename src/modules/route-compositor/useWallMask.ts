import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';

/** Asks the worker for the hold-vs-wall mask the first time Route or 3D view opens for an image. */
export function useWallMask(client: MlClient): Uint8Array | null {
  const image = useAppStore((s) => s.image);
  const inRoute = useAppStore((s) => s.view === 'route' || s.view === '3d');
  const wallMask = useAppStore((s) => s.wallMask);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!image || !inRoute || requested.current === image.id) return;
    requested.current = image.id;
    client
      .request({ type: 'wall:segment', imageId: image.id, pixels: image.pixels })
      .then((r) => {
        if (useAppStore.getState().image?.id === r.imageId)
          useAppStore.getState().setWallMask(r.mask);
      })
      .catch(() => {
        // Without a wall mask, other holds take the wall color; Route view still works.
        requested.current = null;
      });
  }, [client, image, inRoute]);

  return wallMask;
}
