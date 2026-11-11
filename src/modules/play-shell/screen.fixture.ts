import { fireEvent, screen } from '@testing-library/react';
import type { WorkingImage } from '../image-input';
import { SYNTHETIC } from './synthetic.fixture';
import type { PlayScreenProps } from './PlayScreen';

// Tests only: a tiny photo for the synthetic route and PlayScreen's props on it.

export const ROUTE_IMAGE: WorkingImage = {
  id: 'synthetic',
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: 'wall-landscape.jpg',
  sampleId: 'synthetic',
};

export const routeProps = (over: Partial<PlayScreenProps> = {}): PlayScreenProps => ({
  wallId: 'synthetic',
  title: 'Synthetic wall',
  profile: { level: 'gym', hints: false, numbers: false },
  onBack: () => {},
  client: null,
  photo: ROUTE_IMAGE,
  level: SYNTHETIC,
  tagged: null,
  tagReady: false,
  footholds: null,
  onPlan: () => {},
  onSetAid: () => {},
  ...over,
});

/** The route's photo at its working size (1536 × 1152), so the fitted view puts the holds on screen. */
export const ROUTE_FULL: WorkingImage = {
  ...ROUTE_IMAGE,
  pixels: { width: 1536, height: 1152, data: new Uint8ClampedArray(4) } as ImageData,
  width: 1536,
  height: 1152,
};

/** A 2D context that draws nothing (jsdom has none). */
function fakeContext(canvas: HTMLCanvasElement) {
  const image = (w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
  });
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, p) => {
      if (p === 'canvas') return canvas;
      if (p === 'createImageData') return image;
      if (p in t) return t[p];
      return () => {};
    },
    set: (t, p, v) => {
      t[p] = v;
      return true;
    },
  });
}

/**
 * Lets the photo draw in jsdom: a no-op 2D context, a 343 × 257 photo box and queued animation
 * frames. `flush()` runs the queued frames, which commits the pixel layer's view (S1). Call
 * vi.restoreAllMocks() and vi.unstubAllGlobals() after each test.
 */
export function canvasHarness(box = { width: 343, height: 257 }) {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return fakeContext(this) as never;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: box } as never], this as never);
      }
      disconnect() {}
    },
  );
  return { flush: () => frames.splice(0).forEach((f) => f(0)) };
}

/**
 * Amendment (b) U5: the target list is behind "List targets". Opens it when it is collapsed (a
 * no-op once open) and returns the list's region, as a player would reach it.
 */
export function targetsRegion(name: string | RegExp): HTMLElement {
  const toggle = screen.queryByRole('button', { name: 'List targets' });
  if (toggle?.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  return screen.getByRole('region', { name });
}

/**
 * Past the direction map to the tray: presses "Start planning" when the map is open. A tagged
 * route opens on it (E1); a baked level doesn't (SPEC-launch-wall-2 R7), so then this does nothing.
 */
export function skipMap() {
  const go = screen.queryByRole('button', { name: 'Start planning' });
  if (go) fireEvent.click(go);
}

/**
 * Opens the direction map on a baked level, as a player does: "Check directions" (in the ☰ drawer
 * on a phone). A baked level no longer opens on it (SPEC-launch-wall-2 R7).
 */
export function openMap() {
  const drawer = screen.queryByRole('button', { name: 'Hints and tools' });
  if (drawer && drawer.getAttribute('aria-expanded') !== 'true') fireEvent.click(drawer);
  fireEvent.click(screen.getByRole('button', { name: 'Check directions' }));
}
