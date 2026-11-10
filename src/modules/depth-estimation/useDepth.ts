import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';

/** Runs depth once per image, after the analysis trigger (SPEC-depth-estimation › When it runs). */
export function useDepth(client: MlClient): void {
  const image = useAppStore((s) => s.image);
  const triggered = useAppStore((s) => s.analysisTriggered);
  const attempt = useAppStore((s) => s.depthAttempt);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!image || !triggered) return;
    const key = `${image.id}#${attempt}`;
    if (requested.current === key) return;
    requested.current = key;
    const store = useAppStore.getState;
    const isCurrent = () => store().image?.id === image.id;

    store().setDepthStatus({ state: 'running' });
    client
      .request({ type: 'depth:run', imageId: image.id, pixels: image.pixels })
      .then((r) => {
        if (isCurrent()) store().setDepth({ ...r, imageId: r.imageId });
      })
      .catch((err: unknown) => {
        if (isCurrent()) {
          store().setDepthStatus({
            state: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
  }, [client, image, triggered, attempt]);
}
