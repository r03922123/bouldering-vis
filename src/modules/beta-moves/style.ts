import { isHand, type Limb } from '../climber-stance';
import { DEADPOINT_REACH, STATIC_REACH, type MoveStyle } from './types';

// SPEC-beta-moves B5: how a limb reaches its target, from its reach ratio (3 decimals, B16).

/** 'fall' when the ratio is over the limb's allowance. Feet don't jump (a v1 game rule). */
export function styleFor(limb: Limb, ratio: number, dynamic: boolean): MoveStyle | 'fall' {
  if (ratio <= STATIC_REACH) return 'static';
  if (isHand(limb) && dynamic && ratio <= DEADPOINT_REACH) return 'deadpoint';
  return 'fall';
}
