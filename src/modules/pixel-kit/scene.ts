import type { PixelBuffer } from './buffer';
import { contactBoxes, rasterClimber, type PixelClimber } from './climber';
import { rasterGap, rasterMarker, uniqueMarkers, type HoldMarker, type ReachGap } from './markers';
import { MAX_PUFFS, PUFF_MAX_LIFE_MS, rasterPuff, type ChalkPuff } from './puffs';
import type { ArtGrid } from './view';

// SPEC-pixel-kit › Rendering Rules › Draw order, and Decisions P10. The scene is pure: the
// picture depends only on its inputs, and time is one of them. Only PixelLayer reads a clock.

export interface PixelScene {
  climber: PixelClimber | null;
  markers: readonly HoldMarker[];
  gaps: readonly ReachGap[];
  puffs: readonly ChalkPuff[];
  timeMs: number;
  reducedMotion: boolean;
}

/** One target phase (SPEC-pixel-kit › Markers: 1 px in, then 2 px in, 300 ms each). */
const PHASE_MS = 300;

/** The puffs that are drawn: none with reduced motion, else the 6 newest by `bornMs`. */
function drawnPuffs(scene: PixelScene): ChalkPuff[] {
  if (scene.reducedMotion) return [];
  return [...scene.puffs].sort((a, b) => b.bornMs - a.bornMs).slice(0, MAX_PUFFS);
}

/**
 * Clears `buf` and draws the scene in the order of Rendering Rules: planned markers → finish
 * markers → reach gaps → climber → start brackets → target marker → chalk puffs. The start
 * brackets sit over the climber like a UI overlay: they keep the hold centre clear, so they never
 * hide a hand on the hold. Deterministic (the output depends only on the inputs); it writes into
 * `buf` and returns that same object.
 */
export function renderScene(buf: PixelBuffer, grid: ArtGrid, scene: PixelScene): PixelBuffer {
  buf.data.fill(0);
  if (!buf.width || !buf.height) return buf;
  const { timeMs: t, reducedMotion } = scene;
  const markers = uniqueMarkers(scene.markers);
  // A target's limb label keeps clear of the climber's hands and feet.
  const contacts = scene.climber ? contactBoxes(grid, scene.climber) : [];
  const layer = (keep: (m: HoldMarker) => boolean) => {
    for (const m of markers) {
      if (keep(m))
        rasterMarker(buf, grid, m, t, reducedMotion, m.role === 'target' ? contacts : []);
    }
  };

  layer((m) => m.role === 'planned');
  layer((m) => m.role === 'finish');
  for (const gap of scene.gaps) rasterGap(buf, grid, gap);
  if (scene.climber) rasterClimber(buf, grid, scene.climber);
  layer((m) => m.role === 'start');
  layer((m) => m.role === 'target');
  for (const puff of drawnPuffs(scene)) rasterPuff(buf, grid, puff, t);
  return buf;
}

/**
 * The next time the picture changes without new input, or null: the next 300-ms target phase
 * (unless reduced motion), the current time while a drawn puff is alive, or a future puff's birth.
 */
export function nextChangeAt(scene: PixelScene): number | null {
  const t = scene.timeMs;
  if (scene.reducedMotion || !Number.isFinite(t)) return null;
  let next = Infinity;
  if (scene.markers.some((m) => m.role === 'target')) {
    next = (Math.floor(t / PHASE_MS) + 1) * PHASE_MS;
  }
  for (const puff of drawnPuffs(scene)) {
    const age = t - puff.bornMs;
    if (age >= 0 && age < PUFF_MAX_LIFE_MS) return t;
    if (age < 0) next = Math.min(next, puff.bornMs);
  }
  return next === Infinity ? null : next;
}
