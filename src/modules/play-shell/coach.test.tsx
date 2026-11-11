import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  checkBeta,
  createStanceCache,
  decodeBeta,
  type MoveCheck,
  type MoveContext,
} from '../beta-moves';
import { SYNTHETIC, SYNTHETIC_BETAS } from './synthetic.fixture';
import {
  ADVANCE_GRID,
  breakdownLine,
  coachPages,
  FRAME_GRID,
  FRAME_SLICE,
  gridSvg,
  REVEAL_MS,
} from './coach';
import { CoachWindow } from './CoachWindow';
import { numbersFor } from './numbers';
import { contextFor, verdictLine } from './play';

// SPEC-play-shell › Amendment 2026-11-02 D1 and acceptance 6: the coach window shows the referee's
// text verbatim, can be skipped, and has a reduced-motion path.

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;

/** Every check of every synthetic-route beta, up to its first fall or top: starts, holds, tips and falls. */
const CHECKS: MoveCheck[] = SYNTHETIC_BETAS.flatMap((b) => {
  const beta = decodeBeta(b.text, ctx);
  return beta ? [...checkBeta(beta, ctx, createStanceCache()).steps] : [];
});

describe('coachPages (acceptance 6: the referee’s text verbatim)', () => {
  it('covers starts, holds, falls and tips across the synthetic-route betas', () => {
    expect(CHECKS.some((c) => !c.move)).toBe(true);
    expect(CHECKS.some((c) => c.verdict === 'fall')).toBe(true);
    expect(CHECKS.some((c) => c.verdict === 'hold')).toBe(true);
    expect(CHECKS.some((c) => c.verdict === 'hold' && c.tip)).toBe(true);
  });

  it('joined with spaces, the pages are exactly the verdict line the live region announces', () => {
    for (const c of CHECKS) expect(coachPages(ctx, c).join(' ')).toBe(verdictLine(ctx, c));
  });

  // Amendment 2026-11-03 R0-2 (superseding D1's page of their own): the reason is the lesson, so
  // a fall's first page is the verdict and its reason together, and a tip shares its page too.
  it('puts fail.text and move.tip on the first page with the verdict, word for word', () => {
    const fall = CHECKS.find((c) => c.verdict === 'fall' && c.move)!;
    expect(fall).toBeDefined();
    for (const c of CHECKS) {
      const pages = coachPages(ctx, c);
      if (c.verdict === 'fall' && c.move) {
        expect(pages).toHaveLength(1);
        expect(pages[0]).toMatch(/: you'd fall\. /);
        expect(pages[0]!.endsWith(c.fail!.text)).toBe(true);
      }
      if (c.verdict === 'hold' && c.tip) {
        expect(pages).toHaveLength(1);
        expect(pages[0]!.endsWith(`: holds. ${c.tip}`)).toBe(true);
      }
    }
  });

  it('a fall or a tip is one page: the whole verdict line (R0-2)', () => {
    const fall = CHECKS.find((c) => c.verdict === 'fall' && c.move)!;
    expect(coachPages(ctx, fall)).toEqual([verdictLine(ctx, fall)]);
    const held = CHECKS.find((c) => c.verdict === 'hold' && c.move)!;
    const tipped: MoveCheck = { ...held, tip: 'Deadpoint: move fast and catch the hold' };
    expect(coachPages(ctx, tipped)).toEqual([verdictLine(ctx, tipped)]);
    expect(coachPages(ctx, tipped)[0]).toMatch(/: holds\. Deadpoint: move fast/);
  });

  it('the start page is the start verdict', () => {
    const start = CHECKS.find((c) => !c.move)!;
    expect(coachPages(ctx, start)).toEqual(['Start: Balanced: this position can be held']);
  });
});

describe('breakdownLine (Numbers on)', () => {
  it('shows every Numbers value exactly, in order, and no number of its own', () => {
    for (const c of CHECKS) {
      const line = breakdownLine(c);
      let rest = line;
      let at = 0;
      for (const r of numbersFor(c)) {
        const i = line.indexOf(r.value, at);
        expect(i, `${r.label} ${r.value}`).toBeGreaterThanOrEqual(0);
        at = i + r.value.length;
        rest = rest.replace(r.value, '');
      }
      // With the referee's values taken out, no digit is left: nothing was computed here.
      expect(rest).not.toMatch(/\d/);
    }
  });

  it('reads as one line of short labels', () => {
    const start = CHECKS.find((c) => !c.move)!;
    expect(breakdownLine(start)).toMatch(/^LH -?\d+\.\d % · RH .* · Contacts kept \d$/);
    expect(breakdownLine(start)).not.toContain('\n');
  });
});

describe('the frame and the arrow (originality review)', () => {
  it('the frame is a 9 × 9 nine-slice, symmetric, with one repeated cell on each edge', () => {
    expect(FRAME_GRID).toHaveLength(9);
    expect(FRAME_GRID.every((r) => r.length === 9)).toBe(true);
    // Symmetric in shape; each bolt's one lit pixel (h) sits top-left, light from one side.
    const shape = FRAME_GRID.map((r) => r.replace(/h/g, 'b'));
    expect([...shape].reverse()).toEqual(shape);
    expect(shape.map((r) => [...r].reverse().join(''))).toEqual(shape);
    const bolts = FRAME_GRID.flatMap((r, y) =>
      [...r].flatMap((c, x) => (c === 'h' ? [[x, y]] : [])),
    );
    expect(bolts).toEqual([
      [1, 1],
      [6, 1],
      [1, 6],
      [6, 6],
    ]);
    expect(FRAME_SLICE).toBe(4);
    // The edges' profile: ink, chalk, chalk, ink; the middle cell is clear (the text's area).
    const top = FRAME_GRID.slice(0, 4)
      .map((r) => r[4])
      .join('');
    const left = FRAME_GRID[4]!.slice(0, 4);
    expect(top).toBe('occo');
    expect(left).toBe('occo');
    expect(FRAME_GRID[4]![4]).toBe('.');
  });

  it('gridSvg draws one crisp 1 × 1 rect per filled cell, in pixel-kit’s palette', () => {
    const svg = decodeURIComponent(gridSvg(ADVANCE_GRID).replace('data:image/svg+xml,', ''));
    const filled = ADVANCE_GRID.join('')
      .split('')
      .filter((c) => c === '#').length;
    expect(svg.match(/<rect /g)).toHaveLength(filled);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#f7f3e8"');
    expect(svg).toContain('viewBox="0 0 5 6"');
  });
});

describe('CoachWindow', () => {
  const PAGES = ["Left hand to 7F: you'd fall.", 'Too far: left hand — move your feet up first'];
  const LIVE = PAGES.join(' ');
  const box = () => screen.getByRole('region', { name: 'Coach' });
  const live = () => document.querySelector('.play-verdict')!;
  const shownText = () =>
    [...document.querySelectorAll('.play-coach-text span:not(.play-coach-hidden)')]
      .map((s) => s.textContent)
      .join('');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('announces the whole line at once and reveals it letter by letter in the box', () => {
    render(<CoachWindow live={LIVE} ok={false} pages={PAGES} />);
    expect(live()).toHaveTextContent(LIVE);
    expect(live()).toHaveAttribute('role', 'status');
    expect(live()).toHaveAttribute('aria-live', 'polite');
    expect(document.querySelector('.play-coach-text')).toHaveAttribute('aria-hidden', 'true');
    expect(shownText()).toBe('');
    act(() => vi.advanceTimersByTime(REVEAL_MS * 4));
    expect(shownText()).toBe('Left');
    // The box shows the referee's text exactly: once revealed, page 1 is the first page.
    act(() => vi.advanceTimersByTime(REVEAL_MS * 200));
    expect(shownText()).toBe(PAGES[0]);
    expect(box()).toHaveAttribute('data-revealed', 'all');
  });

  it('a tap skips the reveal, the advance arrow goes on, and the last page has no arrow', () => {
    render(<CoachWindow live={LIVE} ok={false} pages={PAGES} />);
    expect(screen.queryByRole('button', { name: 'Next coach line' })).toBeNull();
    fireEvent.click(box());
    expect(shownText()).toBe(PAGES[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Next coach line' }));
    expect(box()).toHaveAttribute('data-page', '2');
    fireEvent.click(box());
    expect(shownText()).toBe(PAGES[1]);
    expect(screen.queryByRole('button', { name: 'Next coach line' })).toBeNull();
    // The live region never changed while the box paged.
    expect(live()).toHaveTextContent(LIVE);
  });

  it('Enter skips and then advances, unless a control has the focus', () => {
    render(
      <>
        <button type="button">Other</button>
        <CoachWindow live={LIVE} ok={false} pages={PAGES} />
      </>,
    );
    const other = screen.getByRole('button', { name: 'Other' });
    other.focus();
    fireEvent.keyDown(other, { key: 'Enter' });
    expect(box()).not.toHaveAttribute('data-revealed', 'all');
    other.blur();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(shownText()).toBe(PAGES[0]);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(box()).toHaveAttribute('data-page', '2');
  });

  it('new words start again on page 1', () => {
    const { rerender } = render(<CoachWindow live={LIVE} ok={false} pages={PAGES} />);
    fireEvent.click(box());
    fireEvent.click(box());
    expect(box()).toHaveAttribute('data-page', '2');
    rerender(<CoachWindow live="Start: x" ok pages={['Start: x']} />);
    expect(box()).toHaveAttribute('data-page', '1');
    expect(box()).not.toHaveAttribute('data-revealed', 'all');
  });

  it('shows every page at once under reduced motion, with no timer', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<CoachWindow live={LIVE} ok={false} pages={PAGES} />);
    expect(shownText()).toBe(PAGES[0]);
    expect(box()).toHaveAttribute('data-revealed', 'all');
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next coach line' }));
    expect(shownText()).toBe(PAGES[1]);
  });

  it('review suggestion: listens for Enter once, not again on every revealed letter', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(<CoachWindow live={LIVE} ok={false} pages={PAGES} />);
    act(() => vi.advanceTimersByTime(REVEAL_MS * 10));
    expect(shownText()).toBe('Left hand ');
    expect(add.mock.calls.filter(([type]) => String(type) === 'keydown')).toHaveLength(1);
    // And the one listener still acts on the latest state.
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(shownText()).toBe(PAGES[0]);
  });

  it('has the COACH name tag in the pixel font, out of the accessibility tree', () => {
    render(<CoachWindow live={LIVE} ok={false} pages={PAGES} />);
    const tag = document.querySelector('.play-coach-tag')!;
    expect(tag).toHaveAttribute('aria-hidden', 'true');
    expect(tag.querySelector('canvas')).toHaveAttribute('data-text', 'COACH');
  });
});
