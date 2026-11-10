import { expectGolden, HUB_GOLDEN_DIR } from '../../../tests/pixelGolden';
import { bufferToText, COLOR, createBuffer, measurePixelText } from '../pixel-kit';
import { placesFor } from './places';
import {
  ART_H,
  cameraFor,
  FEET_Y,
  promptText,
  renderHub,
  sceneryFor,
  signBox,
  worldWidth,
  type HubScene,
} from './render';

// SPEC-gym-hub G1–G3, G10 and AC 12: the hub scene, deterministic and snapshotted exactly.

const SAMPLES = [
  { id: 'routemake-g2-b1', name: 'Wall 1' },
  { id: 't-up-d2', name: 'Wall 2' },
];
const GYM = placesFor('gym', SAMPLES);
const BEGINNER = placesFor('beginner', SAMPLES);

const scene = (over: Partial<HubScene> = {}): HubScene => ({
  places: GYM,
  climber: { x: GYM[0]!.x, facing: 1, pose: 'idle', frame: 0 },
  camX: 0,
  prompt: null,
  bob: 0,
  ...over,
});

const render = (width: number, s: HubScene) => renderHub(createBuffer(width, ART_H), s);

describe('the world (G1, G2)', () => {
  it('is 108 art px tall and one place gap per place wide', () => {
    expect(ART_H).toBe(108);
    expect(worldWidth(GYM)).toBe(6 * 56);
    expect(worldWidth(BEGINNER)).toBe(5 * 56);
  });

  it('caches the static scenery per set of places', () => {
    const a = sceneryFor(GYM);
    expect(sceneryFor(placesFor('gym', SAMPLES))).toBe(a);
    expect([a.width, a.height]).toEqual([336, 108]);
    const b = sceneryFor(BEGINNER);
    expect(b).not.toBe(a);
    expect(b.width).toBe(280);
  });
});

describe('cameraFor', () => {
  it('centres the climber, held inside the world', () => {
    expect(cameraFor(168, 129, 336)).toBe(104);
    expect(cameraFor(28, 129, 336)).toBe(0);
    expect(cameraFor(320, 129, 336)).toBe(207);
  });

  it('centres a world narrower than the view', () => {
    expect(cameraFor(28, 400, 336)).toBe(-32);
    expect(cameraFor(300, 400, 336)).toBe(-32);
  });

  it('is a whole number of art px', () => {
    expect(Number.isInteger(cameraFor(100.4, 129, 336))).toBe(true);
  });
});

describe('promptText (G6)', () => {
  it('is the place label in capitals', () => {
    expect(GYM.map(promptText)).toEqual([
      'FRONT DESK',
      'LOCKERS',
      'WALL 1',
      'WALL 2',
      'NEW WALL',
      'SETTING ROOM',
    ]);
  });
});

describe('renderHub', () => {
  it('draws the whole gym, every place in floor order (gym level)', () => {
    expectGolden('hub-gym-336', render(336, scene()), 1, HUB_GOLDEN_DIR);
  });

  it('has no Setting Room door for a beginner (G9)', () => {
    const s = scene({ places: BEGINNER });
    expectGolden('hub-beginner-280', render(280, s), 1, HUB_GOLDEN_DIR);
  });

  it('draws the climber walking at Wall 1 with its prompt, through a phone-width camera', () => {
    const bay = GYM[2]!;
    const s = scene({
      climber: { x: bay.x, facing: -1, pose: 'idle', frame: 1 },
      camX: cameraFor(bay.x, 129, worldWidth(GYM)),
      prompt: bay,
      bob: 1,
    });
    expectGolden('hub-wall-1-prompt-129', render(129, s), 1, HUB_GOLDEN_DIR);
  });

  it('draws a walk frame between places, with no prompt', () => {
    const s = scene({
      climber: { x: 112.4, facing: 1, pose: 'walk', frame: 2 },
      camX: cameraFor(112.4, 129, worldWidth(GYM)),
    });
    expectGolden('hub-walking-129', render(129, s), 1, HUB_GOLDEN_DIR);
  });

  it('extends the ceiling, back wall and floor past the ends of a narrow world', () => {
    const b = render(400, scene({ camX: -32 }));
    expect(b.data.includes(COLOR.clear)).toBe(false);
    const column = (x: number) => Array.from({ length: ART_H }, (_, y) => b.data[y * 400 + x]);
    // World x = -32 and 367: no place there, just the gym's plain backdrop.
    for (const x of [0, 399]) {
      const c = column(x);
      expect(c[2]).toBe(COLOR.ink);
      expect(c[50]).toBe(COLOR.dusk);
      expect(c[FEET_Y]).toBe(COLOR.skinDeep);
    }
  });

  it('stands the climber with its feet on FEET_Y', () => {
    const b = render(336, scene({ climber: { x: 168, facing: 1, pose: 'idle', frame: 0 } }));
    const at = (x: number, y: number) => b.data[y * b.width + x];
    // The idle sprite's rubber rand is the bottom row, under the anchor column.
    expect(at(168, FEET_Y)).toBe(COLOR.dusk);
    expect(at(168, FEET_Y + 1)).toBe(COLOR.ink);
  });

  it('is deterministic and returns the buffer it was given', () => {
    const s = scene({ climber: { x: 200, facing: -1, pose: 'walk', frame: 3 }, camX: 120 });
    const a = createBuffer(129, ART_H);
    expect(renderHub(a, s)).toBe(a);
    expect(bufferToText(render(129, s))).toBe(bufferToText(a));
  });

  it('leaves no clear pixel in the picture', () => {
    const b = render(129, scene({ camX: 50 }));
    expect(b.data.includes(COLOR.clear)).toBe(false);
  });
});

describe('the converted castle (Amendment 2026-11-01, Acceptance C3b)', () => {
  const world = () => sceneryFor(GYM);
  const at = (x: number, y: number) => world().data[y * world().width + x];
  const NEIGHBOURS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  it('keeps every sign readable on stone: its chalk text touches only chalk or ink (C3b 2)', () => {
    for (const p of GYM) {
      const { x0, y0, x1, y1 } = signBox(p);
      let chalk = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          if (at(x, y) !== COLOR.chalk) continue;
          chalk++;
          for (const [dx, dy] of NEIGHBOURS)
            expect([COLOR.chalk, COLOR.ink], `${p.id} ${x + dx},${y + dy}`).toContain(
              at(x + dx, y + dy),
            );
        }
      expect(chalk, p.id).toBeGreaterThan(20);
    }
  });

  it('keeps the prompt on its ink plate: sun text touches only sun or ink (C3b 2)', () => {
    const bay = GYM[3]!;
    const camX = cameraFor(bay.x, 129, 336);
    const b = render(129, scene({ camX, prompt: bay }));
    // The plate: the text, a gap and the 5-px arrow, centred on the bay (render.ts drawPrompt).
    const width = measurePixelText(promptText(bay), true).width + 1 + 5 + 2;
    const left = bay.x - camX - Math.floor(width / 2);
    let sun = 0;
    for (let y = 33; y < 44; y++)
      for (let x = left; x < left + width; x++) {
        if (b.data[y * 129 + x] !== COLOR.sun) continue;
        sun++;
        for (const [dx, dy] of NEIGHBOURS)
          expect([COLOR.sun, COLOR.ink]).toContain(b.data[(y + dy) * 129 + x + dx]);
      }
    expect(sun).toBeGreaterThan(40);
  });

  it('carves each bay\'s "Wall n" plaque in slate, and keeps the gym\'s navy boards elsewhere', () => {
    for (const p of GYM) {
      const { x0, y0 } = signBox(p);
      expect(at(x0 + 1, y0 + 3), p.id).toBe(p.kind === 'bay' ? COLOR.dusk : COLOR.navy);
      expect(at(x0 + 2, y0 + 1), p.id).toBe(p.kind === 'bay' ? COLOR.dusk : COLOR.navy);
    }
  });

  it('sets each bay in a stone arch, a pier on either side', () => {
    for (const p of GYM.filter((q) => q.kind === 'bay')) {
      // Above the panel's round head, the arch's slate voussoirs; the panel below them.
      const ring = Array.from({ length: 6 }, (_, i) => at(p.x - 12, 18 + i));
      expect(ring).toContain(COLOR.slate);
      expect(at(p.x - 12, 30)).toBe(COLOR.slate);
      for (const x of [p.x - 28, p.x + 28]) expect(at(x, 76), `pier at ${x}`).toBe(COLOR.slate);
    }
  });

  it('shows no window glass between the gatehouse merlons (no pane framed into a cross)', () => {
    const desk = GYM[0]!;
    const glass = [COLOR.tide, COLOR.bloom, COLOR.lime, COLOR.sun];
    for (let y = 50; y < 57; y++)
      for (let x = desk.x - 24; x < desk.x + 23; x++)
        expect(glass, `${x},${y}`).not.toContain(at(x, y));
  });

  it('lights the floor with static lantern pools and window light, in palette colours only', () => {
    const floor = (x0: number, x1: number) => {
      const seen = new Set<number>();
      for (let y = 89; y < ART_H; y++) for (let x = x0; x < x1; x++) seen.add(at(x, y)!);
      return seen;
    };
    // Under the lantern on the pier between the bays: ember and sun dither on the floor.
    expect(floor(156, 181)).toContain(COLOR.ember);
    // In front of the lockers' window: its glass colours on the boards.
    const lockers = floor(GYM[1]!.x - 6, GYM[1]!.x + 14);
    for (const c of [COLOR.tide, COLOR.bloom, COLOR.lime]) expect(lockers).toContain(c);
    expect(Math.max(...world().data)).toBeLessThanOrEqual(15);
  });

  it('animates nothing new: with the same climber, the picture ignores the clock and the bob (C3b 3)', () => {
    const still = scene({ climber: { x: 112, facing: 1, pose: 'idle', frame: 0 } });
    const a = bufferToText(render(336, { ...still, bob: 0 }));
    const b = bufferToText(render(336, { ...still, bob: 1 }));
    expect(b).toBe(a);
  });
});
