import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/app';
import type { MlClient } from '../workers/client';

/**
 * Records model download progress, and once the hold detector is ready, downloads the depth and
 * hold-type models in the background (lowest worker priority) so they're ready when needed.
 */
export function useModelPreload(client: MlClient): void {
  const samReady = useAppStore((s) => s.samStatus === 'ready');
  const imageId = useAppStore((s) => s.image?.id ?? null);
  const done = useRef(false);

  useEffect(() => client.onProgress((p) => useAppStore.getState().recordProgress(p)), [client]);

  useEffect(() => {
    if (!samReady || !imageId || done.current) return;
    done.current = true; // the models are cached for the session, so once is enough
    client.request({ type: 'models:prefetch', imageId }).catch(() => {
      done.current = false; // a stale image or a failed download: try again next time
    });
  }, [client, samReady, imageId]);
}
