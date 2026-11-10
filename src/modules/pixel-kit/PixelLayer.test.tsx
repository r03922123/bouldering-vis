import { act, render, renderHook } from '@testing-library/react';
import hang48 from '../../../tests/fixtures/pixel-kit/poses/hang-48.json';
import { blit, createBuffer } from './buffer';
import type { PixelClimber } from './climber';
import type { HoldMarker } from './markers';
import { DEFAULT_LOOK, OUTFITS } from './outfits';
import { PixelLayer, type PixelLayerProps } from './PixelLayer';
import { renderScene } from './scene';
import type { PixelJoints } from './types';
import { useReducedMotion } from './useReducedMotion';
import { artGrid, pixelSize, type PixelView } from './view';

// SPEC-pixel-kit › Decisions P3 and P10; AC 40 and 47. jsdom has no canvas, so each test installs
// its own 2D context stub over the null stub from tests/setup.ts and records what it is given.

interface Recorded {
  created: [number, number][];
  puts: Uint8ClampedArray[];
}

const realGetContext = HTMLCanvasElement.prototype.getContext;
let rec: Recorded;

function stubContext() {
  rec = { created: [], puts: [] };
  const ctx = {
    createImageData: (w: number, h: number) => {
      rec.created.push([w, h]);
      return { width: w, height: h, data: new Uint8ClampedArray(4 * w * h) };
    },
    putImageData: (img: { data: Uint8ClampedArray }) => rec.puts.push(img.data.slice()),
  };
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx) as unknown as HTMLCanvasElement['getContext'];
}

type Listener = (e: { matches: boolean }) => void;
let reduce = false;
const mqListeners = new Set<Listener>();

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return reduce;
    },
    addEventListener: (_: string, l: Listener) => mqListeners.add(l),
    removeEventListener: (_: string, l: Listener) => mqListeners.delete(l),
  })) as unknown as typeof window.matchMedia;
}

function setReduce(on: boolean) {
  reduce = on;
  for (const l of [...mqListeners]) l({ matches: on });
}

beforeEach(() => {
  stubContext();
  reduce = false;
  mqListeners.clear();
  stubMatchMedia();
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const climber: PixelClimber = {
  joints: hang48.joints as PixelJoints,
  heightPx: hang48.heightPx,
  outfit: OUTFITS.starter,
  look: DEFAULT_LOOK,
  gripping: { lh: true, rh: true, lf: true, rf: true },
  selected: null,
  mood: 'ok',
};

const VIEW: PixelView = { scale: 4, tx: 10, ty: 6, boxW: 200, boxH: 260, dpr: 1 };
const target: HoldMarker = {
  holdId: 't',
  role: 'target',
  bbox: { x: 26, y: 3, w: 6, h: 6 },
  limb: 'rh',
};
const empty: PixelLayerProps['scene'] = { climber: null, markers: [], gaps: [], puffs: [] };

const canvasOf = (c: HTMLElement) => c.querySelector('canvas.px-layer') as HTMLCanvasElement;

describe('PixelLayer (AC 40)', () => {
  it('puts the bytes of blit(renderScene(…)) on an aria-hidden canvas sized width·P/dpr', () => {
    const scene = { climber, markers: [target], gaps: [], puffs: [] };
    const view: PixelView = { ...VIEW, dpr: 2.625 };
    const { container } = render(
      <PixelLayer view={view} climberHeightPx={48} scene={scene} clock={() => 40} />,
    );
    const px = pixelSize(48, view);
    const grid = artGrid(view, px);
    const buf = renderScene(createBuffer(grid.width, grid.height), grid, {
      ...scene,
      timeMs: 40,
      reducedMotion: false,
    });
    const expected = new Uint8ClampedArray(4 * grid.width * grid.height);
    blit(buf, expected);

    expect(rec.puts.at(-1)).toEqual(expected);
    expect(rec.created).toEqual([[grid.width, grid.height]]);
    const canvas = canvasOf(container);
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect([canvas.width, canvas.height]).toEqual([grid.width, grid.height]);
    expect(canvas.dataset.px).toBe(String(px));
    expect(parseFloat(canvas.style.width)).toBeCloseTo((grid.width * px) / 2.625, 6);
    expect(parseFloat(canvas.style.height)).toBeCloseTo((grid.height * px) / 2.625, 6);
  });

  it('makes no createImageData or putImageData call for a 0 × 0 box', () => {
    const { container } = render(
      <PixelLayer
        view={{ ...VIEW, boxW: 0, boxH: 0 }}
        climberHeightPx={48}
        scene={{ ...empty, climber, markers: [target] }}
      />,
    );
    expect(rec.created).toEqual([]);
    expect(rec.puts).toEqual([]);
    const canvas = canvasOf(container);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('keeps P under hysteresis when the box grows by 1 px', () => {
    // A fit-to-width view: scale follows the box. H_dev = 751.9·343/1536 = 167.9 → P 3 (art 56);
    // at 344 px, 168.4 alone would round to 4, but 168.4 / 3 = 56.1 is still inside 36–60.
    const fit = (w: number): PixelView => ({ ...VIEW, scale: w / 1536, boxW: w, boxH: 300 });
    const { container, rerender } = render(
      <PixelLayer view={fit(343)} climberHeightPx={751.9} scene={empty} />,
    );
    expect(canvasOf(container).dataset.px).toBe('3');
    rerender(<PixelLayer view={fit(344)} climberHeightPx={751.9} scene={empty} />);
    expect(canvasOf(container).dataset.px).toBe('3');
    expect(pixelSize(751.9, fit(344))).toBe(4);
    const fresh = render(<PixelLayer view={fit(344)} climberHeightPx={751.9} scene={empty} />);
    expect(canvasOf(fresh.container).dataset.px).toBe('4');
  });

  it('redraws when the scene changes', () => {
    const { rerender } = render(
      <PixelLayer view={VIEW} climberHeightPx={48} scene={empty} clock={() => 0} />,
    );
    const before = rec.puts.length;
    rerender(
      <PixelLayer view={VIEW} climberHeightPx={48} scene={{ ...empty, climber }} clock={() => 0} />,
    );
    expect(rec.puts.length).toBe(before + 1);
    expect(rec.puts.at(-1)!.some((v) => v !== 0)).toBe(true);
  });
});

describe('PixelLayer scheduling (AC 47)', () => {
  /** Fake timers, rAF and performance.now; returns spies counting what is scheduled. */
  function fakeTime() {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    return {
      raf: vi.spyOn(window, 'requestAnimationFrame'),
      timeout: vi.spyOn(window, 'setTimeout'),
    };
  }

  it('schedules no rAF and no timeout in 1 s with no target and no puffs', () => {
    const spy = fakeTime();
    render(<PixelLayer view={VIEW} climberHeightPx={48} scene={{ ...empty, climber }} />);
    expect(rec.puts).toHaveLength(1);
    spy.raf.mockClear();
    spy.timeout.mockClear();
    act(() => vi.advanceTimersByTime(1000));
    expect(spy.raf).not.toHaveBeenCalled();
    expect(spy.timeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(rec.puts).toHaveLength(1);
  });

  it('renders at most 4 times a second with only a target, with no rAF', () => {
    const spy = fakeTime();
    render(<PixelLayer view={VIEW} climberHeightPx={48} scene={{ ...empty, markers: [target] }} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(spy.raf).not.toHaveBeenCalled();
    expect(rec.puts.length).toBeGreaterThanOrEqual(3);
    expect(rec.puts.length).toBeLessThanOrEqual(4);
    // The two phases really alternate on the canvas.
    expect(rec.puts[1]).not.toEqual(rec.puts[0]);
    expect(rec.puts[2]).toEqual(rec.puts[0]);
  });

  it('renders every frame only while a puff is alive', () => {
    const spy = fakeTime();
    const bornMs = performance.now();
    const scene = { ...empty, puffs: [{ seed: 5, at: { x: 20, y: 30 }, bornMs }] };
    render(<PixelLayer view={VIEW} climberHeightPx={48} scene={scene} />);
    act(() => vi.advanceTimersByTime(600));
    const during = rec.puts.length;
    expect(during).toBeGreaterThanOrEqual(30); // ~16 ms frames for 600 ms
    act(() => vi.advanceTimersByTime(40)); // the frame that sees the puff gone
    spy.raf.mockClear();
    spy.timeout.mockClear();
    const after = rec.puts.length;
    act(() => vi.advanceTimersByTime(1000));
    expect(spy.raf).not.toHaveBeenCalled();
    expect(spy.timeout).not.toHaveBeenCalled();
    expect(rec.puts.length).toBe(after);
    expect(rec.puts.at(-1)!.every((v) => v === 0)).toBe(true);
  });

  it('stops breathing and schedules nothing with reduced motion, including a live change', () => {
    const spy = fakeTime();
    render(<PixelLayer view={VIEW} climberHeightPx={48} scene={{ ...empty, markers: [target] }} />);
    act(() => setReduce(true));
    const n = rec.puts.length;
    spy.timeout.mockClear();
    act(() => vi.advanceTimersByTime(1000));
    expect(spy.timeout).not.toHaveBeenCalled();
    expect(spy.raf).not.toHaveBeenCalled();
    expect(rec.puts.length).toBe(n);
  });
});

describe('useReducedMotion', () => {
  it('follows the media query, including changes while the page is open', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => setReduce(true));
    expect(result.current).toBe(true);
    act(() => setReduce(false));
    expect(result.current).toBe(false);
  });

  it('is false where matchMedia does not exist', () => {
    // @ts-expect-error: jsdom has no matchMedia by default; this test removes the stub
    delete window.matchMedia;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
