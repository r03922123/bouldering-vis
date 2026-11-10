import { useMemo } from 'react';
import { createBuffer, type PixelBuffer } from '../buffer';
import { COLOR, type PaletteIndex } from '../palette';
import { HOLLOW_STAR, ICONS, stampOutlined } from './icons';
import { PixelCanvas } from './PixelCanvas';
import { textArt } from './PixelText';

// SPEC-pixel-kit › User stories (the HUD) and AC 37–39. The numbers and the meter only show what
// play-shell and scoring decided; nothing here computes a value. Every canvas is aria-hidden and
// the real value is in ARIA attributes or a visually hidden span.

export type Tone = 'ok' | 'warn' | 'fail';

/** Each tone also has its own icon (ok tick, warn !, fail ×), so colour is never the only cue. */
export const TONE_COLOR: Readonly<Record<Tone, PaletteIndex>> = {
  ok: COLOR.lime,
  warn: COLOR.sun,
  fail: COLOR.bloom,
};

export const METER_SEGMENTS = 10;
const SEGMENT = { w: 3, h: 5, gap: 1 };
/** The first segment's left edge: the 7-px icon, its outline pad and a 2-px gap. */
const SEGMENTS_X = 10;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The tone icon, then 10 segments: round(clamp(value)·10) in the tone colour, the rest dusk. */
export function meterArt(value: number, tone: Tone): PixelBuffer {
  const filled = Math.round(clamp01(value) * METER_SEGMENTS);
  const w = SEGMENTS_X + METER_SEGMENTS * (SEGMENT.w + SEGMENT.gap);
  const buf = createBuffer(w, 9);
  const mask = createBuffer(w, 9);
  stampOutlined(buf, mask, ICONS[tone], 1, 1, TONE_COLOR[tone]);
  const block = Array.from({ length: SEGMENT.h }, () => '#'.repeat(SEGMENT.w));
  for (let k = 0; k < METER_SEGMENTS; k++) {
    const color = k < filled ? TONE_COLOR[tone] : COLOR.dusk;
    stampOutlined(buf, mask, block, SEGMENTS_X + k * (SEGMENT.w + SEGMENT.gap), 2, color);
  }
  return buf;
}

/** Three stars with 2 px between them: the first `count` filled (sun), the rest hollow (chalk). */
export function starsArt(count: 0 | 1 | 2 | 3): PixelBuffer {
  const sw = ICONS.star[0]!.length;
  const sh = ICONS.star.length;
  const w = 3 * sw + 2 * 2 + 2;
  const buf = createBuffer(w, sh + 2);
  const mask = createBuffer(w, sh + 2);
  for (let k = 0; k < 3; k++) {
    const filled = k < count;
    stampOutlined(
      buf,
      mask,
      filled ? ICONS.star : HOLLOW_STAR,
      1 + k * (sw + 2),
      1,
      filled ? COLOR.sun : COLOR.chalk,
    );
  }
  return buf;
}

/** `MOVES 07`; drawn as 99 above 99 and 00 below 0, while the hidden text gives the real count. */
export function MoveCounter({ moves }: { moves: number }) {
  const real = Number.isFinite(moves) ? Math.max(0, Math.floor(moves)) : 0;
  const text = `MOVES ${String(Math.min(99, real)).padStart(2, '0')}`;
  const art = useMemo(() => textArt(text), [text]);
  return (
    <span className="px-moves">
      <PixelCanvas art={art} text={text} />
      <span className="visually-hidden">{`${real} ${real === 1 ? 'move' : 'moves'}`}</span>
    </span>
  );
}

/** A grip or balance meter: role="meter", 0–100, with the tone shown by icon and colour. */
export function GripMeter({ value, tone, label }: { value: number; tone: Tone; label: string }) {
  const v = clamp01(value);
  const art = useMemo(() => meterArt(v, tone), [v, tone]);
  return (
    <div
      className="px-meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
      data-filled={Math.round(v * METER_SEGMENTS)}
      data-tone={tone}
    >
      <PixelCanvas art={art} />
    </div>
  );
}

/** 0–3 stars; hollow and filled stars differ in shape, not only colour. */
export function Stars({ count }: { count: 0 | 1 | 2 | 3 }) {
  const art = useMemo(() => starsArt(count), [count]);
  return (
    <span className="px-stars" role="img" aria-label={`${count} of 3 stars`}>
      <PixelCanvas art={art} scale={3} />
    </span>
  );
}
