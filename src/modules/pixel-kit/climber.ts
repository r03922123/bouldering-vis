import { createBuffer, resizeBuffer, type PixelBuffer } from './buffer';
import type { Look, Outfit } from './outfits';
import { COLOR } from './palette';
import {
  clipRegion,
  drawLine,
  fillCapsule,
  fillPolygon,
  outlinePixels,
  type Paint,
  type Region,
} from './raster';
import { COMPACT, REGULAR, stampSprite, type Sprite } from './sprites';
import type { PixelJointName, PixelJoints, PixelLimb, Pt } from './types';
import { ART_HEIGHT_BAND, artPixel, toArt, type ArtGrid } from './view';

// SPEC-pixel-kit › Rendering Rules › Climber. Groups (each limb, the trunk, the head) are filled
// into a reused scratch mask; each group's 4-neighbour outline is written in ink and then its
// fill, so a nearer group's outline separates it from the group behind it. The hand and foot
// sprites are drawn once more after the trunk and the head, so a contact is never covered.

export type Mood = 'ok' | 'strain' | 'fail';

export interface PixelClimber {
  joints: PixelJoints;
  /** Climber height, image px (sets the art height). */
  heightPx: number;
  outfit: Outfit;
  look: Look;
  /** Hands: grip sprite vs open hand. */
  gripping: Readonly<Record<PixelLimb, boolean>>;
  selected: PixelLimb | null;
  mood: Mood;
}

export interface LimbThickness {
  arm: number;
  thigh: number;
  shank: number;
  compact: boolean;
}

/** Limb thickness in art px for an art height; the compact set is used below 36. */
export function limbThickness(artHeight: number): LimbThickness {
  if (!(artHeight >= ART_HEIGHT_BAND[0])) return { arm: 1, thigh: 1, shank: 1, compact: true };
  return {
    arm: Math.max(2, Math.round(artHeight / 20)),
    thigh: Math.max(2, Math.round(artHeight / 13)),
    shank: Math.max(2, Math.round(artHeight / 16)),
    compact: false,
  };
}

const JOINTS: readonly PixelJointName[] = [
  'pelvis',
  'neck',
  'head',
  'lShoulder',
  'rShoulder',
  'lElbow',
  'rElbow',
  'lHand',
  'rHand',
  'lHip',
  'rHip',
  'lKnee',
  'rKnee',
  'lFoot',
  'rFoot',
];

/** Root, middle and end joint of each limb. */
const LIMB_JOINTS: Record<PixelLimb, readonly [PixelJointName, PixelJointName, PixelJointName]> = {
  lh: ['lShoulder', 'lElbow', 'lHand'],
  rh: ['rShoulder', 'rElbow', 'rHand'],
  lf: ['lHip', 'lKnee', 'lFoot'],
  rf: ['rHip', 'rKnee', 'rFoot'],
};

/** Draw order without z, and the tie order with it (far to near). */
const BASE_ORDER: readonly PixelLimb[] = ['lf', 'rf', 'lh', 'rh'];

/** Marks mask pixels that belong to the selected limb's hand or foot sprite. */
const SPRITE_BIT = 0x10;
const NECK = 2;
const WAISTBAND = 2;
const DROP = { w: 2, h: 3 };

let scratch: PixelBuffer = createBuffer(0, 0);
/** Which group last filled each pixel (0 = none or an outline), for the end-sprite pass. */
let owners: PixelBuffer = createBuffer(0, 0);

export function limbOrder(joints: PixelJoints): PixelLimb[] {
  const all = BASE_ORDER.every((l) => LIMB_JOINTS[l].every((n) => joints[n].z !== undefined));
  if (!all) return [...BASE_ORDER];
  const meanZ = (l: PixelLimb) => LIMB_JOINTS[l].reduce((s, n) => s + joints[n].z!, 0) / 3;
  return [...BASE_ORDER].sort((a, b) => meanZ(a) - meanZ(b));
}

/**
 * The art-px boxes of the hand and foot sprites (lh, rh, lf, rf), each grown by its 1-px outline:
 * the contacts a target label must not cover. Empty if any joint is non-finite.
 */
export function contactBoxes(
  grid: ArtGrid,
  c: PixelClimber,
): { x: number; y: number; w: number; h: number }[] {
  const ok = JOINTS.every((n) => {
    const j = c.joints[n];
    return j && Number.isFinite(j.x) && Number.isFinite(j.y);
  });
  if (!ok) return [];
  const { scale, dpr } = grid.view;
  const set = limbThickness((c.heightPx * scale * dpr) / grid.px).compact ? COMPACT : REGULAR;
  return (['lh', 'rh', 'lf', 'rf'] as const).map((limb) => {
    const s =
      limb === 'lf'
        ? set.footLeft
        : limb === 'rf'
          ? set.footRight
          : c.gripping[limb]
            ? set.handGrip
            : set.handOpen;
    const p = artPixel(grid, c.joints[LIMB_JOINTS[limb][2]]);
    return { x: p.x - s.ax - 1, y: p.y - s.ay - 1, w: s.w + 2, h: s.h + 2 };
  });
}

/** Clips to `buf`; draws nothing if any joint is non-finite. */
export function rasterClimber(buf: PixelBuffer, grid: ArtGrid, c: PixelClimber): void {
  if (!buf.width || !buf.height) return;
  const J = c.joints;
  for (const n of JOINTS) {
    const j = J[n];
    if (!j || !Number.isFinite(j.x) || !Number.isFinite(j.y)) return;
    if (j.z !== undefined && !Number.isFinite(j.z)) return;
  }

  const { scale, dpr } = grid.view;
  const th = limbThickness((c.heightPx * scale * dpr) / grid.px);
  const set = th.compact ? COMPACT : REGULAR;
  const o = c.outfit;
  const slot: Record<string, number> = {
    H: o.hat,
    B: o.band,
    R: c.look.hair,
    S: c.look.skin,
    F: o.shoes,
    r: COLOR.dusk,
    G: o.bag,
    C: COLOR.chalk,
  };
  const colorOf = (cell: string) => slot[cell] ?? 0;
  const art = (n: PixelJointName) => toArt(grid, J[n]);
  const px = (n: PixelJointName) => artPixel(grid, J[n]);

  scratch = resizeBuffer(scratch, buf.width, buf.height);
  owners = resizeBuffer(owners, buf.width, buf.height);
  const mask = scratch;
  const owner = owners.data;
  mask.data.fill(0);
  owner.fill(0);
  const ghost = c.mood === 'fail';

  /**
   * Fills one group into the mask, writes its outline and fill into `buf`, and clears the mask.
   * `id` marks the pixels the group fills; with `overOwn`, the outline skips pixels still showing
   * that group's own fill (an end sprite stays joined to its forearm or shank).
   */
  const group = (
    points: readonly Pt[],
    margin: number,
    fill: () => void,
    selected = false,
    id = 0,
    overOwn = false,
  ) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const region: Region = clipRegion(buf, {
      x0: Math.floor(Math.min(...xs) - margin),
      y0: Math.floor(Math.min(...ys) - margin),
      x1: Math.ceil(Math.max(...xs) + margin) + 1,
      y1: Math.ceil(Math.max(...ys) + margin) + 1,
    });
    fill();
    const w = buf.width;
    const d = mask.data;
    outlinePixels(mask, region, (i, x, y) => {
      if (overOwn && owner[i] === id) return;
      owner[i] = 0;
      const nearSprite =
        selected &&
        ((x > 0 && d[i - 1]! & SPRITE_BIT) ||
          (x < w - 1 && d[i + 1]! & SPRITE_BIT) ||
          (y > 0 && d[i - w]! & SPRITE_BIT) ||
          (y < buf.height - 1 && d[i + w]! & SPRITE_BIT));
      buf.data[i] = nearSprite ? COLOR.sun : COLOR.ink;
    });
    for (let y = region.y0; y < region.y1; y++) {
      for (let x = region.x0, i = y * w + region.x0; x < region.x1; x++, i++) {
        const v = d[i]!;
        if (!v) continue;
        buf.data[i] = ghost && (x + y) % 2 ? COLOR.clear : v & 15;
        owner[i] = id;
        d[i] = 0;
      }
    }
  };

  const segment = (a: Pt, b: Pt, t: number, paint: Paint) => {
    if (th.compact && t === 1 && typeof paint === 'number') drawLine(mask, a, b, paint);
    else fillCapsule(mask, a, b, t, paint);
  };
  /** A forearm or shank: its round cap stops at the hand or foot joint, under the sprite. */
  const distal = (a: Pt, b: Pt, t: number, paint: Paint) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = th.compact || len === 0 ? 0 : Math.min(1, t / 2 / len);
    segment(a, { x: b.x - k * (b.x - a.x), y: b.y - k * (b.y - a.y) }, t, paint);
  };
  const sprite = (s: Sprite, at: Pt, mark: boolean) =>
    stampSprite(mask, s, at.x, at.y, mark ? (cell) => colorOf(cell) | SPRITE_BIT : colorOf);
  const margin = Math.ceil(Math.max(th.arm, th.thigh, th.shank, NECK) / 2) + 9;

  const order = limbOrder(J);
  const LIMB_ID: Record<PixelLimb, number> = { lh: 1, rh: 2, lf: 3, rf: 4 };
  const endSprite = (limb: PixelLimb): Sprite => {
    if (limb === 'lf') return set.footLeft;
    if (limb === 'rf') return set.footRight;
    return c.gripping[limb] ? set.handGrip : set.handOpen;
  };
  for (const limb of order) {
    const [root, mid, end] = LIMB_JOINTS[limb];
    const hand = limb === 'lh' || limb === 'rh';
    const points = [art(root), art(mid), art(end)];
    group(
      points,
      margin,
      () => {
        if (hand) {
          segment(points[0]!, points[1]!, th.arm, o.sleeves === 'tank' ? c.look.skin : o.top);
          distal(points[1]!, points[2]!, th.arm, o.sleeves === 'long' ? o.top : c.look.skin);
        } else {
          segment(points[0]!, points[1]!, th.thigh, o.bottoms);
          distal(points[1]!, points[2]!, th.shank, o.legs === 'pants' ? o.bottoms : c.look.skin);
        }
        sprite(endSprite(limb), px(end), c.selected === limb);
      },
      c.selected === limb,
      LIMB_ID[limb],
    );
  }

  // Trunk: neck, the shoulder–hip quad with a waistband along the hip line, then the chalk bag.
  const lHip = art('lHip');
  const rHip = art('rHip');
  const hx = rHip.x - lHip.x;
  const hy = rHip.y - lHip.y;
  const hipLen = Math.hypot(hx, hy);
  const torso = (x: number, y: number) => {
    const px0 = x + 0.5 - lHip.x;
    const py0 = y + 0.5 - lHip.y;
    const dist = hipLen > 0 ? Math.abs(px0 * hy - py0 * hx) / hipLen : Math.hypot(px0, py0);
    return dist < WAISTBAND ? o.bottoms : o.top;
  };
  const quad = [art('lShoulder'), art('rShoulder'), rHip, lHip];
  group([...quad, art('neck'), art('head'), art('pelvis')], margin, () => {
    fillCapsule(mask, art('neck'), art('head'), NECK, c.look.skin);
    if (th.compact) fillCapsule(mask, art('pelvis'), art('neck'), 2, torso);
    fillPolygon(mask, quad, torso);
    sprite(set.bag, px('pelvis'), false);
  });

  const head = px('head');
  group([art('head')], margin, () => sprite(set.head, head, false));

  // Contacts are the game's key information, so the hand and foot sprites go on top of the trunk
  // and the head (Open Question 11, resolved). Limb segments keep their depth order.
  for (const limb of order) {
    const end = px(LIMB_JOINTS[limb][2]);
    group(
      [end],
      margin,
      () => sprite(endSprite(limb), end, c.selected === limb),
      c.selected === limb,
      LIMB_ID[limb],
      true,
    );
  }

  if (c.mood === 'strain') {
    // A 2 × 3 sweat drop, 1 px above the head sprite's top-right corner.
    const right = head.x - set.head.ax + set.head.w - 1;
    const top = head.y - set.head.ay;
    const x0 = right - DROP.w + 1;
    const y0 = top - 1 - DROP.h;
    group([{ x: x0, y: y0 }], DROP.h + 1, () => {
      for (let y = y0; y < y0 + DROP.h; y++) {
        for (let x = x0; x < x0 + DROP.w; x++) {
          if (x >= 0 && y >= 0 && x < mask.width && y < mask.height) {
            mask.data[y * mask.width + x] = COLOR.tide;
          }
        }
      }
    });
  }
}
