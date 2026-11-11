import { act, render } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { PlayScreen } from './PlayScreen';

// Review finding 4 (hard rule 4): drawExtras runs inside the canvas's effect, so the pixel layer's
// view must be committed later (the next animation frame), never by a setState in that effect.

const image: WorkingImage = {
  id: 'synthetic',
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: 'wall-landscape.jpg',
  sampleId: 'synthetic',
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

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image });
  frames = [];
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
        this.cb([{ contentRect: { width: 343, height: 257 } } as never], this as never);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('commits the pixel layer’s view on the next frame, not inside the canvas’s effect', () => {
  const { container } = render(
    <PlayScreen
      wallId="synthetic"
      title="Synthetic wall"
      profile={{ level: 'gym', hints: false, numbers: false }}
      onBack={() => {}}
      client={null}
      photo={image}
      level={SYNTHETIC}
      tagged={null}
      tagReady={false}
      footholds={null}
      onPlan={() => {}}
      onSetAid={() => {}}
    />,
  );
  // The photo has drawn (its effect ran drawExtras), but no view is committed yet.
  expect(container.querySelector('canvas.px-layer')).toBeNull();
  act(() => {
    for (const f of frames.splice(0)) f(0);
  });
  expect(container.querySelector('canvas.px-layer')).not.toBeNull();
});
