import hang48 from '../../../tests/fixtures/pixel-kit/poses/hang-48.json';
import splitStart from '../../../tests/fixtures/pixel-kit/poses/split-start.json';
import { createBuffer, type PixelBuffer } from './buffer';
import { rasterClimber, type PixelClimber } from './climber';
import { markerFrame, rasterGap, rasterMarker, type HoldMarker, type ReachGap } from './markers';
import { DEFAULT_LOOK, OUTFITS } from './outfits';
import { COLOR, ROLE_COLOR } from './palette';
import { rasterPuff, type ChalkPuff } from './puffs';
import { nextChangeAt, renderScene, type PixelScene } from './scene';
import type { PixelJoints } from './types';
import { artGrid, artPixel, pixelSize, type ArtGrid } from './view';

// SPEC-pixel-kit › Rendering Rules › Draw order; AC 24 (scene part), 25 (scene), 28 and 29.

const identity = (w: number, h: number): ArtGrid =>
  artGrid({ scale: 1, tx: 0, ty: 0, boxW: w, boxH: h, dpr: 1 }, 1);

const G = identity(80, 80);

const climber: PixelClimber = {
  joints: hang48.joints as PixelJoints,
  heightPx: hang48.heightPx,
  outfit: OUTFITS.starter,
  look: DEFAULT_LOOK,
  gripping: { lh: true, rh: true, lf: true, rf: true },
  selected: null,
  mood: 'ok',
};

const marker = (
  role: HoldMarker['role'],
  holdId: string,
  x: number,
  y: number,
  extra: Partial<HoldMarker> = {},
): HoldMarker => ({ holdId, role, bbox: { x, y, w: 6, h: 6 }, ...extra });

const scene = (over: Partial<PixelScene> = {}): PixelScene => ({
  climber: null,
  markers: [],
  gaps: [],
  puffs: [],
  timeMs: 0,
  reducedMotion: false,
  ...over,
});

const render = (s: PixelScene, grid = G) =>
  renderScene(createBuffer(grid.width, grid.height), grid, s);

const lit = (b: PixelBuffer) => b.data.reduce((n, v) => n + (v ? 1 : 0), 0);

/** Holds both hands sit on: hang-48's hands are at (12.5, 6) and (28.5, 6). */
const busy = (): PixelScene =>
  scene({
    climber,
    markers: [
      marker('target', 't', 26, 3, { limb: 'rh' }),
      marker('start', 'a', 10, 3),
      marker('planned', 'a', 10, 3, { step: 1 }),
      marker('finish', 'f', 50, 10),
      marker('planned', 'p', 30, 50, { step: 2 }),
    ],
    gaps: [{ limb: 'rf', from: { x: 27.5, y: 54 }, to: { x: 33, y: 53 } }],
    puffs: [{ seed: 3, at: { x: 12.5, y: 6 }, bornMs: 0 }],
    timeMs: 40,
  });

describe('renderScene', () => {
  it('is deterministic and returns the buffer it was given (AC 28)', () => {
    const s = busy();
    const a = createBuffer(G.width, G.height);
    expect(renderScene(a, G, s)).toBe(a);
    const b = renderScene(createBuffer(G.width, G.height), G, s);
    expect(b.data).toEqual(a.data);
    expect(renderScene(a, G, s).data).toEqual(b.data);
    expect(lit(a)).toBeGreaterThan(400);
  });

  it('draws planned → finish → gaps → climber → start brackets → target → puffs', () => {
    const s = busy();
    const expected = createBuffer(G.width, G.height);
    const [target, start, plannedA, finish, plannedP] = s.markers as HoldMarker[];
    for (const m of [plannedA!, plannedP!, finish!]) rasterMarker(expected, G, m, 40, false);
    rasterGap(expected, G, s.gaps[0]!);
    rasterClimber(expected, G, climber);
    rasterMarker(expected, G, start!, 40, false);
    rasterMarker(expected, G, target!, 40, false);
    rasterPuff(expected, G, s.puffs[0]!, 40);
    expect(render(s).data).toEqual(expected.data);
  });

  it('puts the target and the start brackets over the climber', () => {
    const s = busy();
    const out = render(s);
    const targetAlone = render(scene({ markers: [s.markers[0]!], timeMs: 40 }));
    const climberAlone = render(scene({ climber }));
    targetAlone.data.forEach((v, i) => v && expect(out.data[i]).toBe(v));
    // Where the climber and the start brackets overlap, the brackets win (minus target and puffs).
    const startAlone = render(scene({ markers: [s.markers[1]!] }));
    const puffs = render(scene({ puffs: s.puffs, timeMs: 40 }));
    let overlap = 0;
    startAlone.data.forEach((v, i) => {
      if (!v || !climberAlone.data[i] || targetAlone.data[i] || puffs.data[i]) return;
      overlap++;
      expect(out.data[i]).toBe(v);
    });
    expect(overlap).toBeGreaterThan(0);
  });

  it('keeps the split start’s brackets and both hands visible (start brackets over the climber)', () => {
    const view = { scale: 343 / 1536, tx: 0, ty: 0, boxW: 343, boxH: 257.25, dpr: 2.625 };
    const grid = artGrid(view, pixelSize(splitStart.heightPx, view));
    const c: PixelClimber = { ...climber, joints: splitStart.joints as PixelJoints, heightPx: 424 };
    // Hold b, the start sloper under the right hand at (780, 540). The box is invented: 80 × 80
    // image px centred on that hand.
    const start = marker('start', 'b', 740, 500);
    start.bbox = { x: 740, y: 500, w: 80, h: 80 };
    const out = render(scene({ climber: c, markers: [start] }), grid);
    const startAlone = render(scene({ markers: [start] }), grid);
    const climberAlone = render(scene({ climber: c }), grid);

    // All four corner brackets: every bracket stroke pixel shows, and the climber is under them.
    const f = markerFrame(grid, start.bbox);
    const corners = [
      [f.x, f.y],
      [f.x + f.w - 1, f.y],
      [f.x, f.y + f.h - 1],
      [f.x + f.w - 1, f.y + f.h - 1],
    ] as const;
    for (const [x, y] of corners) expect(out.data[y * grid.width + x]).toBe(ROLE_COLOR.start);
    let underClimber = 0;
    startAlone.data.forEach((v, i) => {
      if (v !== ROLE_COLOR.start) return;
      expect(out.data[i]).toBe(v);
      if (climberAlone.data[i]) underClimber++;
    });
    expect(underClimber).toBeGreaterThan(0); // the case the old order hid

    // Both hands stay fully visible: their sprite pixels are as the climber alone draws them.
    for (const joint of ['lHand', 'rHand'] as const) {
      const h = artPixel(grid, c.joints[joint]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = (h.y + dy) * grid.width + h.x + dx;
          if (climberAlone.data[i])
            expect(out.data[i], `${joint} ${dx},${dy}`).toBe(climberAlone.data[i]);
        }
      }
    }
  });

  it('draws a repeated (holdId, role) only once, using the last one', () => {
    const first = marker('planned', 'p', 10, 10, { step: 1 });
    const last = marker('planned', 'p', 40, 40, { step: 2 });
    expect(render(scene({ markers: [first, last] })).data).toEqual(
      render(scene({ markers: [last] })).data,
    );
  });

  it('clears the buffer first', () => {
    const b = createBuffer(G.width, G.height);
    b.data.fill(COLOR.brick);
    expect(lit(renderScene(b, G, scene()))).toBe(0);
  });

  it('draws only the 6 newest puffs, and none with reduced motion (AC 24)', () => {
    const puffs: ChalkPuff[] = Array.from({ length: 8 }, (_, k) => ({
      seed: k + 1,
      at: { x: 8 + 9 * k, y: 40 },
      bornMs: 100 - k * 10, // puffs 6 and 7 are the oldest
    }));
    const t = 110;
    const shuffled = [
      puffs[6]!,
      puffs[2]!,
      puffs[0]!,
      puffs[7]!,
      puffs[5]!,
      puffs[1]!,
      puffs[4]!,
      puffs[3]!,
    ];
    const all = render(scene({ puffs: shuffled, timeMs: t }));
    const newest = render(scene({ puffs: puffs.slice(0, 6), timeMs: t }));
    expect(all.data).toEqual(newest.data);
    expect(lit(render(scene({ puffs: puffs.slice(6), timeMs: t })))).toBeGreaterThan(0);
    expect(lit(render(scene({ puffs, timeMs: t, reducedMotion: true })))).toBe(0);
  });

  it('holds the target still with reduced motion', () => {
    const s = scene({ markers: [marker('target', 't', 30, 30, { limb: 'lf' })] });
    expect(render({ ...s, timeMs: 400 }).data).not.toEqual(render({ ...s, timeMs: 0 }).data);
    expect(render({ ...s, timeMs: 400, reducedMotion: true }).data).toEqual(
      render({ ...s, timeMs: 0, reducedMotion: true }).data,
    );
  });
});

describe('clipping and empty input (AC 25, scene)', () => {
  it('gives an all-clear buffer for an empty scene', () => {
    expect(lit(render(scene()))).toBe(0);
  });

  it('does not throw on a 0 × 0 grid', () => {
    const g = identity(0, 0);
    expect(g.width).toBe(0);
    expect(() => renderScene(createBuffer(0, 0), g, busy())).not.toThrow();
  });

  it('leaves the buffer clear when everything is wholly outside the grid', () => {
    const away = (p: { x: number; y: number }) => ({ x: p.x + 500, y: p.y - 500 });
    const joints = Object.fromEntries(
      Object.entries(hang48.joints).map(([k, j]) => [k, { ...away(j), z: j.z }]),
    ) as PixelJoints;
    const gaps: ReachGap[] = [{ limb: 'lh', from: { x: 600, y: -400 }, to: { x: 650, y: -450 } }];
    const out = render(
      scene({
        climber: { ...climber, joints },
        markers: [
          marker('finish', 'f', 600, -500),
          marker('target', 't', -300, 20, { limb: 'lh' }),
        ],
        gaps,
        puffs: [{ seed: 1, at: { x: 600, y: -500 }, bornMs: 0 }],
        timeMs: 50,
      }),
    );
    expect(lit(out)).toBe(0);
  });

  it('draws nothing for a climber with a NaN joint, but still draws the markers', () => {
    const joints = { ...(hang48.joints as PixelJoints), lKnee: { x: NaN, y: 43 } };
    const m = [marker('start', 'a', 10, 10)];
    expect(render(scene({ climber: { ...climber, joints }, markers: m })).data).toEqual(
      render(scene({ markers: m })).data,
    );
  });
});

describe('nextChangeAt (AC 29)', () => {
  const target = marker('target', 't', 30, 30, { limb: 'rh' });
  const puff = (bornMs: number): ChalkPuff => ({ seed: 1, at: { x: 10, y: 10 }, bornMs });

  it('is null for an empty scene, or one with only still markers', () => {
    expect(nextChangeAt(scene())).toBeNull();
    expect(nextChangeAt(scene({ climber, markers: [marker('start', 'a', 1, 1)] }))).toBeNull();
  });

  it('gives the next multiple of 300 ms while a target is present', () => {
    for (const [t, next] of [
      [0, 300],
      [1, 300],
      [299.5, 300],
      [300, 600],
      [450, 600],
      [10_000, 10_200],
    ] as const) {
      expect(nextChangeAt(scene({ markers: [target], timeMs: t }))).toBe(next);
    }
  });

  it('gives the current time while a puff is alive', () => {
    expect(nextChangeAt(scene({ puffs: [puff(0)], timeMs: 0 }))).toBe(0);
    expect(nextChangeAt(scene({ puffs: [puff(0)], timeMs: 599 }))).toBe(599);
    expect(nextChangeAt(scene({ puffs: [puff(0)], timeMs: 600 }))).toBeNull();
  });

  it('gives the smaller of the two when both apply', () => {
    expect(nextChangeAt(scene({ markers: [target], puffs: [puff(100)], timeMs: 250 }))).toBe(250);
    expect(nextChangeAt(scene({ markers: [target], puffs: [puff(0)], timeMs: 650 }))).toBe(900);
  });

  it('gives a future puff’s birth time (builder’s call)', () => {
    expect(nextChangeAt(scene({ puffs: [puff(500)], timeMs: 100 }))).toBe(500);
    expect(nextChangeAt(scene({ markers: [target], puffs: [puff(500)], timeMs: 100 }))).toBe(300);
  });

  it('is null with reduced motion (no breathing, no puffs)', () => {
    expect(
      nextChangeAt(scene({ markers: [target], puffs: [puff(0)], timeMs: 10, reducedMotion: true })),
    ).toBeNull();
  });

  it('ignores puffs older than the 6 newest, which are not drawn', () => {
    // At 100 the oldest puff would be alive, but the six newest are all still to come.
    const puffs = [puff(0), ...Array.from({ length: 6 }, () => puff(500))];
    expect(nextChangeAt(scene({ puffs, timeMs: 100 }))).toBe(500);
  });
});
