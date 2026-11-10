import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkingImage } from '../image-input';

type Point = { x: number; y: number };

/** Fits the photo in the box, centred (as the Studio's canvas fits it before any zoom). */
export function fitPhoto(imgW: number, imgH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { scale, tx: (boxW - imgW * scale) / 2, ty: (boxH - imgH * scale) / 2 };
}

/**
 * The photo for Plan on a baked level: drawn fitted, untouched, with `drawExtras` on top, the same
 * contract as SelectionCanvas. It never prepares the segmentation model: a baked level has no hold
 * to tap in, so SAM loads only when the player tags (load on demand, PRPL). Same box and classes as
 * the Studio's canvas, so the layout and the top-third rule are the same.
 */
export function PlanPhoto({
  image,
  badges,
  drawExtras,
}: {
  image: WorkingImage;
  /** The badge labels drawn by drawExtras, for tests and E2E (as SelectionCanvas's data-badges). */
  badges: string;
  drawExtras: (ctx: CanvasRenderingContext2D, toScreen: (p: Point) => Point) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const base = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')?.putImageData(image.pixels, 0, 0);
    return c;
  }, [image]);
  const fit = useMemo(
    () => (box.w && box.h ? fitPhoto(image.width, image.height, box.w, box.h) : null),
    [image, box],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(dpr * fit.scale, 0, 0, dpr * fit.scale, dpr * fit.tx, dpr * fit.ty);
    g.imageSmoothingEnabled = fit.scale < 1;
    g.drawImage(base, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawExtras(g, (p) => ({ x: p.x * fit.scale + fit.tx, y: p.y * fit.scale + fit.ty }));
  }, [base, box, fit, drawExtras]);

  return (
    <div className="selection">
      <div
        ref={boxRef}
        className="selection-box"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Wall photo"
          data-image-width={image.width}
          data-image-height={image.height}
          data-badges={badges}
          data-scale={fit?.scale}
          data-tx={fit?.tx}
          data-ty={fit?.ty}
        />
      </div>
    </div>
  );
}
