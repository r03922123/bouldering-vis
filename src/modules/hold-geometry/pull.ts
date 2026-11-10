// SPEC-point-cloud-view › Amendment: Draw a Hold's Direction in 3D. The user's pull: a preset, or a
// direction drawn in 3D. Image frame: +x right, +y down, +z out of the wall (toward the viewer).

type Vec3 = [number, number, number];

export type PullPreset = 'down' | 'up' | 'left' | 'right' | 'into';
export type PullOverride = PullPreset | { custom: Vec3 };

export const PRESET_DIR: Record<PullPreset, Vec3> = {
  down: [0, 1, 0],
  up: [0, -1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  into: [0, 0, -1],
};

export const PULL_OPTIONS: { value: PullPreset; label: string }[] = [
  { value: 'down', label: 'Down' },
  { value: 'up', label: 'Up' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'into', label: 'Into the wall' },
];

/** A drawn direction within this angle of a preset becomes that preset. */
export const SNAP_DEG = 12;

export const isCustomPull = (p: PullOverride | null): p is { custom: Vec3 } =>
  typeof p === 'object' && p !== null;

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The preset nearest a drawn direction if it's within SNAP_DEG (unless aiming freely), else the direction. */
export function snapPull(dir: Vec3, free = false): PullOverride {
  const d = unit(dir);
  if (!free) {
    const cos = Math.cos((SNAP_DEG * Math.PI) / 180);
    for (const [p, v] of Object.entries(PRESET_DIR) as [PullPreset, Vec3][]) {
      if (d[0] * v[0] + d[1] * v[1] + d[2] * v[2] >= cos) return p;
    }
  }
  return { custom: d };
}

export const pullDir = (p: PullOverride): Vec3 => (isCustomPull(p) ? p.custom : PRESET_DIR[p]);

const WORDS: [neg: string, pos: string][] = [
  ['left', 'right'],
  ['up', 'down'],
  ['into the wall', 'out from the wall'],
];

/** A direction in words: the main axis, plus a second one when it's clear (≥ 0.25). */
export function describePull(dir: Vec3): string {
  const d = unit(dir);
  const order = [0, 1, 2].sort((a, b) => Math.abs(d[b]!) - Math.abs(d[a]!));
  const word = (i: number) => WORDS[i]![d[i]! > 0 ? 1 : 0];
  const main = order[0]!;
  const head =
    main === 2
      ? d[2]! < 0
        ? 'Push into the wall'
        : 'Pull out from the wall'
      : `Pull ${word(main)}`;
  const second = order[1]!;
  const s = Math.abs(d[second]!);
  if (s < 0.25) return head;
  return `${head} and ${s / Math.abs(d[main]!) < 0.5 ? 'a little ' : ''}${word(second)}`;
}
