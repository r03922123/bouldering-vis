// SPEC-gym-hub G5: walking is pure. No clock or randomness inside, so the same inputs always give
// the same states (AC 4); HubScreen owns the clock and the key state.

/** Art px per ms (72 art px/s). */
export const WALK_SPEED = 0.072;
/** One walk-cycle frame per stride. */
export const STRIDE_MS = 125;
const FRAMES = 4;

export interface WalkState {
  /** Art px along the floor. */
  x: number;
  facing: 1 | -1;
  /** Where a tap sent the climber; null when standing or walking on a held key. */
  targetX: number | null;
  /** Walk-cycle frame, 0 when standing. */
  frame: number;
  /** Time spent walking since the last stop (drives the frame). */
  phaseMs: number;
}

export type WalkInput = { kind: 'goto'; x: number } | { kind: 'hold'; dir: -1 | 0 | 1 };

export function idle(x: number, facing: 1 | -1): WalkState {
  return { x, facing, targetX: null, frame: 0, phaseMs: 0 };
}

const clamp = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));

export function step(
  s: WalkState,
  input: WalkInput | null,
  dtMs: number,
  bounds: readonly [number, number],
): WalkState {
  let targetX = s.targetX;
  let dir: -1 | 0 | 1 = 0;
  if (input?.kind === 'goto') targetX = clamp(input.x, bounds);
  if (input?.kind === 'hold' && input.dir !== 0) {
    // A held key takes over from a tapped target.
    targetX = null;
    dir = input.dir;
  }

  let x = s.x;
  let facing = s.facing;
  const stride = WALK_SPEED * dtMs;
  if (targetX !== null) {
    const gap = targetX - s.x;
    if (gap !== 0) facing = gap > 0 ? 1 : -1;
    if (Math.abs(gap) <= stride) {
      x = targetX;
      targetX = null;
    } else {
      x = s.x + facing * stride;
    }
  } else if (dir !== 0) {
    facing = dir;
    x = clamp(s.x + dir * stride, bounds);
  }

  const moving = x !== s.x || targetX !== null;
  if (!moving) return { x, facing, targetX: null, frame: 0, phaseMs: 0 };
  const phaseMs = s.phaseMs + dtMs;
  return { x, facing, targetX, frame: Math.floor(phaseMs / STRIDE_MS) % FRAMES, phaseMs };
}
