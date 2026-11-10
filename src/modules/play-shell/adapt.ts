import type { Joints } from '../climber-stance';
import type { PixelJoints, PixelView } from '../pixel-kit';

// SPEC-play-shell S1 and pixel-kit P4: the adapters between the Studio's pieces and pixel-kit.

type Point = { x: number; y: number };

/**
 * The PixelView behind a SelectionCanvas `toScreen` (S1): the offset is where the image origin
 * lands, and the scale is how far one image px moves on screen. No Studio change is needed.
 */
export function viewFrom(
  toScreen: (p: Point) => Point,
  boxW: number,
  boxH: number,
  dpr: number,
): PixelView {
  const o = toScreen({ x: 0, y: 0 });
  return { scale: toScreen({ x: 1, y: 0 }).x - o.x, tx: o.x, ty: o.y, boxW, boxH, dpr };
}

/** Field-by-field equality, so the view goes into React state only when it changes (S1). */
export function sameView(a: PixelView | null, b: PixelView): boolean {
  return (
    !!a &&
    a.scale === b.scale &&
    a.tx === b.tx &&
    a.ty === b.ty &&
    a.boxW === b.boxW &&
    a.boxH === b.boxH &&
    a.dpr === b.dpr
  );
}

/** climber-stance joints ([x, y, z] tuples, image px) → pixel-kit joints ({x, y, z}). */
export function toPixelJoints(j: Joints): PixelJoints {
  const out = {} as PixelJoints;
  for (const name of Object.keys(j) as (keyof Joints)[]) {
    const [x, y, z] = j[name];
    out[name] = { x, y, z };
  }
  return out;
}
