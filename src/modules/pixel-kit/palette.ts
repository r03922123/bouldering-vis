import type { PixelLimb } from './types';

// SPEC-pixel-kit › Palette. 16 entries: index 0 is transparent, plus 15 original colours. This is
// the only file with hex values; everything else draws through COLOR indices.

export const COLOR = {
  clear: 0,
  ink: 1,
  dusk: 2,
  slate: 3,
  chalk: 4,
  skinLight: 5,
  skinMid: 6,
  skinDeep: 7,
  brick: 8,
  ember: 9,
  sun: 10,
  leaf: 11,
  lime: 12,
  tide: 13,
  navy: 14,
  bloom: 15,
} as const;

export type ColorName = keyof typeof COLOR;
export type PaletteIndex = (typeof COLOR)[ColorName];

/** 16 entries; '#rrggbb', or null for index 0 (clear). */
export const PALETTE: readonly (string | null)[] = [
  null,
  '#1b1325', // ink
  '#3d2e52', // dusk
  '#6e6a86', // slate
  '#f7f3e8', // chalk
  '#f5cfa6', // skinLight
  '#c68a5c', // skinMid
  '#6e4128', // skinDeep
  '#b8432e', // brick
  '#ffab57', // ember
  '#ffd94a', // sun
  '#3f9e4a', // leaf
  '#7ee88f', // lime
  '#45d3f2', // tide
  '#2c4fa3', // navy
  '#ffa3d6', // bloom
];

export type MarkerRole = 'start' | 'finish' | 'planned' | 'target';

/** Roles differ from Studio's badges: a red finish fails the contrast rule (brick = 1.82). */
export const ROLE_COLOR: Readonly<Record<MarkerRole, PaletteIndex>> = {
  start: COLOR.lime,
  finish: COLOR.sun,
  planned: COLOR.chalk,
  target: COLOR.bloom,
};

/** Close to the Studio stance overlay (left #22d3ee, right #fb923c). */
export const LIMB_COLOR: Readonly<Record<PixelLimb, PaletteIndex>> = {
  lh: COLOR.tide,
  lf: COLOR.tide,
  rh: COLOR.ember,
  rf: COLOR.ember,
};

const channel = (hex: string, i: number) => {
  const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of '#rrggbb'. */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

/** WCAG 2.x contrast ratio (≥ 1, order does not matter). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * min over all backgrounds of max(C(fill,bg), C(outline,bg)) = √((Lf+.05)/(Lo+.05)) for Lf ≥ Lo:
 * the worst background sits at the geometric middle of the two luminances.
 */
export function worstCaseContrast(fill: string, outline: string = PALETTE[COLOR.ink]!): number {
  return Math.sqrt(contrastRatio(fill, outline));
}
