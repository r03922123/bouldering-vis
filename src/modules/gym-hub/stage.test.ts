import { placesFor } from './places';
import { ART_H } from './render';
import {
  CAMERA_TAU_MS,
  DASH_MS,
  dashSpeedup,
  easeCamera,
  idleFrame,
  MAX_CSS_PX,
  neighbourPlace,
  stageLayout,
  walkBounds,
} from './stage';
import { IDLE_MS } from './sprites';
import { WALK_SPEED } from './walk';

// SPEC-gym-hub G2, G7, G14, G15: the pure parts of HubScreen's canvas loop.

const GYM = placesFor('gym', [
  { id: 'a', name: 'Wall 1' },
  { id: 'b', name: 'Wall 2' },
]);

describe('stageLayout (G2)', () => {
  it('makes the art 108 px tall in whole device pixels, at least pixel-kit’s Pmin', () => {
    // Pixel 7 (dpr 2.625) at 375 × 740: the box is min(60dvh, 324) = 324 CSS px tall.
    const phone = stageLayout(375, 324, 2.625);
    expect(phone).toEqual({ px: 7, width: 141, height: ART_H, cssW: 376, cssH: 288 });
    // Desktop at dpr 1: P = 3 CSS px.
    expect(stageLayout(1280, 324, 1)).toEqual({
      px: 3,
      width: 427,
      height: ART_H,
      cssW: 1281,
      cssH: 324,
    });
    expect(MAX_CSS_PX).toBe(3);
  });

  it('is never taller than its box, even where Pmin would not fit', () => {
    // A landscape phone 300 px tall: 60dvh = 180 CSS px < 108 · Pmin(2.625)/2.625 ≈ 206.
    const tight = stageLayout(700, 180, 2.625);
    expect(tight.cssH).toBeLessThanOrEqual(180);
    expect(tight.px).toBe(4);
    expect(Number.isInteger(tight.px)).toBe(true);
  });

  it('covers the box width (the stage clips the last partial art px)', () => {
    for (const [w, dpr] of [
      [343, 3],
      [390, 2],
      [1000, 1.25],
    ] as const) {
      const l = stageLayout(w, 324, dpr);
      expect(l.cssW).toBeGreaterThanOrEqual(w);
      expect(l.cssW - w).toBeLessThan(l.px / dpr);
    }
  });

  it('is empty for an empty or hidden box', () => {
    expect(stageLayout(0, 324, 2).width).toBe(0);
    expect(stageLayout(375, 0, 2).width).toBe(0);
  });
});

describe('easeCamera (G14)', () => {
  it('closes 1 − e^(−dt/τ) of the gap each frame and snaps when under half a pixel', () => {
    expect(CAMERA_TAU_MS).toBe(120);
    expect(easeCamera(0, 100, 120, false)).toBeCloseTo(100 * (1 - Math.exp(-1)), 9);
    expect(easeCamera(99.6, 100, 16, false)).toBe(100);
  });

  it('cuts straight to the target with reduced motion', () => {
    expect(easeCamera(0, 100, 16, true)).toBe(100);
  });
});

describe('dashSpeedup (G7, builder’s call)', () => {
  it('walks a strip trip at the normal speed when it takes under DASH_MS', () => {
    expect(DASH_MS).toBe(1000);
    expect(dashSpeedup(28, 84)).toBe(1);
  });

  it('speeds a longer trip up so it arrives in DASH_MS', () => {
    const k = dashSpeedup(28, 308);
    expect(280 / (WALK_SPEED * k)).toBeCloseTo(DASH_MS, 6);
  });
});

describe('idleFrame (G15)', () => {
  it('alternates the 2 idle frames every IDLE_MS, and holds frame 0 with reduced motion', () => {
    expect([0, IDLE_MS - 1, IDLE_MS, 2 * IDLE_MS].map((t) => idleFrame(t, false))).toEqual([
      0, 0, 1, 0,
    ]);
    expect(idleFrame(IDLE_MS, true)).toBe(0);
  });
});

describe('walkBounds', () => {
  it('keeps the climber 8 art px inside the ends of the world', () => {
    expect(walkBounds(GYM)).toEqual([8, 328]);
  });
});

describe('neighbourPlace (reduced motion and no-canvas arrow keys)', () => {
  it('is the next place in that direction from where the climber stands', () => {
    expect(neighbourPlace(GYM, 28, 1)?.id).toBe('lockers');
    expect(neighbourPlace(GYM, 100, 1)?.id).toBe('bay:a');
    expect(neighbourPlace(GYM, 100, -1)?.id).toBe('lockers');
    expect(neighbourPlace(GYM, 28, -1)).toBeNull();
    expect(neighbourPlace(GYM, 308, 1)).toBeNull();
  });
});
