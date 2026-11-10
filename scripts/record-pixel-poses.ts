// Records the pixel-kit pose fixtures (tests/fixtures/pixel-kit/poses/*.json), so the pixel-kit
// unit tests never import climber-stance (SPEC-pixel-kit › Testing › Fixtures).
// Solver poses come from solveStance; the symmetric and crossed poses are hand-made, with every x
// on an art-pixel centre (k + 0.5) for the mirror test (AC 13).
// Usage: node scripts/record-pixel-poses.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runnerImport } from 'vite';

type Xyz = { x: number; y: number; z?: number };
type Joints = Record<string, Xyz>;
interface Pose {
  name: string;
  heightPx: number;
  source: string;
  joints: Joints;
}

const root = join(import.meta.dirname, '..');
const OUT = join(root, 'tests', 'fixtures', 'pixel-kit', 'poses');

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Symmetric hang at H = 48 on a 41-wide grid: the pelvis on column 20, x mirrored about 20.5. */
function hang48(): Joints {
  const c = 20.5;
  const pair = (name: string, dx: number, y: number): Joints => ({
    [`l${name}`]: { x: c - dx, y, z: 0 },
    [`r${name}`]: { x: c + dx, y, z: 0 },
  });
  return {
    pelvis: { x: c, y: 34, z: 0.5 },
    neck: { x: c, y: 20, z: 0.5 },
    head: { x: c, y: 15, z: 0.5 },
    ...pair('Shoulder', 6, 20),
    ...pair('Elbow', 10, 13),
    ...pair('Hand', 8, 6),
    ...pair('Hip', 4, 34),
    ...pair('Knee', 9, 43),
    ...pair('Foot', 7, 54),
  };
}

/** The hang with the forearms crossed above the head; the arms' z decides which is in front. */
function cross48(): Joints {
  const j = hang48();
  return {
    ...j,
    lElbow: { x: 12.5, y: 12, z: 0 },
    lHand: { x: 26.5, y: 4, z: 0 },
    rElbow: { x: 28.5, y: 12, z: 0 },
    rHand: { x: 14.5, y: 4, z: 0 },
  };
}

interface Solved {
  joints: Record<string, [number, number, number]> | null;
}
type Solve = (
  contacts: Record<string, unknown>,
  opts: { height: number; wallAngleDeg: number },
) => Solved;

const jug = (holdId: string, x: number, y: number) => ({
  holdId,
  point: [x, y],
  type: 'jug',
  dir: null,
});

function solved(
  solve: Solve,
  name: string,
  height: number,
  contacts: Record<string, unknown>,
  source = 'solveStance, vertical wall, jugs',
): Pose {
  const s = solve(contacts, { height, wallAngleDeg: 0 });
  if (!s.joints) throw new Error(`${name}: solveStance gave no joints`);
  const joints: Joints = {};
  for (const [k, [x, y, z]] of Object.entries(s.joints)) {
    joints[k] = { x: round(x), y: round(y), z: round(z) };
  }
  return { name, heightPx: height, source, joints };
}

const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

/**
 * An invented split start in working image px, inside a 1536 × 1152 photo (SPEC-pixel-kit ›
 * Amendment 2026-11-06). The left hand sidepulls a crimp up and to the left, the right hand presses
 * a sloper low near the body's midline, and the feet stand on two blobs below. The pulls are the
 * hold-geometry type rules' (sidepull toward the body; sloper with its assumed surface). The solver
 * puts the right hand inside the shoulder–hip quad, the case OQ 11 found.
 */
const SPLIT_START = {
  lh: { holdId: 'a', point: [600, 380], type: 'crimp', dir: unit([1, 0, -0.3]) },
  rh: {
    holdId: 'b',
    point: [780, 540],
    type: 'sloper',
    dir: unit([0, 0.6, -1]),
    surface: { normal: unit([0, -0.6, 1]), source: 'assumed' },
  },
  lf: { holdId: 'blob:c', point: [700, 800], type: null, dir: null },
  rf: { holdId: 'blob:d', point: [860, 800], type: null, dir: null },
};

const { module: stance } = await runnerImport<{ solveStance: Solve }>(
  join(root, 'src/modules/climber-stance/index.ts'),
  { root, logLevel: 'error' },
);

const poses: Pose[] = [
  { name: 'hang-48', heightPx: 48, source: 'hand-made, symmetric', joints: hang48() },
  { name: 'cross-48', heightPx: 48, source: 'hand-made, crossed forearms', joints: cross48() },
  solved(stance.solveStance, 'reach-left-48', 48, {
    lh: jug('a', 13, 5),
    rh: jug('b', 27, 16),
    lf: jug('c', 14, 52),
    rf: jug('d', 27, 48),
  }),
  solved(stance.solveStance, 'campus-48', 48, { lh: jug('a', 14, 8), rh: jug('b', 27, 8) }),
  solved(
    stance.solveStance,
    'split-start',
    424,
    SPLIT_START,
    'solveStance, vertical wall, invented split start',
  ),
  solved(stance.solveStance, 'hang-24', 24, {
    lh: jug('a', 8, 4),
    rh: jug('b', 16, 4),
    lf: jug('c', 9, 27),
    rf: jug('d', 15, 27),
  }),
];

mkdirSync(OUT, { recursive: true });
for (const p of poses) {
  writeFileSync(join(OUT, `${p.name}.json`), `${JSON.stringify(p, null, 2)}\n`);
  const xs = Object.values(p.joints).map((j) => j.x);
  const ys = Object.values(p.joints).map((j) => j.y);
  console.log(
    `${p.name}: x ${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}, y ${Math.min(...ys).toFixed(1)}–${Math.max(...ys).toFixed(1)}`,
  );
}
