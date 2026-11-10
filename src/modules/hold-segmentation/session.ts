import type { MlClient } from '../../workers/client';
import type { Point } from '../../workers/protocol';
import type { WorkingImage } from '../image-input';
import type { HoldMask } from './types';

export type SelectResult =
  | { kind: 'added'; hold: HoldMask }
  | { kind: 'removed'; id: string }
  | { kind: 'miss' }
  /** The current view can't add holds (only Original can). */
  | { kind: 'blocked' };

export function holdAt(holds: readonly HoldMask[], p: Point, width: number): HoldMask | null {
  const i = Math.round(p.y) * width + Math.round(p.x);
  return holds.find((h) => h.mask[i] === 1) ?? null;
}

/** The highest decode sequence received per client and image: tells the worker which holds it may forget. */
const seenByClient = new WeakMap<MlClient, Map<string, number>>();
function seenFor(client: MlClient): Map<string, number> {
  let m = seenByClient.get(client);
  if (!m) seenByClient.set(client, (m = new Map()));
  return m;
}

/**
 * One tap: deselect a selected hold, or ask the worker for a new one.
 * The worker picks, cleans and measures the mask (nothing pixel-sized runs here), and it keeps
 * every hold it returned, so a tap that was in flight while another hold landed still never
 * overlaps it.
 */
export async function selectAt(
  client: MlClient,
  image: Pick<WorkingImage, 'id' | 'width' | 'height'>,
  getHolds: () => readonly HoldMask[],
  point: Point,
  { allowAdd = true }: { allowAdd?: boolean } = {},
): Promise<SelectResult> {
  const { width: w, height: h } = image;
  const hit = holdAt(getHolds(), point, w);
  if (hit) return { kind: 'removed', id: hit.id };
  if (!allowAdd) return { kind: 'blocked' };

  const p = {
    x: Math.min(w - 1, Math.max(0, Math.round(point.x))),
    y: Math.min(h - 1, Math.max(0, Math.round(point.y))),
  };
  const seen = seenFor(client);
  const res = await client.request({
    type: 'sam:decode',
    imageId: image.id,
    point: p,
    selected: getHolds().map((hold) => hold.id),
    seen: seen.get(image.id) ?? 0,
  });
  seen.set(image.id, Math.max(seen.get(image.id) ?? 0, res.seq));
  if (!res.hold) return { kind: 'miss' };

  return {
    kind: 'added',
    hold: {
      ...res.hold,
      imageId: image.id,
      role: 'route',
      order: getHolds().reduce((max, hd) => Math.max(max, hd.order + 1), 0),
    },
  };
}
