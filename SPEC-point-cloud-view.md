# Spec: point-cloud-view

Module id: `point-cloud-view` · Depends on: `depth-estimation`, `route-compositor` (also reads `hold-segmentation` and `hold-geometry` state) · Used by: app shell
Status: **APPROVED (2026-10-28)**
Parent: [SPEC.md](SPEC.md)

## Objective

A **3D dot map** of the wall (requirement 6b): every pixel lifted into 3D using the depth
map and drawn as a colored point that the user can orbit and zoom. The route stands out
in it, with role badges and the perpendicular-line arrows in 3D. This replaces Gaussian
splatting, which needs several photos (decided in SPEC.md).

User stories:
- I open **3D view** and rotate the wall to see how far volumes and jugs stick out.
- My selected holds are bigger and in color, with S/F badges, and their normal arrows point out of them in 3D.
- I can switch between real photo colors and the Route view colors.

## How It Works

**Lazy-loaded:** three.js and this module are a separate chunk, loaded with a dynamic
`import()` the first time 3D view opens. Opening 3D view is also a depth trigger (see `depth-estimation`).

**Unprojection (pure)**, pinhole camera with assumed intrinsics:
- Horizontal FOV **60°** → `f = (w/2) / tan(30°)`, principal point at the image center.
- Depth is relative, so z is a **display mapping**, not metric: `z = 1 − relief · d`, where `d` ∈ [0, 1] (1 = nearest) and `relief` defaults to **0.35** (slider 0–1).
- `X = (u − cx) · z / f`, `Y = −(v − cy) · z / f`, `Z = −z` (three.js: +y up, the camera looks toward −z).

**Point budget:**
- Wall and other-hold pixels: sampled with stride `s`, chosen so the total is ≤ **300k** points on desktop and ≤ **120k** on touch devices (`pointer: coarse`).
- **Selected-hold pixels at stride 1**, so the route is drawn in full detail.

**Flying-pixel filter:** drop a point when the local depth jump `max(|∇d|)` in its 3×3
neighborhood is > **0.08**. Otherwise the edges between holds and the wall become streaks
pointing at the camera.

**Rendering (three.js `Points`, one `BufferGeometry`):**

| Element | Look |
|---|---|
| Color mode **Photo** | Source RGB for every point |
| Color mode **Route** (default) | Composite RGB from `route-compositor`, so it follows the **Show other holds** toggle (hidden other holds take the wall color) |
| Selected holds | Point size × 1.6 |
| Normal arrows | `ArrowHelper` at each hold's 3D centroid along `HoldGeometry.normal` (mapped into the same frame); dashed or transparent when `consistency < 0.4` |
| Role badges | S1 / S2 / F sprites above the start and finish holds, always facing the camera |

**Camera:** starts at the original photo viewpoint, so the first frame looks like the photo.
`OrbitControls` (one finger or left-drag rotates, pinch or wheel zooms, two fingers or
right-drag pans), plus a **Reset view** button. The orbit target is the centroid of the route,
or the image center when there are no holds.

## Public Interface (`src/modules/point-cloud-view/index.ts`)

```ts
export interface PointCloudData {
  positions: Float32Array;   // 3 * n
  colors: Float32Array;      // 3 * n, 0–1
  sizes: Float32Array;       // n
  count: number;
}

// pure
export function intrinsics(w: number, h: number, hfovDeg?: number): { f: number; cx: number; cy: number };
export function unproject(u: number, v: number, d: number, k: ReturnType<typeof intrinsics>, relief: number): [number, number, number];
export function pickStride(w: number, h: number, budget: number, selectedPixels: number): number;
export function buildPointCloud(input: {
  depth: DepthMap; source: ImageData; composite: ImageData; holds: readonly HoldMask[];
  colorMode: 'photo' | 'route'; relief: number; budget: number;
}): PointCloudData;

// UI (lazy chunk)
export default function PointCloudView(): JSX.Element;   // canvas + Color mode, Relief, Reset view, Show arrows
```

`buildPointCloud` runs on the main thread, with its heavy part moved into the depth worker
(changed 2026-10-28). The streak filter (a 9-neighbour pass over ~1.7M pixels) is computed once per image
inside the `depth:run` job and shipped as `DepthMap.discontinuities`. What's left takes ~30 ms on an M1 for
~250k points, and it only reruns when depth or the selection changes. Moving everything to a worker would
copy ~40 MB of image, depth and masks per rebuild for little gain. Changing the color mode or the Show other holds toggle only rebuilds
the `colors` attribute; changing `relief` only rebuilds `positions`.

Store: `view` gains `'3d'` → `'original' | 'route' | 'depth' | '3d'`. In 3D view, taps
don't select holds.

## Acceptance Criteria

1. **Unit:** the center pixel unprojects to `(0, 0, −z)`; corner pixels at `d = 0` reach the expected X/Y edge for a 60° FOV (±1e-6); `relief = 0` gives a flat plane.
2. **Unit:** with `pickStride` the total point count stays ≤ the budget for 1536×1152, both with and without large selected holds; every selected-hold pixel is included at stride 1.
3. **Unit:** a synthetic depth step edge produces no points inside the filtered band; a smooth ramp loses no points.
4. **Unit:** in Route color mode, point colors equal the composite pixels; toggling Show other holds changes only colors, never positions.
5. Opening 3D view the first time loads the three.js chunk (not in the initial bundle, checked in the build output) and shows the cloud within **≤ 2s** once depth is ready (laptop).
6. **≥ 30 fps** while orbiting on a laptop (Chrome Performance panel); on a phone, orbiting stays responsive (≥ 24 fps, mid-range Android, manual).
7. The first frame matches the photo framing (the camera at the original viewpoint); Reset view returns to it.
8. Arrows and S/F badges appear for selected holds; the Show arrows toggle hides the arrows in both 2D and 3D.
9. Without WebGL2, the view shows "3D view needs WebGL2" instead of crashing.
10. All controls (color mode, relief slider, reset, show arrows) are labeled and work by keyboard.

## Testing

- **Unit (Vitest):** `intrinsics`, `unproject`, `pickStride`, the flying-pixel filter, `buildPointCloud` on small synthetic inputs (criteria 1–4).
- **Component:** a mocked renderer receives an attribute update (colors only) when the toggle changes.
- **E2E (Playwright, fake worker, SwiftShader WebGL):** open 3D view → the canvas renders, there are no console errors, `data-point-count` on the canvas is > 0 and ≤ the budget; Reset view works.
- **Manual:** criterion 6, plus a look at 3 real photos: relief reads correctly, with no streak artifacts left.

## Out of Scope

Gaussian splatting or multiple photos, metric scale, reading FOV from EXIF, exporting
(PLY/GLB), meshing, VR/AR, selecting holds in 3D.

## Assumptions (approved 2026-10-28)

- A fixed 60° FOV is good enough. Real phone cameras are about 65–75°, but since depth is relative, the **Relief** slider makes up the visual difference.
- Default color mode is **Route**, so the 3D view matches the Route view the user has just seen.

## Amendment 2026-10-29: Force Arrows and Numbered Badges (T25, T26)

- A **green force arrow** per hold with a force direction. It *ends* at the hold's 3D centroid, pointing
  along the force (the hand pushing onto the hold), so it stays visible in front of the surface. The
  existing yellow normal arrow stays. The Arrows switch hides both.
- Badge sprites use the numbered labels from `hold-segmentation`.
- Acceptance: `data-force-arrows` counts the force arrows; pinch and volume holds get none; Arrows off → 0.

## Amendment 2026-10-29 (b): Readable Directions in 3D

User feedback, reproduced with a 13–15-hold simulation on the D2 sample: the 3D mesh arrows had cones bigger
than the holds ("funnels" at an angle), 1 px shafts reaching far above each hold, badge sprites colliding
with arrow tails, and 13 identical "pull down" arrows. Changes:
- Arrows and badges in 3D are a **2D overlay** at projected positions, redrawn on every render with the
  same drawing code as the 2D views (`drawArrow2D`, `drawBadge`): constant pixel size, crisp, never
  larger than a hold. Arrow length follows the on-screen foreshortening of the force; ⊗ when it points away.
- **Emphasis:** the common type-rule "pull down" is drawn subtle (26 px, thin); other directions (sloper,
  measured surface, sidepull, undercling) are bold (44 px).
- **Badges sit opposite the arrow**, so they never overlap it; above the hold when there's no arrow.

## Amendment 2026-10-30: Shading and Surface Style (T33, review item P1-4)

Approved by the human as part of the AAA review:
- Points are round (soft dot sprite) and Lambert-shaded from the depth normals (one light from the upper left,
  50% ambient), so relief reads as shape in both color modes.
- A **3D style** switch: *Dots* (default) or *Surface*, a shaded triangle mesh of the depth map (~200k vertices).
  Triangles touching a depth discontinuity or spanning a jump > `FLYING_PIXEL_JUMP` are dropped.
- Known limit: orbiting far off-axis shows the monocular depth model's guess at occluded areas as long sheets;
  a single photo has no data there.


## Amendment 2026-10-30 (approved 2026-10-30): Draw a Hold's Direction in 3D (T42, T43)

Requested by the human: adjust a hold's force vector by drawing in 3D. Chosen option: *drag on screen*. Review lens:
an indoor-climbing game developer (Cairn): direct manipulation, a clear grab affordance, forgiving input, instant
feedback.

### Interaction
- Each force arrow gets a **grab handle**: a ring on the arrowhead (the arrow starts at the hold), with a 44 px touch
  target; it stays under the finger while aiming. Rings are quiet (55% opacity) until hovered or held: always visible,
  since touch has no hover. The hint line names the gesture. Hover shows a glow and a
  `grab` cursor. Pressing **on a handle** aims the arrow; pressing anywhere else still orbits (no mode switch).
- **Aiming:** the arrow points from the hold to the pointer. The pointer ray is intersected with the plane through the
  hold that faces the camera, so what you see is what you set. Turn the camera (e.g. a side view) and drag again to tilt it
  into or out of the wall.
- **Snapping:** within 12° of a preset (down, up, left, right, into the wall), the arrow snaps to it, the handle pulses,
  and phones that support it give a short vibration. Hold Shift to aim freely.
- **Live feedback:** the arrow and its words ("Pull down and a little left (set by you)") update on every pointer move;
  releasing commits. Esc while dragging cancels.
- **Hold without a direction (pinch, unclassified):** a dashed handle on the hold itself lets the user draw one.

### Data
- `PullOverride` becomes `preset | { custom: Vec3 }` (image frame: +x right, +y down, +z out of the wall). The 3D view
  converts from the three.js frame (+y up). One override per hold, as now: the 2D arrow, the 3D arrow and the card all
  read it. The card's picker shows **"Pull: drawn"** for a custom one; **Pull: auto** resets it.

### Acceptance criteria (amendment)
- A1. Unit: the frame conversion three.js ↔ image is exact and round-trips; aiming from a pointer gives the expected
  direction for a front and a side camera.
- A2. Unit: snapping picks the preset within 12°, keeps a free direction otherwise, and never snaps when "free" is set.
- A3. Unit: the words for a custom direction ("down and a little left", "into the wall") from its angles.
- A4. E2E: dragging a handle changes that hold's direction (data attribute and card text); dragging elsewhere still
  orbits; Esc cancels; Pull: auto resets.
- A5. The arrow follows the pointer with no visible lag: a redraw per pointer move, no React state per move (refs).

## Amendment 2026-10-30: Aiming Coach Mark (I4 of the Cairn review)

The rings were discoverable only by reading the hint line. On the first visit to the 3D view the first
handle gets a coach mark: a short label ("Drag to set the pull") beside the ring with a leader line,
drawn on the overlay canvas so it follows the handle as the camera moves, flipped to the left near the
right edge, and hidden with the Arrows layer. It disappears on the first handle press and is remembered
per device (`localStorage` key `bouldering-vis:aim-coach`; blocked storage just shows it again). The
canvas exposes `data-coach="aim"` while it is shown.

Acceptance: A6. The mark is shown before the first drag, gone after it, and absent on a later visit.

