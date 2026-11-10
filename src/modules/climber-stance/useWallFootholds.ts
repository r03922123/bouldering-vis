import { useEffect } from 'react';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';

/**
 * Asks the worker for the wall footholds once per image, as soon as the climber is shown, whatever
 * the view (Amendment 2026-10-31 (b), rule 1). Not on the analysis trigger: the worker can't
 * interrupt a running job, and segmentWall during tapping would delay sam:decode.
 */
export function useWallFootholds(client: MlClient): void {
  const image = useAppStore((s) => s.image);
  const show = useAppStore((s) => s.showClimber);

  useEffect(() => {
    if (!image || !show) return;
    // The status belongs to the current image (setImage resets it). Read here, not subscribed:
    // an error waits for a new image or for the climber to be turned off and on, never a loop.
    const { wallFootholdsStatus, setWallFootholdsStatus } = useAppStore.getState();
    if (wallFootholdsStatus === 'pending' || wallFootholdsStatus === 'ready') return;
    // Pending in the same effect, so the stance debounce never fires on 'idle' with smears.
    setWallFootholdsStatus('pending');
    const isCurrent = () => useAppStore.getState().image?.id === image.id;
    client
      .request({ type: 'wall:footholds', imageId: image.id, pixels: image.pixels })
      .then((r) => {
        if (isCurrent() && r.imageId === image.id)
          useAppStore.getState().setWallFootholds(r.footholds);
      })
      .catch(() => {
        // Without footholds the climber still stands, on smears (rule 14).
        if (isCurrent()) useAppStore.getState().setWallFootholdsStatus('error');
      });
  }, [client, image, show]);
}
