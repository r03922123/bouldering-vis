import { useMemo } from 'react';
import { createBuffer, type PixelBuffer } from '../buffer';
import { measurePixelText, rasterText } from '../font';
import { COLOR, type PaletteIndex } from '../palette';
import { PixelCanvas } from './PixelCanvas';

// SPEC-pixel-kit › Pixel Font › Where it is used and Accessibility. Short labels only (≤ 12
// characters); the canvas is aria-hidden and the real text sits in a .visually-hidden span.

/** `text` in the pixel font, in `color` with a 1-px ink outline, cropped to its measured box. */
export function textArt(text: string, color: PaletteIndex = COLOR.chalk): PixelBuffer {
  const { width, height } = measurePixelText(text, true);
  const buf = createBuffer(width, height);
  rasterText(buf, 0, 0, text, color, COLOR.ink);
  return buf;
}

/** One art px = round(scale·dpr) device px (scale in CSS px, default 2). */
export function PixelText({
  text,
  scale = 2,
  color = COLOR.chalk,
}: {
  text: string;
  scale?: 2 | 3 | 4;
  color?: PaletteIndex;
}) {
  const art = useMemo(() => textArt(text, color), [text, color]);
  return (
    <span className="px-text">
      <PixelCanvas art={art} scale={scale} text={text} />
      <span className="visually-hidden">{text}</span>
    </span>
  );
}
