import { DEADPOINT_REACH, STATIC_REACH, type MoveCheck } from '../beta-moves';
import { isHand, LIMB_NAME, LIMBS, type Limb } from '../climber-stance';

export interface NumberRow {
  limb: Limb | null;
  label: string;
  value: string;
}

const STYLE_WORD = { static: 'Static', deadpoint: 'Deadpoint' } as const;
/** SPEC-climber-stance Amendment 2026-11-04, M1: the hips on the wall's row. */
export const BODY_SHARE = 'Body on the wall share';
const limit = (v: number) => v.toFixed(3);

/** A reach ratio against the limit the referee used: static for feet, deadpoint for its hands. */
function reachValue(check: MoveCheck, limb: Limb, ratio: number): string {
  const r = Number.isFinite(ratio) ? ratio.toFixed(3) : '∞';
  if (!isHand(limb) || check.style === 'static') return `${r} of ${limit(STATIC_REACH)} (static)`;
  if (check.style === 'deadpoint') return `${r} of ${limit(DEADPOINT_REACH)} (deadpoint)`;
  // A fall decided before the style: both of a hand's limits.
  return `${r} of ${limit(STATIC_REACH)} (static) · ${limit(DEADPOINT_REACH)} (deadpoint)`;
}

/**
 * Pure: Numbers mode's rows for a check (S10). Only values the referee returned, formatted with no
 * arithmetic beyond rounding to the precision beta-moves already rounded them to: each limb's
 * weight share, each moved limb's reach ratio, the effort, the style and the contacts kept.
 */
export function numbersFor(check: MoveCheck): readonly NumberRow[] {
  const rows: NumberRow[] = [];
  for (const l of LIMBS) {
    const share = check.loads[l];
    if (share !== undefined) {
      rows.push({ limb: l, label: `${LIMB_NAME[l]} share`, value: `${share.toFixed(1)} %` });
    }
  }
  if (check.bodyLoad !== null) {
    rows.push({ limb: null, label: BODY_SHARE, value: `${check.bodyLoad.toFixed(1)} %` });
  }
  for (const l of LIMBS) {
    const ratio = check.reach[l];
    if (ratio !== undefined) {
      rows.push({ limb: l, label: `${LIMB_NAME[l]} reach`, value: reachValue(check, l, ratio) });
    }
  }
  if (check.effort !== null) {
    rows.push({ limb: null, label: 'Effort', value: `${check.effort.toFixed(1)} % bodyweight` });
  }
  if (check.style !== null)
    rows.push({ limb: null, label: 'Style', value: STYLE_WORD[check.style] });
  rows.push({ limb: null, label: 'Contacts kept', value: String(check.contactsKept) });
  return rows;
}
