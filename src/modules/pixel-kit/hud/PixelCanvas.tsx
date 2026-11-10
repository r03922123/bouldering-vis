import { useLayoutEffect, useRef } from 'react';
import { blit, type PixelBuffer } from '../buffer';

// SPEC-pixel-kit › Tasks T9: a HUD art pixel is round(scale·dpr)/dpr CSS px, so it covers a
// whole number of device pixels at every devicePixelRatio. The bitmap is the art itself and
// `image-rendering: pixelated` (.px-canvas) scales it without smoothing.

/** Device px per HUD art px: round(scale·dpr), at least 1. */
export function hudPixel(scale: number, dpr: number): number {
  return Math.max(1, Math.round(scale * dpr));
}

/** An aria-hidden canvas showing `art`; the caller supplies the accessible text. */
export function PixelCanvas({
  art,
  scale = 2,
  text,
}: {
  art: PixelBuffer;
  scale?: number;
  /** What the art says, as `data-text` (tests and debugging; not read by assistive tech). */
  text?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const cssPx = hudPixel(scale, dpr) / dpr;

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = art.width;
    canvas.height = art.height;
    if (!art.width || !art.height) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(art.width, art.height);
    blit(art, image.data);
    ctx.putImageData(image, 0, 0);
  }, [art]);

  return (
    <canvas
      ref={ref}
      className="px-canvas"
      aria-hidden="true"
      data-text={text}
      width={art.width}
      height={art.height}
      style={{ width: `${art.width * cssPx}px`, height: `${art.height * cssPx}px` }}
    />
  );
}
