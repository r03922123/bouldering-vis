export type Lab = [L: number, a: number, b: number];

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

// D65 reference white.
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);

/** sRGB (0–255) → CIELAB, D65. */
export function srgbToLab(r: number, g: number, b: number): Lab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / XN);
  const fy = f((0.2126 * R + 0.7152 * G + 0.0722 * B) / YN);
  const fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(p: Lab, q: Lab): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const LINEAR = Float32Array.from({ length: 256 }, (_, c) => toLinear(c));

/** RGBA pixels → packed L,a,b per pixel. Same math as srgbToLab, with a table for linearization. */
export function labImage(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const R = LINEAR[rgba[i * 4]!]!;
    const G = LINEAR[rgba[i * 4 + 1]!]!;
    const B = LINEAR[rgba[i * 4 + 2]!]!;
    const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / XN);
    const fy = f((0.2126 * R + 0.7152 * G + 0.0722 * B) / YN);
    const fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / ZN);
    out[i * 3] = 116 * fy - 16;
    out[i * 3 + 1] = 500 * (fx - fy);
    out[i * 3 + 2] = 200 * (fy - fz);
  }
  return out;
}
