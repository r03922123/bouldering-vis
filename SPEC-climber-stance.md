# Spec: climber-stance

Module id: `climber-stance` · Depends on: `hold-segmentation`, `hold-geometry` · Used by: app shell (Route view overlay, inspector), `point-cloud-view` (3D figure, last task)
Status: **APPROVED (2026-10-30)**
Parent: [SPEC.md](SPEC.md) · Research: the pose report from 2026-10-30 (Stage 1; Stage 3, physics simulation / RL, closed 2026-10-30: no GPU budget for training or serving)

## Objective

Show **how a body could hang on the chosen holds**: which hand and foot go where, where the
center of mass sits, how much of the climber's weight each hand and foot carries, and whether
the position can be held at all. One frozen position (a "stance") at a time. This is a
teaching picture, not a measurement.

User stories:
- After Show route, I press "Try the start position" and see a stick climber on the start holds, with feet on the holds below.
- Each hand and foot shows how much of my weight it carries ("Right hand 32%"), so I see why good feet matter.
- I see a yellow dot (my center of mass) and a shaded area showing where it must stay. Moving a foot changes both.
- When a position can't be held, I'm told why in climbing words: "Out of reach: left foot", "Barn door: you'd swing off to the right", "Right hand: a sloper can't take this pull — get your hips lower".
- I can move any hand or foot to another selected hold, or take it off the wall.
- I set my wall's steepness (slab, vertical, overhang) and the climber's size on the photo.

**Not in Stage 1:** moving between stances (Stage 2), animation, physics simulation or RL (closed), dynamic moves, heel or toe hooks, flagging poses, pinch torque, per-person strength, metric units (cm, kg, N).

## Decisions (proposed; the review can change any of these)

| # | Topic | Decision | Why |
|---|---|---|---|
| S1 | Model | **Quasi-static equilibrium** with point contacts and friction cones (Bretl & Lall 2008) | Small, exact, testable; enough to teach balance |
| S2 | Units | Forces as **% of bodyweight**; lengths in **image pixels** | % bodyweight doesn't depend on mass or metric scale, so one "climber size" number is the only scale input |
| S3 | Scale | **Revised 2026-10-31 (Amendment: Default Climber Size).** Default climber height = **0.26 × the photo's width**, clamped to 0.12–0.6 × its height; independent of the holds. A **Climber size** slider, 50–200 % | Measured on 11 climbs in 5 gyms from climbers' videos; the old rule (14 × median hold) drew climbers 3.2× too big |
| S4 | Wall angle | User picks **Slab (−10°) / Vertical / Overhang 20° / 35° / 45°**; default Vertical. Not estimated from depth | Relative monocular depth can't give a true wall angle (SPEC-depth-estimation) |
| S5 | Wall frame | Holds lie on the wall plane (z = 0) at their centroids; the camera is assumed square to the wall. Same frame as the app: +x right, +y down the wall, +z out of the wall | Reuses hold-geometry's frame; hold relief is small next to body size |
| S6 | Body | Stick skeleton: head, trunk, upper arms, forearms (to grip), thighs, shanks (to toe). **Lengths** from Winter's anthropometric ratios (× height); **segment masses and CoM positions** from de Leva 1996 | Standard, free, citable. No SMPL (non-commercial licence) |
| S7 | Reach | **Analytic two-bone IK** per limb with a pole vector (elbows down and out, knees out to the sides and away from the wall). No IK library | Four 2-bone chains have closed-form solutions; closed-chain-ik-js would add a dependency for no gain |
| S8 | Pose search | The unknown is the **pelvis position (x, y, z)**. The trunk leans halfway from straight up toward the hands' midpoint, parallel to the wall. The hips stay at least 0.15 H below the highest hand (no mantles in Stage 1). Coarse grid filtered by reach, then pattern-search refinement | 3 unknowns; fast and deterministic; a failing stance still looks human |
| S9 | Forces | Each friction cone is linearized into an **8-edge pyramid**; solve with **NNLS** (Lawson–Hanson, ~80 lines, no dependency) | Exact non-negativity, no QP library |
| S10 | Objective | **Revised after review (2026-10-30).** The pose comes from a **posture prior**: arms near 90 % reach, legs anywhere in 45–90 %, pelvis 0.2 H off the wall and over the middle of its holds. Forces are then the least effort at that pose: **2·Σ‖hand‖² + Σ‖foot‖²**, with sideways force (along the wall) costing 4× (climbers shift weight onto the foot under them rather than lean on sideways friction). The load cost only breaks ties between poses | Choosing the pose by the load cost made every vertical 4-point stance split 17/17/33/33, whatever the feet did. **Honest limit:** on a vertical wall the hand/foot split is statically indeterminate, so it reflects the "weight on your feet" rule (the 2:1 weights). The left/right split, and every split where a cone limits, does come from the geometry |
| S11 | Feasible | Equilibrium residual ≤ **2 % of bodyweight** (force) and ≤ **2 % bodyweight × height** (torque) | A tolerance for the linearized cones |
| S12 | Thread | Pure functions on the main thread, debounced 100 ms after a change. Move to the worker only if the AC 12 budget fails | Avoids new worker plumbing |
| S13 | Display | **Route view** overlay (default off; "Climber" switch) plus a **Stance** inspector section. 3D figure in the last task | Route view is the clean picture; on a phone the numbers go in the panel, not on the canvas |

### Friction cones (reaction force of the hold on the climber)

The cone's axis comes from the hold's **effective force** (`forceWithOverride` from
hold-geometry: the user's drawn pull wins, then the surface, then the hold type). The hand pulls
along `dir`, so the hold pushes back along **−dir**. The force is first turned into the wall frame
by the rotation that takes that hold's local wall normal to +z (added after review: otherwise a
depth tilt around one hold tips its cone into or out of the wall, against S4/S5).

| Contact | Axis | Half-angle |
|---|---|---|
| Hand on jug | −dir | 55° |
| Hand on pocket | −dir | 45° |
| Hand on edge | −dir | 40° |
| Hand on crimp | −dir | 35° |
| Hand on sloper, volume | −dir | 30° |
| Hand, any type with `dir = null` (pinch, unknown) | up the wall (0, −1, 0) | pinch 60°, otherwise 40° |
| Foot on a hold | up and out: unit(0, −1, 0.6) | 45° |
| Foot smearing (no hold; was also a foot on a sloper or volume until Amendment 2026-11-01 (c)) | out of the wall (0, 0, 1) | 35° |

Gravity in the wall frame for wall angle α (overhang > 0): `g = (0, cos α, sin α)`, total weight 1.
Hand types are passed as plain strings (the hold-geometry pattern), so this module doesn't
depend on `hold-classification`.

### Default limb assignment ("Try the start position")

1. **Hands:** two start holds → left hand on the left one, right hand on the right one. One start hold → both hands match on it (± 0.015 H apart).
2. **Feet:** from the other selected holds (route role, not finish) at least 0.35 H below the lower hand. Pick the pair with the lowest total of (horizontal distance from below the hands + |drop − 0.75 H|), with the left foot left of the right foot. One candidate → one foot; a foot with no foothold **smears on the wall** ("Smear on the wall": 0.75 H below the hands, 0.1 H to its side, kept on the photo; cone out of the wall, 35°). Changed from "both feet off" on 2026-10-30: the routemake routes list hand holds only (spray walls use any feet), so every real start position became a campus hang that no vertical wall allows.
3. The user can change any limb to any selected hold, or set it to **Off**. Removing a hold frees its limb.

### Diagnosis when a stance can't be held (first rule that applies)

Order revised after review: barn door is checked before slips, because freeing a contact's friction lets it pull too, which "explained" almost every one-sided stance as a slip.

1. **Out of reach** (IK fails for a limb at every pelvis position): "Out of reach: left foot — make the climber bigger or pick a closer hold".
2. **Barn door** (all contacts lie near one steep line): "Barn door: you'd swing off to the right — add a hand or foot on the other side".
3. **Slips** (it becomes feasible when one contact may take a force in any direction, tested at the search's best positions and a spread of the others): "Right hand: a sloper can't take this pull — get your hips lower/under it" (the wording comes from the hold type).
4. Otherwise: "Can't hold this position on this wall".

A stance that can't be held is drawn dashed in a **natural pose** (no physics: limbs near 90 % reach, hips 0.2 H off the wall), not the search's least-bad pose, which on slopers was a strange mantle. Its weight shares are not shown (numbers for an impossible position mislead).

## How It Works (pure)

```
contacts (limb → hold centroid, cone) + gravity + body(H)
  → grid of pelvis positions → keep those where all 4 limbs reach (IK)
  → per candidate: CoM from segment poses → NNLS forces → cost
  → refine the best (pattern search, 4 halvings)
  → Pose { joints, com, forces%, feasible, diagnosis }
region: 18 × 18 grid of CoM positions on the wall plane (at the pose's CoM depth)
  → feasible? → convex hull = "where your hips can be"
```

The feasible CoM set is convex for fixed contacts (Bretl & Lall), so a hull of grid samples is a
fair picture of it.

## Public Interface (`src/modules/climber-stance/index.ts`)

```ts
export type Limb = 'lh' | 'rh' | 'lf' | 'rf';
export type Assignment = Record<Limb, string | null>;     // hold id or null (off)
export interface ContactInput { holdId: string; point: [number, number]; type: string | null; dir: Vec3 | null }

export interface Stance {
  joints: Joints | null;                                  // null when no limb is on a hold
  com: Vec3;
  load: Partial<Record<Limb, { percent: number; share: number; force: Vec3 }>>;
        // force the climber applies; share = % of the weight (adds to 100); empty unless feasible
  reach: Partial<Record<Limb, boolean>>;                  // per assigned limb
  feasible: boolean;
  diagnosis: Diagnosis | null;                            // { kind, limb?, text }
  region: [number, number][];                             // hull on the wall plane
}

export function autoAssign(holds: readonly HoldMask[], heightPx: number): Assignment;              // pure
export function contactsFor(a: Assignment, holds, types, forces, heightPx): StanceContacts;        // pure
export function solveStance(contacts: StanceContacts, opts: StanceOptions): Stance;              // pure
export function defaultClimberHeight(holds: readonly HoldMask[], imageHeight: number): number;      // pure
export function useStance(types, forces): { stance: Stance | null; assignment; height };          // debounced
export function StancePanel(props): JSX.Element;       // inspector section
export function drawStance(ctx, stance, toScreen): void;   // Route view overlay
```

Store additions (reset per image except `wallAngle`, which is usually the same gym; a removed hold clears its limb):
`stanceAssignment: Assignment | null` (null = auto), `climberScale: number` (1 = default),
`wallAngle: -10 | 0 | 20 | 35 | 45`, `showClimber: boolean` (default false).

## Display

- **Overlay (Route view, "Climber" on):** stick figure (white with a dark outline, 3 px at 1×); left limbs cyan `#22d3ee`, right limbs orange `#fb923c`; a small limb chip (LH/RH/LF/RF) at each contact; the force each limb applies as an arrow, length ∝ % (100 % = 0.25 H); CoM as a yellow `#facc15` dot with a dotted line down; the region drawn as a yellow **range bar through the CoM** (the region sliced at the CoM's height: "your hips can move between these marks"; on a vertical wall the region is an endless vertical band, so a filled polygon only added clutter). Limb chips sit left or right of the hold by side, so matched hands both show. When the stance can't be held: the figure is dashed, and an unreachable limb is a dashed line to its hold.
- **Stance panel:** 4 rows (limb · hold number select · % bar) whose percents add up to 100 %; status line ("Balanced" or the diagnosis); Wall angle select; Climber size slider; "Try the start position" button (sets auto and turns the overlay on); a short note: "A simple balance model — real grip strength and friction vary."
- Forces shown are the **force the climber applies** (same sense as the existing hold arrows).

## Acceptance Criteria

Unit (synthetic, H = 1000 px):
1. **Body:** de Leva mass fractions sum to 100 % ± 0.1; standing straight, the CoM is at 0.55–0.58 H above the soles.
2. **IK:** a reachable target is hit within 0.5 px; the elbow bends toward its pole; a target beyond limb length reports unreachable.
3. **NNLS:** matches a brute-force reference on 20 random small problems (≤ 1e-6).
4. **Symmetric 4-point stance**, vertical wall, jugs 0.2 H apart, feet on holds 0.75 H lower: ~~L/R loads equal within 1 %~~; the vertical components add to 100 % ± 1; **feet carry more than hands**.
   - **Amended 2026-11-01 (book-based prior, B6).** The hips shift onto one foot, as the 19 measured climbs do, so the L/R loads are no longer equal: the CoM sits within 0.1 H of a foot. The two mirror-image poses cost the same, and rounding used to pick the side. A tie (costs within 1e-9) now goes to the pelvis further left, so a mirror-symmetric stance that can be held settles on its **left** foot (this one: LH 27 · RH 16 · LF 52 · RF 21 % force, pelvis 0.25 H left). Mirroring an asymmetric stance mirrors its pose (within 0.005 H) and its loads (within 0.5 %). `main`'s prior kept this stance centred and even.
5. **Steeper is harder:** same holds, the hands' share rises monotonically from Vertical → 20° → 35° → 45°.
6. **Campus:** feet off on Overhang 35° with jugs → hands 100 %, feasible; on the same wall with slopers → infeasible, diagnosis "slips" on a hand.
7. **Barn door:** a failing stance with its contacts on one steep line is diagnosed "barn door" (a sloper hand and a smearing foot on one vertical line, 35°). A hand and foot on one line on jugs and edges can be held: gravity is parallel to that line, so friction carries the sideways turn.
7b. **Feet shift weight:** moving one foot out wide changes the left/right foot shares by more than 3 points.
8. **Undercling:** both hands on underclings (pull up) with feet below → feasible, feet > 100 % (the hands pull the body down).
9. **Out of reach:** a foothold 1.2 H below the hands → "Out of reach: left foot".
10. **Invariance and determinism:** scaling every position and H by 3 gives the same percents (± 0.1); the same input gives the same output.
11. **Region:** the CoM dot is inside the region exactly when the stance is feasible (on fixtures 4–8).

Performance:
12. `solveStance` + region **< 60 ms** desktop and **< 150 ms** at 4× CPU throttle for 4 contacts (measured with the existing harness; meets the 150 ms long-task budget).

UI (component + E2E, desktop and 375 px):
13. "Try the start position" on the sample wall → the overlay shows a figure, the panel's 4 rows add up to 100 %, and the status is set.
14. Changing a limb's hold or the wall angle updates the figure and the numbers within 300 ms; setting a limb to Off removes it.
15. The overlay follows zoom and pan; the "Climber" switch hides it; no console errors.
16. A new image resets the stance; removing a hold that has a limb frees that limb.

Manual (real photos, 5 routemake fixtures):
17. On walls where a climber would agree the start position is holdable, it's shown as Balanced. A wrong verdict is either explained by a wrong hold type or pull direction (the user can fix it), or recorded in Check Results.

## Testing

- **Unit (Vitest):** `body`, `ik`, `nnls`, `equilibrium`, `pose`, `assign`, `diagnose`, `region` (AC 1–11), each with small hand-built fixtures.
- **Component:** `StancePanel` (rows, sum, select changes, Off), overlay draw calls with a stub context.
- **E2E (Playwright, fake ML):** AC 13–16 on desktop and phone.
- **Timing:** add `stance` to `spike/loop-timing.mjs` (AC 12).

## Boundaries

- **Always:** pure math with named constants and the source cited next to each table; % bodyweight only, no fake precision (whole percents in the UI); tests first.
- **Ask first:** a new dependency (physics engine, IK or QP library); moving solving into the worker; showing cm, kg or N; changing the hold-geometry force rules.
- **Never:** present the result as a measurement or a safety guarantee; ship SMPL or any non-commercial body model; send photos or stances to a server.

## Check Results (2026-10-30)

Real models (SlimSAM, Depth Anything, CLIP + probe), local dev server, five routemake routes (3 on `mingde-S`, 2 on `g4-SW`), start position from the route's own start tags, default climber size.

After the review fixes (posture-first pose, wall-frame forces, barn door first):

| Route | Holds | Vertical | Overhang 35° |
|---|---|---|---|
| mingde-S #0 (grade 7) | 8 | Balanced: hands 31 + 31, smears 19 + 19 | Balanced: hands 50 + 50, smears 0 + 0 |
| mingde-S #1 (grade 4) | 6 | Balanced: hands 31 + 31, smears 19 + 19 | Balanced: hands 50 + 50 |
| mingde-S #2 (grade 2) | 5 | Right hand: a sloper can't take this pull | Right hand: a sloper can't take this pull |
| g4-SW #0 (grade 3) | 6 | Balanced: hands 33 + 34, smears 16 + 17 | Balanced: hands 50 + 50 |
| g4-SW #2 (grade 6) | 6 | Right hand: a sloper can't take this pull | Left hand: a sloper can't take this pull |

- **AC 17:** 3 of 5 start positions balance on a vertical wall. The two that don't have a start hold typed "sloper" (CLIP + probe, matched hands, smearing feet). Whether that's right depends on the hold type, which the user can correct, as the AC allows. Smears carry nothing on a 35° overhang, which matches climbing experience.
- **First version (feet off):** 0 of 5 balanced on vertical. That drove the smear change above.
- **AC 12:** the longest main-thread task while the stance re-solves is 51–59 ms on desktop and 110–117 ms at 4× CPU throttle. Both meet the targets (60 ms, and the 150 ms long-task budget), but desktop is close: the next speed-up is bisecting the CoM range instead of sampling an 18 × 18 region grid (review suggestion; ~half the solves).
- **Size:** on `g4-SW` the default climber is about 0.8 of the photo's height, which looks ~20 % too big for a spray wall. Kept: the slider fixes it, and there is no ground truth to tune against (Open Question 1).
- **Display:** a failing stance first drew the search's least-bad pose (a mantle with the head above the hands). It's now a natural hanging pose, dashed, with no shares.
- No console errors.

## Amendment: Default Climber Size (2026-10-31)

**Why.** The first default (14 × the median selected hold's long side) assumed a ~12 cm hold next to a
~170 cm climber. Measured against real climbers it drew the figure **3.2× too big on average (worst
4.6×)**: selected-hold masks include volumes, macros and shadows, and holds span 3 cm foot chips to
100 cm macros ([Trango sizing](https://trango.com/pages/hold-technology),
[EP macros](https://epclimbing.com/en/news/macros-ep-climbing-florent-bonvarlet-holds-2)). No climbing
game infers body size from hold size either: they author the wall around a fixed body (Assassin's
Creed's 30 cm handhold grid, [GamesBeat](https://gamesbeat.com/ubisofts-creative-director-on-why-hooded-assassins-still-fit-in-the-american-revolution-interview/);
Cairn's hand-placed holds, [Point'n Think](https://www.pointnthink.fr/en/emeric-thoa-cairn-2/)).

**Ground truth.** `scripts/fetch-routemake-zone.ts` saves routemake zones with climbers' videos and
their self-reported height band. Per video, MediaPipe joints are mapped onto the zone photo (SIFT +
RANSAC homography) and leg segments give photo px/cm (spike: `spike/zone-scale/`). Independent vision
agents checked every video's registration and scale; 11 of 16 were trusted (5 zones, 5 gyms:
g2-B1 ×6, g5-A1 ×2, g3-AB1, g4-C1, mingde-A2). Target per climb: a 170 cm climber at that local scale.

**Candidates** (leave-one-zone-out for fitted constants; error as a ratio to the target):

| Default climber height | Bias | Typical error | Worst |
|---|---|---|---|
| 14 × median hold (old) | 3.23× | ×1.24 | ×4.58 |
| k × median hold | 0.86× | ×2.06 | ×5.41 |
| type-aware hold sizes (Trango bands per type) | 0.86× | ×1.61 | ×2.03 |
| k × image height | 0.89× | ×1.56 | ×2.18 |
| k × √(image area) | 0.93× | ×1.33 | ×1.72 |
| **k × image width, k = 0.26** | **0.96×** | **×1.22** | **×1.40** |

Width works because zone photos frame a wall section of similar width (0.26 → ~6.5 m across);
height fails on portrait photos. **Decision:** `climberHeight = 0.26 × imageWidth`, clamped to
0.12–0.6 × imageHeight (a guard for panoramas and very tall crops), independent of the selected holds
(so the figure no longer jumps as holds are added). The slider stays (50–200 %).

**Limits.** 11 climbs, 5 gyms; the per-climb errors range 0.74–1.32×. Bodies hang 15–35 cm in front
of the wall, so video scales run a few % high. Commercial walls are ~3.7–4.6 m and competition walls
≤ 4.5 m ([IFSC venue spec](https://images.ifsc-climbing.org/ifsc/image/private/t_q_good/prd/zyoowsp9iiywlszflw99.pdf)),
but the measured walls were 2.9–4.5 m, so a fixed wall-height prior would not have done better.
Single-image person-height estimation barely beats the population mean
([Günel et al.](https://arxiv.org/html/1805.10355v1)), so a typed height and a slider remain the
honest controls.

**Known scale wins.** When the photo carries a measured scale (`WorkingImage.pxPerCm`, from a sample
measured with its videos; SPEC-image-input › Amendment 2026-10-31), the default is
**170 cm × pxPerCm**. 170 cm sits between intermediate recreational women (~1.65 m) and men (~1.77 m)
([PMC13541946](https://pmc.ncbi.nlm.nih.gov/articles/PMC13541946/)) and is the climber the
calibration used.

AC 18: `defaultClimberHeight({width: 1600, height: 1200})` = 416; with `pxPerCm: 2.5` → 425; portrait 1600×2133 → 416;
a 4000×600 panorama clamps to 360; adding or removing holds never changes it.

## Amendment: Book-Based Stance (2026-10-31)

**Why.** Real climbers' videos (19 verified climbs, 5 gyms, 59 still stances) showed the solved
stances with hips ~0.10–0.15 H too low and knees ~45–50° more bent than real; at a stand start the
real climber stands on near-straight legs with bent arms, the solver hung from straight arms.

**Source.** 東秀磯, 攀岩技術教本詳細圖解 (旗標, 2018), read chapter by chapter (printed page numbers).
Used as a reference for principles only: nothing from the book ships in the app.

**Principles adopted now** (Stage 1 posture prior):

| # | Book principle | Pages | Solver |
|---|---|---|---|
| B1 | Feet carry the weight; the loaded leg is near-straight, weight on the skeleton | 19, 117, 120, 145 | loaded-leg reach 0.97–1.0 (was 0.45–0.9) |
| B2 | A high-stepped foot's knee bends; the low leg bears the weight | 17, 93–95 | a foot ≥ 0.3 H above the other gets a free 0.45–1.0 band |
| B3 | Pulling arms work bent (strongest at ~90° elbow) | 39 | pull-arm reach target 0.8 (was 0.9) |
| B4 | Hand pull ≈ weight × hip-to-wall distance ÷ vertical span: hips close to the wall | 19, 139 | pelvis 0.1 H off the wall (was 0.2), steep penalty past 0.15 H |
| B5 | Knees open sideways and down, not away from the wall | 54, 139 | knee pole lateral + down (was out of the wall) |
| B6 | Put the CoM over the loaded foot (frontal lever: hand load ≈ W·Δx_foot / Δx_hand) | 16, 140, 152 | lateral prior over the feet (was centred on all holds) |
| B7 | A crouched, hips-low frog is the wind-up for a dynamic move, not a stance | 22, 118, 145 | the static stance never prefers it |

**Stage 2 (not yet):** trunk rotation (inside/outside edge, drop knee, layback; p75–78, 100–109),
flags as counterweight instead of a smear (p72–83), press vs pull by hand height (p40, 96, 135),
grip-strength curve and 50%/80% grip warnings (p39, 136), wall-angle families (p148–151).

**Validation (59 still stances from 19 verified climbs, 5 gyms; `spike/zone-scale/`):**

| Real vs solved | Old prior | Book prior |
|---|---|---|
| Hip vertical bias | +0.097 H (too low) | −0.008 H |
| Shoulder vertical bias | +0.106 H | +0.001 H |
| Hip position error (median) | 0.146 H | 0.127 H |
| Knee angle error (median) | 51° | 26° |
| Elbow angle error (median) | 21° | 23° |

Fitting the dials further gained little (0.442 → 0.430) and did not hold up on held-out gyms, so the
book values stay. **Blind visual A/B** (23 stances, old vs new in random order, vision reviewers):
new 12 / old 10 / tie 1; starts 5 / 6 / 1. The new prior fixes the vertical bias but is **not yet a
visible win**: reviewers flag a sideways trunk shift and occasional sunk hips where real climbers
turn their body. Trunk rotation (Stage 2) is the next step.

**Start position:** auto feet a median 0.58 H below the lower hand and 0.21 H to the side, minimum
0.25 H (12 real starts; was 0.75 H / 0.1 H / 0.35 H). This shipped first, in Amendment 2026-10-31:
Split Start and Measured Foot Spacing (`anyFeet.ts`).

**Ported onto step 1 (2026-11-01, user decision).** The prior now ships on top of Amendment
2026-10-31 (b); every step 1 behaviour is kept except AC 4's equal L/R loads (amended there: the hips shift onto one foot, and a symmetric stance picks the left one). Re-run on the 59 stances (`baseline.eval.ts`, `main`'s
solver vs the port): hip vertical bias +0.097 → −0.008 H, shoulder +0.106 → +0.001 H, hip error
0.146 → 0.127 H, knee error 51° → 26°, elbow error 21° → 23°, feasible 0.966 both. On the 12 starts
alone the hips now sit a little high (−0.061 H; was +0.081 H).

- **Smears on an overhang are not loaded legs.** From rule 8's 20° a smear carries next to nothing,
  so B1's near-straight band doesn't apply to it; it gets the free 0.45–1.0 band. Without this the
  straight legs lift the hips and AC 31's smears carry 3.7 % each at 20° (bound 3 %); with it,
  0.3 %. The 59 stances are all vertical with no smears, so their numbers don't change.
- **B1-03 (pinned `b1-foot-band.blobs.json`, H 424, Vertical):** the pelvis sits 0.051 H below the
  right (lower) hand, down from 0.111 H on `main` in the same unit setup (Task 8's live check read
  0.09 H). B1-03's feet are only 0.50–0.52 H below the lower hand, so the near-straight legs lift
  the hips onto the search's floor (0.15 H below the higher, left hand). The real starts with feet
  that close sit 0.00–0.21 H below (B1-07, B1-11, B1-12, C1-24); the 0.275 H median comes from
  deeper feet. `anyFeet.test.ts` pins the floor exactly (0.051 H), and `stance.test.ts` ("hangs the
  hips off the floor…") pins a hip height the prior does set (feet 0.72 H down: 0.36 ± 0.005 H).
  **Decided 2026-11-01 (user): accept 0.051 H** — it sits inside the 0.00–0.21 H range of real
  starts with feet this close, and `hipsBelowHands` (0.15) stays unchanged. Trunk rotation
  (Stage 2) is still the next step.

## Open Questions

1. ~~The default size heuristic (14 × median hold) is a guess.~~ Resolved 2026-10-31: see Amendment: Default Climber Size.
2. ~~Should the feet default to a smear when no footholds were selected?~~ Resolved 2026-10-30: yes (Check Results).

## Amendment 2026-10-31: Split Start and Measured Foot Spacing (pro-climber review)

- **One start hold:** the other hand takes the nearest picked route hold beside it: within 0.55 H sideways, within 0.25 H in height, and more sideways than vertical. Hands are ordered left to right. If there is no such hold, both hands match on the start hold.
- **Foot spacing:** feet go 0.58 H below the lower hand and 0.21 H to each side. A picked hold counts as a foothold from 0.25 H below the hand. These values come from 12 real starts in `spike/zone-scale`.
- **Known gap:** with only hand holds picked, both feet smear. A smear can only push the body away from the wall, and a sloper's cone points out of the wall too, so a sloper start on a vertical wall has no feasible forces and every share shows "—". The proposed next step is "any feet": stand on the nearest hold in `wallMask`.

## Amendment 2026-10-31 (b): Any Feet and Sloper Cone (Bloc Hall step 1)

Status: **PROPOSED (2026-10-31)**, revised after review. This is step 1 of the build order in [SPEC-game.md](SPEC-game.md).

Parent decisions changed here:
- "Friction cones": sloper and volume hands.
- "Default limb assignment": feet.
- "Diagnosis": a new kind, `sloper-steep`, inside the slip rule.

S3 and the smear cone are not changed.

Sources:
- the research report `research-climbing-re.md` §3 and §5, and the techniques list `research-climbing-re-techniques.json`. Both exist only in the session scratchpad today, so task 8 commits them under `tasks/`;
- the claims this amendment relies on, checked in **Spot-Check** below.

### Objective

Make the default start position holdable on real walls, with real weight shares. Bloc Hall's first success criterion depends on this: "the default start stance can be held, and the weight shares are real numbers".

Today, a route that lists only hand holds gets two smearing feet. A smear can only push the body *away* from the wall. Under today's type rule, a sloper hand's reaction also points out of the wall. On a vertical wall, a body whose centre of mass (CoM) hangs off the wall needs an *inward* pull at the hands to stop it toppling. Neither contact can give that pull, so the forces never balance and every share shows "—". This is the "Known gap" in the previous amendment.

The recorded real-model session on the sample wall shows the gap on route **B1-03**:
- Vertical: "Right hand: a sloper can't take this pull", with all four shares "—".
- Overhang 35°: "Can't hold this position on this wall".

This amendment does two things, the two items on the capability map:

1. **Any feet.** Feet stand on real holds found in the photo's wall mask, not only on holds the user picked. Order of preference:
   1. a picked route hold;
   2. a wall-mask blob;
   3. a smear (slab or vertical);
   4. a dangling foot (overhang ≥ 20°).
2. **Sloper cone.** A sloper or volume hand's friction cone is centred on the grip surface's outward normal in the wall frame, with half-angle atan(μ), μ = 0.72. A new diagnosis says when a sloper is too steep to hold.

User stories:
- I press "Try the start position" on B1-03. The climber stands on the two holds above the mats, the panel says "Balanced", and it shows four percentages.
- I can switch "Feet: Any feet / Follow hands". With Follow hands, feet use only the route's holds, as on a strict "feet follow hands" problem.
- Each foot's hold list includes "Wall foothold 1–4", so I can move a foot to another hold the app found.
- When a sloper can't be held, I'm told so in climbing words, and how to fix a wrong guess.

**Not in this amendment:**
- **The smear cone 35° → 40°.** It isn't on the capability map, and it would widen a cone. It needs its own approved amendment (Spot-Check row 3 holds the evidence). The spike shows it doesn't change B1-03.
- trunk rotation (see **Deferred: Trunk Rotation**);
- per-blob depth normals ("up-facing fraction") and per-blob hold types;
- checking candidate foot pairs with the physics solver;
- matched feet on one wide blob;
- force caps per hold type;
- the Bretl–Lall region;
- a toe point for picked-hold feet. They keep the centroid, as today.

### Findings From the Code (read before reviewing)

**The wall mask is a colour heuristic.**
- `route-compositor/segmentWall.ts` runs Lab k-means with seed 1, then open 3×3 and close 5×5. It keeps components between 0.02 % and 8 % of the image.
- 1 = hold, 0 = wall. The mask has no ids, types or normals.
- `useWallMask` asks the worker for it only when the Route or 3D view opens.
- `climber-stance` may not import `route-compositor`, because SPEC-climber-stance's "Depends on" line names only `hold-segmentation` and `hold-geometry`. The worker (`src/workers/`, which is not a module) wires the two together.

**Spike timings** on the sample photo (`public/samples/routemake-g2-b1.jpg` at 1536 × 1152), in Node on the M1 dev laptop. The spike script is not committed; task 8 re-measures these.

| Step | Time |
|---|---|
| `segmentWall` | 345 ms |
| `labelComponents` (96 components) | 23 ms |
| per-blob summary (bounding box, upper contour) | 14 ms |

At 4× CPU throttle, the labelling and summary would take an *estimated* ~150 ms (4 × 37 ms, not measured). That is the whole long-task budget, so they run **in the worker**.

**The sloper cone today:**
- With a reliable surface (tilt ≥ 20°, R ≥ 0.4), `forceDirection` returns `source: 'surface'` and `dir = −n̂`. `contactsFor` turns that into the wall frame (`alignToOut`), and `coneFor` uses the axis `−dir`. So the axis is already the surface normal.
- With an unreliable surface (the common "Faces you" case), the sloper type rule gives `dir = unit(−ŵ + 0.6·down)`. The axis `−dir` is then unit(0, −0.6, 1) in the wall frame: out of the wall and up, 59° from up.
- A `volume` gets `dir = null` from `forceDirection`, unless its surface is reliable. It then falls back to an "up" cone at 40°, which is too generous.
- **So the real changes are three:**
  - half-angle atan(0.72) instead of 30°;
  - a volume with no reliable surface uses the assumed sloper surface;
  - the `sloper-steep` diagnosis.
- The surface's source (`measured`, `user` or `assumed`) comes straight from `Force.source`, which the app already passes in. So climber-stance doesn't copy hold-geometry's private 20° / 0.4 gate.
- **The sloper cone alone does not rescue B1-03** (simulation below). Real footholds do.

**The worker transfers response buffers.** `host.ts` `transferables()` transfers every typed array in a response, including the `wall:segment` mask. A worker-side mask cache must therefore keep its own copy, or the second request reads a detached, empty buffer.

**Stale comment.** `assign.ts` cites "Amendment: Book-Based Stance", which doesn't exist. It should cite "Amendment 2026-10-31: Split Start and Measured Foot Spacing".

**Existing tests build `ContactInput` by hand**, with no surface. Examples are `stance.test.ts` AC 6 and AC 11 (sloper hands with `dir = (0, 0.6, −1)`, expecting `kind: 'slip'`) and `diagnose.test.ts`. Rule 11's fallback keeps them valid. Only the cone-table assertion changes (sloper 30° → 35.8°).

**E2E waits on the status text.** `e2e/stance.spec.ts` waits for the status to stop matching `/Working/` before it reads the shares. So the new "pending" status must keep the word "Working" (rule 15).

### Spot-Check (2026-10-31)

| # | Claim | Result | What this spec uses |
|---|---|---|---|
| 1 | **MoonBoardRNN BetaMove foot regions** ([preprocessing_helper.py](https://github.com/jrchang612/MoonBoardRNN/blob/master/preprocessing/preprocessing_helper.py), `moveGenerator`) | **Partly confirmed.** 7 regions below the remaining hand, in rows 2–3, 4–6 and 7–9 below it. Column half-widths 2–4, 2–5 and ±2. `scoreFromfoot = 0.5` when no region has a hold. The grid pitch (~20 cm) that turns rows into metres is **not confirmed** by an official MoonBoard source. | The gates are anchored on **our own 12 measured starts** (`tests/fixtures/real/zone-scale/lat.json`, `startGeometry`): drop 0.27–1.03 H, \|side\| ≤ 0.60 H. The two deepest feet (0.92 and 1.03 H) are both within 0.21 H sideways. BetaMove only corroborates: at ~20 cm per row its bands are 0.24–0.35, 0.47–0.71 and 0.82–1.06 H, and its widths ≤ 0.59 H (≤ 0.24 H in the lowest band). |
| 2 | **Fuss et al. 2020**, skin on hold ≈ 0.72 ([Front. Psychol. 11:252](https://pmc.ncbi.nlm.nih.gov/articles/PMC7088443/)) | **Confirmed, as a lower bound.** 14 flat surfaces, 22 climbers. Average COF 0.529 (Teflon) to 0.841 (rubber); translucent plastic 0.718. The surfaces were inclined −29°, which needs ≥ tan 29° = 0.554. The values are "substatic" ratios *applied before impending slip*, not the slip limit. Flat plates, open hand, no chalk. | μ = 0.72, so the half-angle is **atan(0.72) = 35.75° = 0.6240 rad**. Because applied ratios are below the slip limit, this is a lower bound. Real textured, chalked holds are untested. |
| 3 | **Elkington et al. 2024**, shoe rubber ≈ 1 ([Sports Eng. 27:30](https://eprints.whiterose.ac.uk/id/eprint/217285/)) | **Confirmed**, from Table 6. μs 0.97–1.21 at 30 and 60 N; μk 0.76–1.14; a 1.7–26.4 % drop at slip onset. Tested against a **granite** pin, not gym plastic or plywood. | **Not used here.** It is the evidence for a later smear 40° amendment. |
| 4 | **Horizon Zero Dawn, GDC 2017**, "free-hang vs braced" ([van Grinsven slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanGrinsven_PlayerTraversalMechanics.pdf), "Climbing: Guiding Limbs") | **Partly confirmed.** The slides say "Feet: against geometry if possible, otherwise dangling" and "Collision probes … two sets for the feet". They give **no wall-angle threshold**, and the words "braced / free-hang" are not in this deck. | Hold first, dangle otherwise, is HZD's logic (logic only; no art, code or assets). The **20° threshold is ours**, from a spike on our own solver: with jugs, smears carried 1–2 % each at 20° and 0 % at 35°. That run is not in the table below, so AC 31 pins it. Check Results 2026-10-30 also showed 0 % at 35°. |

**Not spot-checked, so labelled as such where they are used:**
- the 0.29 H "too close" distance (the research report attributes it to Naderi 2017's h_too_close, d = 0.5 m);
- the Naderi facing cost in **Deferred**.

The ~3 cm smallest foot chip comes from the parent spec's Trango citation.

### Pre-Implementation Simulation (spike, scratch copy of the solver)

Inputs:
- **Hands**, from the recorded session:
  - **LH** = hold 2, a crimp sidepull, `dir = unit(1, 0, −0.3)`, point (906, 584).
  - **RH** = hold 1 (Start), a sloper with an unreliable surface (the type rule), `dir = unit(0, 0.6, −1)`, point (1106, 626).
- **Size**: `pxPerCm` 2.496 at 1536 px (the sample's 2.6 at 1600), so **H = 424 px**.
- **Feet**, picked by the rules below from the real `segmentWall` mask:
  - LF toe (960, 838): the pink hold above the mats, 0.50 H below the lower hand and 0.11 H left of the hands' middle.
  - RF toe (1131, 845): the black hold, 0.29 H right.

The wall-foothold results use the sloper cone with μ = 0.72 and today's 35° smear (this amendment's configuration). The last column shows that the cone changes alone change nothing.

| Wall | Today (smears) | Wall footholds | Smears 40° + sloper μ 0.72 |
|---|---|---|---|
| Slab | slip: right hand sloper | **Balanced** LH −1 · RH 0 · LF 54 · RF 47 | slip: right hand sloper |
| Vertical | slip: right hand sloper | **Balanced** LH 0 · RH 0 · LF 94 · RF 6 | slip: right hand sloper |
| Overhang 20° | slip: right hand sloper | slip: left hand crimp | slip: right hand sloper |
| Overhang 35° | slip: right hand sloper | slip: right hand sloper | slip: right hand sloper |

Each solve took 22–31 ms in Node. The spike reports the existing climber-stance suites passing with the new sloper cone, with only the cone-table assertion changed. Task 5 re-runs them.

### Interface (`src/modules/climber-stance/index.ts`, additions)

```ts
// wallFootholds.ts — pure. Runs in the worker (exported via climber-stance/worker.ts), once per image.
export const WALL_FOOT_PREFIX = 'blob:';
export interface WallFoothold {
  /** `blob:<label>`. Stable for one image (row-major labelling of a deterministic mask). */
  id: string;
  label: number;
  /** Pixels. */
  area: number;
  bbox: { x: number; y: number; w: number; h: number };
  centroid: { x: number; y: number };
  /** On the blob's upper contour (rule 3). The contact point is (toe.x, toe.y + TOE_INSET·H). */
  toe: { x: number; y: number };
}
export interface WallFootholds {
  imageId: string;
  width: number;
  height: number;
  /** Component label per pixel, 0 = wall, row-major. segmentWall's speck filter bounds the count at 5 000. */
  labels: Uint16Array;
  blobs: WallFoothold[];
}
/** Throws if the mask has more than 65 535 components (never for a segmentWall mask). */
export function wallFootholds(
  mask: Uint8Array, width: number, height: number, imageId: string,
): WallFootholds;                                                   // pure, deterministic
export const isWallFoothold: (id: string | null) => boolean;

// anyFeet.ts — pure
export type FeetMode = 'any' | 'follow';
export interface FootCandidate {
  /** A picked route hold id, or `blob:<label>`. */
  id: string;
  kind: 'hold' | 'blob';
  /** Contact point, image px (hold: centroid; blob: toe + inset). */
  point: [number, number];
  /** Lower is better (rule 5). */
  cost: number;
}
export type FootCandidates = Record<'lf' | 'rf', FootCandidate[]>;
export function footCandidates(args: {
  holds: readonly HoldMask[];
  /** The hands of the current assignment (auto or the user's). */
  hands: { lh: HoldMask | null; rh: HoldMask | null };
  height: number;
  footholds: WallFootholds | null;
  mode: FeetMode;
}): FootCandidates;      // per foot: holds first, then ≤ 4 blobs; each group sorted by (cost, id)

// assign.ts — extended signatures. Calls without the new arguments keep their behaviour,
// except rule 4's gates on picked holds.
export interface AutoAssignOptions {
  wallAngleDeg?: number;              // default 0
  footholds?: WallFootholds | null;   // default null
  feetMode?: FeetMode;                // default 'any'
}
export function autoAssign(
  holds: readonly HoldMask[], height: number, opts?: AutoAssignOptions,
): Assignment;
export interface ContactExtras {
  footholds?: WallFootholds | null;
}
export function contactsFor(
  assignment: Assignment,
  holds: readonly HoldMask[],
  types: ReadonlyMap<string, string | null>,
  /** hold-geometry's Force; `source` picks the sloper surface (rule 11). */
  forces: ReadonlyMap<string, { dir: Vec3 | null; source?: 'surface' | 'type' | 'user' | 'none' }>,
  height: number,
  photo?: { width: number; height: number },
  wallNormals?: ReadonlyMap<string, Vec3>,
  extras?: ContactExtras,
): StanceContacts;

// stance.ts
export interface ContactInput {
  holdId: string;
  point: [number, number];
  type: string | null;
  dir: Vec3 | null;
  /** Sloper or volume hands only: the grip surface's outward normal in the wall frame (rule 11). */
  surface?: { normal: Vec3; source: 'measured' | 'user' | 'assumed' } | null;
}

// cones.ts
export const SLOPER_MU = 0.72;                          // Fuss et al. 2020 (lower bound)
export const SLOPER_HALF_ANGLE = Math.atan(SLOPER_MU);  // 0.6240 rad (35.75°)
export function coneFor(
  limb: Limb, type: string | null, dir: Vec3 | null, surface?: ContactInput['surface'],
): Cone;

// diagnose.ts
export type DiagnosisKind = 'reach' | 'slip' | 'barn-door' | 'sloper-steep' | 'unbalanced';

// useWallFootholds.ts — App.tsx mounts it once (precedent: route-compositor's useWallMask)
export function useWallFootholds(client: MlClient): void;

// useStance.ts — the `forces` parameter widens to include `source` (App already passes Force).
// StanceState gains:
//   candidates: FootCandidates;      // memoised on (hands, holds, footholds, height, mode)
//   footholdsStatus: 'idle' | 'pending' | 'ready' | 'error';
```

**Worker protocol** (`src/workers/protocol.ts`, with `import type { WallFootholds } from '../modules/climber-stance/worker'`):

```ts
| { type: 'wall:footholds'; imageId: string; pixels: ImageData }
// response:
'wall:footholds': { type: 'wall:blobs'; imageId: string; footholds: WallFootholds };
```

- Priority 1, like `wall:segment`. `PRIORITY` in `host.ts` gains the entry. `transferables()` already transfers `footholds.labels`, which is one level down.
- `src/workers/wallCache.ts` exports `createMaskCache(segment = segmentWall)`. It is a one-entry cache keyed by `imageId`.
  - `ml.worker.ts` creates one instance, and each `createFakeHandlers()` creates its own, so tests don't share state.
  - `wall:segment` and `wall:footholds` both go through the cache, so `segmentWall` runs at most once per image, in either order.
  - The cache **stores its own copy** and hands out `mask.slice()`. A response transfers its buffer, so a shared array would come back detached.
- The worker imports the pure functions from `climber-stance/worker.ts` and `route-compositor/worker.ts`. That is the existing precedent, and `src/workers/` is not a module.

**Store additions** (`src/store/app.ts`; all reset by `setImage`):

| Field | Default | Notes |
|---|---|---|
| `feetMode: FeetMode` | `'any'` | Route-level. `setFeetMode(m)` also sets `stanceAssignment: null`, so the toggle visibly re-picks the start position (hands included). |
| `wallFootholds: WallFootholds \| null` | `null` | Set by `setWallFootholds` from `useWallFootholds`. |
| `wallFootholdsStatus` | `'idle'` | `'idle' \| 'pending' \| 'ready' \| 'error'`, set by `setWallFootholdsStatus`. |

Nothing here uses browser storage. Blocked storage changes nothing in this module.

### Behaviour Rules

**When and where the footholds are computed**

1. `useWallFootholds(client)` is mounted once in `App.tsx`. It sends **one** `wall:footholds` request per image when `image && showClimber`, whatever the view.
   - In the same effect that sends the request, it sets the status to `pending`, so the 100 ms stance debounce never fires on `idle`. The status then goes to `ready` or `error`.
   - An answer or error for an image that is no longer current is ignored. The hook compares the request's `imageId` with the store's.
   - There is no automatic retry. A new image, or turning the climber off and on, retries.
   - Why `showClimber` and not `analysisTriggered`: the worker can't interrupt a running job. A 345 ms (desktop), ~1.4 s (estimated phone) `segmentWall` during tapping would delay `sam:decode`. SPEC-play-shell decides how Play mode turns the request on.
2. `wallFootholds(mask, width, height, imageId)` labels the mask's 8-connected components **once** with `lib/components.ts` `labelComponents`. It copies the labels into a `Uint16Array`.
   - In one more pass it records each component's area, bounding box, centroid and upper contour (the top pixel in each column).
   - An all-zero mask gives `blobs: []`.

**Toe point and blob size**

3. **Toe rule.**
   - Take the columns in the central 60 % of the bounding box (`x0 + ⌊0.2w⌋` … `x0 + ⌈0.8w⌉ − 1`) that contain blob pixels. If none do, take every column of the blob.
   - Sort them by (top y, x) and take the lower median.
   - `toe` = (that column, its top y). The toe always lies exactly on the upper contour.
   - The foot's contact point is `toe + (0, TOE_INSET·H)`, with **TOE_INSET = 0.005**.
4. **Gates.** All gates are measured at the contact point, in climber heights H. They are measured from the **lower hand** (y_h = the largest hand y) and the hands' mean x (x_m). A candidate must pass all of them, picked holds and blobs alike:

   | Gate | Value | Source |
   |---|---|---|
   | Drop below the lower hand | 0.25 H ≤ Δy ≤ 1.05 H | measured 0.27–1.03 H (12 starts); BetaMove bands corroborate |
   | Sideways from x_m | \|Δx\| ≤ 0.60 H when Δy ≤ 0.80 H; ≤ 0.30 H below that | measured \|side\| ≤ 0.60 H; the two measured feet deeper than 0.80 H are within 0.21 H; the leg reach limits deep wide feet (AC 26b) |
   | Blob size | bounding-box w and h ≥ **0.012 H** (≈ 2 cm at 170 cm) | the smallest foot chips are ~3 cm (Trango, cited in the parent spec) |
   | On the photo | contact point inside the image | — |
   | Shape: not too big | bounding-box w and h ≤ **0.40 H** (was 0.25 H; see the check below) | user decision 2026-10-31 (filter signs and stickers); a game guess, not measured |
   | Shape: not a solid rectangle | reject when fill = area ÷ (w·h) ≥ **0.92** and both w and h ≥ **0.06 H** | signs and stickers are filled rectangles; real holds are rounder. A game guess |
   | Shape: not a strip | reject when max(w, h) ÷ min(w, h) > **6** | tape lines and edge strips; a game guess |

   - The three shape gates apply to blobs only. **Check:** the route sign above the mats on B1, which the spike ranked 2nd for the right foot, must fail at least one shape gate (Task 4 verifies this on the sample photo). If it doesn't, adjust the values in the amendment before merging, and record the change.
   - **Check run 2026-11-01** (review fix; real `segmentWall` on the sample at 1536 × 1152, B1-03 hands, H 424; the foot band's blobs are pinned in `tests/fixtures/b1-foot-band.blobs.json`):
     - With "not too big" at 0.25 H, the black foothold the simulation stands on (`blob:81`, 84 × 125 px, 0.30 H tall) was rejected, and the right foot went to the route sign (`blob:91`, 63 × 23 px, fill 0.66, aspect 2.7). The pink hold (0.25 H) only just passed, and failed at climber size 95 %.
     - **Changed:** "not too big" 0.25 H → **0.40 H**. B1-03's feet are now the pink and black holds at climber sizes 100 % and 95 % (`anyFeet.test.ts`).
     - **Still failing: the sign passes every shape gate**, and stays in the right foot's menu as "Wall foothold 2". No values of the three gates separate it: it is a small, tilted rectangle (fill 0.66, aspect 2.7, smaller side 0.054 H). A survey of the blobs at aspect 2.2–6 on the 8 local routemake photos and the sample found signs at aspect 2.3–3.4 and fill 0.57–0.69, and real footholds at the same values (a red edge at aspect 2.44, a white hold at 2.91). Catching it needs a new cue, for example the fill of a rotated bounding rectangle, or the blob's colour or texture from the worker. **Open: the user's decision.**
   - "Wall foothold 1–4" in each foot's menu remains the user's manual fix.

   - `segmentWall` already drops specks under 0.02 % of the image and regions over 8 %.
   - A blob cut by the image edge is kept if its contact point is inside.
   - The size gate applies to blobs only. Picked holds are the user's tags.
5. **Score** (lower is better; dimensionless):
   `cost = |p − ideal_s| / H + 0.5 · Σ_hands max(0, 1 − |p − hand| / 0.29 H)`
   - `ideal` = (x_m ∓ 0.21 H, y_h + 0.58 H): the measured `SMEAR_SIDE` and `FOOT_DROP`.
   - The second term softly penalises a foot right under a hand. 0.29 H (≈ 0.5 m at 170 cm) is a tuning constant taken from the research report's reading of Naderi 2017's h_too_close. It has not been spot-checked.
6. **Excluding blobs under the hands, and duplicates.** This runs only when `footholds` is given. It uses `labels` and each picked hold's SAM mask, scanned over the hold's bounding box only (a hold without a mask uses only the point test):
   - A blob overlapping a **hand** hold by ≥ 30 % of the smaller of the two areas, or containing a hand's contact point, is never a foot.
   - A blob overlapping any other **picked** hold (any role) by ≥ 30 % of the smaller area is dropped. A picked hold with role `route` then competes on its own, at its centroid, through the gates. Start and finish holds are never feet.
7. **Preference order.** Feet are picked as a pair from the per-foot lists of rule 5 (≤ 4 blobs per foot). Pairs are ranked by:
   - (a) fewest fallback feet;
   - (b) then fewest blob feet, so a picked route hold beats a blob;
   - (c) then the lowest summed cost;
   - (d) then candidate ids in string order, so the result is deterministic.

   Two real feet keep `lf.x ≤ rf.x`, and two feet never share one candidate. If exactly one distinct candidate exists, it goes to the left foot if its x < x_m, otherwise to the right foot, and the other foot falls back.
8. **Fallback.**
   - Wall angle ≤ 0° (slab, vertical): **smear** (`SMEAR`, as today).
   - Wall angle ≥ 20°: **dangle**. The limb is `null`, shown as Off, and the leg hangs along gravity as today.
9. **Follow hands** (`feetMode: 'follow'`): only picked route holds are candidates, then the fallback. Blobs are never offered.
10. **contactsFor.**
    - A `blob:<label>` foot becomes `{ holdId: id, point: toe + inset, type: null, dir: null }`. Its cone is therefore the foothold cone (axis unit(0, −1, 0.6), 45°).
      - **Honest limit:** the blob's real shape is unknown. A sloping blob or a volume gets the same edge cone (Open Question 2).
    - A blob id that isn't in `footholds` (stale or not loaded) gives `null`, like a missing hold.
    - Blobs are offered for feet only, never for hands.

**Sloper cone**

11. For a hand on a `sloper` or `volume`, `contactsFor` sets `surface` in the wall frame (the same `alignToOut` rotation as `dir`). The first case that applies wins:
    1. **user**: `forces[id].source === 'user'`: normal = −dir.
    2. **measured**: `forces[id].source === 'surface'` (hold-geometry's own reliability gate): normal = −dir, which is n̂ in the wall frame.
    3. **assumed**: otherwise, including `dir = null` and no force entry yet: normal = unit(0, −0.6, 1). This is the sloper type rule's surface: out of the wall and up, 59° from up.

    How `coneFor` uses it:
    - With a `surface`, `coneFor` centres the cone on `surface.normal` with half-angle `SLOPER_HALF_ANGLE`.
    - Without one (hand-built contacts in tests and other callers), a sloper or volume hand keeps today's axis (−dir, or up at 40° when `dir` is null), with half-angle `SLOPER_HALF_ANGLE` when `dir` is set. No `sloper-steep` diagnosis is given.

    What changes in production:
    - For a sloper, all three cases give today's axis. Only the half-angle changes.
    - A volume with no reliable surface changes from "up, 40°" to the assumed surface.
    - The widening from 30° to 35.75° is sourced (Spot-Check 2), and the spike shows it doesn't change B1-03's verdict.
12. **Steepness** = the angle between `surface.normal` and true up, −`gravityFor(α)`. So the same sloper gets steeper on an overhang.
13. **Diagnosis "sloper too steep"** sits inside the slip rule, and the rule order is unchanged. If the slip test's limb is a sloper or volume hand with a `surface`, and its steepness is greater than `SLOPER_HALF_ANGLE`, the kind is `'sloper-steep'`. The text depends on the source:
    - measured or user: "Right hand: this sloper is too steep to hold here — get a foot on a hold under it";
    - assumed: "Right hand: this sloper may be too steep — if its top faces up, set its pull to Down". "Down" is the hold inspector's existing `PULL_OPTIONS` label.

    The texts use "volume" for volumes, and no degree numbers appear (the hold-geometry rule). Otherwise the existing slip text stays.

**UI**

14. `useStance`:
    - passes `wallAngle`, `feetMode` and the footholds (only when `ready`) to `autoAssign`, and the footholds to `contactsFor`;
    - doesn't solve while `feetMode === 'any'` and `wallFootholdsStatus === 'pending'`. The status then reads "Working out the position: finding footholds…" and no shares show, so no smear stance flashes first. The text keeps "Working", which the existing E2E waits on;
    - on `error`, solves with no blobs, and the panel adds "Couldn't find footholds on this photo";
    - computes `candidates` from the current assignment's hands.
15. `StancePanel`:
    - **Feet toggle**: a two-option radio group, "Feet: Any feet / Follow hands". Each option is ≥ 44 px tall.
    - **Foot select options**, in order: Off · Smear on the wall · Wall foothold 1 … k · Hold N …
      - "Wall foothold *i*" are that foot's ranked blob candidates (k ≤ 4).
      - An assigned blob that isn't in the list appears as "Wall foothold".
      - In Follow-hands mode there are no wall options.
      - Hand selects never list wall footholds.
    - The overlay draws the foot chip at the contact point (toe + inset). `drawStance` draws from contacts, so it needs no hold lookup. There is no extra outline, to keep Route view clean.

### Acceptance Criteria (continuing from AC 18)

**Unit** (Vitest, synthetic masks, H = 1000 px unless stated):
- Hands are jugs at (900, 300) and (1100, 300), so y_h = 300 and x_m = 1000.
- Masks are 2000 × 1600, and blobs are 40 × 20 px rectangles unless stated.

19. **Labelling and toe.**
    - A 40 × 20 rectangle at x 100–139, y 50–69 gives `area` 800, `bbox` {100, 50, 40, 20} and `toe` (119, 50).
    - A blob with a 6 px notch in its top edge, inside the central columns, has its toe on the upper contour (exact top-pixel test).
    - The same mask twice gives deep-equal output, and the ids are `blob:1…n` in row-major order.
    - An all-zero mask gives `blobs: []`.
20. **Picks a blob.** Blobs with contact points at (790, 885) and (1210, 885), and no picked feet, give `lf` = the left blob and `rf` = the right blob, not `SMEAR`.
21. **Gates.** Each of these is rejected when it is the only blob, so both feet smear on Vertical:
    - drop 0.20 H;
    - drop 1.20 H;
    - Δx 0.70 H at drop 0.50 H;
    - Δx 0.40 H at drop 0.90 H;
    - an 8 × 8 px blob (< 12 px);
    - a blob whose contact point falls below the image's last row.

    A 40 × 20 blob cut by the image's bottom edge, with its contact point inside, is accepted.
21b. **Shape gates** (each blob placed at the ideal point, otherwise passing every gate):
    - a 450 × 450 px blob (0.45 H) is rejected (too big); a 300 × 300 one (0.30 H) is accepted (changed by the rule 4 check run);
    - a solid 120 × 80 rectangle (fill 1.0, both sides ≥ 0.06 H) is rejected (sign);
    - a 280 × 40 strip (aspect 7) is rejected (strip);
    - a solid 40 × 20 rectangle is accepted (sides < 0.06 H, aspect 2);
    - an ellipse-shaped 120 × 80 blob (fill ≈ 0.79) is accepted.
22. **Preference.**
    - A picked route hold at (700, 880) beats a blob exactly at the ideal (790, 880).
    - Of two blobs, the one 0.05 H from the ideal beats the one 0.30 H away.
    - A blob at the edge of the gates (drop 1.0 H, Δx 0.25 H) beats a smear.
23. **Fallback by wall.** With no candidates:
    - Slab or Vertical gives `SMEAR` for both feet;
    - Overhang 20°, 35° or 45° gives `null` for both feet.
24. **Follow hands.** With the blobs of AC 20 and `feetMode: 'follow'`, the result is `SMEAR` / `SMEAR` on Vertical.
25. **Excluded under hands and deduplicated.**
    - A blob that overlaps a hand hold's mask by 30 % is never a foot, and neither is a blob that contains a hand point.
    - A blob that overlaps a picked route hold by 30 % yields that hold's id, not a `blob:` id.
    - A blob that overlaps a finish hold by 30 % yields neither.
26. **Pairs and edge routes.**
    - Two real feet always satisfy `lf.x ≤ rf.x`, and never share an id.
    - With a single blob at x 1150, `rf` takes it and `lf` falls back.
    - No start hold gives `EMPTY_ASSIGNMENT` whatever the footholds, and so does an empty route.
    - One start hold with no partner gives matched hands, with gates measured from that hold's centroid.

    26b. **Gate corners are reachable.** With jug hands and one blob at (Δx −0.60 H, drop 0.80 H), and then one at (Δx −0.30 H, drop 1.05 H), `solveStance` on Vertical never gives `kind: 'reach'`. If the solver says otherwise when the test is written, tighten the gate. Never loosen reach.
27. **contactsFor.**
    - A `blob:` foot's point is (toe.x, toe.y + 5), with type `null` and the 45° foothold cone.
    - A stale `blob:` id gives `null`.
    - A sloper hand gets `surface.source` `'user'`, `'measured'` or `'assumed'` from `forces[id].source` `'user'`, `'surface'` or anything else.
    - A volume with no force entry gets the assumed surface.
28. **Sloper cone** (pure `solveStance`, contacts with explicit `surface`).
    - Setup: Vertical; sloper hands at (400, 200) and (600, 200); foothold contacts (type `null`) at (290, 780) and (710, 780). The measured normal is tilted from up toward the room.

    | Surface | Result |
    |---|---|
    | measured, 20° from up | feasible; shares add to 100 ± 1 |
    | measured, 30° from up | the kind is never `sloper-steep` (it is below the threshold) |
    | measured, 45° from up | infeasible; `sloper-steep` on a hand; the "too steep to hold here" text |
    | assumed (59° from up) | infeasible; `sloper-steep` on a hand; the "may be too steep … set its pull to Down" text |
    | user pull Down on both hands | feasible |

    - The 20° and 45° rows, and the user row, are predictions from the cone geometry. They are not in the spike. If the solver disagrees when the test is written first, stop and report. Never widen a cone to make the test pass.
29. **Steeper is stricter.** A sloper with a measured normal 20° from up is feasible on Vertical (AC 28) and infeasible on Overhang 20°, where it is 40° from true up. Whenever that failing stance's diagnosis names a sloper hand, the kind is `sloper-steep`.
30. **Cone table.** It replaces the 30° sloper row; the smear row is unchanged:

    | Contact | Axis | Half-angle |
    |---|---|---|
    | sloper, volume hand with `surface` | `surface.normal` (rule 11) | `SLOPER_HALF_ANGLE` (0.6240 rad) |
    | sloper, volume hand without `surface`, `dir` set | −dir | `SLOPER_HALF_ANGLE` |
    | sloper, volume hand without `surface`, `dir` null | up (0, −1, 0) | 40° (as today) |
    | smear | (0, 0, 1) | 35° (as today) |

    ACs 1–11 still pass, with their existing assertions apart from this row.
31. **Dangle is honest.** Jugs plus two smears at the AC 28 foot points: each smear's share is ≤ 3 % at Overhang 20°, and 0 % (rounded) at 35°.
32. **B1-03 fixture (pure).**
    - Contacts from the simulation: H 424; LH crimp at (906, 584) with `dir` unit(1, 0, −0.3); RH sloper at (1106, 626) with the type-rule `dir` and an assumed surface; foothold contacts at (960, 840) and (1131, 847).
    - Vertical: feasible; four rounded shares add to 100; feet together ≥ 50 %.
    - Slab: feasible.
    - The same hands with two smears on Vertical: infeasible (the regression this amendment fixes).
33. **Determinism and invariance.**
    - The same inputs give the same assignment and stance.
    - `footCandidates` costs are unchanged (± 1e-9) when every point, every bounding box and H are scaled by 3.
    - `purity.test.ts` greps `wallFootholds.ts`, `anyFeet.ts`, `cones.ts`, `diagnose.ts` and `assign.ts`, and finds no `Math.random`, `setTimeout`, `setInterval` or `Date.now`.

**Performance.** All times are on the M1 dev laptop. They are measured with `spike/loop-timing.mjs` and a Node timing script, not asserted in Vitest, where timing flakes.

34. Targets:
    - `wallFootholds` on a 1536 × 1152 mask: ≤ 60 ms in Node (spike: 37 ms). It runs in the worker only.
    - `autoAssign` plus `footCandidates`, with 100 blobs and 7 holds whose bounding boxes cover ≥ 10 % of the image (the overlap scan included): ≤ 5 ms desktop, ≤ 20 ms at 4× throttle. They run on the main thread at every climber-size step.
    - From "Try the start position" to the first verdict on the sample (real `segmentWall`): ≤ 1 s desktop; target ≤ 2 s at 4× throttle. A miss is recorded in Check Results. Moving the trigger earlier is an ask-first change (Open Question 5).
    - AC 12 still holds: `solveStance` + region < 60 ms desktop, < 150 ms at 4× throttle.

**Component and E2E** (fake ML worker, which runs the real `segmentWall`; desktop and 375 px):

35. **Hook.**
    - With `showClimber` on and the view kept on **Original**, exactly one `wall:footholds` request is sent.
    - With `showClimber` off, none is sent, even after Route view opens.
    - With the climber on, opening Route runs `segmentWall` once in total. The test injects a spy through `createMaskCache`.
    - An error for a replaced image doesn't change the new image's status.
36. **Panel.**
    - While pending, the status reads "Working out the position: finding footholds…" and no shares show.
    - With footholds ready, the foot selects list "Wall foothold 1…k" (k ≤ 4), and the hand selects list none.
    - Choosing "Follow hands" re-picks the start position (`stanceAssignment` becomes null), and the wall options disappear.
    - On `error`, the panel shows "Couldn't find footholds on this photo" and a solved stance.
    - The toggle's options are ≥ 44 px tall, with no horizontal scroll at 375 px.
37. **E2E.**
    - `e2e/stance.spec.ts` (AC 13–16) passes unchanged.
    - A new case uses `wall-landscape.jpg` with only start and finish tagged. After "Try the start position", the foot selects list the number of "Wall foothold" options pinned from a one-off run of `wallFootholds` on that fixture. The run is deterministic, so a change to `segmentWall` shows up as a diff. At least one foot is assigned one of them.

**Real-model check** (the recorded session, `spike/pro-session.mjs`):

38. **B1-03 on the sample wall** (Wanhua B1): 7 holds, hold 1 Start, hold 7 Finish, default climber size, Any feet.
    - **Vertical**: the status is "Balanced: this position can be held"; four numeric shares add to 100 ± 1; both feet are on "Wall foothold" options; the feet together carry ≥ 50 %.
    - **Slab**: Balanced.
    - **Overhang 20°**: a `slip` diagnosis naming the left hand (the spike gives "left hand crimp"), or Balanced.
    - **Overhang 35°**: `sloper-steep` on the right hand, with the "may be too steep" text.
    - No console errors.

    The results go in a new Check Results table, next to the baseline (Vertical: "Right hand: a sloper can't take this pull", all shares "—").
39. **The five routemake fixtures** (Check Results 2026-10-30, re-run with a new `spike/stance-real.mjs`):
    - mingde-S #2 and g4-SW #2 either balance or fail with `sloper-steep`, on Vertical.
    - The three that balanced still balance on Vertical and on Overhang 35°.
40. **Foot choice against real climbers** (recorded, not gating).
    - Data: the g2-B1 starts in `tests/fixtures/real/zone-scale/export.json` (the sample photo's zone), with the hands at the real wrist points.
    - Measure: the median distance from the chosen feet to the MediaPipe toes (`real.lToe` / `real.rToe`), in the export's frame and H.
    - Target ≤ 0.12 H (the research report's target).
    - These are the same starts the gates came from, so this is an in-sample check. A miss is recorded, never tuned away without review.

### Testing

- **Unit:**
  - `wallFootholds.test.ts` (AC 19);
  - `anyFeet.test.ts` (AC 20–26b, 33);
  - `assign.test.ts` (existing cases, plus AC 23 and 27);
  - `equilibrium.test.ts` (AC 30);
  - `stance.test.ts` (AC 28, 29, 31, 32);
  - `diagnose.test.ts` (the `sloper-steep` texts and source wording);
  - `purity.test.ts` (AC 33 grep).

  Fixtures are hand-built masks, made with `rect(mask, x, y, w, h)` helpers in the test file. No image files.
- **Worker contract:**
  - `fakeHandlers.test.ts` lists `wall:footholds`;
  - `priority.test.ts` gives it rank 1;
  - `wallCache.test.ts` shows that `segmentWall` runs once for both request types in either order, and that the cached mask still has full length after a transferred response.
- **Component:**
  - `useWallFootholds.test.tsx` (AC 35, with a stub client);
  - `StancePanel.test.tsx` (AC 36);
  - `useStance.test.tsx` (no solve while pending; a solve on error; existing cases unchanged with no hook mounted).
- **E2E:** `e2e/stance.spec.ts` (AC 37), on desktop and Pixel 7.
- **Real-model:**
  - `spike/pro-session.mjs`, copied from the session scratchpad and reading `tests/fixtures/real/b1-03-holds.json` (AC 38);
  - `spike/stance-real.mjs`, new (AC 39, 40);
  - `spike/loop-timing.mjs`, which gains the footholds wait (AC 34).

  Results are recorded in this spec.

### Boundaries

- **Always:**
  - keep the rules pure and deterministic (no `Math.random`, no timers);
  - label in the worker, never on the main thread;
  - `climber-stance` never imports `route-compositor`; the worker and the app shell wire them;
  - name every constant and cite its source next to it, marking tuning constants as ours;
  - write tests first;
  - keep AC 1–18 green;
  - show whole percents only;
  - keep the photo on the device.
- **Ask first:**
  - changing `segmentWall`'s thresholds or `route-compositor`'s public API;
  - the smear cone change (35° → 40°);
  - requesting footholds before the climber is shown (prefetch);
  - using depth normals or types per blob;
  - solving candidate pairs with the physics solver;
  - changing hold-geometry's force rules or exporting its private gate;
  - an "expert" friction setting;
  - moving the solve into the worker;
  - any new dependency.
- **Never:**
  - widen a cone or skip a check to make B1-03 or an AC pass;
  - present a wall foothold as a hold the user tagged;
  - show degrees or metric forces;
  - upload the photo or make any network request;
  - copy game art, code or sound (HZD is cited for its contact logic only);
  - train or serve models (memory `no-gpu-budget`).

### Tasks (one commit each, branch `game-step-1-any-feet`)

1. **Blob summary (pure).**
   - Acceptance: AC 19.
   - Verify: `npm test -- wallFootholds`.
   - Files:
     - `src/modules/climber-stance/wallFootholds.ts`
     - `src/modules/climber-stance/wallFootholds.test.ts`
     - `src/modules/climber-stance/worker.ts`
     - `src/modules/climber-stance/index.ts` (types and `isWallFoothold`)
2. **Worker request and shared mask cache.**
   - Acceptance: the worker-contract tests; `wall:segment` is unchanged for Route view.
   - Verify: `npm test -- workers`, then `npm run build`.
   - Files:
     - `src/workers/protocol.ts`
     - `src/workers/wallCache.ts` (+ test)
     - `src/workers/ml.worker.ts`
     - `src/workers/fakeHandlers.ts` (+ test)
     - `src/workers/host.ts` (priority) and `priority.test.ts`
3. **Store and hook.**
   - Acceptance: AC 35; a new image resets `feetMode`, `wallFootholds` and the status.
   - Verify: `npm test -- useWallFootholds store`.
   - Files:
     - `src/store/app.ts`
     - `src/modules/climber-stance/useWallFootholds.ts`
     - `src/modules/climber-stance/useWallFootholds.test.tsx`
     - `src/app/App.tsx` (mounts the hook)
     - `src/modules/climber-stance/index.ts`
4. **Any-feet assignment.**
   - Acceptance: AC 20–26b, 27 (blob parts), 33; the existing `assign.test.ts` still passes; the stale "Book-Based Stance" comment is fixed.
   - Verify: `npm test -- assign anyFeet purity`.
   - Files:
     - `src/modules/climber-stance/anyFeet.ts`
     - `src/modules/climber-stance/anyFeet.test.ts`
     - `src/modules/climber-stance/assign.ts`
     - `src/modules/climber-stance/assign.test.ts`
     - `src/modules/climber-stance/purity.test.ts`
5. **Sloper cone.**
   - Acceptance: AC 27 (surface parts), 30, 31, 32; AC 1–11 green.
   - Verify: `npm test -- climber-stance`.
   - Files:
     - `src/modules/climber-stance/cones.ts`
     - `src/modules/climber-stance/stance.ts` (passes `surface` to `coneFor`)
     - `src/modules/climber-stance/assign.ts` (`contactsFor` sets `surface` from `forces[id].source`)
     - `src/modules/climber-stance/equilibrium.test.ts`
     - `src/modules/climber-stance/stance.test.ts`
6. **Sloper diagnosis.**
   - Acceptance: AC 28, 29; the `sloper-steep` texts.
   - Verify: `npm test -- diagnose stance`.
   - Files:
     - `src/modules/climber-stance/diagnose.ts`
     - `src/modules/climber-stance/diagnose.test.ts`
     - `src/modules/climber-stance/stance.test.ts`
7. **Stance hook and panel.**
   - Acceptance: AC 36, rules 14–15.
   - Verify: `npm test -- StancePanel useStance`, then `npm run lint`.
   - Files:
     - `src/modules/climber-stance/useStance.ts` (the `forces` type widens; no `App.tsx` change)
     - `src/modules/climber-stance/useStance.test.tsx`
     - `src/modules/climber-stance/StancePanel.tsx`
     - `src/modules/climber-stance/StancePanel.test.tsx`
8. **E2E, real-model check, timing and sources.**
   - Acceptance: AC 34, 37–40; Check Results recorded in this spec.
   - Verify: `npm run e2e`; `node spike/pro-session.mjs <url> <out> desktop|phone`; `node spike/stance-real.mjs`; `node spike/loop-timing.mjs <out.json>`.
   - Files:
     - `e2e/stance.spec.ts`
     - `spike/pro-session.mjs`
     - `spike/stance-real.mjs`
     - `spike/loop-timing.mjs`
     - `tasks/research-climbing-re.md` and `tasks/research-climbing-re-techniques.json`
     - `SPEC-climber-stance.md`
     - **Changed (review):** `tests/fixtures/real/b1-03-holds.json` is not committed. `tests/fixtures/real/` is gitignored and holds routemake-derived data that must stay local. The session scripts read it from a local path, so they stay local too.

### Check Results (2026-11-01, Task 8)

Real models, B1-03 on the sample wall. Run on the dev server with the recorded session: tap the 7 route holds, tag start and finish, Show route, then "Try the start position". The machine was under heavy unrelated load (load average 8–40).

| Check | Result |
|---|---|
| **AC 37: the start holds** | ✅ Vertical, desktop and Pixel 7: "Balanced: this position can be held". LH hold 2, RH hold 1S, LF and RF "Wall foothold 1" (the pink and black holds above the mats). |
| **Real shares** | ✅ Numbers, not "—". **LH 0 % · RH 0 % · LF 98 % · RF 2 %** on Vertical, and the same on Slab. The hands only pull the body in (S10 least effort; Open Question 1). |
| Overhang 35° | ❌ as expected: "Right hand: this sloper may be too steep — if its top faces up, set its pull to Down" (rule 13). |
| **The figure** | ✅ The overlay's recorded canvas strokes match the solver: both knees bend, and the thigh and shin stay within leg length (0.24 + 0.28 H and 0.24 + 0.29 H). The long line past the left foot is its 98 % force arrow. |
| Posture | ⚠️ The hips sit 0.09 H below the right hand. The 12 measured starts have a median of 0.275 H. This comes from `main`'s posture prior, which this amendment doesn't change. The book-based prior on the unmerged `book-stance` branch addresses it. **Decided 2026-11-01 (user): the book-based posture prior is ported onto step 1** (Amendment: Book-Based Stance › Ported onto step 1). It doesn't raise B1-03's hips: they sit 0.051 H below the right hand, because B1-03's feet are only 0.50–0.52 H down; `anyFeet.test.ts` pins that floor. **Accepted 2026-11-01 (user).** |
| **AC 34: time to a stance** | ✅ 0.3 s on desktop, 0.4 s on Pixel 7, and 0.4 s with the Pixel 7 CPU throttled 4×. The target is ≤ 2 s. The wall mask is already cached from Route view, so only the labelling runs. |
| Rule 4 sign check | ⚠️ The route sign (`blob:91`) still passes every shape gate. It is no longer auto-picked, but it is "Wall foothold 2" for the right foot. Measured on the real mask: its fill against its smallest rotated rectangle (with holes filled) is **0.85**. The nearest real candidates score 0.82 (`blob:92`) and 0.80 (`blob:87`), and B1-03's footholds 0.70 and 0.63. A gate between 0.82 and 0.85 is too thin a margin, and it would reject rectangular rails on other walls. **Decided 2026-11-01 (user):** the sign stays a manual "Wall foothold" option, and there is no rotated-rectangle gate, because the margin is too thin. A later idea: ask CLIP whether a candidate is a hold at all. |
| E2E (local, under load) | 31 of 34 passed in `stance`, `stable-canvas`, `layout` and `route-view`. Rerun alone: "the climber also stands in front of the wall in 3D" passes. `segmentWall … in ≤ 1 s` took 1043 ms at load 20. `segmentWall` is unchanged on this branch, and the same tests failed on `main` under the same load. CI is the reference. |

### Deferred: Trunk Rotation (a later amendment)

Trunk rotation is **not** part of this amendment, and S8 still keeps the trunk parallel to the wall. The research design is recorded here for later, and has not been reviewed or spot-checked:
- Add pelvis yaw ψp ∈ [−50°, 50°] and chest twist τ ∈ [−35°, 35°] to the pattern search.
  - Use a soft facing cost. The research report reads Naderi 2017 as about 29° costing one tolerance unit; not spot-checked.
  - Keep every joint except hands and feet ≥ 0.02 H off the wall.
- Seed the search from three triggers: drop knee or outside edge, twist-lock or backstep (a crossed foot), and flag (barn-door torque). Report "barn door" only after these fail.
- Validate on the 59 real stances with a per-video hip- and shoulder-width ratio.
  - Target: a median error ≤ 0.12, from ~0.24 today.
  - Keep pelvis error ≤ 0.110 H and feasible ≥ 0.95 (today 0.1098 H and 0.966, `lat.json`).

### Open Questions

1. **Shares on a vertical wall.** In the simulation, the B1-03 Vertical shares are LH 0 · RH 0 · LF 94 · RF 6.
   - The hands only pull in toward the wall, and the least-effort rule (S10) puts all the weight on the feet, unevenly.
   - This is honest physics within S10's known limit, but it may read oddly to a climber.
   - Should the panel also say "hands pull in", or is this for the pro-climber review?
   - **Resolved 2026-11-01 (user): the panel says it.** When the stance can be held, every assigned hand's share is within ±2 % (an undercling's share is negative, so underclings stay quiet) and one hand's `load.percent` is ≥ 1, the panel shows "Your hands pull you in to the wall; your feet hold your weight." (`StancePanel.test.tsx`).
2. **Resolved 2026-10-31 (user): filter by shape, and the user can switch feet.** See the shape gates in rule 4 and AC 21b. Still open: every blob that passes gets the edge foothold cone (45°, up and out), whatever its shape. Signs and stickers also pass as blobs: on B1, a route sign above the mats ranks 2nd for the right foot.
   - Options: filter blobs by shape or colour; treat large blobs as smears; or rely on "Wall foothold 2" as the user's fix.
   - **Decided 2026-11-01 (user):** rely on the manual "Wall foothold" option. No rotated-rectangle gate: the sign scores 0.85 against 0.82 for the nearest real foothold, too thin a margin (Check Results, rule 4 sign check). Later idea: ask CLIP whether a candidate is a hold at all.
3. **Picked holds vs blobs.** Should a picked route hold *always* beat a blob (a strict tier, as proposed), or only by a cost bonus? A far picked hold currently wins over an ideal blob.
4. **Per-blob up-facing fraction from depth** (research §3.4), and a foot cone on each blob's normal. These are deferred: they need the depth map in this module, and monocular normals are noisy (SPEC-hold-geometry AC 8).
5. **The footholds wait.**
   - The request starts when the climber is shown. Behind a running depth job, which the worker can't interrupt, "finding footholds" may take seconds on a phone.
   - If AC 34's 2 s target is missed, the options are a prefetch after the depth map, or solving with smears first and re-solving.
6. **Checking candidate pairs with the solver** (the top 3 pairs). Deferred until the Bretl–Lall region frees enough of the time budget.
7. **Smear 40°** (Spot-Check row 3) as its own amendment.
8. **Resolved 2026-11-01 (user): the book-based posture prior is ported** onto step 1 (Check Results › Posture; Amendment: Book-Based Stance › Ported onto step 1). Trunk rotation (**Deferred**) is still the next posture step.
9. **Start shares on uncorrected holds** (from SPEC-beta-moves Task 8, 2026-11-01). On B1-03 with CLIP's types, the start balances with LF 99–100 % and hands about 0 %, while the hands pull 52–57 % of bodyweight inward. The vertical pinches typed as "crimp" become sideways pulls, and the 1S sloper gets the type rule's surface. With a setter's corrections (1S and 7F pulled down, 2/3/4 pinches) it reads LH 10 · RH 21 · LF 26 · RF 43. Should the solver flag such a start, which "the hands only pull the body in" already notes, as low-confidence, or prompt a hold-type check?

## Amendment 2026-11-01 (c): Picked Footholds Use the Foothold Cone

**Builder's call (pro-climber role, Bloc Hall step 2); the user can veto.**

**Rule.** A foot contact on any tagged route hold uses the foothold cone: axis unit(0, −1, 0.6), 45°. That is the same cone as a wall foothold (`blob:` / `wf:`), whatever the hold's CLIP or user hand type, `sloper` and `volume` included. Only a smear (type `smear`) keeps the smear cone (out of the wall, 35°). A foot never takes a grip `surface`. Hands keep their type cones, the sloper rule 11 included.

**Why.**
- A foot stands on top of a hold whatever its hand type, and this cone is already the spec's foot model.
- The hand type describes how a *hand* grips it: a sloper for the hand can be a fine foothold.
- Found in SPEC-beta-moves Task 8. On B1-03 a setter tags the big pink footholds as part of the route. CLIP types them `sloper`, so the old rule made the left foot smear on hold 8 and the start infeasible: "Left hand: a crimp can't take this pull".
- With this rule that start holds: LH −0.2 · RH 0 · LF 98.2 · RF 1.9 (Node, the recorded 9-hold level).

**Honest limit.** A truly slopey foothold (a big volume's sloping face) is now as good as an edge. Per-blob or per-hold foot surfaces (Open Question 2) would refine it.

**Changes.**
- `cones.ts` `coneFor`: a foot's cone depends only on `type === 'smear'`.
- The cone table's last row now reads "Foot smearing".
- Tests:
  - `equilibrium.test.ts`: a foot on every hand type gets the foothold cone; the old "a foot on a sloper smears" assertion is amended; hands are unchanged.
  - `stance.test.ts`: a foot on a sloper- or volume-typed hold solves exactly as on an untyped foothold.
  - `diagnose.test.ts` "names a slipping foot" now uses smearing feet. Its sloper-typed feet stand on their holds now, so it needed the smear it used to get implicitly.

**The 59 real stances (`spike/zone-scale/baseline.eval.ts`) are unchanged by construction.** Every contact there has `type: null`, so every foot already had the foothold cone. The check wasn't re-run, because it writes into the shared, local-only data folder. No other climber-stance or beta-moves expectation changed.

## Amendment 2026-11-02: Grip Point as the Contact Point (SPEC-play-shell E1)

**Approved by the user on 2026-11-02** (SPEC-play-shell › Amendment 2026-11-02, row E1). The game's direction map lets a player move the point where the hand or foot holds a hold.

**Input.** `StanceHold` gains an optional `grip?: { x: number; y: number }` (image px). `contactsFor` uses it as the contact point of a limb on that hold, in place of the centroid:
- hands, and feet on a picked route hold;
- matched hands, which sit `MATCH_GAP` (0.015 H) either side of the grip.

**Unchanged (still the centroid):** `autoAssign` (start hands, the split-start partner, foot candidates and their costs, `pickFeet`'s middle), rule 6's claims, and a `SMEAR` foot's place under the hands. Wall-foothold `blob:` contacts keep their toe + inset. So a grip moves a contact and never changes which holds the default assignment picks.

**No new rules.** Reach, the shared hip floor, the cones and the solver read contact points as before, so they read the grip. The Studio never sets a grip (`HoldMask` has none), so its stances are byte-identical. Tests: `assign.test.ts` › "contactsFor with a grip point".

## Amendment 2026-11-04: R1 Mechanics (Cut Feet, Joint Range, Hooks, Upright Holds)

Status: **APPROVED (2026-11-04)**, with the recommended option on D1, D2 and D3 (user: "approve"). This is build step R1 of [SPEC-game.md](SPEC-game.md) › Amendment 2026-11-03: Redesign Capability Map, row `climber-stance`. That row asks for four mechanics fixes before any probability (`stance-odds`, R2): cutting both feet, joint range-of-motion limits, heel and toe hooks, and a sidepull axis instead of "no single pull".

This amendment specs all four (M1–M4). It narrows M4 because of the spike below; three calls are the leader's (**Decisions** at the end).

### Objective

The referee should stop being wrong in ways a climber notices:
- hanging from two jugs with your feet off a vertical wall is possible (today: "Can't hold this position");
- a knee can't fold flat (today the reach check accepts a foot 0.15 H from the hip, a knee bent about 165°);
- a heel hook takes weight off the arms on steep walls (today the game can't express one);
- an upright edge with no known type is not a jug you pull down.

Every other stance stays byte-identical, and the B1-03 reference beta still tops out at move 16. **Corrected after the PR #18 review:** not byte-identical. M2 changes the pose (and so the shares) of the stances whose knee or hip was past range, and rejects stances that stand on a foot at or above hand height (Check Results › Review).

### Spike (2026-11-04)

A throwaway copy of the solver behind environment flags (diff kept in the session scratchpad as `r1-spike.diff`, not committed). H = 1000 px unless stated; B1-03 is the pinned level (`tests/fixtures/beta/`).

| Fix | Probe | Today | With the fix |
|---|---|---|---|
| M1 body on the wall | Feet cut, two jugs ±0.1 H, Vertical | Can't hold | Holds: LH 48 · RH 48 · body 17 % |
| | Feet cut, one jug, Vertical | Can't hold | Holds: LH 95 · body 19 % |
| | Feet cut, 20° / 35° / 45° | Holds 50 / 50 | Unchanged (the pelvis sits 0.14–0.24 H off the wall, so the body doesn't touch) |
| | B1-03, 9 betas | — | Reference tops at 16; **`cut-feet` (pinch 2 + sloper 1S) no longer falls** |
| M2 joint ranges | Reach check, foot 0.15–0.30 H below the hands | Smallest foot ratio 0.151 | 0.35 (knee ≤ 140°) |
| | B1-03, 9 betas; climber-stance + beta-moves suites | — | Every verdict unchanged; 485 / 485 tests pass |
| M3 heel hook | Hands on jugs, right foot on an edge, left foot on a jug at hand height 0.45 H out left | Standing on it: hands 73 % (35°), 98 % (45°) | Heel-hooking it: hands 45 % (35°), 47 % (45°); the heel carries 54–56 % |
| M3 toe hook | Left sloper hand and left smear on one line, right toe hook 0.35 H out | — | 35°: the toe takes 44 %. 45°: still fails ("slip"). **Weak evidence** |
| M4 as the map words it | B1-03 pinches 2 and 3 (slim, upright) become sidepulls toward the route's middle | Reference tops at 16 | **Reference falls at move 6**: "Left hand: a pinch can't take this pull" |

**Why M4 fails as worded.** A sidepull's side comes from the route's middle (`bodyX`, SPEC-hold-geometry). At move 6 the climber's body is under the pinches, not beside them. A pinch has two faces, and a climber uses whichever one fits where their body is. That is what "no single pull" means, and the video's climbers climb this line.

### M1: Cutting Both Feet (the Body on the Wall)

**Rule.** When no foot is on the wall (both feet off), each pelvis candidate whose depth is ≤ `BODY_TOUCH` = **0.10 H** gets one extra contact, the body on the wall:
- point: the pelvis projected onto the wall, (x, y, 0);
- cone: out of the wall (0, 0, 1), half-angle **20°** (`BODY_HALF_ANGLE`). This is ours: clothing and skin on a textured wall, and no measurement was found. It only pushes, so its friction barely matters;
- load weight: a foot's (`FOOT_WEIGHT`).

0.10 H is the posture prior's `hipDepth` (B4: "hips close to the wall"). So a feet-off hang on a vertical wall settles with the hips on the wall, as real climbers' do.

**Scope.** With any foot on, there is no body contact, so every existing stance is unchanged. The search box is unchanged too: the spike's hangs sit 0.39–0.58 H below the hands, inside today's 0.6 H. So on an overhang the CoM already swings under the hands.

**Output.** `Stance.body: { percent, share, force } | null`. It is null unless the chosen pose uses the body contact, and below 0.5 % of bodyweight (the hips only touch; PR #18 review). The four limbs' shares plus `body.share` add up to 100. The region (`feasibleRegion`) solves with the shown pose's body contact held fixed.

**Display.**
- Panel: a fifth row, "Body on the wall 17 %", only when `body` is set.
- Overlay: a small grey chip at the hips.
- Play: shows nothing new. The verdict and the pivot check simply read the new physics.

### M2: Joint Range of Motion

**Limits** (`JOINT_RANGE`, degrees of flexion). The source is the CDC Normal Joint Range of Motion Study (Soucie et al., Haemophilia 2010), adults 20–44, men / women. The mean is rounded to the nearest 5°:

| Joint | Men | Women | Limit |
|---|---|---|---|
| Knee | 137.7 | 141.9 | **140** |
| Elbow | 144.6 | 150.0 | **145** |
| Hip | 130.4 | 133.8 | **130** |

These are passive goniometer ranges, measured lying down. A climber's high step combines flexion with abduction (our knees open sideways, B5), so the hip limit is applied to the thigh's angle from the trunk's down line, which includes both.

**Rules.**
1. **Minimum reach.** A two-bone limb can't be shorter than its chord at full flexion: `minReach = √(a² + b² − 2ab·cos(180° − flexMax))`. That is legs 0.185 H (ratio 0.349) and arms 0.117 H (ratio 0.303). It replaces |a − b| in `twoBone`, in the solver's `reachOnly`, and in `reach.ts`'s score. This is one shared function, `minReach(limb, d)` in `ik.ts`.
2. **Hip.** After IK, a leg whose thigh (hip → knee) is more than 130° from the trunk's down line (neck → pelvis) doesn't reach from that pelvis. `reach.ts` applies the same test. It places the knee with the solver's own pole (`legPole`, moved out of `place` so both share it), so the reach check and the stance check can't disagree (the same principle as SPEC-beta-moves OQ 11).
3. **Text.** A limb that fails only through rules 1–2 at every allowed pelvis is cramped, not far. Both texts stay kind `reach`:
   - stance: "Too cramped: left foot — pick a hold further from your body";
   - move (beta-moves B4): "Too cramped: left foot — move your hips away first".

   For the move text, `ReachResult` gains `cramped: Limb[]`.

   **As built (PR #18 review):**
   - **The rule.** "Every allowed pelvis" never fires: the grid always reaches positions where the limb is simply too far. So the rule is "some position fails on that limb alone, by a joint's range". Without the limits, every limb would reach there.
   - **Too high.** Where only the hip's range stops a foot, it is too high, not too close, and needs a lower hold:
     - stance: "Too high: left foot — pick a lower foothold" (`highText`, `Candidate.high`);
     - move: "Too high: left foot — try a lower foothold" (`tooHigh`, `ReachResult.high`).
   - **Search slope.** A hip-limit failure costs `UNREACHABLE_COST + (angle − 130°)/180`, so the pattern search keeps its slope toward a reaching pose. A flat cost lost holdable stances.

### M3: Heel and Toe Hooks

**Input.** `ContactInput.hook?: 'heel' | 'toe'`. It applies to feet only, on picked route holds only; it is ignored on hands, smears, and wall footholds (`blob:` / `wf:`, which are chips).

**Cones** (the force the hold puts on the climber):

| Contact | Axis | Half-angle | Why |
|---|---|---|---|
| Heel hook | The hand cone's axis on that hold: −dir; up the wall when there is no pull. As built, `contactsFor` gives the grip `surface` to hands only, so a heel on a sloper uses its pull, not rule 11's surface | 45° | A heel pulls the hold toward the hips as fingers do. Shoe rubber μ ≈ 1.0: Elkington et al. 2024 measured static μ 0.97–1.21 (the foothold's 45°) |
| Toe hook | unit(s, 0, −1): s = +1 when the hold is right of the hands' mean x, −1 when left | 40° (ours) | The top of the toe pulls the hold toward the body and the wall, so the hold pulls back toward its far side and into the wall |

No force measurements exist for either hook. The research found only hamstring-injury series. Both cones are builder's calls.

**Posture.** A hooked leg takes the free band (0.45–1.0): it hooks, it doesn't stand. M2's limits apply, and the hip limit is what makes a high heel need hips close to the hold.

**Where it shows in R1** (Decision D3).
- The Setting Room's Stance panel gets a per-foot select: Stand · Heel hook · Toe hook. It is shown for feet on picked route holds.
- Store: `stanceHooks: Partial<Record<'lf' | 'rf', { holdId, hook }>>`. A hook is kept with its hold and applies only while that foot is on it, which also works for the automatic start assignment. It is reset per image and with the feet mode.
- Overlay: the foot chip reads "LF·heel" / "LF·toe".
- Play gets hooks in R2, with SPEC-beta-moves' amendment. A beta step today is four hold ids, so a hook needs an encoding and a tray control.

**Toe hooks are gated.** Task 3 must find a fixture where a toe hook turns a failing stance into one that holds, at 35° or steeper. If none exists, toe hooks are cut from R1 and go back to Open Questions; heel hooks ship alone.

### M4: Upright Holds (Narrowed After the Spike)

1. **Untyped upright holds become sidepulls.** SPEC-hold-geometry's sidepull shape rule (elongation ≥ 2, long axis ≤ 30° from vertical, pulled toward `bodyX`) also covers holds with no type (`null`). Today those get "no single pull" and the referee pulls them like an edge (up the wall, 40°). The same gates and the same cue apply: "Sidepull: pull sideways toward your body and lean away". This changes a hold-geometry rule, which its spec lists as "ask first"; approving this amendment is that ask.
2. **Pinches stay two-sided.** "Squeeze; no single pull", cone up the wall, 60°. Squeeze strength is a `stance-odds` question (R2), not a cone.
3. **A pinch with a pull set keeps 60°.** This is a bug fix. Today a user or setter pull on a pinch drops its cone to the 40° default, because `HAND_ANGLE` has no `pinch`.

B1-03 is unchanged by construction: it has no untyped holds, and its pinches have no pull. User walls with untyped upright holds change; Task 5 re-checks Wall 1 and Wall 2 (orange). A hold is also untyped until the classifier answers, so an upright hold reads as a sidepull until then, as it read "no single pull" before (PR #17's `carryPlan` handles late types).

**If approved,** SPEC-game's map row reads: "a sidepull axis for untyped upright holds; pinches stay two-sided".

### Interface (additions)

```ts
// stance.ts
export interface ContactInput { /* … */ hook?: 'heel' | 'toe' }
export interface Stance { /* … */ body: { percent: number; share: number; force: Vec3 } | null }
export const BODY_TOUCH = 0.1;            // × H
// ik.ts
export const JOINT_RANGE = { knee: 140, elbow: 145, hip: 130 } as const;   // degrees, CDC ROM
export function minReach(limb: Limb, d: BodyDims): number;
export function legPole(limb: 'lf' | 'rf', right: Vec3): Vec3;
// reach.ts
export interface ReachResult { /* … */ cramped: Limb[] }
```

### Acceptance Criteria (continuing from AC 40)

Unit (Vitest, H = 1000 px):

41. **Feet cut, Vertical, two jugs** at (±100, 0):
    - holds;
    - `body.percent` is 10–25 (the spike gave 17);
    - the limb shares plus `body.share` add up to 100 ± 1;
    - the pelvis is ≤ 0.10 H off the wall.
42. **Feet cut, Vertical, one jug:** holds (the spike gave LH 95 · body 19).
43. **Unchanged elsewhere.**
    - With any foot on, `body` is null.
    - AC 4–11's fixtures give the same JSON as before the change, `body: null` aside.
    - Feet cut at 20°, 35° and 45° give `body` null and 50 / 50.
44. **Minimum reach.** `minReach` is 0.185 H ± 0.001 for legs and 0.117 H ± 0.001 for arms. A foot target that can't be farther than 0.15 H from its hip at any allowed pelvis is unreachable, and the stance text reads "Too cramped: …".
45. **Hip limit.** A fixture whose only reaching knees put the thigh more than 130° from the trunk's down line is unreachable in both `solveStance` and `reachRatios` (the same verdict).
46. **B1-03 under M2.** All 9 betas keep their recorded verdicts (`b1-03.test.ts`, unchanged).
47. **Heel hook.** Hands on jugs (±100, 0), right foot on an edge at (100, 550), left foot on a jug at (−450, 50):
    - at 35° and at 45°, a heel hook puts the hands' combined share at ≤ 55 % (the spike gave 45 and 47);
    - standing on the same hold puts it at ≥ 70 % (the spike gave 73 and 98).
48. **Toe hook (gate).** Task 3's fixture (see M3) holds with the toe hook and fails without it, or toe hooks are cut.
49. **Pinch cone.** `coneFor('lh', 'pinch', [0, 1, 0])` has a 60° half-angle; with `dir: null` it is unchanged (up, 60°).
50. **Untyped upright.** `forceDirection` with type `null`, elongation 3, 10° tilt and `bodyX` to the right gives a sidepull toward the body (`source: 'type'`). The same shape typed `pinch` still gives `dir: null`.

Performance:

51. AC 12's budget is still met. M1 adds one contact, and only to feet-off stances; M2 adds one dot product per leg.

UI and manual:

52. **Panel.** Feet cut on Vertical shows a "Body on the wall" row. A heel-hook select changes the shares within 300 ms. E2E desktop and 375 px, no console errors.
53. **Walls still top out.** In the browser, Wall 1 and Wall 2 (orange) each top out by the beam search used on 2026-11-03. Record the move counts.

### Pinned Expectations That Change

- **`tests/fixtures/beta/b1-03.betas.json` › `cut-feet`.** Its prediction (fall at move 1, "Your feet would cut loose — find a foothold") was written before running, and M1 flips it: hanging on pinch 2 + sloper 1S with the hips on a vertical wall is physically possible, though hard (Decision D1). Under D1-A the entry gets a new prediction (no fall) and a note. The pivot text stays for feet-off stances that still fail, pinned by a new unit fixture: one sloper hand, feet cut, Vertical.
- ~~Nothing else.~~ **Corrected at Task 2 (2026-11-04):** the spike replayed only B1-03, not the beta-moves suite. Two SPEC-beta-moves unit checks pinned the same old physics on the ladder's jugs, and they flip with the same decision (D1-A):
  - **AC 9** (cut feet on Vertical is a fall): the ladder's jugs now **hold** on Vertical, hips on the wall. The "feet cut loose" fall is pinned on the sloper ladder (start holds pulled into the wall).
  - **AC 10** (moving the only foot on Vertical): re-pinned on the sloper ladder, with the same text.
- The B1-03 entry keeps its persona prediction and gains an `amended` record citing D1-A (the fixture's `about` says predictions are never re-recorded).
- The reference beta, the drafts, `straight-to-finish` and `three-limbs` are unchanged.
- **Play (builder's call, overriding "Play shows nothing new"):** Numbers mode lists each limb's share, and with the hips on the wall those add up to ~83 %. `MoveCheck.bodyLoad` (0.1, as `loads`) and a "Body on the wall share" row keep the rows adding up to 100.

### Testing

- Unit: `ik.test.ts` (minReach, legPole), `stance.test.ts` (M1, hooks), `reach.test.ts` (cramped, hip parity), `cones.test.ts` (new; hook and pinch cones), `force.test.ts` (M4), `diagnose.test.ts` (texts).
- Pinned: `b1-03.test.ts` runs in every task.
- Component: `StancePanel.test.tsx` (body row, hook select).
- E2E: AC 52.
- Timing: `spike/loop-timing.mjs` (AC 51).

### Boundaries

- **Always:** the B1-03 replay green after each task; one shared function for any rule that `reach.ts` and the solver both apply; sources cited beside each constant.
- **Ask first:** changing `hipFloor`, the search box, any cone not listed here, or any pinned beta other than `cut-feet`.
- **Never:** hooks or the body contact in Play's tray before the beta-moves amendment (D3); a hook on a smear or a wall-foothold chip; calling a builder's-call constant measured.

### Tasks (one commit each, branch `redesign-r1-stance` from `main` after PR #17)

1. **M2 joint ranges.** `ik.ts` (`JOINT_RANGE`, `minReach`, `legPole`), `stance.ts`, `reach.ts`, `diagnose.ts`, beta-moves' reach text. AC 44–46.
2. **M1 body on the wall.** `stance.ts` (evaluate, region, `Stance.body`), panel row, overlay chip, the `cut-feet` re-prediction under D1. AC 41–43.
3. **M3 hooks.** `cones.ts`, `stance.ts`, store, panel select, overlay; the toe-hook gate first. AC 47–48.
4. **M4 upright holds.** `hold-geometry/force.ts`, `cones.ts`. AC 49–50.
5. **Check.** Full suite, lint, build, timing (AC 51), E2E (AC 52), Wall 1 and Wall 2 in the browser (AC 53). Results go under Check Results here.

### Decisions (the leader's)

**Decided 2026-11-04 (user: "approve"): D1-A, D2-A, D3-A.**

- **D1. Cutting feet on B1-03.** With the body on the wall, cutting both feet from pinch 2 + sloper 1S holds.
  - **A (recommended):** accept it. The physics is right on jugs, and R2's `stance-odds` will band this one "unlikely".
  - **B:** ship M1 together with R2, so a feet-off hang never shows as plainly "holds".
- **D2. Upright holds.**
  - **A (recommended):** the narrowed M4 (untyped holds only; pinches stay two-sided).
  - **B:** the map's wording (pinches become sidepulls). The spike shows it breaks the reference line at move 6.
- **D3. Hooks in Play.**
  - **A (recommended):** the solver and the Setting Room in R1; Play in R2 with the beta-moves amendment.
  - **B:** Play in R1 too (a beta encoding and a tray control), which makes R1 bigger.

### Check Results (2026-11-04, Task 5)

Branch `redesign-r1-stance`:

| Commit | Task |
|---|---|
| b8fa4db | M2 |
| 9cbdf2b | M1 |
| 60e7916 | M3 |
| f3c5d3d | M4 |
| da8428d | E2E |

- **Unit:** 1701 tests, lint clean.
- **AC 44–45 (cramped).**
  - ~~The free solver almost never yields a cramped stance: in 800 random stances, none.~~ Corrected by the review: true for feet below the hands. With feet allowed above the hands, 4 of 400 random stances were cramped, all by the hip's range. They now read "Too high".
  - So "cramped" is pinned two ways: in `reach.ts` with a small pinned box (a foot at the knee's fold, and a foot 0.46 H above the hip that only the hip limit stops), and on `diagnose`'s rule directly.
  - Parity between the solver and the reach check holds by construction: both call `minReach`, `legPole` and `hipFits`.
  - A property test checks that every shown high-step pose keeps knee ≤ 140°, elbow ≤ 145°, hip ≤ 130°.
- **AC 46:** all 9 B1-03 betas keep their verdicts, except `cut-feet` (D1-A, amended).
- **AC 47:** a heel hook drops the hands' share from 73 % to 45 % at 35°, and from 98 % to 47 % at 45°.
- **AC 48 (toe-hook gate): passed.**
  - At 45°: left edge hand and left edge foot on one line is a barn door; standing on a jug at (350, 300) slips; toe-hooking it holds.
  - 16 such fixtures were found.
- **AC 51 (timing).** Node, same machine, median of 40 runs, `main` vs R1:

  | | `main` | R1 |
  |---|---|---|
  | Four-contact stance | 30.6–31.1 ms | 30.6–33.3 ms |
  | Feet cut | 12.8–13.2 ms | 15.9–17.4 ms (one more contact) |
  | B1-03 reference replay | 312–317 ms | 315–317 ms |

- **AC 52 (E2E).**
  - The new Setting Room test passes 6 / 6 (repeat × 3, desktop and 375 px). It sets the start hold to a jug first: the fake classifier types it a sloper, which can't hold a feet-off hang, so the test would otherwise depend on timing.
  - Play / R0 / HUD / stance / routes / hub specs: 148 passed, 10 skipped.
  - "The climber also stands in front of the wall in 3D" timed out once under a 42-test load (the lazy 3D canvas), and passed 8 / 8 alone.
- **AC 53 (walls still top out).** In-page beam search on the R1 dev server, `localhost:5173`, real models:
  - **Wall 1:** tops in **9 moves** (7,643 checks).
  - **Wall 2 (orange):** the same 15 holds, start 3S, finish 14F. It tops in **14 moves** (15,445 checks), with 14F's pull set to Down as on 2026-11-03 (13 moves then). This run's classifier typed holds 1, 4 and 13 as crimps, not slopers.
- **Corrections found while building:**
  - SPEC-beta-moves AC 9 and AC 10 flipped with D1-A (see Pinned Expectations).
  - Play's Numbers mode gained a "Body on the wall share" row (builder's call).

### Review (PR #18, 2026-11-04)

The independent code review found no Critical issues and four Important ones. All four are fixed:

1. **A hip-limit failure stopped the pattern search from finding a pose.** It had a flat cost, so a holdable stance read "Out of reach" (3 of 1500 random stances). It now has a continuous excess, pinned with the reviewer's fixture.
2. **A foot above the hip got "pick a hold further from your body".** That advice is backwards. Hip-only failures now say "Too high … lower foothold", in the stance and in the move check. The rule is reconciled above.
3. **The spec claimed byte-identical stances.** Measured against `main` on the reviewer's 1500 random wide stances (H 1000, jug hands, 0 / 20 / 35°):
   - 30 change verdict, holds → can't;
   - **all 30 stand a foot within 0.1 H of the hands or above them**, where a standing foot usually needs more than a 130° hip (a climber heel-hooks there);
   - **at least 3 of the 30 are search misses, not physics** (re-review): a pose that meets every R1 rule exists. The pre-fix code or a patched copy finds it, but this pattern search doesn't;
   - the texts are 23 "Out of reach" (naming the other foot), 6 slips (4 "Left foot would slip", 1 "Left hand …", 1 "Right hand …") and 1 "Too high";
   - the reviewer also measured 34 of 300 four-contact stances (feet below the hands) whose pose and shares move by up to ~20 points per limb, with no verdict change.
4. **`Stance.body` was set at 0 % force.** It is now null below 0.5 %.

Suggestions taken:
- The stance cache key includes an honoured hook (for R2).
- `canHook` no longer blocks route holds whose id starts with "smear".
- The `reach.ts` JSDoc is corrected.
- The E2E now checks that a heel hook changes the shares (on Overhang 35°).

Follow-ups (re-review, not blocking):
- **The search misses remain.** Fix 1 found 3 stances the pre-fix code missed and lost 3 it held, out of 1500. For example, Vertical `{lh:(-383,0), rh:(383,48), lf:(-467,691), rf:(178,-136)}` now reads "Out of reach: left foot". This is a limit of the local pattern search, not of the cost. The proposed fix is to start the pattern search from several of the best grid points.
- **"Too high" names the high foot in only 1 of the 30.** In 23 the diagnosis blames the far, low foot. Before Play leans on these texts, a later pass should name the foot that is too high.
- **The solver and the reach check already disagreed before R1.** The solver finds a reaching pose that `reachRatios` misses in 37 of 1500 stances (35 on `main`), because only the solver runs a pattern search after the grid. The pelvis rules themselves match.

Left as notes:
- `reach.ts` marks every moving limb cramped even when a kept limb's range is what blocks. Not triggered in 600 random moves.
- The toe-hook side tie (`>=`) at the hands' exact middle.
- There is no separate `cones.test.ts`: hook cones are tested in `stance.test.ts` through `resolveContacts`.
