import hang48 from '../../../tests/fixtures/pixel-kit/poses/hang-48.json';
import { expectGolden } from '../../../tests/pixelGolden';
import { bufferToText, createBuffer, type PixelBuffer } from './buffer';
import { contactBoxes, rasterClimber } from './climber';
import { measurePixelText } from './font';
import { renderScene } from './scene';
import { linePixels } from './raster';
import {
  markerFrame,
  rasterGap,
  rasterMarker,
  rasterMarkerInFrame,
  targetFrame,
  TARGET_FRAME_MIN,
  targetInset,
  targetLabelAt,
  uniqueMarkers,
  type Frame,
  type HoldMarker,
} from './markers';
import { DEFAULT_LOOK, OUTFITS } from './outfits';
import { COLOR, LIMB_COLOR, ROLE_COLOR, type MarkerRole } from './palette';
import type { PixelJoints } from './types';
import { artGrid, toArt, type ArtGrid } from './view';

// SPEC-pixel-kit › Rendering Rules › Markers and Reach gaps; AC 3 (shape), 18–22, 25.

const identity = (w: number, h: number): ArtGrid =>
  artGrid({ scale: 1, tx: 0, ty: 0, boxW: w, boxH: h, dpr: 1 }, 1);

const lit = (b: PixelBuffer, pred: (v: number) => boolean = (v) => v !== 0) => {
  const s = new Set<number>();
  b.data.forEach((v, i) => pred(v) && s.add(i));
  return s;
};

const iou = (a: Set<number>, b: Set<number>) => {
  let inter = 0;
  for (const i of a) if (b.has(i)) inter++;
  return inter / (a.size + b.size - inter);
};

/** A buffer with room for the flag and number above, and the limb glyph below. */
const MARGIN = { left: 4, top: 11, right: 12, bottom: 11 };
const inFrame = (w: number, h: number, m: Omit<HoldMarker, 'holdId' | 'bbox'>, timeMs = 0) => {
  const b = createBuffer(w + MARGIN.left + MARGIN.right, h + MARGIN.top + MARGIN.bottom);
  const frame: Frame = { x: MARGIN.left, y: MARGIN.top, w, h };
  rasterMarkerInFrame(
    b,
    frame,
    { holdId: 'h', bbox: { x: 0, y: 0, w: 1, h: 1 }, ...m },
    timeMs,
    false,
  );
  return b;
};

describe('markerFrame (AC 18)', () => {
  const g = identity(100, 100);

  it('grows a 3 × 3 art bbox by 2 per side to 7 × 7', () => {
    expect(markerFrame(g, { x: 10, y: 20, w: 3, h: 3 })).toEqual({ x: 8, y: 18, w: 7, h: 7 });
  });

  it('clamps a 50 × 20 bbox to 40 × 24, centred', () => {
    expect(markerFrame(g, { x: 10, y: 20, w: 50, h: 20 })).toEqual({ x: 15, y: 18, w: 40, h: 24 });
  });

  it('rounds the bbox out to whole art px', () => {
    expect(markerFrame(g, { x: 10.4, y: 20.6, w: 4.2, h: 6 })).toEqual({
      x: 8,
      y: 18,
      w: 9,
      h: 11,
    });
  });

  it('puts the odd pixel to the right or below when it grows or shrinks', () => {
    // 1 × 2 → 5 × 6 after the grow, then 7 × 7: +2 wide (even), +1 tall (the extra goes below).
    expect(markerFrame(g, { x: 10, y: 20, w: 1, h: 2 })).toEqual({ x: 7, y: 18, w: 7, h: 7 });
    // 41 wide → 45 after the grow → remove 5: 3 from the left, 2 from the right.
    expect(markerFrame(g, { x: 10, y: 20, w: 41, h: 3 })).toEqual({ x: 11, y: 18, w: 40, h: 7 });
  });

  it('works through a scaled view', () => {
    const v = artGrid({ scale: 0.5, tx: 0, ty: 0, boxW: 200, boxH: 200, dpr: 2 }, 4);
    // toArt = image / 4: bbox 40..60 → 10..15 art px → 8..17.
    expect(markerFrame(v, { x: 40, y: 40, w: 20, h: 20 })).toEqual({ x: 8, y: 8, w: 9, h: 9 });
  });
});

describe('shapes', () => {
  const ROLES: MarkerRole[] = ['start', 'finish', 'planned', 'target'];

  it('outlines every stroke pixel in ink', () => {
    for (const role of ROLES) {
      const b = inFrame(12, 12, { role, step: 4, limb: 'rf' });
      for (let y = 1; y < b.height - 1; y++) {
        for (let x = 1; x < b.width - 1; x++) {
          const v = b.data[y * b.width + x]!;
          if (v === COLOR.clear || v === COLOR.ink) continue;
          for (const d of [-1, 1, -b.width, b.width])
            expect(b.data[y * b.width + x + d]).not.toBe(0);
        }
      }
    }
  });

  it('keeps the four role shapes apart: pairwise mask IoU ≤ 0.5 on a 12 × 12 frame (AC 3)', () => {
    const masks = ROLES.map((role) =>
      lit(inFrame(12, 12, { role }), (v) => v === ROLE_COLOR[role]),
    );
    for (let i = 0; i < 4; i++) {
      expect(masks[i]!.size).toBeGreaterThan(8);
      for (let j = i + 1; j < 4; j++) expect(iou(masks[i]!, masks[j]!)).toBeLessThanOrEqual(0.5);
    }
  });

  it('draws start brackets with arms of max(2, ⌊min(w,h)/3⌋)', () => {
    const b = inFrame(12, 8, { role: 'start' });
    const row = (y: number) =>
      [...Array(12).keys()]
        .map((x) =>
          b.data[(MARGIN.top + y) * b.width + MARGIN.left + x] === COLOR.lime ? '#' : '.',
        )
        .join('');
    expect(row(0)).toBe('##........##');
    expect(row(1)).toBe('#..........#');
    expect(row(2)).toBe('............');
    expect(row(7)).toBe('##........##');
  });
});

describe('goldens (AC 19)', () => {
  const sizes: [number, number][] = [
    [7, 7],
    [12, 8],
    [30, 30],
  ];
  const marker: Record<MarkerRole, Omit<HoldMarker, 'holdId' | 'bbox'>> = {
    start: { role: 'start' },
    finish: { role: 'finish' },
    planned: { role: 'planned', step: 12 },
    target: { role: 'target', limb: 'lh' },
  };
  for (const role of Object.keys(marker) as MarkerRole[]) {
    it.each(sizes)(`marker-${role} at %i × %i`, (w, h) => {
      expectGolden(`marker-${role}-${w}x${h}`, inFrame(w, h, marker[role]));
    });
  }

  it('floors and clamps the step to 1–99', () => {
    const text = (step: number) => bufferToText(inFrame(12, 12, { role: 'planned', step }));
    expect(text(140)).toBe(text(99));
    expect(text(0)).toBe(text(1));
    expect(text(-3)).toBe(text(1));
    expect(text(12.9)).toBe(text(12));
    expect(text(12)).not.toBe(text(1));
  });
});

describe('overlap (AC 20)', () => {
  const grid = identity(60, 70);
  const bbox = { x: 30, y: 30, w: 8, h: 8 };
  const draw = (...ms: HoldMarker[]) => {
    const b = createBuffer(60, 70);
    for (const m of ms) rasterMarker(b, grid, m, 0, false);
    return b;
  };
  const planned: HoldMarker = { holdId: 'a', role: 'planned', bbox, step: 7 };
  const start: HoldMarker = { holdId: 'a', role: 'start', bbox };

  it('shows the ring, the number and the brackets on a hold that is start and planned', () => {
    const both = draw(planned, start);
    const p = draw(planned);
    const s = draw(start);
    for (const i of lit(s)) expect(both.data[i]).toBe(s.data[i]);
    const chalk = [...lit(p, (v) => v === COLOR.chalk)];
    const frame = markerFrame(grid, bbox);
    // The number sits above the frame, so all of it is kept.
    const numberPx = chalk.filter((i) => Math.floor(i / 60) < frame.y);
    expect(numberPx.length).toBeGreaterThan(5);
    for (const i of numberPx) expect(both.data[i]).toBe(COLOR.chalk);
    // Brackets (drawn after, Rendering Rules › Draw order) cover the ring near the corners; the
    // ring still shows on all four sides.
    const ring = chalk.filter((i) => Math.floor(i / 60) >= frame.y && both.data[i] === COLOR.chalk);
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const side = (i: number) => {
      const dx = (i % 60) + 0.5 - cx;
      const dy = Math.floor(i / 60) + 0.5 - cy;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
    };
    expect(new Set(ring.map(side))).toEqual(new Set(['top', 'bottom', 'left', 'right']));
  });

  it('keeps a target drawn over the climber fully visible', () => {
    const g = identity(41, 60);
    const target: HoldMarker = {
      holdId: 't',
      role: 'target',
      bbox: { x: 22, y: 2, w: 6, h: 6 },
      limb: 'rh',
    };
    const alone = createBuffer(41, 60);
    rasterMarker(alone, g, target, 0, false);
    const b = createBuffer(41, 60);
    rasterClimber(b, g, {
      joints: hang48.joints as PixelJoints,
      heightPx: 48,
      outfit: OUTFITS.starter,
      look: DEFAULT_LOOK,
      gripping: { lh: true, rh: true, lf: true, rf: true },
      selected: null,
      mood: 'ok',
    });
    expect(lit(b).size).toBeGreaterThan(300);
    rasterMarker(b, g, target, 0, false);
    for (const i of lit(alone)) expect(b.data[i]).toBe(alone.data[i]);
  });

  it('keeps only the last marker for a repeated (holdId, role)', () => {
    const first: HoldMarker = { holdId: 'a', role: 'planned', bbox, step: 1 };
    const last: HoldMarker = { holdId: 'a', role: 'planned', bbox, step: 2 };
    const other: HoldMarker = { holdId: 'a', role: 'start', bbox };
    expect(uniqueMarkers([first, other, last])).toEqual([other, last]);
    expect(uniqueMarkers([])).toEqual([]);
  });
});

describe('target breathing (AC 21)', () => {
  it('sits 1 px in for 0–299 ms and 2 px in for 300–599, repeating', () => {
    expect([0, 299, 300, 599, 600, 899, 900].map((t) => targetInset(t, false))).toEqual([
      1, 1, 2, 2, 1, 1, 2,
    ]);
    expect(targetInset(-1, false)).toBe(2);
    expect(targetInset(NaN, false)).toBe(1);
  });

  it('stays 1 px in with reduced motion', () => {
    for (const t of [0, 300, 450, 900]) expect(targetInset(t, true)).toBe(1);
  });

  it('moves the ticks between phases', () => {
    const at = (t: number) => bufferToText(inFrame(12, 12, { role: 'target' }, t));
    expect(at(0)).toBe(at(299));
    expect(at(0)).not.toBe(at(300));
    expect(at(300)).toBe(at(599));
    expect(at(600)).toBe(at(0));
  });
});

describe('target centre (originality review 2026-11-02: never an upright cross)', () => {
  // On frames of 7–11 art px the four inward ticks met in a solid "+". Every target frame is at
  // least TARGET_FRAME_MIN, so in both breathing phases a 3 × 3 hole stays open at its centre.
  it('keeps a 3 × 3 hole free of ticks at every frame size, in both phases', () => {
    for (let w = 7; w <= 16; w++) {
      for (const h of [7, 9, 12, 13, w]) {
        for (const t of [0, 300]) {
          const b = inFrame(w, h, { role: 'target' }, t);
          const f = targetFrame({ x: MARGIN.left, y: MARGIN.top, w, h });
          const mx = f.x + Math.floor(f.w / 2);
          const my = f.y + Math.floor(f.h / 2);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              expect(b.data[(my + dy) * b.width + mx + dx], `${w}×${h} @${t}`).not.toBe(
                COLOR.bloom,
              );
        }
      }
    }
  });

  it('grows a small target frame, centred, to TARGET_FRAME_MIN; other roles keep theirs', () => {
    expect(TARGET_FRAME_MIN).toBe(13);
    expect(targetFrame({ x: 10, y: 20, w: 7, h: 7 })).toEqual({ x: 7, y: 17, w: 13, h: 13 });
    // The odd pixel goes down, as markerFrame grows.
    expect(targetFrame({ x: 10, y: 20, w: 20, h: 8 })).toEqual({ x: 10, y: 18, w: 20, h: 13 });
    expect(targetFrame({ x: 0, y: 0, w: 30, h: 30 })).toEqual({ x: 0, y: 0, w: 30, h: 30 });
  });

  it('golden: the smallest target, its centre open in both phases', () => {
    const g = identity(30, 30);
    for (const t of [0, 300]) {
      const b = createBuffer(30, 30);
      rasterMarker(
        b,
        g,
        { holdId: 'h', role: 'target', bbox: { x: 14, y: 12, w: 1, h: 1 } },
        t,
        false,
      );
      expectGolden(`marker-target-smallest-${t}`, b);
    }
  });
});

describe('reach gaps (AC 22)', () => {
  it('alternates the limb colour and ink, starting with the limb colour at the limb end', () => {
    const g = identity(30, 20);
    for (const limb of ['lh', 'rf'] as const) {
      const gap = { limb, from: { x: 3.2, y: 15.7 }, to: { x: 25.6, y: 2.1 } };
      const b = createBuffer(30, 20);
      rasterGap(b, g, gap);
      const steps: number[][] = [];
      linePixels(toArt(g, gap.from), toArt(g, gap.to), (x, y, k) =>
        (steps[k] ??= []).push(y * 30 + x),
      );
      expect(steps.length).toBeGreaterThan(10);
      steps.forEach((px, k) => {
        for (const i of px) expect(b.data[i]).toBe(k % 2 ? COLOR.ink : LIMB_COLOR[limb]);
      });
      expect(lit(b).size).toBe(steps.flat().length);
    }
  });
});

describe('clipping (AC 25, markers and gaps)', () => {
  const g = identity(20, 20);

  it('leaves the buffer unchanged for a marker or gap wholly outside', () => {
    const b = createBuffer(20, 20);
    for (const role of ['start', 'finish', 'planned', 'target'] as const) {
      rasterMarker(
        b,
        g,
        { holdId: 'x', role, bbox: { x: 60, y: 60, w: 5, h: 5 }, step: 3, limb: 'lh' },
        0,
        false,
      );
      rasterMarker(
        b,
        g,
        { holdId: 'x', role, bbox: { x: -60, y: -60, w: 5, h: 5 }, step: 3, limb: 'lh' },
        0,
        false,
      );
    }
    rasterGap(b, g, { limb: 'lh', from: { x: -30, y: -30 }, to: { x: -5, y: -40 } });
    expect(lit(b).size).toBe(0);
  });

  it('draws only the in-grid part of a marker partly outside', () => {
    const big = createBuffer(60, 60);
    const gBig = artGrid({ scale: 1, tx: 20, ty: 20, boxW: 60, boxH: 60, dpr: 1 }, 1);
    const m: HoldMarker = { holdId: 'x', role: 'finish', bbox: { x: -4, y: 2, w: 8, h: 8 } };
    rasterMarker(big, gBig, m, 0, false);
    const b = createBuffer(20, 20);
    rasterMarker(b, g, m, 0, false);
    expect(lit(b).size).toBeGreaterThan(0);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++)
        expect(b.data[y * 20 + x]).toBe(big.data[(y + 20) * 60 + x + 20]);
  });

  it('does not throw on a 0 × 0 grid or a non-finite bbox', () => {
    const z = createBuffer(0, 0);
    const g0 = identity(0, 0);
    expect(() => {
      rasterMarker(
        z,
        g0,
        { holdId: 'x', role: 'planned', bbox: { x: 0, y: 0, w: 3, h: 3 }, step: 1 },
        0,
        false,
      );
      rasterGap(z, g0, { limb: 'lh', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } });
    }).not.toThrow();
    const b = createBuffer(20, 20);
    rasterMarker(
      b,
      g,
      { holdId: 'x', role: 'start', bbox: { x: NaN, y: 0, w: 3, h: 3 } },
      0,
      false,
    );
    rasterGap(b, g, { limb: 'lh', from: { x: NaN, y: 0 }, to: { x: 5, y: 5 } });
    expect(lit(b).size).toBe(0);
  });
});

describe('target label placement (builder’s call: labels never cover a contact)', () => {
  const f: Frame = { x: 23, y: 42, w: 8, h: 8 };
  const size = measurePixelText('RF', true); // 13 × 9
  const buf = { width: 41, height: 60 };
  const below = { x: f.x + Math.floor((f.w - size.width) / 2), y: f.y + f.h };

  it('keeps the old spot (centred below the frame) when it covers no contact', () => {
    expect(targetLabelAt(f, size, [], buf)).toEqual(below);
    expect(targetLabelAt(f, size, [{ x: 0, y: 0, w: 4, h: 4 }], buf)).toEqual(below);
  });

  it('moves to the side away from the nearest contact when the old spot would cover it', () => {
    const footBelow = { x: 25, y: 51, w: 6, h: 5 };
    expect(targetLabelAt(f, size, [footBelow], buf)).toEqual({ x: below.x, y: f.y - size.height });
    // A contact to the left of the frame, under the old spot: the label goes right, unless that
    // leaves the buffer; then the next clear side in the order below, above, right, left.
    const handLeft = { x: 18, y: 49, w: 5, h: 5 };
    const right = { x: f.x + f.w, y: f.y + Math.floor((f.h - size.height) / 2) };
    expect(targetLabelAt(f, size, [handLeft], { width: 60, height: 60 })).toEqual(right);
    expect(targetLabelAt(f, size, [handLeft], buf)).toEqual({ x: below.x, y: f.y - size.height });
  });

  it('is deterministic', () => {
    const contacts = [
      { x: 25, y: 51, w: 6, h: 5 },
      { x: 10, y: 51, w: 6, h: 5 },
    ];
    expect(targetLabelAt(f, size, contacts, buf)).toEqual(targetLabelAt(f, size, contacts, buf));
  });

  it('at the original spot (y 44), the label still avoids the foot (re-review 4)', () => {
    // The scene as first written, before TARGET_FRAME_MIN: the grown frame's ticks may now reach
    // the foot's top row, but the label (the scene with the limb glyph minus the one without)
    // never lands on the foot.
    const g = identity(41, 60);
    const c = {
      joints: hang48.joints as PixelJoints,
      heightPx: 48,
      outfit: OUTFITS.starter,
      look: DEFAULT_LOOK,
      gripping: { lh: true, rh: true, lf: true, rf: true },
      selected: null,
      mood: 'ok' as const,
    };
    const bbox = { x: 25, y: 44, w: 4, h: 4 };
    const rf = contactBoxes(g, c)[3]!;
    const frame = targetFrame(markerFrame(g, bbox));
    // The label's default spot, centred below the frame, would cover the right foot here.
    const old = { x: frame.x + Math.floor((frame.w - 13) / 2), y: frame.y + frame.h, w: 13, h: 9 };
    const hits = (a: Frame, b: Frame) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(hits(old, rf)).toBe(true);
    const scene = (limb?: 'rf') =>
      renderScene(createBuffer(41, 60), g, {
        climber: c,
        markers: [{ holdId: 't', role: 'target', bbox, ...(limb ? { limb } : {}) }],
        gaps: [],
        puffs: [],
        timeMs: 0,
        reducedMotion: false,
      });
    const withLabel = scene('rf');
    const without = scene();
    let labelPx = 0;
    for (let i = 0; i < withLabel.data.length; i++) {
      if (withLabel.data[i] === without.data[i]) continue;
      labelPx++;
      const x = i % 41;
      const y = Math.floor(i / 41);
      const onFoot = x >= rf.x && x < rf.x + rf.w && y >= rf.y && y < rf.y + rf.h;
      expect(onFoot, `label pixel ${x},${y} on the foot`).toBe(false);
    }
    expect(labelPx).toBeGreaterThan(10);
  });

  it('keeps a foot visible that the old label covered (renderScene)', () => {
    const g = identity(41, 60);
    const c = {
      joints: hang48.joints as PixelJoints,
      heightPx: 48,
      outfit: OUTFITS.starter,
      look: DEFAULT_LOOK,
      gripping: { lh: true, rh: true, lf: true, rf: true },
      selected: null,
      mood: 'ok' as const,
    };
    const target: HoldMarker = {
      holdId: 't',
      role: 'target',
      // 3 px higher than before TARGET_FRAME_MIN (2026-11-02), so the grown 13 px frame ends on
      // the same row the old 8 px frame did, just above the foot: the same scene.
      bbox: { x: 25, y: 41, w: 4, h: 4 },
      limb: 'rf',
    };
    const frame = targetFrame(markerFrame(g, target.bbox));
    expect(frame.y + frame.h).toBe(50);
    const contacts = contactBoxes(g, c);
    const rf = contacts[3]!;
    const old = { x: frame.x + Math.floor((frame.w - 13) / 2), y: frame.y + frame.h, w: 13, h: 9 };
    const hits = (a: Frame, b: Frame) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(hits(old, rf)).toBe(true); // the old placement covered the right foot

    const climberAlone = createBuffer(41, 60);
    rasterClimber(climberAlone, g, c);
    const scene = renderScene(createBuffer(41, 60), g, {
      climber: c,
      markers: [target],
      gaps: [],
      puffs: [],
      timeMs: 0,
      reducedMotion: false,
    });
    for (let y = rf.y + 1; y < rf.y + rf.h - 1; y++) {
      for (let x = rf.x + 1; x < rf.x + rf.w - 1; x++) {
        const v = climberAlone.data[y * 41 + x]!;
        if (v) expect(scene.data[y * 41 + x], `${x},${y}`).toBe(v);
      }
    }
  });
});
