import type { HoldGeometry } from './geometry';
import { describePull, pullDir, type PullOverride } from './pull';

// SPEC-hold-geometry › Amendment: Force Direction. Source: maxclimbing, "Force Direction & Hold
// Geometry". Maximum friction comes from force perpendicular to the hold surface.

type Vec3 = [number, number, number];

export interface Force {
  /** Unit force the hand applies (image frame: +x right, +y down, +z toward the viewer). */
  dir: Vec3 | null;
  /** 'surface': reliable normal; 'type': hold-type rule; 'user': set by the user; 'none': no direction. */
  source: 'surface' | 'type' | 'user' | 'none';
  cue: string | null;
}

const SURFACE_MIN_TILT_DEG = 20;
const SURFACE_MIN_CONSISTENCY = 0.4;

const SURFACE_CUE: Record<HoldGeometry['orientation'], string> = {
  sidepull: 'Pull sideways into the wall; turn your chest to the hold',
  undercling: 'Pull up and out; drop your hips',
  standard: 'Pull perpendicular to the surface',
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** "Down the wall": image-down projected onto the wall plane. */
function wallDown(w: Vec3): Vec3 {
  const up: Vec3 = [0, -1, 0];
  const k = dot(up, w);
  const u = unit([up[0] - k * w[0], up[1] - k * w[1], up[2] - k * w[2]]);
  return [-u[0], -u[1], -u[2]];
}

/**
 * The force to apply to a hold. A reliable surface wins (push perpendicular into it); otherwise the
 * hold type decides. `type` is the effective type (a user override wins), passed as a plain string
 * so this module doesn't depend on hold-classification.
 */
/**
 * A long, near-upright edge is a sidepull (pro review: "you can't pull down on a vertical edge").
 * It is pulled sideways toward the climber's body, taken as the middle of the route (`bodyX`).
 */
const SIDEPULL_ELONGATION = 2;
const SIDEPULL_MAX_TILT = 30;
const SIDEPULL_TYPES = new Set(['crimp', 'edge', 'pocket', 'jug']);

/**
 * SPEC-climber-stance Amendment 2026-11-04, M4 (narrowed after a spike, decision D2-A): a hold with
 * no type is a sidepull by the same shape rule. A pinch is not: it has two faces, and the climber
 * uses whichever fits where their body is, so it keeps no single pull.
 */
const sidepullType = (type: string | null) => type === null || SIDEPULL_TYPES.has(type);

function sidepull(g: HoldGeometry, type: string | null, bodyX: number | undefined): Force | null {
  const s = g.shape;
  if (!s || bodyX === undefined || !sidepullType(type)) return null;
  if (s.elongation < SIDEPULL_ELONGATION || s.tiltDeg > SIDEPULL_MAX_TILT) return null;
  if (Math.abs(bodyX - s.x) < 1) return null;
  const side = Math.sign(bodyX - s.x);
  return {
    dir: unit([side, 0, -0.3]),
    source: 'type',
    cue: 'Sidepull: pull sideways toward your body and lean away',
  };
}

export function forceDirection(g: HoldGeometry, type: string | null, bodyX?: number): Force {
  const tilt = (Math.acos(Math.min(1, Math.max(-1, dot(g.normal, g.wallNormal)))) * 180) / Math.PI;
  if (tilt >= SURFACE_MIN_TILT_DEG && g.consistency >= SURFACE_MIN_CONSISTENCY) {
    return {
      dir: [-g.normal[0], -g.normal[1], -g.normal[2]],
      source: 'surface',
      cue: SURFACE_CUE[g.orientation],
    };
  }
  const side = sidepull(g, type, bodyX);
  if (side) return side;
  const down = wallDown(g.wallNormal);
  const w = g.wallNormal;
  switch (type) {
    case 'jug':
    case 'edge':
    case 'pocket':
      return { dir: down, source: 'type', cue: 'Pull down into the incut' };
    case 'crimp':
      return { dir: down, source: 'type', cue: 'Pull down; keep your elbow under the edge' };
    case 'sloper':
      return {
        dir: unit([-w[0] + 0.6 * down[0], -w[1] + 0.6 * down[1], -w[2] + 0.6 * down[2]]),
        source: 'type',
        cue: 'Press into the wall; get your hips under the hold',
      };
    case 'pinch':
      return { dir: null, source: 'none', cue: 'Squeeze; no single pull direction' };
    case 'foot-chip':
      return { dir: null, source: 'none', cue: 'Foothold: step on it with the tip of your shoe' };
    default:
      return { dir: null, source: 'none', cue: null };
  }
}

/** The user's correction wins; otherwise the computed force. */
export function forceWithOverride(
  g: HoldGeometry,
  type: string | null,
  pull: PullOverride | null,
  bodyX?: number,
): Force {
  if (!pull) return forceDirection(g, type, bodyX);
  const dir = pullDir(pull);
  return { dir, source: 'user', cue: `${describePull(dir)} (set by you)` };
}
