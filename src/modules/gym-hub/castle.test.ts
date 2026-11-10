import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectGolden, HUB_GOLDEN_DIR } from '../../../tests/pixelGolden';
import { COLOR, createBuffer } from '../pixel-kit';
import {
  BANNERS,
  CASTLE_COLORS,
  CHEST,
  LANTERN,
  PORTCULLIS,
  WINDOW,
  type CastleGrid,
} from './castle';
import { stampOutlined } from './sprites';

// SPEC-gym-hub › Amendment 2026-11-01 (castle), Acceptance (C3b) 1 and 4: the castle's prop grids.

const ALL: readonly (readonly [string, CastleGrid])[] = [
  ['LANTERN', LANTERN],
  ['WINDOW', WINDOW],
  ['CHEST', CHEST],
  ['PORTCULLIS', PORTCULLIS],
  ...BANNERS.map((b, i) => [`BANNERS[${i}]`, b] as const),
];
const PALETTE_VALUES = new Set<number>(Object.values(COLOR));

describe('the castle grids', () => {
  it('are rectangular, and every letter is one of the 16 palette colours (no new colours)', () => {
    for (const [name, g] of ALL) {
      expect(g.rows, name).toHaveLength(g.h);
      for (const row of g.rows) expect(row, name).toHaveLength(g.w);
      for (const ch of new Set(g.rows.join('').replace(/\./g, ''))) {
        expect(CASTLE_COLORS[ch], `${name}: '${ch}'`).toBeDefined();
        expect(PALETTE_VALUES.has(CASTLE_COLORS[ch]!)).toBe(true);
      }
    }
  });

  it('stamp with a 1-px ink outline on every free-standing prop (pixel-kit outline rule)', () => {
    const props: (readonly [string, CastleGrid])[] = [
      ['LANTERN', LANTERN],
      ['CHEST', CHEST],
      ...BANNERS.map((b) => ['BANNER', b] as const),
    ];
    for (const [name, g] of props) {
      const b = createBuffer(g.w + 2, g.h + 2);
      stampOutlined(b, g, g.ax + 1, g.ay + 1, (c) => CASTLE_COLORS[c]!);
      const at = (x: number, y: number) => b.data[y * b.width + x];
      for (let y = 0; y < b.height; y++)
        for (let x = 0; x < b.width; x++) {
          const v = at(x, y);
          if (v === COLOR.clear || v === COLOR.ink) continue;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const)
            expect(at(x + dx, y + dy), `${name} ${x + dx},${y + dy}`).not.toBe(COLOR.clear);
        }
    }
  });

  it('give the banners three simple divisions: a chevron, a bend and quarters', () => {
    const [chevron, bend, quarters] = BANNERS.map((b) => b.rows);
    // Chevron: the charge's lowest row is widest apart, its top row meets in the middle.
    const top = chevron!.findIndex((r) => r.includes('y'));
    expect(chevron![top]).toMatch(/^t+yyt+$/);
    expect(chevron![top + 4]).toMatch(/^yyt+yy$/);
    // Bend: the charge steps one column right every two rows, top left to bottom right.
    bend!
      .slice(0, 18)
      .forEach((r, y) => expect(r.indexOf('n'), `row ${y}`).toBe(Math.floor(y / 2)));
    // Quarters: four fields, the diagonal pairs alike.
    expect(new Set(quarters!.slice(0, 9).map((r) => r))).toEqual(new Set(['gggggrrrrr']));
    expect(quarters![10]).toBe('rrrrrggggg');
  });

  it('leads the window in diamonds, with no full mullion or transom (no cross shape)', () => {
    const inside = WINDOW.rows.slice(2, -2).map((r) => r.slice(2, -2));
    for (let c = 0; c < inside[0]!.length; c++) {
      expect(
        inside.every((r) => r[c] === 'k'),
        `column ${c}`,
      ).toBe(false);
    }
    for (const r of inside) expect(r === 'k'.repeat(r.length)).toBe(false);
    for (const glass of ['t', 'p', 'g', 'y']) expect(WINDOW.rows.join('')).toContain(glass);
  });

  it('sets no lone bloom pane: each touches another bloom pane across one lead', () => {
    const rows = WINDOW.rows;
    const glass = (x: number, y: number) => 'tpgy'.includes(rows[y]?.[x] ?? '.');
    // Panes: 4-connected runs of one glass colour, bounded by the ink leading.
    const pane = rows.map((r) => [...r].map(() => -1));
    const colour: string[] = [];
    for (let y = 0; y < WINDOW.h; y++)
      for (let x = 0; x < WINDOW.w; x++) {
        if (!glass(x, y) || pane[y]![x]! >= 0) continue;
        const id = colour.push(rows[y]![x]!) - 1;
        const todo = [[x, y] as const];
        pane[y]![x] = id;
        while (todo.length) {
          const [a, b] = todo.pop()!;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const [nx, ny] = [a + dx, b + dy];
            if (glass(nx, ny) && pane[ny]![nx]! < 0 && rows[ny]![nx] === rows[b]![a]) {
              pane[ny]![nx] = id;
              todo.push([nx, ny]);
            }
          }
        }
      }
    // Neighbours: two steps apart across a single lead pixel.
    const near = colour.map(() => new Set<number>());
    for (let y = 0; y < WINDOW.h; y++)
      for (let x = 0; x < WINDOW.w; x++) {
        const id = pane[y]![x]!;
        if (id < 0) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const other = pane[y + 2 * dy]?.[x + 2 * dx] ?? -1;
          if (rows[y + dy]?.[x + dx] === 'k' && other >= 0 && other !== id) near[id]!.add(other);
        }
      }
    const bloom = colour.flatMap((c, i) => (c === 'p' ? [i] : []));
    expect(bloom.length).toBeGreaterThanOrEqual(4);
    for (const i of bloom) {
      expect(
        [...near[i]!].some((j) => colour[j] === 'p'),
        `bloom pane ${i}`,
      ).toBe(true);
    }
  });

  it('matches the exact pixels of every prop, stamped with its outline', () => {
    for (const [name, g] of ALL) {
      const b = createBuffer(g.w + 2, g.h + 2);
      stampOutlined(b, g, g.ax + 1, g.ay + 1, (c) => CASTLE_COLORS[c]!);
      const file = `castle-${name.toLowerCase().replace(/\[(\d)\]/, '-$1')}`;
      expectGolden(file, b, 1, HUB_GOLDEN_DIR);
    }
  });
});

describe('provenance (Acceptance C3b 1, SPEC-game › Never)', () => {
  it('precedes every grid in castle.ts with the provenance comment', () => {
    const lines = readFileSync(join(import.meta.dirname, 'castle.ts'), 'utf8').split('\n');
    const defs = lines.flatMap((line, i) => (/=\s*grid\(/.test(line) ? [i] : []));
    expect(defs).toHaveLength(7); // lantern, window, chest, portcullis, 3 banners
    for (const i of defs) {
      expect(lines[i - 1], `line ${i + 1}: ${lines[i]}`).toMatch(
        /^\s*\/\/ original, drawn for Bloc Hall, 2026-11-02$/,
      );
    }
  });
});
