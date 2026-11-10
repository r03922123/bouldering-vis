import type { JointName } from './body';
import { canHook, type Stance, type StanceContacts } from './stance';
import { LIMBS, type Limb } from './types';
import { add, scale, type Vec3 } from './vec';

// SPEC-climber-stance › Display: the Route view overlay. layoutStance is pure (tested); drawStance
// only paints what it returns.

type Pt = { x: number; y: number };
/** Wall frame (image pixels, +z out of the wall) → screen. */
export type Project = (p: Vec3) => Pt;

/** The flat Route view: the photo's pixels on screen, depth ignored. */
export const flatProjection =
  (toScreen: (p: Pt) => Pt): Project =>
  (p) =>
    toScreen({ x: p[0], y: p[1] });

export const STANCE_COLOR = {
  left: '#22d3ee',
  right: '#fb923c',
  body: '#f8fafc',
  outline: '#0f172a',
  com: '#facc15',
  /** Amendment 2026-11-04, M1: the hips resting on the wall (grey: no side). */
  wall: '#94a3b8',
} as const;

/** 100 % of bodyweight draws as an arrow this long (× climber height). */
export const ARROW_PER_BODYWEIGHT = 0.25;
const MIN_ARROW_PX = 8;
const LINE_PX = 3;
export const CHIP: Record<Limb, string> = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' };
/** M1: the chip where the hips rest on the wall. */
export const BODY_CHIP = 'Body';

const sideColor = (limb: Limb) => (limb[0] === 'l' ? STANCE_COLOR.left : STANCE_COLOR.right);

const BONES: { from: JointName; to: JointName; limb?: Limb }[] = [
  { from: 'pelvis', to: 'neck' },
  { from: 'lShoulder', to: 'rShoulder' },
  { from: 'lHip', to: 'rHip' },
  { from: 'lShoulder', to: 'lElbow', limb: 'lh' },
  { from: 'lElbow', to: 'lHand', limb: 'lh' },
  { from: 'rShoulder', to: 'rElbow', limb: 'rh' },
  { from: 'rElbow', to: 'rHand', limb: 'rh' },
  { from: 'lHip', to: 'lKnee', limb: 'lf' },
  { from: 'lKnee', to: 'lFoot', limb: 'lf' },
  { from: 'rHip', to: 'rKnee', limb: 'rf' },
  { from: 'rKnee', to: 'rFoot', limb: 'rf' },
];
const END: Record<Limb, JointName> = { lh: 'lHand', rh: 'rHand', lf: 'lFoot', rf: 'rFoot' };

export interface StanceLayout {
  dashed: boolean;
  /**
   * Where the hips can be at the CoM's height: the region sliced along that line (on a vertical wall
   * the region is an endless band, so the slice is the whole story). Null when the line misses it.
   */
  range: { a: Pt; b: Pt } | null;
  bones: { a: Pt; b: Pt; color: string }[];
  head: { x: number; y: number; r: number };
  com: Pt;
  /** Dotted line straight down the wall from the CoM. */
  plumb: { a: Pt; b: Pt };
  arrows: { x: number; y: number; ux: number; uy: number; length: number; color: string }[];
  chips: { x: number; y: number; text: string; color: string }[];
  /** An unreachable limb: dashed from where it ends to its hold. */
  reachGaps: { a: Pt; b: Pt; color: string }[];
}

export function layoutStance(
  stance: Stance,
  contacts: StanceContacts,
  height: number,
  project: Project,
): StanceLayout | null {
  const j = stance.joints;
  if (!j) return null;
  const at = (p: Vec3) => project(p);
  const span = (a: Vec3, b: Vec3) => {
    const s0 = at(a);
    const s1 = at(b);
    return { s0, dx: s1.x - s0.x, dy: s1.y - s0.y, len: Math.hypot(s1.x - s0.x, s1.y - s0.y) };
  };

  const arrows: StanceLayout['arrows'] = [];
  const chips: StanceLayout['chips'] = [];
  const reachGaps: StanceLayout['reachGaps'] = [];
  for (const limb of LIMBS) {
    const c = contacts[limb];
    if (!c) continue;
    const point: Vec3 = [c.point[0], c.point[1], 0];
    const p = at(point);
    // Left chips sit left of the hold and right chips right of it, so matched hands both show.
    const side = limb[0] === 'l' ? -1 : 1;
    // Amendment 2026-11-04, M3: a hooked foot says how it hooks.
    const text = c.hook && canHook(limb, c) ? `${CHIP[limb]}·${c.hook}` : CHIP[limb];
    chips.push({ x: p.x + side * 16, y: p.y + 14, text, color: sideColor(limb) });
    if (stance.reach[limb] === false) {
      reachGaps.push({ a: at(j[END[limb]]), b: p, color: sideColor(limb) });
    }
    const load = stance.load[limb];
    if (!load) continue;
    // The whole force, so a push into the wall looks short from the front and long from the side.
    const s = span(point, add(point, scale(load.force, ARROW_PER_BODYWEIGHT * height)));
    if (s.len < 1e-6) continue;
    arrows.push({
      x: p.x,
      y: p.y,
      ux: s.dx / s.len,
      uy: s.dy / s.len,
      length: Math.max(MIN_ARROW_PX, s.len),
      color: sideColor(limb),
    });
  }
  if (stance.body) {
    const hips = at([j.pelvis[0], j.pelvis[1], 0]);
    chips.push({ x: hips.x, y: hips.y, text: BODY_CHIP, color: STANCE_COLOR.wall });
  }
  const com = at(stance.com);
  return {
    dashed: !stance.feasible,
    range: sliceAt(stance.region, stance.com, at),
    bones: BONES.map((b) => ({
      a: at(j[b.from]),
      b: at(j[b.to]),
      color: b.limb ? sideColor(b.limb) : STANCE_COLOR.body,
    })),
    head: { ...at(j.head), r: Math.max(4, span(j.head, add(j.head, [0.055 * height, 0, 0])).len) },
    com,
    plumb: { a: com, b: at(add(stance.com, scale(stance.gravity, 0.3 * height))) },
    arrows,
    chips,
    reachGaps,
  };
}

/** The x-extent of the convex region along the horizontal line through the CoM. */
function sliceAt(
  region: readonly [number, number][],
  com: Vec3,
  at: (p: Vec3) => Pt,
): StanceLayout['range'] {
  const y = com[1];
  const xs: number[] = [];
  region.forEach((p, i) => {
    const q = region[(i + 1) % region.length]!;
    if ((p[1] - y) * (q[1] - y) > 0 || p[1] === q[1]) return;
    xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
  });
  if (region.length < 3 || xs.length < 2) return null;
  return { a: at([Math.min(...xs), y, com[2]]), b: at([Math.max(...xs), y, com[2]]) };
}

function arrow(ctx: CanvasRenderingContext2D, a: StanceLayout['arrows'][number]) {
  const tip = { x: a.x + a.ux * a.length, y: a.y + a.uy * a.length };
  const head = 8;
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = LINE_PX;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - a.ux * head - a.uy * head * 0.6, tip.y - a.uy * head + a.ux * head * 0.6);
  ctx.lineTo(tip.x - a.ux * head + a.uy * head * 0.6, tip.y - a.uy * head - a.ux * head * 0.6);
  ctx.closePath();
  ctx.fill();
}

export function drawStance(ctx: CanvasRenderingContext2D, l: StanceLayout): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (l.range) {
    // A bar with end ticks: "your hips can move between these marks".
    const { a, b } = l.range;
    ctx.strokeStyle = STANCE_COLOR.com;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    for (const e of [a, b]) {
      ctx.moveTo(e.x, e.y - 7);
      ctx.lineTo(e.x, e.y + 7);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.setLineDash(l.dashed ? [6, 4] : []);
  // Dark outline first, then the color, so the figure reads on any wall.
  for (const pass of ['outline', 'color'] as const) {
    ctx.lineWidth = pass === 'outline' ? LINE_PX + 3 : LINE_PX;
    for (const b of l.bones) {
      ctx.strokeStyle = pass === 'outline' ? STANCE_COLOR.outline : b.color;
      ctx.beginPath();
      ctx.moveTo(b.a.x, b.a.y);
      ctx.lineTo(b.b.x, b.b.y);
      ctx.stroke();
    }
    ctx.strokeStyle = pass === 'outline' ? STANCE_COLOR.outline : STANCE_COLOR.body;
    ctx.beginPath();
    ctx.arc(l.head.x, l.head.y, l.head.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([6, 4]);
  for (const g of l.reachGaps) {
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.a.x, g.a.y);
    ctx.lineTo(g.b.x, g.b.y);
    ctx.stroke();
  }
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = STANCE_COLOR.com;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(l.plumb.a.x, l.plumb.a.y);
  ctx.lineTo(l.plumb.b.x, l.plumb.b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const a of l.arrows) arrow(ctx, a);

  ctx.fillStyle = STANCE_COLOR.com;
  ctx.strokeStyle = STANCE_COLOR.outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(l.com.x, l.com.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of l.chips) {
    ctx.fillStyle = STANCE_COLOR.outline;
    ctx.fillRect(c.x - 12, c.y - 8, 24, 16);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, c.x, c.y);
  }
  ctx.restore();
}
