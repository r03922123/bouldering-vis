import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectGolden, HUB_GOLDEN_DIR } from '../../../tests/pixelGolden';
import {
  bufferToText,
  COLOR,
  createBuffer,
  DEFAULT_LOOK,
  OUTFITS,
  type PixelBuffer,
} from '../pixel-kit';
import {
  climberColors,
  climberSprite,
  IDLE,
  IDLE_MS,
  MAGS,
  MAGS_COLORS,
  mirrorSprite,
  stampOutlined,
  WALK,
  type HubSprite,
} from './sprites';

// SPEC-gym-hub G4 and AC 12, 15: the hub's own sprites, stamped with a 1-px ink outline.

/** The sprite stamped into a buffer 1 px larger on each side, so its whole outline shows. */
function stampedBuffer(s: HubSprite, colorOf: (cell: string) => number): PixelBuffer {
  const b = createBuffer(s.w + 2, s.h + 2);
  stampOutlined(b, s, s.ax + 1, s.ay + 1, colorOf);
  return b;
}
const stamped = (s: HubSprite, colorOf: (cell: string) => number) =>
  bufferToText(stampedBuffer(s, colorOf));

const starter = climberColors(OUTFITS.starter, DEFAULT_LOOK);
const flip = (text: string) =>
  text
    .split('\n')
    .map((r) => [...r].reverse().join(''))
    .join('\n');

describe('stampOutlined', () => {
  it('puts the anchor cell on the given pixel, with a 4-neighbour ink outline around the fill', () => {
    const dot: HubSprite = { w: 2, h: 1, ax: 0, ay: 0, rows: ['AA'] };
    const b = createBuffer(5, 3);
    stampOutlined(b, dot, 1, 1, () => COLOR.sun);
    expect(bufferToText(b)).toBe(['.11..', '1aa1.', '.11..'].join('\n'));
  });

  it('clips at the buffer edges', () => {
    const b = createBuffer(2, 2);
    stampOutlined(b, MAGS, -3, 40, () => COLOR.sun);
    stampOutlined(b, WALK[0]!, 0, 0, starter);
    expect(bufferToText(b)).toBe(['..', '..'].join('\n'));
    stampOutlined(b, { w: 1, h: 1, ax: 0, ay: 0, rows: ['A'] }, 1, 1, () => COLOR.sun);
    expect(bufferToText(b)).toBe(['.1', '1a'].join('\n'));
  });
});

describe('climber sprites (side view)', () => {
  it('has a 4-frame walk and a 2-frame idle, all 12 × 24 and anchored at the feet', () => {
    expect(WALK).toHaveLength(4);
    expect(IDLE).toHaveLength(2);
    for (const s of [...WALK, ...IDLE]) {
      expect([s.w, s.h, s.ax, s.ay]).toEqual([12, 24, 5, 23]);
    }
    expect(IDLE_MS).toBe(600);
  });

  it('takes its colours from the starter outfit and the default look', () => {
    expect(starter('H')).toBe(OUTFITS.starter.hat);
    expect(starter('B')).toBe(OUTFITS.starter.band);
    expect(starter('T')).toBe(OUTFITS.starter.top);
    expect(starter('P')).toBe(OUTFITS.starter.bottoms);
    expect(starter('F')).toBe(OUTFITS.starter.shoes);
    expect(starter('G')).toBe(OUTFITS.starter.bag);
    expect(starter('S')).toBe(DEFAULT_LOOK.skin);
    expect(starter('R')).toBe(DEFAULT_LOOK.hair);
    expect(climberColors()('T')).toBe(OUTFITS.starter.top);
  });

  it('faces left as the exact mirror of facing right, anchor and all', () => {
    for (const pose of ['walk', 'idle'] as const) {
      for (let f = 0; f < (pose === 'walk' ? 4 : 2); f++) {
        const right = climberSprite(pose, f, 1);
        const left = climberSprite(pose, f, -1);
        expect(left).toEqual(mirrorSprite(right));
        expect(left.ax).toBe(right.w - 1 - right.ax);
        expect(stamped(left, starter)).toBe(flip(stamped(right, starter)));
      }
    }
  });

  it('wraps frame numbers into the cycle', () => {
    expect(climberSprite('walk', 5, 1)).toBe(climberSprite('walk', 1, 1));
    expect(climberSprite('idle', 3, -1)).toBe(climberSprite('idle', 1, -1));
  });

  it('matches the exact pixels of every frame (starter outfit, facing right)', () => {
    WALK.forEach((s, i) => expectGolden(`walk-${i}`, stampedBuffer(s, starter), 1, HUB_GOLDEN_DIR));
    IDLE.forEach((s, i) => expectGolden(`idle-${i}`, stampedBuffer(s, starter), 1, HUB_GOLDEN_DIR));
  });

  it('breathes in the idle cycle: frame 1 lowers the head 1 px and keeps the feet', () => {
    const [a, b] = IDLE.map((s) => s.rows);
    expect(b![0]).toBe('............');
    expect(b!.slice(1, 10)).toEqual(a!.slice(0, 9));
    expect(b!.slice(11)).toEqual(a!.slice(11));
  });
});

describe('Mags, the front desk (original design, AC 15)', () => {
  it('is drawn chest-up, 14 × 17, anchored at the bottom centre', () => {
    expect([MAGS.w, MAGS.h, MAGS.ax, MAGS.ay]).toEqual([14, 17, 6, 16]);
  });

  it('matches its exact pixels', () => {
    expectGolden('mags', stampedBuffer(MAGS, MAGS_COLORS), 1, HUB_GOLDEN_DIR);
  });

  it('wears a headset that reads against her outline: slate band, cups and mic, never ink', () => {
    expect(MAGS_COLORS('E')).toBe(COLOR.slate);
    expect(MAGS_COLORS('M')).toBe(COLOR.slate);
    // The band crosses the top of her head; each ear cup is at least 2 px tall.
    expect(MAGS.rows[0]!.replace(/\./g, '')).toMatch(/^E+$/);
    for (const col of [0, MAGS.w - 1]) {
      expect(MAGS.rows.filter((r) => r[col] === 'M').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the outline rule (pixel-kit Rendering Rules, AC 12)', () => {
  it('leaves no fill pixel next to a clear one, on every sprite', () => {
    const all: (readonly [HubSprite, (c: string) => number])[] = [
      ...[...WALK, ...IDLE].flatMap((s) => [s, mirrorSprite(s)]).map((s) => [s, starter] as const),
      [MAGS, MAGS_COLORS],
    ];
    for (const [s, colorOf] of all) {
      const b = stampedBuffer(s, colorOf);
      const at = (x: number, y: number) => b.data[y * b.width + x]!;
      for (let y = 0; y < b.height; y++) {
        for (let x = 0; x < b.width; x++) {
          if (at(x, y) === COLOR.clear || at(x, y) === COLOR.ink) continue;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            expect(at(x + dx, y + dy), `${x + dx},${y + dy}`).not.toBe(COLOR.clear);
          }
        }
      }
    }
  });
});

describe('provenance (SPEC-game › Never)', () => {
  it('precedes every grid in sprites.ts with the provenance comment', () => {
    const lines = readFileSync(join(import.meta.dirname, 'sprites.ts'), 'utf8').split('\n');
    const defs = lines.flatMap((line, i) => (/=\s*sprite\(/.test(line) ? [i] : []));
    expect(defs).toHaveLength(7); // 4 walk, 2 idle, Mags
    for (const i of defs) {
      expect(lines[i - 1], `line ${i + 1}: ${lines[i]}`).toMatch(
        /^\s*\/\/ original, drawn for Bloc Hall, 2026-11-01$/,
      );
    }
  });
});
