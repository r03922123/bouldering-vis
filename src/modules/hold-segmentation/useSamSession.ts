import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';

/** Embeds each new image once (in the background) and tracks the result in the store. */
export function useSamSession(client: MlClient): { retry: () => void } {
  const image = useAppStore((s) => s.image);
  const setSamStatus = useAppStore((s) => s.setSamStatus);
  const [attempt, setAttempt] = useState(0);
  // Effects can run twice for the same inputs (StrictMode, remounts). A second embed would
  // queue in the worker ahead of the user's first tap, so request once per image + attempt.
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!image) return;
    const key = `${image.id}#${attempt}`;
    if (requested.current === key) return;
    requested.current = key;
    // The canvas remounts when the user comes back from the 3D view. The store already knows this
    // image is embedded (or being embedded): asking again would queue behind depth and hold types.
    const status = useAppStore.getState().samStatus;
    if (attempt === 0 && (status === 'ready' || status === 'preparing')) return;
    const isCurrent = () => useAppStore.getState().image?.id === image.id;
    setSamStatus('preparing');
    client
      .request({ type: 'sam:embed', imageId: image.id, pixels: image.pixels })
      .then(() => isCurrent() && setSamStatus('ready'))
      .catch(() => isCurrent() && setSamStatus('error'));
  }, [client, image, attempt, setSamStatus]);

  return { retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
