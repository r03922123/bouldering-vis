import { UNSURE_BELOW, type HoldType } from './classify';

export interface StoredClassification {
  holdId: string;
  /** Top 3, descending. */
  top: { type: HoldType; prob: number }[];
}

export interface HoldClassification extends StoredClassification {
  userType: HoldType | null;
  /** userType ?? top[0].type */
  effectiveType: HoldType;
  /** top[0].prob < 0.35 and no override */
  unsure: boolean;
}

/** Overrides are stored separately, so they survive re-classification. */
export function effectiveClassification(
  c: StoredClassification,
  userType: HoldType | null,
): HoldClassification {
  const best = c.top[0]!;
  return {
    ...c,
    userType,
    effectiveType: userType ?? best.type,
    unsure: userType === null && best.prob < UNSURE_BELOW,
  };
}
