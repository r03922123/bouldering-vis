import { render } from '@testing-library/react';
import type { MoveContext } from '../beta-moves';
import { annotateHolds } from './annotate';
import { SYNTHETIC } from './synthetic.fixture';
import { holdArrows } from './hints';
import { boxAt, contextFor } from './play';
import { ArrowLayer } from './ArrowLayer';

// SPEC-play-shell › Amendment 2026-11-02 (b) T1: the SVG the annotations are drawn as. The ⊗'s ×
// and the falls mark are diagonal, never an upright cross; a pull the player set is bloom; every
// badge circle is cut out of the drawing.

const hold = (id: string, dir: [number, number, number] | null, user = false) => ({
  id,
  label: id,
  base: { x: 100, y: 100 },
  dir,
  user,
});
const box = { x: 95, y: 95, w: 10, h: 10 };

/** Each straight segment of an SVG path "M x y L x y M …". */
function segments(d: string) {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i + 3 < n.length; i += 4) out.push([n[i]!, n[i + 1]!, n[i + 2]!, n[i + 3]!]);
  return out;
}

it('draws ⊗’s × and the falls mark diagonally, never as an upright +', () => {
  const { annotations } = annotateHolds(
    [hold('a', [0, 0.1, -0.99])],
    { scale: 1, tx: 0, ty: 0 },
    {
      boxes: () => box,
      badges: [],
      edit: false,
    },
  );
  const { container } = render(
    <ArrowLayer
      width={300}
      height={300}
      annotations={annotations}
      marks={[{ at: { x: 50, y: 50 }, kind: 'falls' }]}
      badges={[]}
    />,
  );
  const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d')!);
  expect(paths.length).toBeGreaterThanOrEqual(2);
  for (const d of paths)
    for (const [x1, y1, x2, y2] of segments(d)) {
      // Diagonal: it moves as far across as down, never along an axis.
      expect(Math.abs(x2 - x1)).toBeGreaterThan(1);
      expect(Math.abs(Math.abs(x2 - x1) - Math.abs(y2 - y1))).toBeLessThan(1e-6);
    }
});

it('colours a pull the player set in bloom, and cuts every badge out of the drawing', () => {
  const { annotations } = annotateHolds(
    [hold('a', [0, 1, 0], true), hold('b', [1, 0, 0])],
    { scale: 1, tx: 0, ty: 0 },
    { boxes: () => box, badges: [], edit: false },
  );
  const badges = [
    { x: 20, y: 20, r: 12 },
    { x: 200, y: 40, r: 15 },
  ];
  const { container } = render(
    <ArrowLayer width={300} height={300} annotations={annotations} marks={[]} badges={badges} />,
  );
  const fills = [...container.querySelectorAll('[data-hold="a"] polygon')].map((p) =>
    p.getAttribute('fill'),
  );
  expect(fills).toContain('#ffa3d6');
  const mask = container.querySelector('mask')!;
  const cut = [...mask.querySelectorAll('circle')].map((c) => ({
    x: Number(c.getAttribute('cx')),
    y: Number(c.getAttribute('cy')),
    r: Number(c.getAttribute('r')),
  }));
  expect(cut).toEqual(badges.map((b) => ({ x: b.x, y: b.y, r: b.r + 1.5 })));
  expect(container.querySelector('g[mask]')!.getAttribute('mask')).toBe(`url(#${mask.id})`);
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

it('review: on the synthetic route at the desktop and phone scales, every stroke is ≤ 3 CSS px, never scaled', () => {
  for (const scale of [0.546875, 0.2233]) {
    const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
    const view = { scale, tx: 0, ty: 0 };
    const boxOf = (id: string) => {
      const b = boxAt(ctx, ctx.holds.find((h) => h.id === id)!.centroid);
      return { x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale };
    };
    const { annotations } = annotateHolds(holdArrows(ctx), view, {
      boxes: boxOf,
      badges: [],
      edit: true,
    });
    const width = 1536 * scale;
    const height = 1152 * scale;
    const { container, unmount } = render(
      <ArrowLayer
        width={width}
        height={height}
        annotations={annotations}
        marks={[
          { at: { x: 40, y: 40 }, kind: 'holds' },
          { at: { x: 60, y: 40 }, kind: 'deadpoint' },
          { at: { x: 80, y: 40 }, kind: 'falls' },
        ]}
        badges={[]}
      />,
    );
    const svg = container.querySelector('svg')!;
    // One CSS px a user unit: the viewBox is the drawing's own size, and nothing is transformed.
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
    expect(svg.getAttribute('width')).toBe(String(width));
    expect(container.querySelectorAll('[transform]')).toHaveLength(0);
    const widths = [...container.querySelectorAll('[stroke-width]')].map((e) =>
      Number(e.getAttribute('stroke-width')),
    );
    expect(widths.length).toBeGreaterThan(10);
    for (const w of widths) expect(w, `scale ${scale}`).toBeLessThanOrEqual(3);
    // The arrows are drawn: at least one shaft per scale.
    expect(container.querySelectorAll('[data-kind="arrow"] line').length).toBeGreaterThan(0);
    unmount();
  }
});
