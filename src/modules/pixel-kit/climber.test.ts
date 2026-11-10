import campus48 from '../../../tests/fixtures/pixel-kit/poses/campus-48.json';
import cross48 from '../../../tests/fixtures/pixel-kit/poses/cross-48.json';
import hang24 from '../../../tests/fixtures/pixel-kit/poses/hang-24.json';
import hang48 from '../../../tests/fixtures/pixel-kit/poses/hang-48.json';
import reachLeft48 from '../../../tests/fixtures/pixel-kit/poses/reach-left-48.json';
import splitStart from '../../../tests/fixtures/pixel-kit/poses/split-start.json';
import { expectGolden } from '../../../tests/pixelGolden';
import { bufferToText, createBuffer, type PixelBuffer } from './buffer';
import { limbThickness, rasterClimber, type PixelClimber } from './climber';
import { DEFAULT_LOOK, OUTFITS } from './outfits';
import { COLOR } from './palette';
import { REGULAR } from './sprites';
import type { PixelJointName, PixelJoints, PixelLimb } from './types';
import { artGrid, artPixel, pixelSize, toArt, type ArtGrid, type PixelView } from './view';

// SPEC-pixel-kit › Rendering Rules › Climber, AC 10–17 and AC 25 (climber). The grids map image
// px 1:1 to art px, so heightPx is the art height.

interface PoseFixture {
  name: string;
  heightPx: number;
  joints: Record<string, { x: number; y: number; z?: number }>;
}

const identity = (w: number, h: number, tx = 0): ArtGrid => {
  const view: PixelView = { scale: 1, tx, ty: 0, boxW: w, boxH: h, dpr: 1 };
  return artGrid(view, 1);
};

const ALL_GRIP = { lh: true, rh: true, lf: true, rf: true } as const;

const climber = (pose: PoseFixture, over: Partial<PixelClimber> = {}): PixelClimber => ({
  joints: pose.joints as PixelJoints,
  heightPx: pose.heightPx,
  outfit: OUTFITS.starter,
  look: DEFAULT_LOOK,
  gripping: ALL_GRIP,
  selected: null,
  mood: 'ok',
  ...over,
});

const render = (grid: ArtGrid, c: PixelClimber) => {
  const b = createBuffer(grid.width, grid.height);
  rasterClimber(b, grid, c);
  return b;
};

const at = (b: PixelBuffer, x: number, y: number) => b.data[y * b.width + x]!;

const neighbours = (b: PixelBuffer, x: number, y: number) =>
  (
    [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const
  ).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < b.width && ny < b.height);

const G41x60 = identity(41, 60);

describe('limbThickness (AC 11)', () => {
  it('scales the limbs with the art height', () => {
    expect(limbThickness(48)).toEqual({ arm: 2, thigh: 4, shank: 3, compact: false });
    expect(limbThickness(60)).toEqual({ arm: 3, thigh: 5, shank: 4, compact: false });
    expect(limbThickness(36)).toEqual({ arm: 2, thigh: 3, shank: 2, compact: false });
    expect(limbThickness(30)).toEqual({ arm: 1, thigh: 1, shank: 1, compact: true });
  });
});

describe('anchors (AC 10)', () => {
  const c = climber(hang48);
  const b = render(G41x60, c);
  const look = DEFAULT_LOOK;
  const o = OUTFITS.starter;

  it('puts each hand sprite anchor on artPixel(hand)', () => {
    for (const j of ['lHand', 'rHand'] as const) {
      const { x, y } = artPixel(G41x60, c.joints[j]);
      expect([at(b, x - 1, y - 1), at(b, x, y - 1), at(b, x + 1, y - 1)]).toEqual([
        COLOR.chalk,
        look.skin,
        COLOR.chalk,
      ]);
      expect(at(b, x, y)).toBe(look.skin);
      expect(at(b, x, y + 1)).toBe(look.skin);
    }
  });

  it('puts each foot sprite anchor on artPixel(foot), with the left foot mirrored', () => {
    const r = artPixel(G41x60, c.joints.rFoot);
    expect([-1, 0, 1, 2].map((d) => at(b, r.x + d, r.y))).toEqual(Array(4).fill(COLOR.dusk));
    expect(at(b, r.x + 2, r.y - 2)).not.toBe(o.shoes); // 'FFF.': the right foot's top-right is clear
    const l = artPixel(G41x60, c.joints.lFoot);
    expect([-2, -1, 0, 1].map((d) => at(b, l.x + d, l.y))).toEqual(Array(4).fill(COLOR.dusk));
    expect(at(b, l.x - 2, l.y - 2)).not.toBe(o.shoes);
  });

  it('puts the head sprite anchor on artPixel(head)', () => {
    const { x, y } = artPixel(G41x60, c.joints.head);
    expect([-3, -2, -1, 0, 1, 2, 3].map((d) => at(b, x + d, y))).toEqual(Array(7).fill(look.hair));
    expect(at(b, x, y - 1)).toBe(o.band);
    expect(at(b, x, y - 4)).toBe(o.hat);
    expect([at(b, x - 3, y + 1), at(b, x + 3, y + 1)]).toEqual([look.skin, look.skin]);
  });
});

describe('outline (AC 12)', () => {
  const poses = [hang48, reachLeft48, campus48, cross48];
  it.each(['ok', 'strain'] as const)('leaves no %s fill pixel next to a clear pixel', (mood) => {
    for (const pose of poses) {
      const grid = identity(41, 66);
      const b = render(grid, climber(pose, { mood }));
      for (let y = 0; y < b.height; y++) {
        for (let x = 0; x < b.width; x++) {
          const v = at(b, x, y);
          if (v === COLOR.clear || v === COLOR.ink || v === COLOR.sun) continue;
          for (const [nx, ny] of neighbours(b, x, y)) expect(at(b, nx, ny)).not.toBe(COLOR.clear);
        }
      }
    }
  });
});

describe('mirror (AC 13)', () => {
  it('draws the mirrored symmetric hang as the column-reversed buffer', () => {
    const W = G41x60.width;
    const swap = (n: string) =>
      n.startsWith('l') ? `r${n.slice(1)}` : n.startsWith('r') ? `l${n.slice(1)}` : n;
    const mirroredJoints = Object.fromEntries(
      Object.entries(hang48.joints).map(([n, j]) => [swap(n), { ...j, x: W - j.x }]),
    ) as PixelJoints;
    const pelvis = artPixel(G41x60, hang48.joints.pelvis);
    expect(W % 2).toBe(1);
    expect(pelvis.x).toBe((W - 1) / 2);
    for (const j of Object.values(hang48.joints)) expect(j.x % 1).toBe(0.5);

    const a = render(G41x60, climber(hang48));
    const m = render(G41x60, climber(hang48, { joints: mirroredJoints }));
    const reversed = createBuffer(W, a.height);
    for (let y = 0; y < a.height; y++)
      for (let x = 0; x < W; x++) reversed.data[y * W + (W - 1 - x)] = at(a, x, y);
    expect(bufferToText(m)).toBe(bufferToText(reversed));
  });
});

describe('draw order (AC 14)', () => {
  const withArmZ = (lz: number, rz: number) => {
    const j = structuredClone(cross48.joints) as PixelJoints;
    for (const n of ['lShoulder', 'lElbow', 'lHand'] as const) j[n].z = lz;
    for (const n of ['rShoulder', 'rElbow', 'rHand'] as const) j[n].z = rz;
    return render(G41x60, climber(cross48, { joints: j }));
  };
  /** Pixels on the left forearm's centre line, around where the forearms cross. */
  const lForearm = () => {
    const e = cross48.joints.lElbow;
    const h = cross48.joints.lHand;
    return [0.35, 0.45, 0.5, 0.55, 0.65].map((t) => ({
      x: Math.floor(e.x + t * (h.x - e.x)),
      y: Math.floor(e.y + t * (h.y - e.y)),
    }));
  };

  it('lets the nearer arm (larger z) cross over the other', () => {
    const leftFront = withArmZ(1, -1);
    const rightFront = withArmZ(-1, 1);
    expect(bufferToText(leftFront)).not.toBe(bufferToText(rightFront));
    expect(lForearm().every((p) => at(leftFront, p.x, p.y) === DEFAULT_LOOK.skin)).toBe(true);
    expect(lForearm().some((p) => at(rightFront, p.x, p.y) === COLOR.ink)).toBe(true);
  });

  it('uses lf, rf, lh, rh when a joint has no z', () => {
    const j = structuredClone(cross48.joints) as PixelJoints;
    for (const n of Object.keys(j) as PixelJointName[]) delete j[n].z;
    const noZ = render(G41x60, climber(cross48, { joints: j }));
    expect(bufferToText(noZ)).toBe(bufferToText(withArmZ(-1, 1)));
  });
});

describe('hands and feet over the trunk (AC 14, OQ 11)', () => {
  /** The cells of `limb`'s end sprite, placed at its anchor, as "x,y" → slot letter. */
  const endSprite = (grid: ArtGrid, pose: PoseFixture, limb: PixelLimb, c: PixelClimber) => {
    const joint = { lh: 'lHand', rh: 'rHand', lf: 'lFoot', rf: 'rFoot' }[limb] as PixelJointName;
    const s =
      limb === 'lf'
        ? REGULAR.footLeft
        : limb === 'rf'
          ? REGULAR.footRight
          : c.gripping[limb]
            ? REGULAR.handGrip
            : REGULAR.handOpen;
    const at0 = artPixel(grid, pose.joints[joint]!);
    const cells = new Map<string, string>();
    s.rows.forEach((row, r) =>
      [...row].forEach((cell, col) => {
        if (cell !== '.') cells.set(`${at0.x - s.ax + col},${at0.y - s.ay + r}`, cell);
      }),
    );
    return cells;
  };
  const slotColor = (c: PixelClimber, cell: string) =>
    ({ S: c.look.skin, C: COLOR.chalk, F: c.outfit.shoes, r: COLOR.dusk })[cell];

  /** Point in polygon (even-odd). */
  const inside = (p: { x: number; y: number }, poly: { x: number; y: number }[]) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!;
      const b = poly[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r;
    }
    return r;
  };

  /** Every end-sprite cell shows its slot colour, and no trunk-top fill touches it. */
  const expectEndsVisible = (grid: ArtGrid, pose: PoseFixture, c: PixelClimber) => {
    const b = render(grid, c);
    for (const limb of ['lh', 'rh', 'lf', 'rf'] as const) {
      const cells = endSprite(grid, pose, limb, c);
      for (const [key, cell] of cells) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        expect(at(b, x, y), `${limb} ${key}`).toBe(slotColor(c, cell));
        for (const [nx, ny] of neighbours(b, x, y)) {
          if (cells.has(`${nx},${ny}`)) continue;
          // The limb's own forearm or shank may join the sprite; the trunk (the top) may not.
          expect(at(b, nx, ny), `${limb} ${nx},${ny}`).not.toBe(c.outfit.top);
        }
      }
    }
    return b;
  };

  it('keeps the split start’s right hand, inside the trunk quad, fully visible and outlined', () => {
    // A phone fit of a 1536 × 1152 wall photo: P = 5, art height 49.7.
    const view: PixelView = {
      scale: 343 / 1536,
      tx: 0,
      ty: 0,
      boxW: 343,
      boxH: 257.25,
      dpr: 2.625,
    };
    const grid = artGrid(view, pixelSize(splitStart.heightPx, view));
    expect(grid.px).toBe(5);
    const pose = splitStart as PoseFixture;
    const j = pose.joints;
    const quad = (['lShoulder', 'rShoulder', 'rHip', 'lHip'] as const).map((n) =>
      toArt(grid, j[n]!),
    );
    expect(inside(toArt(grid, j.rHand!), quad)).toBe(true); // the case the old order hid
    const c = climber(pose);
    const b = expectEndsVisible(grid, pose, c);
    // The hand is ringed in ink where it sits on the trunk.
    const hand = endSprite(grid, pose, 'rh', c);
    let inked = 0;
    for (const key of hand.keys()) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      for (const [nx, ny] of neighbours(b, x, y)) {
        if (!hand.has(`${nx},${ny}`) && at(b, nx, ny) === COLOR.ink) inked++;
      }
    }
    expect(inked).toBeGreaterThan(4);
  });

  it('keeps every hand and foot of the other poses fully visible', () => {
    for (const pose of [hang48, reachLeft48, cross48] as PoseFixture[]) {
      expectEndsVisible(G41x60, pose, climber(pose));
    }
  });
});

describe('selected limb (AC 15)', () => {
  it("turns only the outline next to the right foot's sprite from ink to sun", () => {
    const base = render(G41x60, climber(hang48));
    const sel = render(G41x60, climber(hang48, { selected: 'rf' }));
    const foot = artPixel(G41x60, hang48.joints.rFoot);
    const s = REGULAR.footRight;
    const spriteFill = new Set<string>();
    s.rows.forEach((row, r) =>
      [...row].forEach((cell, col) => {
        if (cell !== '.') spriteFill.add(`${foot.x - s.ax + col},${foot.y - s.ay + r}`);
      }),
    );
    let changed = 0;
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        if (at(base, x, y) === at(sel, x, y)) continue;
        changed++;
        expect(at(base, x, y)).toBe(COLOR.ink);
        expect(at(sel, x, y)).toBe(COLOR.sun);
        expect(neighbours(base, x, y).some(([nx, ny]) => spriteFill.has(`${nx},${ny}`))).toBe(true);
      }
    }
    expect(changed).toBeGreaterThan(4);
  });
});

describe('mood (AC 16)', () => {
  const ok = render(G41x60, climber(hang48));

  it("'fail' clears odd fill pixels and keeps the ink outline", () => {
    const fail = render(G41x60, climber(hang48, { mood: 'fail' }));
    for (let y = 0; y < ok.height; y++) {
      for (let x = 0; x < ok.width; x++) {
        const v = at(ok, x, y);
        expect(at(fail, x, y) === COLOR.ink).toBe(v === COLOR.ink);
        if (v === COLOR.clear || v === COLOR.ink) expect(at(fail, x, y)).toBe(v);
        else expect(at(fail, x, y)).toBe((x + y) % 2 ? COLOR.clear : v);
      }
    }
  });

  it("'strain' adds a 2×3 tide drop with its ink outline and changes nothing else", () => {
    const strain = render(G41x60, climber(hang48, { mood: 'strain' }));
    const tide: [number, number][] = [];
    const ink: [number, number][] = [];
    for (let y = 0; y < ok.height; y++) {
      for (let x = 0; x < ok.width; x++) {
        if (at(ok, x, y) === at(strain, x, y)) continue;
        expect(at(ok, x, y)).toBe(COLOR.clear);
        if (at(strain, x, y) === COLOR.tide) tide.push([x, y]);
        else {
          expect(at(strain, x, y)).toBe(COLOR.ink);
          ink.push([x, y]);
        }
      }
    }
    expect(tide).toHaveLength(6);
    const xs = new Set(tide.map((p) => p[0]));
    const ys = new Set(tide.map((p) => p[1]));
    expect([xs.size, ys.size]).toEqual([2, 3]);
    for (const [x, y] of ink) {
      expect(neighbours(strain, x, y).some(([nx, ny]) => at(strain, nx, ny) === COLOR.tide)).toBe(
        true,
      );
    }
    // 1 px above the head's top-right corner.
    const head = artPixel(G41x60, hang48.joints.head);
    const right = head.x - REGULAR.head.ax + REGULAR.head.w - 1;
    const top = head.y - REGULAR.head.ay;
    expect(Math.max(...xs)).toBe(right);
    expect(Math.max(...ys)).toBe(top - 2);
  });
});

describe('goldens (AC 17)', () => {
  it.each([
    ['climber-hang-48', hang48, {}],
    ['climber-reach-left-48', reachLeft48, {}],
    ['climber-fail-48', hang48, { mood: 'fail' }],
    ['climber-strain-48', hang48, { mood: 'strain' }],
    ['climber-selected-rf-48', hang48, { selected: 'rf' }],
  ] as [string, PoseFixture, Partial<PixelClimber>][])('%s', (name, pose, over) => {
    expectGolden(name, render(G41x60, climber(pose, over)));
  });

  it('climber-campus-48 (feet off; an open right hand)', () => {
    const gripping: Record<PixelLimb, boolean> = { lh: true, rh: false, lf: false, rf: false };
    expectGolden('climber-campus-48', render(identity(41, 66), climber(campus48, { gripping })));
  });

  it('climber-compact-24 (the compact set below art height 36)', () => {
    expectGolden('climber-compact-24', render(identity(24, 32), climber(hang24)));
  });

  it.each(Object.values(OUTFITS))('climber-hang-48-$id', (outfit) => {
    expectGolden(`climber-hang-48-${outfit.id}`, render(G41x60, climber(hang48, { outfit })));
  });

  it('climber-edge-48 (half off the left edge, clipped)', () => {
    const grid = identity(41, 60, -20);
    expectGolden('climber-edge-48', render(grid, climber(hang48)));
  });
});

describe('clipping and bad input (AC 25, climber)', () => {
  it('draws only the in-grid pixels of a climber partly off the grid', () => {
    const full = render(G41x60, climber(hang48));
    const edge = render(identity(41, 60, -20), climber(hang48));
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 21; x++) expect(at(edge, x, y)).toBe(at(full, x + 20, y));
  });

  it('leaves the buffer unchanged for a climber wholly outside', () => {
    for (const tx of [-200, 200]) {
      const b = createBuffer(41, 60);
      b.data[5] = COLOR.lime;
      const before = bufferToText(b);
      expect(() => rasterClimber(b, identity(41, 60, tx), climber(hang48))).not.toThrow();
      expect(bufferToText(b)).toBe(before);
    }
  });

  it('draws nothing when a joint is not finite', () => {
    for (const bad of [
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 1, y: 1, z: NaN },
    ]) {
      const j = { ...(hang48.joints as PixelJoints), lKnee: bad };
      const b = render(G41x60, climber(hang48, { joints: j }));
      expect(b.data.every((v) => v === 0)).toBe(true);
    }
  });

  it('does not throw on a 0 × 0 grid', () => {
    expect(() => render(identity(0, 0), climber(hang48))).not.toThrow();
  });
});
