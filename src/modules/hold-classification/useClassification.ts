import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';
import { applySizePrior, cropHold } from './classify';
import { rankEmbedding } from './rank';
import { SHIPPED_PROBE } from './shippedProbe';

/** After the analysis trigger, classifies each selected hold once (and new holds as they come). */
export function useClassification(client: MlClient): void {
  const image = useAppStore((s) => s.image);
  const holds = useAppStore((s) => s.holds);
  const triggered = useAppStore((s) => s.analysisTriggered);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!image || !triggered) return;
    const store = useAppStore.getState;
    for (const hold of holds) {
      if (requested.current.has(hold.id) || store().classifications[hold.id]) continue;
      requested.current.add(hold.id);
      client
        .request({
          type: 'clip:embed',
          imageId: image.id,
          holdId: hold.id,
          crop: cropHold(image.pixels, hold),
        })
        .then((r) => {
          if (store().image?.id !== image.id) return;
          const ranked = rankEmbedding(r.embedding, SHIPPED_PROBE);
          const share = hold.area / (image.width * image.height);
          store().setClassification({
            holdId: r.holdId,
            top: applySizePrior(ranked, share).slice(0, 3),
          });
        })
        .catch(() => requested.current.delete(hold.id)); // retried on the next change
    }
  }, [client, image, holds, triggered]);
}
