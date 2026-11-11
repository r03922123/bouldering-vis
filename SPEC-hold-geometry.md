# Spec: hold-geometry

Module id: `hold-geometry` · Depends on: `hold-segmentation`, `depth-estimation` · Used by: app shell (hold card), `point-cloud-view`
Status: **APPROVED (2026-10-26)**
Parent: [SPEC.md](SPEC.md)

## Objective

For each selected hold, draw the **perpendicular line**: an arrow along the hold's
surface normal that shows which way the grip surface faces (requirement 5). From the same
normal, derive an **orientation** tag (`standard` / `sidepull` / `undercling`) to show next
to the hold type.

User stories:
- On each of my holds I see an arrow pointing the way the hold faces, so I know which direction to pull.
- The hold card says "faces left · sidepull" and the hint says to pull against the arrow.

## How It Works (pure, main thread, < 5 ms per hold)

1. **Hold normal.** Erode the hold mask (the hold's edges have depth jumps that produce false
   normals). Erosion is **6 px (= 3σ of the normals' blur) when ≥ 10 px remain, else 2 px, else none**.
   Changed from a fixed 2 px on 2026-10-28: a 2 px erosion can't satisfy AC 2 because a σ = 2 blur
   spreads an edge step about 6 px inward. Average the unit normals inside the eroded mask, then renormalize:
   `n̂ = Σn / |Σn|`. The **consistency** `R = |Σn| / count` (0–1) is the confidence.
   If the eroded mask is empty, use the uneroded one.
2. **Wall normal.** Average the normals in a ring 6–20px outside the mask, excluding pixels
   of any selected hold. Used for orientation; the arrow itself always shows `n̂`.
3. **Relative facing.** `rel = n̂ − (n̂·ŵ)ŵ` (the hold normal's component along the wall).
   Tilt `θ = angle(n̂, ŵ)`.
4. **Orientation tag** (image coordinates, +y down):
   - `θ < 20°` → `standard` (faces straight out; no clear pull direction)
   - otherwise, using the direction of `rel` in 2D:
     - facing mostly **down** (angle within ±45° of +y) → `undercling`
     - facing mostly **left or right** (±45° of ±x) → `sidepull`
     - facing **up** → `standard` (the normal pull-down hold)
5. **Facing word:** one of 8 directions (up, up-right, …) from `atan2` of `(n̂x, n̂y)`.
6. **Arrow drawing (overlay layer):** starts at the hold centroid. Its 2D direction is
   `(n̂x, n̂y)` and its length is `max(12, 80·√(n̂x²+n̂y²))` screen px. When it's under 12px,
   a ⊙ dot ("faces you") is drawn instead. When `R < 0.4` the arrow is **dashed** and the card says "uncertain".

Since depth is relative (see `depth-estimation`), angles show **direction, not true degrees**.
The UI never shows a number of degrees.

## Public Interface (`src/modules/hold-geometry/index.ts`)

```ts
export type Orientation = 'standard' | 'sidepull' | 'undercling';
export type Facing = 'up' | 'up-right' | 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left' | 'out';

export interface HoldGeometry {
  holdId: string;
  normal: [number, number, number];      // n̂, +z toward the viewer
  wallNormal: [number, number, number];  // ŵ
  consistency: number;                   // R, 0–1
  orientation: Orientation;
  facing: Facing;                        // 'out' when the arrow is a ⊙ dot
}

export function holdGeometry(hold: HoldMask, holds: readonly HoldMask[], depth: DepthMap): HoldGeometry;   // pure
export function NormalArrows(): JSX.Element;   // overlay layer; toggle "Show arrows" (default on)
```

Computed for every selected hold once `DepthMap` is ready; recomputed only when that hold's
mask or the depth changes.

## Acceptance Criteria

1. **Synthetic (unit):** a hold on a flat wall facing straight out → `facing: 'out'`, `standard`, `R > 0.95`.
2. A hold whose depth ramps so that it faces left → `facing: 'left'`, `sidepull`, with `n̂` within 2° of the analytic normal.
3. Facing down → `undercling`; facing up → `standard`.
4. On a wall tilted as a whole (the wall ramp equals the hold ramp), a hold that is flat relative to the wall → `standard` (orientation is relative to the wall, not the camera).
5. The 2px erosion removes the edge effect: a cylinder-cap fixture's `n̂` is closer to +z with erosion than without (unit).
6. Arrows render on Original, Route and Depth views, follow zoom and pan, and toggle with "Show arrows". Dashed when `R < 0.4`.
7. The hold card shows "Faces left · sidepull · pull against the arrow" (or "uncertain"); no degree numbers anywhere.
8. Manual (revised 2026-10-29, decision D2): on real photos, every arrow that is drawn points the way a climber would agree with, and holds whose mean normal faces the camera show a ⊙ instead of a guessed direction. The original target of 7 of 10 *directional* arrows isn't reachable with monocular depth and mean normals (see Check Results).

## Testing

- **Unit (Vitest):** synthetic depth ramps through `computeNormals` (from `depth-estimation`) into `holdGeometry`, covering criteria 1–5; the boundaries of the 8-direction facing words.
- **Component:** `NormalArrows` draws N arrows for N holds; a dashed style when R is low.
- **E2E (fake worker):** fake depth ramp → Show route → arrows appear on all selected holds.
- **Manual:** criterion 8.

## Out of Scope

Metric angles, hand/foot pull suggestions, multiple normals per hold (e.g. pinch faces),
3D arrows (drawn by `point-cloud-view` using `normal`).

## Check Results (2026-10-28, M1)

**Normal gain.** With the spec's fixed gain 40, real holds read almost entirely "Faces you". Real depth-gradient
percentiles (|∇d| per px) were p75 ≈ 0.0016–0.0025 and p90 ≈ 0.0032–0.0053 across `real-1`, `heldout` and `real-2`,
so gain 40 gives hold tilts of only 5–11°. `computeNormals` now uses **gain = 1 / p90(|∇d|)** (clamped to 40–2000) in
the workers. The steepest 10% of each photo reads as ≥ 45° and flat wall stays under 20°.

| Check | Result | Target |
|---|---|---|
| AC 1–7 (unit, component, E2E with fake depth) | pass | ✓ |
| 10 holds incl. a 10 k-px volume on 1536×1152 | < 200 ms total in Node | < 5 ms/hold (main thread) ✓ |
| **AC 8**: real photos, arrows a climber would agree with | **not met**. Spray-wall route: 2 of 7 holds get a direction (left, up), 5 read "Faces you". A1 volumes: 9 of 9 "Faces you" | ≥ 7/10 ✗ |

**Why AC 8 fails.** The *mean* normal of a dome-shaped hold, or of a faceted volume (pyramid, ridge), averages back to
about +z. Monocular depth (the model works at about 518 px) also leaves only ~10–20 depth samples across a typical hold.
And on photos with floor or ceiling in frame, those dominate p90, which mutes wall relief.

**Open decision for the human.** The options are (a) keep surface normals as specified and accept "Faces you" as the
common result, (b) per-facet normals (cluster the hold's normals and draw the dominant facet), or (c) the 2D edge-
perpendicular line from the mask shape (the alternative offered on 2026-10-26). Until then, the implementation follows
the spec.

## Amendment 2026-10-29: Force Direction (T26)

Source: maxclimbing, "Force Direction & Hold Geometry". Core rule: *maximum friction when force is applied
perpendicular to the hold surface; pull in the direction the hold allows*.

`forceDirection(geometry, type)` returns a unit vector (image frame) of the force the hand should apply,
the rule that produced it, and a short cue:

| Case | Direction | Cue |
|---|---|---|
| Surface is reliable: tilt vs wall ≥ 20° and R ≥ 0.4 | **−n̂** (into the grip surface) | by orientation: sidepull "Pull sideways into the wall; turn your chest to the hold"; undercling "Pull up and out; drop your hips"; standard "Pull perpendicular to the surface" |
| jug / edge / pocket | wall-down (−u) | "Pull down into the incut" |
| crimp | wall-down (−u) | "Pull down; keep your elbow under the edge" |
| sloper | normalize(−ŵ − 0.6u): into the wall and down | "Press into the wall; get your hips under the hold" |
| pinch | none | "Squeeze; no single pull direction" |
| volume, or type unknown | none | — |

`u` is image-up projected onto the wall plane. The type is the effective type (the user override wins), so
correcting a type fixes the arrow. The hold card shows the cue.

Acceptance (unit): a reliable left-facing surface gives a force of +x; a flat hold typed sloper points into
the wall and down; pinch or volume gives no arrow; an override changes the arrow.

## Amendment 2026-10-29 (b): One Direction, Shown Like the Article (T28, T29)

User feedback: two arrows per hold (yellow normal + green force) were confusing. From now on:
- **Only the force direction is shown**, in 2D (green arrow from the centroid along the force's on-screen
  component) and in 3D. The yellow surface-normal arrows and the "Faces … · standard" text are removed;
  the normal is still computed, because it drives the force rule.
- Every hold card shows a **force diagram drawn like the maxclimbing figure**: a side view with the wall
  as a vertical line (climber side to the right), the hold profile (sloper = round bulge, jug/edge/crimp/
  pocket = flat incut lip, undercling = downward lip), a red hand and arm, and a green arrow at the
  force's (out-of-wall, down) angle, captioned with the cue. When the force is mostly sideways (sidepull)
  the diagram is a front view instead. No force → no diagram, just the cue if there is one.

Acceptance: a flat incut's arrow points straight down; a sloper's points into the wall and down; an
undercling's points up and away from the wall; a sidepull uses the front view; pinch/volume show no
arrow; the diagram has an accessible label.


## Amendment 2026-10-31: Sidepulls From the Hold Shape (pro-climber review)

A pro-climber review of the earlier sample route found thin vertical edges labelled "pull down". You can't pull down on a vertical edge; climbers use it as a sidepull.

- `HoldGeometry.shape` holds the mask's second-moment shape: `elongation` (long axis over short axis), `tiltDeg` (long axis from vertical, 0–90°) and centroid `x`.
- A crimp, edge, pocket or jug with elongation ≥ 2 and tilt ≤ 30° is a sidepull. Its force points sideways toward the climber's body, which is taken as the mean x of the route's holds, slightly into the wall. The cue reads "Sidepull: pull sideways toward your body and lean away".
- A short, flat or body-less hold keeps the type rule. A user's drawn or chosen direction still overrides everything.
