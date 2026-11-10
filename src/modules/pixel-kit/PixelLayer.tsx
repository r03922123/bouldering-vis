import { useLayoutEffect, useRef } from 'react';
import { blit, createBuffer, resizeBuffer, type PixelBuffer } from './buffer';
import { nextChangeAt, renderScene, type PixelScene } from './scene';
import { useReducedMotion } from './useReducedMotion';
import { artGrid, pixelSize, type PixelView } from './view';

// SPEC-pixel-kit › Decisions P3 and P10. The canvas bitmap is the art grid; its CSS size is
// bitmap·P/dpr, so each art pixel covers P whole device pixels and `image-rendering: pixelated`
// scales it without smoothing. This is the only place in the module that reads a clock. Between
// changes it sleeps: a timeout per target phase, rAF only while a puff is alive, else nothing.

export interface PixelLayerProps {
  view: PixelView;
  /** Sets P even when `scene.climber` is null; normally equals climber.heightPx. */
  climberHeightPx: number;
  scene: Omit<PixelScene, 'timeMs' | 'reducedMotion'>;
  /** Default performance.now; move-animation passes its replay clock. */
  clock?: () => number;
}

const defaultClock = () => performance.now();

/**
 * Timers can fire a hair early against performance.now. Waking 1 ms after the phase change
 * avoids a second, identical render just before it.
 */
const WAKE_LATE_MS = 1;

interface LayerState {
  /** The previous P, kept for the hysteresis in pixelSize. */
  px: number;
  buf: PixelBuffer;
  image: ImageData | null;
}

/** aria-hidden canvas; must sit in a positioned parent with overflow: hidden (P3). */
export function PixelLayer({ view, climberHeightPx, scene, clock }: PixelLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef<LayerState>({ px: 0, buf: createBuffer(0, 0), image: null });
  const reducedMotion = useReducedMotion();
  const { scale, tx, ty, boxW, boxH, dpr } = view;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = state.current;
    const v: PixelView = { scale, tx, ty, boxW, boxH, dpr };
    const px = pixelSize(climberHeightPx, v, s.px || undefined);
    s.px = px;
    const grid = artGrid(v, px);
    // Assigning the size clears the bitmap, so only do it when it changes.
    if (canvas.width !== grid.width) canvas.width = grid.width;
    if (canvas.height !== grid.height) canvas.height = grid.height;
    canvas.style.width = `${(grid.width * px) / dpr}px`;
    canvas.style.height = `${(grid.height * px) / dpr}px`;
    canvas.dataset.px = String(px);
    // A zero size would make createImageData throw IndexSizeError.
    if (!grid.width || !grid.height) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = clock ?? defaultClock;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const draw = () => {
      const full: PixelScene = { ...scene, timeMs: now(), reducedMotion };
      s.buf = resizeBuffer(s.buf, grid.width, grid.height);
      renderScene(s.buf, grid, full);
      if (s.image?.width !== grid.width || s.image.height !== grid.height) {
        s.image = ctx.createImageData(grid.width, grid.height);
      }
      blit(s.buf, s.image.data);
      ctx.putImageData(s.image, 0, 0);
      const next = nextChangeAt(full);
      if (next === null) return;
      if (next <= full.timeMs) frame = requestAnimationFrame(draw);
      else timer = setTimeout(draw, next - full.timeMs + WAKE_LATE_MS);
    };
    draw();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [scale, tx, ty, boxW, boxH, dpr, climberHeightPx, scene, clock, reducedMotion]);

  return <canvas ref={canvasRef} className="px-layer" aria-hidden="true" />;
}
