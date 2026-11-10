// Small 3-vector helpers. Frame (SPEC-climber-stance S5): +x right, +y down the wall, +z out of the wall.

export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const l = norm(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};
/** a + (b − a)·t */
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

export const OUT: Vec3 = [0, 0, 1];

/**
 * Rotates `v` by the rotation that takes the unit vector `n` to OUT (+z), Rodrigues' formula.
 * Used to express a hold's force in the wall frame when its local wall normal is tilted.
 */
export function alignToOut(v: Vec3, n: Vec3): Vec3 {
  const nn = unit(n);
  const k = cross(nn, OUT);
  const s = norm(k);
  const c = dot(nn, OUT);
  if (s < 1e-9) return c > 0 ? v : [v[0], -v[1], -v[2]];
  const kk = scale(k, 1 / s);
  return add(add(scale(v, c), scale(cross(kk, v), s)), scale(kk, dot(kk, v) * (1 - c)));
}
