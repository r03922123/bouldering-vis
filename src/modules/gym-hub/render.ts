import {
  COLOR,
  createBuffer,
  createRng,
  hashSeed,
  measurePixelText,
  rasterText,
  type PixelBuffer,
} from '../pixel-kit';
import {
  archedLeaf,
  BANNERS,
  banner,
  box,
  CHEST,
  fillRect,
  LANTERN,
  lightPool,
  paintGrid,
  pier,
  plot,
  PORTCULLIS,
  stampProp,
  stoneArch,
  WINDOW,
  windowLight,
} from './castle';
import { PLACE_GAP, type Place } from './places';
import {
  climberColors,
  climberSprite,
  MAGS,
  MAGS_COLORS,
  stampOutlined,
  type HubSprite,
} from './sprites';

// SPEC-gym-hub G1–G3, G10. The gym is one strip of world, 108 art px tall and one place gap per
// place wide. Its static scenery (the converted castle of the 2026-11-01 amendment: timber roof,
// masonry, piers, the bays in their arches, the gatehouse desk, the chests, the doors, banners,
// lanterns and their light, and the pixel-font signs) is rasterised once per set of places; each frame copies the camera's
// window of it and adds Mags, the climber and the prompt. Pure: the picture depends only on the
// scene, so tests snapshot it exactly; HubScreen owns the clock and the camera's easing.

export const ART_H = 108;
/** The climber's bottom row (the rubber of its shoes), on the walkway in front of the wall. */
export const FEET_Y = 100;

// Rows, top to bottom.
const BEAM_Y = 5; // the timber wall plate under the roof, rows 5–6, an ink shadow on row 7
const WALL_Y = 8; // the masonry wall, rows 8–86
const SKIRT_Y = 87; // the stone plinth: ink, then slate
const FLOOR_Y = 89; // wooden boards to the bottom
const SIGN_Y = 10; // the sign rail: every place's sign hangs here
const PROMPT_Y = 34; // the prompt sits just under the sign rail

export interface HubScene {
  /** In floor order (placesFor). */
  places: readonly Place[];
  climber: { x: number; facing: 1 | -1; pose: 'walk' | 'idle'; frame: number };
  /** World x of the view's left edge, in whole art px; negative when the world is centred. */
  camX: number;
  /** The place the climber stands at, which shows its prompt; null while walking. */
  prompt: Place | null;
  /** The prompt arrow's bob, 0 or 1 (always 0 with reduced motion, G14). */
  bob: 0 | 1;
}

export function worldWidth(places: readonly Place[]): number {
  return places.length * PLACE_GAP;
}

/** The camera's left edge for a climber at x: centred on it, held inside the world. */
export function cameraFor(x: number, viewW: number, worldW: number): number {
  if (viewW >= worldW) return Math.round((worldW - viewW) / 2);
  return Math.min(worldW - viewW, Math.max(0, Math.round(x - viewW / 2)));
}

/** The prompt's pixel text: the place's label in capitals (≤ 12 characters, pixel-kit P7). */
export function promptText(place: Place): string {
  return place.label.toUpperCase();
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Ashlar courses on the back wall: 6 rows each (the last is mortar), stones 14 wide, staggered. */
const COURSE = 6;
const STONE = 14;

/**
 * The castle hall at any world column (Amendment 2026-11-01): a dark timber roof with brick rafters
 * over a timber wall plate, dusk ashlar with ink mortar and a slate catch-light on each stone, a
 * stone plinth, then the floorboards. Value-compressed, so the places in front read first.
 */
function backdrop(x: number, y: number): number {
  if (y < BEAM_Y) return mod(x, 6) === 0 ? COLOR.brick : COLOR.ink;
  if (y < WALL_Y - 1) return y === BEAM_Y + 1 && mod(x, 14) === 3 ? COLOR.ink : COLOR.skinDeep;
  if (y === WALL_Y - 1) return COLOR.ink;
  if (y < SKIRT_Y) {
    const row = y - WALL_Y;
    if (row % COURSE === COURSE - 1) return COLOR.ink;
    const j = mod(x + (Math.floor(row / COURSE) % 2 ? STONE / 2 : 0), STONE);
    if (j === 0) return COLOR.ink;
    return row % COURSE === 0 && (j === 1 || j === 2) ? COLOR.slate : COLOR.dusk;
  }
  if (y === SKIRT_Y) return COLOR.ink;
  if (y < FLOOR_Y) return COLOR.slate;
  // Boards: seams at rows 96 and 103; butt joints staggered from row to row.
  if (y === 96 || y === 103) return COLOR.ink;
  const joint = y < 96 ? 0 : y < 103 ? 16 : 8;
  return mod(x, 32) === joint ? COLOR.ink : COLOR.skinDeep;
}

/** The pixel-font name on each sign (a door's two words on two lines). Exported for tests. */
export function signText(p: Place): string {
  if (p.kind === 'desk') return 'DESK';
  if (p.kind === 'new-wall') return 'NEW\nWALL';
  if (p.kind === 'setting-room') return 'SETTING\nROOM';
  return p.label.toUpperCase();
}

/** A sign's box on the sign rail (x1, y1 exclusive). Exported for tests. */
export function signBox(p: Place): { x0: number; y0: number; x1: number; y1: number } {
  const t = measurePixelText(signText(p), true);
  const w = t.width + 4;
  const x0 = p.x - Math.floor(w / 2);
  return { x0, y0: SIGN_Y, x1: x0 + w, y1: SIGN_Y + t.height + 4 };
}

/**
 * Every place's sign, with chalk text in an ink outline (Acceptance C3b 2). A bay's is a plaque
 * carved into the keystone of its arch (slate, its recess shaded dusk on the top and left); the
 * others are the gym's own navy boards, hung from the wall plate.
 */
function drawSign(buf: PixelBuffer, p: Place) {
  const { x0, y0, x1, y1 } = signBox(p);
  if (p.kind === 'bay') {
    box(buf, x0, y0, x1, y1, COLOR.slate);
    fillRect(buf, x0 + 1, y0 + 1, x1 - 1, y0 + 2, COLOR.dusk);
    fillRect(buf, x0 + 1, y0 + 1, x0 + 2, y1 - 1, COLOR.dusk);
  } else {
    for (const hx of [x0 + 3, x1 - 4]) fillRect(buf, hx, WALL_Y, hx + 1, SIGN_Y, COLOR.ink);
    box(buf, x0, y0, x1, y1, COLOR.navy);
  }
  rasterText(buf, x0 + 2, y0 + 2, signText(p), COLOR.chalk, COLOR.ink);
}

const HOLD_COLORS = [COLOR.sun, COLOR.bloom, COLOR.lime, COLOR.ember, COLOR.tide, COLOR.chalk];
// Hold shapes: a jug, a crimp, a pinch, a sloper (filled, outlined by stampOutlined).
// original, drawn for Bloc Hall, 2026-11-01
const HOLD_SHAPES: readonly HubSprite[] = [
  { w: 4, h: 2, ax: 1, ay: 0, rows: ['AAAA', '.AA.'] },
  { w: 3, h: 1, ax: 1, ay: 0, rows: ['AAA'] },
  { w: 2, h: 3, ax: 0, ay: 1, rows: ['AA', 'AA', 'A.'] },
  { w: 4, h: 2, ax: 1, ay: 1, rows: ['.AA.', 'AAAA'] },
];

/** A bay's arch: its centre row and inner radius (the opening is the climbing panel). */
const ARCH_CY = 41;
const ARCH_R = 23;
/** Inside the bay's opening, clear of its ink edge. */
const inOpening = (dx: number, y: number) =>
  y < ARCH_CY ? Math.hypot(dx, y - ARCH_CY) < ARCH_R - 0.5 : Math.abs(dx) < ARCH_R;

/**
 * A climbing wall set in a stone arch between two piers: the round-headed slate panel with a few
 * holds seeded by its sample, a navy kicker board, and the crash mat on the floor in front.
 */
function drawBay(buf: PixelBuffer, p: Place) {
  stoneArch(buf, p.x, ARCH_CY, ARCH_R);
  for (let y = ARCH_CY - ARCH_R; y < SKIRT_Y; y++)
    for (let x = p.x - ARCH_R - 1; x <= p.x + ARCH_R + 1; x++) {
      const dx = x - p.x;
      if (inOpening(dx, y))
        plot(buf, x, y, y < 80 ? COLOR.slate : y === 80 ? COLOR.ink : COLOR.navy);
      else if (y >= ARCH_CY && Math.abs(dx) <= ARCH_R + 1)
        plot(buf, x, y, Math.abs(dx) === ARCH_R ? COLOR.ink : COLOR.slate);
    }
  const seed = hashSeed(...[...(p.sampleId ?? p.id)].map((c) => c.codePointAt(0)!));
  const rng = createRng(seed);
  const placed: { x: number; y: number }[] = [];
  for (let tries = 0; placed.length < 9 && tries < 200; tries++) {
    const x = p.x - 18 + Math.floor(rng() * 36);
    const y = 29 + Math.floor(rng() * 47);
    const shape = HOLD_SHAPES[Math.floor(rng() * HOLD_SHAPES.length)]!;
    const color = HOLD_COLORS[Math.floor(rng() * HOLD_COLORS.length)]!;
    if (placed.some((q) => Math.abs(q.x - x) < 8 && Math.abs(q.y - y) < 7)) continue;
    // The hold and its outline stay inside the arch's opening.
    const l = x - shape.ax - 1 - p.x;
    const r = x - shape.ax + shape.w - p.x;
    const t = y - shape.ay - 1;
    if (![l, r].every((dx) => inOpening(dx, t))) continue;
    placed.push({ x, y });
    stampOutlined(buf, shape, x, y, () => color);
  }
  // The crash mat on the floor in front, in three padded sections.
  box(buf, p.x - 25, FLOOR_Y, p.x + 25, 96, COLOR.navy);
  fillRect(buf, p.x - 24, FLOOR_Y + 1, p.x + 24, FLOOR_Y + 2, COLOR.tide);
  for (const sx of [p.x - 8, p.x + 8]) fillRect(buf, sx, FLOOR_Y + 1, sx + 1, 95, COLOR.ink);
}

/**
 * The window behind the gatehouse, shortened so its sill sits on the merlon line (rows 48–49):
 * its head and body over the window's own sill, so no glass shows between the merlons, where one
 * framed pane would read as a cross. Derived from WINDOW, not a new grid.
 */
const DESK_WINDOW_Y = 24;
const DESK_WINDOW = {
  ...WINDOW,
  h: 26,
  rows: [...WINDOW.rows.slice(0, 24), ...WINDOW.rows.slice(-2)],
};

/**
 * The front desk as a timber gatehouse: two posts and a lintel with timber merlons, a raised
 * portcullis showing its iron teeth, a window high behind, and the plank counter Mags stands at.
 */
function drawDesk(buf: PixelBuffer, p: Place) {
  const x0 = p.x - 24;
  const x1 = p.x + 23;
  paintGrid(buf, DESK_WINDOW, p.x, DESK_WINDOW_Y);
  // Merlons over the lintel, then the lintel and the posts.
  for (let mx = x0 + 1; mx + 5 <= x1; mx += 8) box(buf, mx, 50, mx + 5, 56, COLOR.skinDeep);
  box(buf, x0 - 1, 55, x1 + 1, 60, COLOR.skinDeep);
  fillRect(buf, x0, 56, x1, 57, COLOR.brick);
  for (const px of [x0 + 1, x1 - 5]) box(buf, px, 59, px + 4, 82, COLOR.skinDeep);
  paintGrid(buf, PORTCULLIS, p.x, 60);
  // The counter: an oak top over a plank front with an iron band.
  box(buf, x0, 81, x1, 95, COLOR.skinDeep);
  fillRect(buf, x0 + 1, 82, x1 - 1, 83, COLOR.skinMid);
  fillRect(buf, x0 + 1, 83, x1 - 1, 84, COLOR.ink);
  for (let sx = x0 + 6; sx < x1 - 1; sx += 6) fillRect(buf, sx, 84, sx + 1, 94, COLOR.brick);
  fillRect(buf, x0 + 1, 88, x1 - 1, 89, COLOR.slate);
  windowLight(buf, p.x + 4, 97, 107, 5);
}

/** The lockers: a row of three iron-banded chests under a tall leaded window, lit in colour. */
function drawLockers(buf: PixelBuffer, p: Place) {
  paintGrid(buf, WINDOW, p.x, 28);
  for (const dx of [-14, 0, 14]) stampProp(buf, CHEST, p.x + dx, 92);
  windowLight(buf, p.x + 2, 97, 107, 6);
}

/** New wall: an arched oak door in a stone surround, with iron strap hinges and a ring pull. */
function drawNewWallDoor(buf: PixelBuffer, p: Place) {
  const cx = p.x;
  stoneArch(buf, cx, 59, 11);
  for (const side of [-1, 1])
    for (let y = 59; y < SKIRT_Y + 1; y++) {
      const j = (y - 59) % 7 === 6;
      for (let d = 11; d <= 14; d++)
        fillRect(
          buf,
          cx + side * d,
          y,
          cx + side * d + 1,
          y + 1,
          d === 11 || d === 14 || j ? COLOR.ink : COLOR.slate,
        );
    }
  archedLeaf(buf, cx, 49, SKIRT_Y + 1, 10, COLOR.skinMid, COLOR.skinDeep);
  for (const hy of [60, 79]) {
    fillRect(buf, cx - 9, hy, cx + 4, hy + 2, COLOR.ink);
    for (let sx = cx - 7; sx < cx + 4; sx += 3) plot(buf, sx, hy, COLOR.slate);
  }
  box(buf, cx + 4, 68, cx + 8, 72, COLOR.sun);
}

/**
 * The Setting Room: a stair tower engaged in the hall's wall, its rounded masonry shaded light to
 * dark, stair slits climbing it, and a low green door with a lit barred window: the workshop.
 */
function drawTower(buf: PixelBuffer, p: Place) {
  const x0 = p.x - 18;
  const x1 = p.x + 18;
  const w = x1 - x0;
  for (let y = 0; y < SKIRT_Y; y++)
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / w;
      let v: number = COLOR.dusk;
      if (x === x0 || x === x1) v = COLOR.ink;
      else if ((y + 3) % COURSE === 0) v = COLOR.ink;
      else {
        // Stones narrow towards the edges, as the tower turns away.
        const a = Math.asin(Math.max(-1, Math.min(1, 2 * u - 1)));
        const course = Math.floor((y + 3) / COURSE);
        const k = (a + (course % 2 ? 0.2 : 0)) / 0.4;
        const near = Math.abs(k - Math.round(k)) * 0.4 * Math.cos(a) * (w / 2);
        if (near < 0.5) v = COLOR.ink;
        else if (u > 0.12 && u < 0.38) v = COLOR.slate;
        else if (u > 0.86) v = COLOR.ink;
      }
      plot(buf, x, y, v);
    }
  for (const [sx, sy] of [
    [p.x + 9, 46],
    [p.x - 8, 36],
  ] as const) {
    box(buf, sx - 2, sy - 1, sx + 2, sy + 8, COLOR.slate);
    fillRect(buf, sx - 1, sy, sx + 1, sy + 7, COLOR.ink);
  }
  stoneArch(buf, p.x, 73, 8);
  for (const side of [-1, 1])
    for (let y = 73; y < SKIRT_Y + 1; y++)
      for (let d = 8; d <= 11; d++)
        fillRect(
          buf,
          p.x + side * d,
          y,
          p.x + side * d + 1,
          y + 1,
          d === 8 || d === 11 ? COLOR.ink : COLOR.slate,
        );
  archedLeaf(buf, p.x, 66, SKIRT_Y + 1, 7, COLOR.leaf, COLOR.dusk);
  box(buf, p.x - 3, 70, p.x + 4, 76, COLOR.sun);
  for (const bx of [p.x - 1, p.x + 1]) fillRect(buf, bx, 71, bx + 1, 75, COLOR.ink);
  fillRect(buf, p.x + 4, 79, p.x + 6, 81, COLOR.sun);
}

/** The piers between places (and at both ends), each with a roof truss post over its corbel. */
function drawPiers(buf: PixelBuffer, count: number) {
  for (let i = 0; i <= count; i++) {
    const x = i * PLACE_GAP;
    fillRect(buf, x - 2, 0, x + 3, WALL_Y, COLOR.ink);
    fillRect(buf, x - 1, 0, x + 2, WALL_Y - 1, COLOR.skinDeep);
    pier(buf, x, WALL_Y, SKIRT_Y + 1);
  }
}

/** On every inner pier: a banner (chevron, bend, quarters in turn) over a lantern and its pool. */
function drawPierDressing(buf: PixelBuffer, count: number) {
  for (let i = 1; i < count; i++) {
    const x = i * PLACE_GAP;
    banner(buf, BANNERS[(i - 1) % BANNERS.length]!, x, 31);
    stampProp(buf, LANTERN, x, 58);
    lightPool(buf, x, 95, 17, 6);
  }
}

let cache: { key: string; buf: PixelBuffer } | null = null;

/** The static scenery for these places, world-wide; cached until the places change. */
export function sceneryFor(places: readonly Place[]): PixelBuffer {
  const key = places.map((p) => `${p.id}@${p.x}`).join('|');
  if (cache?.key === key) return cache.buf;
  const buf = createBuffer(worldWidth(places), ART_H);
  for (let y = 0; y < ART_H; y++) {
    for (let x = 0; x < buf.width; x++) buf.data[y * buf.width + x] = backdrop(x, y);
  }
  for (const p of places) {
    if (p.kind === 'bay') drawBay(buf, p);
    else if (p.kind === 'desk') drawDesk(buf, p);
    else if (p.kind === 'lockers') drawLockers(buf, p);
    else if (p.kind === 'new-wall') drawNewWallDoor(buf, p);
  }
  drawPiers(buf, places.length);
  for (const p of places) if (p.kind === 'setting-room') drawTower(buf, p);
  drawPierDressing(buf, places.length);
  for (const p of places) drawSign(buf, p);
  cache = { key, buf };
  return buf;
}

// original, drawn for Bloc Hall, 2026-11-01
const ARROW: HubSprite = { w: 5, h: 3, ax: 2, ay: 2, rows: ['..A..', '.AAA.', 'AAAAA'] };
const STARTER = climberColors();
const sunFill = () => COLOR.sun;

/** "WALL 1 ▲": sun text and a bobbing arrow on an ink plate, kept inside the view. */
function drawPrompt(buf: PixelBuffer, place: Place, camX: number, bob: 0 | 1) {
  const text = promptText(place);
  const t = measurePixelText(text, true);
  const width = t.width + 1 + ARROW.w + 2;
  const left = Math.min(buf.width - width, Math.max(0, place.x - camX - Math.floor(width / 2)));
  fillRect(buf, left - 1, PROMPT_Y - 1, left + width + 1, PROMPT_Y + t.height + 1, COLOR.ink);
  rasterText(buf, left, PROMPT_Y, text, COLOR.sun, COLOR.ink);
  stampOutlined(buf, ARROW, left + t.width + 1 + 1 + ARROW.ax, PROMPT_Y + 6 - bob, sunFill);
}

/**
 * Draws the scene into `buf` (the view: its width is the camera's, its height ART_H) and returns
 * it. Draw order: scenery → Mags → climber → prompt.
 */
export function renderHub(buf: PixelBuffer, scene: HubScene): PixelBuffer {
  const { places, climber, camX, prompt, bob } = scene;
  const world = sceneryFor(places);
  const { width: w, height: h, data } = buf;
  // The camera's window of the scenery; past either end of the world, the plain gym goes on.
  const from = Math.max(0, -camX);
  const to = Math.min(w, world.width - camX);
  for (let y = 0; y < Math.min(h, ART_H); y++) {
    const row = y * w;
    if (to > from)
      data.set(
        world.data.subarray(y * world.width + camX + from, y * world.width + camX + to),
        row + from,
      );
    for (let x = 0; x < from; x++) data[row + x] = backdrop(x + camX, y);
    for (let x = Math.max(from, to); x < w; x++) data[row + x] = backdrop(x + camX, y);
  }
  const desk = places.find((p) => p.kind === 'desk');
  if (desk) stampOutlined(buf, MAGS, desk.x - 14 - camX, 80, MAGS_COLORS);
  const sprite = climberSprite(climber.pose, climber.frame, climber.facing);
  stampOutlined(buf, sprite, Math.round(climber.x) - camX, FEET_Y, STARTER);
  if (prompt) drawPrompt(buf, prompt, camX, bob);
  return buf;
}
