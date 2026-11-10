import type { DecodedHold } from '../../workers/protocol';

export type HoldRole = 'start' | 'route' | 'finish';

/** A selected hold: what the worker isolated (DecodedHold) plus the app's bookkeeping. */
export interface HoldMask extends DecodedHold {
  /** The WorkingImage.id this mask belongs to. */
  imageId: string;
  role: HoldRole;
  /** Selection order, 0-based. */
  order: number;
}
