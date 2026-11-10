# Spec: play-shell, the Play Screen

Status: **APPROVED 2026-11-01** (user, "approve both"). Open questions settled the same day:
- **1, the shared hook:** yes. `useRouteHolds` moves out of `App.tsx`, with behaviour pinned by a test.
- **2, the licence:** yes. Our own tagging of B1-03 ships as a baked level, with no scraped route data.
- **3 and 4:** as proposed. The Studio's badges stay as the route markers, and the new map arrows are approved.
Parent: [SPEC-game.md](SPEC-game.md) › Amendment 2026-11-01 (b) (approved). Build step 3, tasks C5–C8 in [tasks/game-todo.md](tasks/game-todo.md). Depends on `beta-moves` and `pixel-kit` (step 2).

Items taken from the design-pillars amendment (still PROPOSED, SPEC-game Q4) are marked **[if pillars]**. Step 3 builds without them, and they are added only if the user approves the pillars.

## Objective

The screen where a player plans a beta on a real wall photo. The photo stays untouched. On top of it: a pixel climber in the solver's pose, a target marker and a reach gap, plus a move tray below. Every verdict is the referee's (`beta-moves` over `climber-stance`). The level only changes how much the screen helps and shows (amendment (b)).

User stories:
- I open Wall 1 from the gym and see my climber already on the start holds, with a line saying whether the start holds.
- I tap a limb, then a hold. The climber moves there, or I see a ghost of the move and the reason it fails ("Your feet would cut loose — find a foothold"). A failing move is only previewed, never added to my plan.
- Undo always takes me back exactly one move.
- As a pro, I turn on Numbers and see each limb's share of my weight, each moved limb's reach against the limit, and the move's effort, exactly as the referee computed them.
- On my own photo I tag the route first (start, holds, finish) and then plan on it.

**Not in step 3:**
- Send and the replay (`move-animation`, step 4);
- stars and badges (`scoring`);
- saving (`progression`);
- the tutorial rooms and hint tiers 2–3 (`game-feel`);
- Ack/Coil/Catch timing and forgiving taps **[if pillars]**.

## Decisions

| # | Topic | Decision | Why |
|---|---|---|---|
| S1 | Photo canvas | Play reuses the Studio's `SelectionCanvas`: taps → SAM holds, zoom and pan, unchanged. The pixel layer gets its `PixelView` from `drawExtras`' `toScreen`: `tx, ty = toScreen(0,0)` and `scale = toScreen(1,0).x − tx`. The box is the canvas's CSS size. `PixelLayer` sits in the stage's positioned, `overflow: hidden` parent. The view goes into React state only when it changes. | Settles pixel-kit Open Question 7 with **no Studio change**. One tap pipeline, already tested. |
| S2 | Two phases | **Tag** (only when the wall has no route): the Studio's route steps (tap holds, choose start and finish) in a compact Play layout. **Plan**: the move tray. A route that is ready moves you to Plan, and "Edit route" goes back. Edits clear the plan after a confirm. | Own photos need tagging. Sample walls can skip it once a baked level exists (S9). |
| S3 | Route → `RouteHold[]` | The Studio's derivation in `App.tsx` (effective type, force with override, wall normal) moves into one shared hook, `useRouteHolds()` in `src/app/`. App.tsx calls it with **identical behaviour**, and Play calls it too. **Ask first** (see OQ 1). If it's declined, Play keeps its own copy with a test that pins it to the Studio's output. | One derivation, so Play and Studio never disagree about a hold's force. |
| S4 | Context | `makeContext` with the route holds, wall feet (the existing `useWallFootholds`, mapped with `toWallFeet`), the photo size, the climber height (the sample's `pxPerCm` scale × 170 cm, or the Studio default), and the wall angle from the Studio's stance panel (default Vertical). Rules are **always `DEFAULT_RULES`, for every level.** | Amendment (b): one referee, and SC 6. |
| S5 | Start | `newPlan(ctx)` → `defaultStart`, then `checkStart`. The verdict line says whether the start holds, in the solver's words. | Old SC 1 and C5. |
| S6 | Planning a move | Tap a limb (DOM toggle buttons LH · RH · LF · RF), then tap the photo. `targetAt` turns the tap into a `Target` (a route hold, a wall foothold or a smear). `applyStep` → `MoveCheck`.<br>• **Legal** (`hold` or `top`): it's committed to the plan, and the climber is shown in the new stance.<br>• **Fall:** a **preview only**. The ghost climber (pixel-kit's fail mood) shows with the reason, and the plan is unchanged (user decision: preview a failing move before committing it).<br>• **Shape rejection:** the rejection text; nothing moves.<br>• **2-limb moves:** pick a second limb before the tap, when the tray tier allows it (S8). | Uses beta-moves as-is. "Falling is free" without needing the pillars. |
| S7 | Undo / redo | `undo` / `redo` on the plan, with buttons enabled by `canUndo` / `canRedo`. Undo always restores the previous stance exactly (old SC 2). | — |
| S8 | Level presets | From the profile (`gym-hub`'s `Profile`).<br>• **beginner:** 1 limb per move, verdict words plus the plumb line **[if pillars]**, Numbers off.<br>• **gym:** 1–2 limbs, Numbers off.<br>• **pro:** 1–2 limbs, Numbers on.<br>Every aid has a toggle in a small "Aids" menu at every level. Presets change only the tray and what is shown, **never `MoveRules`**. | Amendment (b) table, and "no grade gate". |
| S9 | Sample walls | A wall with a **baked level** (task A2's B1-03 level JSON, served as static data) opens straight into Plan. A wall without one opens in Tag. Shipping the baked B1-03 route depends on the licence question (OQ 2). Until it is answered, Wall 1 opens in Tag like any photo. | No scraped route data ships without the user's yes. |
| S10 | Numbers mode | A panel under the verdict, showing only values in the current `MoveCheck`:<br>• **share** % per limb (`loads`, 0.1);<br>• **reach ratio** per moved limb against `STATIC_REACH` (1.000) and `DEADPOINT_REACH` (1.100), labelled static or deadpoint;<br>• **effort**;<br>• **style**;<br>• **contacts kept**.<br>Formatting only, with no arithmetic beyond rounding. | Amendment (b): "Show a number the referee didn't compute" is a Never. |
| S11 | Pixel layer contents | The climber (stance joints → `PixelJoints`; mood `ok`, `strain` for a deadpoint, `fail` for a preview), the `target` marker on the tapped target, a reach gap for an out-of-reach preview, and chalk puffs on a grab. Route roles are **not** drawn as pixel markers in step 3, because `SelectionCanvas` already draws its badges and outlines there (OQ 3). | No doubled markers, and no Studio change. |
| S12 | Accessible path | A DOM list of targets: the route holds by label, then "Wall foothold n", then "Smear". The limb buttons and this list complete any move without the canvas. Verdicts go to an `aria-live="polite"` region. | SPEC-game › Boundaries, and pillars §4's DOM path adopted as a requirement. |
| S13 | Layout | Phone first. The stage keeps the Studio's top-third rule (`e2e/layout.spec.ts`). The tray sits under the stage: limbs, Undo, Redo, Aids, and the verdict line. Every button ≥ 44 × 44 CSS px, 16 px gutter, no horizontal scroll at 375 px. A "◀ Gym" link sits in the header row as in the Setting Room. | — |
| S14 | Own photo | The New wall door (`gym-hub`) opens the file picker. The photo loads through `loadImage` into the store and opens `#/wall/mine` in Tag. In memory only, and nothing is uploaded. "Open in Setting Room" moves the same photo and route to `#/studio`. The Setting Room's "Play this wall" link (in the room bar, outside the Studio) comes back. | Amendment (b) › A photo carries across. |

## Interface (`src/modules/play-shell/index.ts`)

```ts
export function PlayScreen(props: { wallId: string; profile: Profile; onBack: () => void }): JSX.Element;
/** Pure: the Numbers-mode rows for a check (S10). */
export function numbersFor(check: MoveCheck): readonly { limb: Limb | null; label: string; value: string }[];
/** Pure: the tray's settings for a profile (S8). Never returns MoveRules. */
export function trayFor(profile: Profile): { maxLimbs: 1 | 2; numbers: boolean; plumb: boolean };
/** Pure: climber-stance joints → pixel-kit joints (pixel-kit P4). */
export function toPixelJoints(j: Joints): PixelJoints;
/** Pure: the PixelView behind a SelectionCanvas toScreen (S1). */
export function viewFrom(toScreen: (p: Point) => Point, boxW: number, boxH: number, dpr: number): PixelView;
```

Map change: `play-shell` imports `beta-moves`, `pixel-kit` and `gym-hub` (for `Profile`), plus the Studio modules it composes (`hold-segmentation`, `climber-stance`, `image-input`) through their `index.ts`. **This adds arrows to the capability map: ask first (OQ 4).**

## Project Structure

```
src/modules/play-shell/
  index.ts  PlayScreen.tsx  MoveTray.tsx  NumbersPanel.tsx  TargetList.tsx
  numbers.ts  tray.ts  adapt.ts (toPixelJoints, viewFrom)  usePlay.ts
  *.test.ts(x) next to each
src/app/useRouteHolds.ts (+ .test.ts)   S3, if approved
e2e/play.spec.ts  e2e/own-wall.spec.ts
```

## Acceptance Criteria

1. **Start:** opening a wall with a ready route shows the climber on `defaultStart` and the verdict line. With the fake ML worker in E2E, the start's weight shares add up to 100 %.
2. **Legal move:** limb, then a reachable hold → the plan grows by one step, the climber is drawn in `check.stance`, and the verdict line shows the hold.
3. **Fall preview:** limb, then a target `checkMove` calls a fall → the plan is unchanged, the ghost and `check.reason` show, and the live region announces the reason.
4. **Undo:** after any sequence of moves and previews, Undo restores the previous step's assignment and stance exactly (deep-equal to the earlier `MoveCheck.stance`).
5. **Three moves on B1-03** (E2E, fake models, hub → Wall 1 → plan 3 moves) with real verdicts from beta-moves.
6. **Same referee** (amendment (b) SC 6): one beta checked under `trayFor` of all three profiles gives deep-equal `MoveCheck`s, because `trayFor` never yields rules (unit).
7. **Numbers exactness:** every value `numbersFor` returns equals the matching `MoveCheck` field rounded as shown (unit, over the beta-moves fixtures).
8. **No invented numbers:** Numbers mode renders only rows from `numbersFor` (component).
9. **Own photo** (amendment (b) SC 5): from `/`, a pro reaches the first verdict on their own photo in ≤ 4 taps plus the hold taps (E2E: New wall → choose file → tag → plan).
10. **Carry across:** a photo and its route round-trip Play → Setting Room → Play unchanged.
11. **Keyboard:** a complete move by keyboard through the limb buttons and the target list, with the verdict announced.
12. **Layout:** 375 px with no horizontal scroll, buttons ≥ 44 px, and the wall top < 740/3 on a 375 × 740 phone.
13. **Studio untouched:** with S3 approved, App.tsx's only change is calling `useRouteHolds`, and the whole Studio suite passes at `#/studio`.

## Testing Strategy

| Level | Covers |
|---|---|
| Unit | `numbersFor`, `trayFor`, `toPixelJoints`, `viewFrom`, the same-referee test (AC 6, 7), `useRouteHolds` against the Studio's current output (S3) |
| Component | Tray state (limb → target → verdict), preview vs commit, Undo/Redo enabling, Aids toggles, Numbers panel (AC 2–4, 8) |
| E2E (desktop + Pixel 7, fake models) | `play.spec.ts` (AC 1–5, 11, 12), `own-wall.spec.ts` (AC 9, 10) |
| Real-model check | B1-03 from the hub with real models: start holds, 3 legal moves, recorded like the step-1 check |

## Boundaries

- **Always:** verdicts come only from beta-moves. A fall is a preview. Rules are the same for every level. Phone first. Sound muted by default.
- **Ask first:** S3's hook extraction (it touches `App.tsx`); new capability-map arrows (OQ 4); any `SelectionCanvas` prop (OQ 3); shipping the B1-03 route data (OQ 2).
- **Never:** compute or show a number the referee didn't return; change `MoveRules` by level; upload a photo.

## Open Questions

1. **S3, the shared `useRouteHolds` hook.** May the Studio's route-to-force derivation move out of `App.tsx` into a shared hook, with behaviour unchanged and pinned by a test? Proposed: yes. The alternative is a duplicated copy with a pinning test.
2. **Licence (S9, = pillars Q4).** May our own tagging of B1-03 (taps made in this app, not scraped data) ship as a baked level beside the already-public sample photo? If not, Wall 1 opens in Tag, and SC 4's 3-minute target includes tagging.
3. **Doubled markers (S11).** In step 3, keep the Studio's badges as the route markers (proposed). Or, later, add an ask-first `SelectionCanvas` prop that hides them so pixel markers can take over?
4. **Map arrows.** Approve `play-shell → gym-hub` (for `Profile`) and `play-shell → hold-segmentation / climber-stance / image-input` (to compose the Studio's pieces)? This settles pixel-kit OQ 7's third part.

## Builder's Calls (step 3 build, 2026-11-02)

- **Plan is a fixed board.** In Plan a tap layer over the photo takes every tap, so a tap can never add or remove one of the Studio's holds. A tap picks the nearest allowed target (`targetAt`) within 24 CSS px, a 48 px touch target (Material's minimum). Zoom and pan stay in Tag.
- **A two-limb move takes two taps,** one target per limb, then one check.
- **The DOM target list adds "Let go"** (beta-moves' `null` target). "Smear" puts the foot at its current point.
- **After a fall preview the limb stays picked,** to try another hold; after a legal move the tray clears.
- **The plan survives "◀ Gym"** (game designer; Nielsen's "user control and freedom"). Each committed plan, Undo history included, stays in memory for the session, keyed by wall id + `ctx.key`. No storage before step 5.
- **Load on demand** (technical director; PRPL). On a baked level Play draws the photo with its own `PlanPhoto`, with the same box and `drawExtras` contract as `SelectionCanvas`, and never starts the ML worker. SAM is prepared only in Tag. This also keeps a route tagged in the Setting Room on the same photo from doubling the level's badges.
- **Baked-level badges** are the Studio's own (`drawBadge`), above each hold. Without masks, a hold's box is 0.05 × climber height, and pixel-kit's frame clamps it.
- **`trayFor`'s `plumb` is false** until the pillars are approved. Hints show one coaching line for now.
- **A baked level carries its own wall angle** (B1-03: Vertical, as recorded). A tagged route uses the Studio's angle.
- **"Play this wall"** goes to a sample's own bay when it has no baked level, otherwise to `#/wall/mine` (your route on that photo).

- **Import exception: the ML worker's client type.** `PlayScreen.tsx` imports `type MlClient` from `src/workers/client`, type only, to hand it to `SelectionCanvas`. The Studio's modules already import it the same way: `hold-segmentation` (`SelectionCanvas`, `session`, `useSamSession`), `climber-stance` (`useWallFootholds`), `depth-estimation` (`useDepth`), `hold-classification` (`useClassification`) and `route-compositor` (`useWallMask`). `src/workers` is not a capability-map module, so this adds no map arrow. On a baked level `PlayScreen` gets no client, and the worker never starts.
- **Late hold types don't restart a plan** (checked on review, 2026-11-02). Plan on a tagged route waits for depth and the wall footholds. `PlayAnalysis` posts every hold's CLIP job before the depth job (the Studio's order, App.tsx), and the worker runs jobs first in, first out. So every type is in before depth settles, and the context's key doesn't change under a plan. A type can arrive later only from a CLIP retry, which useClassification makes on the next change to the holds, and that change starts a new plan anyway. A CLIP that never answers leaves the hold untyped (`type: null`), as in the Studio, rather than holding Plan back. The context is also memoised on the wall's content, so an equal wall never re-runs `defaultStart` or the last check.

## Check Results (2026-11-02, C9)

### Real models, B1-03 from the hub

Run on `npx vite --port 5174` without `VITE_FAKE_ML` (the real ML worker), headless Chromium, desktop and Pixel 7 (375 × 740). As a pro (Numbers on): `/` → "I climb hard, set or coach" → Wall 1 → LF, RF, LH tapped on the photo at the reference beta's first three targets. Load average 4.5–7.8.

| Check | Result |
|---|---|
| **The start holds** | ✅ "Start: Balanced: this position can be held". LH hold 2, RH 1S, LF `wf:959:837`, RF `wf:1108:848` (= the reference beta's start). |
| **Start shares** | ✅ LH 10.0 % · RH 21.3 % · LF 25.9 % · RF 42.8 % (sum 100.0). Effort 25.0 % bodyweight, 4 contacts. |
| **Move 1: LF → Wall foothold 61** (`wf:878:721`) | ✅ hold. Reach 0.220 of 1.000 (static). LH 10.0 · RH 24.9 · LF 15.9 · RF 49.2. Effort 34.5, 3 contacts kept. |
| **Move 2: RF → Wall foothold 67** (`wf:959:837`) | ✅ hold. Reach 0.358 (static). LH 12.9 · RH 31.0 · LF 20.7 · RF 35.4. Effort 34.5, 3 kept. |
| **Move 3: LH → 3** | ✅ hold. Reach 0.221 (static). LH 12.3 · RH 30.9 · LF 21.2 · RF 35.6. Effort 55.3, 3 kept. |
| Desktop vs Pixel 7 | Identical verdicts and numbers. They also equal the fake-model E2E and the Node unit tests: on a baked level the referee's input is the level file, with no model in the loop. |
| **Models used** | None. No worker message and no model request on Wall 1, start through move 3 (after the load-on-demand fixes). The first run, before the worker fix, fetched transformers.js because the worker was created, but no model weights. |
| Time to the first verdict | 1.3 s from the Wall 1 tap on the dev server (cold Play chunk), desktop and Pixel 7. |

### Lighthouse accessibility (12.8.2, `vite preview` of the production build)

| Page | Mobile | Desktop |
|---|---|---|
| `/` (the gym, level question open) | **100** | **100** |
| `#/wall/routemake-g2-b1` (Play, start shown) | **100** | **100** |

### E2E, fake models, desktop and Pixel 7

`npm run e2e` at `22f6647`: **200 passed, 0 failed** (1.7 min, load 5–11), exit 0. An earlier full run at `f7cbc66` under load 41–100 had 24 failures, all in the Studio's 3D or timing specs (pointcloud, full-flow's 3D step, stance in 3D, feedback, route-view). On the unchanged step-2 base `ea77ceb`, full-flow and stance-in-3D also failed at load 25–32. Pointcloud passed 26/26 on the branch rerun at load 28.

### Success criteria (amendment (b) SC 1, 2, 5, 6 and the old SC 2)

| SC | Evidence |
|---|---|
| **1. Opens into the gym** | `hub.spec` AC 2: the gym paints within 2 s at 4× CPU throttle, without the Studio bundle. A wall door is tappable then. |
| **2. Studio unchanged** | `App.tsx` and every Studio module are unchanged since step 2 (`git diff ea77ceb..HEAD`: only one added export in `beta-moves/index.ts`). The whole Studio E2E suite passes at `#/studio` (above). The Setting Room is 2 taps from the hub (`hub.spec` AC 6). |
| **5. Pro** | `own-wall.spec` AC 9 counts real taps with a capture-phase `pointerdown` listener. **Updated 2026-11-02:** since gym-hub W3 removed the level question, the first verdict on your own photo takes **2 in-app taps**, New wall and Plan this route, plus the OS photo picker and the tagging taps (`own-wall.spec` expects exactly these 2). If the picker is one tap that makes 3; phone pickers often take two (a source, then the photo), which makes 4. The tagging is 3 hold taps and 2 role taps (Start, Finish). Counting the role taps as in-app taps gives 4. The first verdict shows with E1's direction map open, so "Start planning" comes after it and isn't counted. At C9, before W3, it was 3 in-app taps, with "I climb hard, set or coach" first. S2's "a route that is ready moves you to Plan" would remove the Plan tap; it isn't built. Numbers values equal the referee's (`numbers.test.ts`, every check of every B1-03 beta). |
| **6. Same referee** | `sameReferee.test.tsx`: `PlayScreen` under the beginner, gym and pro profiles, with the reference beta (16 moves to the top) plus a fall preview and a shape rejection played through the limb buttons and the target list. Assignment, shares, move count and verdict text are equal after every step. A mutation that leaks the profile into the wall makes it fail. `trayFor` returns only `maxLimbs`, `numbers` and `plumb`. |
| **Old SC 2. Undo** | `moves.test.ts`: after moves, rejections and fall previews, Undo restores the previous step's assignment and stance, deep-equal with a fresh cache. `play.spec` AC 4 on desktop and Pixel 7. |

### D1 originality (2026-11-02)

The originality review of the play-feel build (64f7f7f..0bde86a), required before merge (D1, SPEC-game › Never), like SPEC-gym-hub's AC 15 record.

| Item | Result |
|---|---|
| **Verdict** | ✅ **Pass**, with three cross readings fixed (below). |
| **Coach window** (`FRAME_GRID`, `coach.ts`) | A generic convention: a titled text box at the bottom of the screen. The nearest is Dragon Quest's dark window with a title, but this one has a purple ground, square bolt-head corners and a left-set "COACH" tag on tape. It is nothing like the Pokémon, Final Fantasy, EarthBound, Undertale or Mega Man X frames. The tag uses pixel-kit's own 5×7 font (reviewed 2026-11-01), and there are no sounds. |
| **`ADVANCE_GRID`** | A generic double chevron. |
| **`GLYPH_GRIDS` and the arrows** | Fine. ⊙ and ⊗ are the physics convention for a vector out of or into the page; the arrows follow the ISO 7000 convention. |
| **`MARK_GRIDS`** | Follow traffic-light coding (green holds, yellow deadpoint, orange falls), with three different shapes (dot, ring, diagonal ×). |
| **Method** | Reviewed from memory, with no web access. |
| **Fixed: 4.** pixel-kit's target marker on 7–11 px frames | Its four ticks met in a solid "+". Target frames are now at least 13 art px, so the centre stays open (SPEC-pixel-kit › Amendment 2026-11-02; `markers.test.ts`, goldens `marker-target-smallest-*`). |
| **Fixed: 5.** a hint arrow through a step badge | On 7F it read as a Latin cross on a disc. Arrows now start past a badge, and nothing of a hint is drawn inside one (`hints.test.ts` "review 5"). |
| **Fixed: 6.** the falls × on the arrow's tail | A mark now sits off the hold's arrow and never touches it (`hints.test.ts` "review 6"). |

## Amendment 2026-11-02: Keyboard Limbs, Mouse Targets, Three Hints, Direction Editing, a Coach Window and Beta Videos

Status: **APPROVED 2026-11-02** (user: "approve"), from the user's play-test feedback. Every hint shows **only what the referee computed** (SPEC-game › Boundaries); none of them commits a move.

| # | Change | Builder's call (role), grounded reason |
|---|---|---|
| K1 | **Keyboard limbs:** Q = LH, W = RH, A = LF, S = RF, and 1–4 as well. Esc drops the selection. Each limb button shows its key. | Game designer, feel. The 2×2 block mirrors the body (hands on top, left limbs on the left), Norman's natural mapping. |
| K2 | **Mouse targets:** hovering the photo outlines the target the click would pick (the same 24 CSS px nearest rule as a tap) and names it in a small label. Clicking commits. Touch is unchanged. | Game designer, feel. Hover-to-preview, click-to-act is the standard pointer pattern (WCAG 3.2.1: no change on hover). |
| H1 | **Hint 1, hold directions.** Pixel arrows on each route hold show the pull direction the referee uses (the `RouteHold.dir` it was given). Toggled as "Hold directions" in Aids. | Pro climber. Reading which way a hold pulls is the first thing a climber reads, and it's the referee's own input, so no new maths. |
| H2 | **Hint 2, 3D view.** "3D" opens the Studio's `PointCloudView` for this wall in a panel, with the current stance standing in it. It's lazy-loaded. The depth model downloads only when the hint is first opened, with a one-time notice and a progress line. | Technical director. It reuses the existing 3D view, and loading on demand keeps Wall 1's start free of model downloads. **Map arrows `play-shell → point-cloud-view, depth-estimation` are approved by this amendment.** |
| H3 | **Hint 3, the plausible holds view** (user decision 2026-11-02). After a limb is picked, the referee runs `checkMove` on every candidate target for that limb: route holds, plus wall feet and smear for a foot. Each candidate is marked "holds" (static), "holds as a deadpoint" or "falls", with a count line such as "7 targets: 3 hold · 1 deadpoint · 3 fall". It's computed in small idle chunks through the stance cache and can be cancelled. It never commits. It's toggled as "Plausible holds" in Aids and is **off by default**. | Pro climber and technical director. The referee is deterministic, so these are yes/no verdicts, not probabilities, and nothing is called a "rate". A Monte Carlo success rate over input uncertainty was offered and not chosen. The design-pass cut list called this an answer key; the user asked for it, so it's opt-in. |
| D1 | **The coach window.** Analysis and explanations appear in an **original** 8-bit RPG-style text box at the bottom of the screen:<br>• a pixel-bordered frame with a 5×7 pixel-font name tag ("COACH");<br>• the body in the system font, so it stays readable and translatable (pixel-kit's font rule);<br>• the text reveals letter by letter, skippable with a tap or Enter, and appears at once under reduced motion;<br>• an advance arrow on longer explanations.<br>It shows the solver's own words: the start verdict, `fail.text` and `move.tip`, and with Numbers on, a one-line breakdown. It never copies Pokémon's or Mega Man's frame, font or sounds, and an originality review is needed before merge. | Game designer, world. A bottom text box is the classic turn-based RPG convention, which suits a think-then-act planning game better than an action game's cut-in dialogue. |
| E1 | **Check the hold directions before planning** (user request 2026-11-02). Whenever a wall goes into Plan, whether a route the player just tagged or a baked level like Wall 1, a **direction map** opens first: an arrow on every route hold showing the pull direction the referee will use. It asks: "Do these directions look right?" with **"Edit directions"** and **"Start planning"**. In edit mode, with the mouse (and touch):<br>• **Rotate:** drag an arrow's head to turn the pull direction. Only the in-plane angle changes; the out-of-wall part stays.<br>• **Translate:** drag the arrow's base dot to move the **grip point** where the hand or foot holds the hold. It's clamped to the hold's box (the mask when there is one).<br>• **Reset** returns a hold to the referee's default.<br>Arrows are ≥ 44 px to grab, and there's a keyboard path: the hold list plus the arrow keys rotate and move the point. "Start planning" (or "Done") goes to Plan. A changed direction or point restarts the plan from the start, because the referee's input changed. | Pro climber. Reading how each hold pulls is the first read of a route. **Rotation** reuses the approved user override, the Studio's custom pull `{ custom: Vec3 }`, with `forceSource: 'user'`. **Translation** adds one referee input, an optional per-hold **grip point** that replaces the centroid as the contact point. It's carried in `RouteHold` and the context key. That's a `beta-moves` / `climber-stance` input change, approved by the user's request. Edits are in memory only (step 5 saves), and the baked level file never changes. |
| V1 | **Beta videos.** On a wall whose sample has routemake videos, the header shows "Watch beta videos on routemake ↗", opening in a new tab with `noopener`. The link goes to the route's own page when a verified routemake route URL exists for it, and to the wall's zone page otherwise. **Only the URL ships**: videos stay on routemake, never bundled or embedded. | Technical director. This follows the existing image-input policy (videos are "linked, never bundled") and the licence answer (no scraped route data ships). |

Acceptance:
1. Q/W/A/S and 1–4 pick limbs, and Esc clears.
2. Hover outlines the click target and clicking commits it.
3. Hold-direction arrows match `RouteHold.dir` (unit test).
4. 3D opens with the stance shown, and no depth request is made before it's opened (fake-client test).
5. Hint 3's marks equal `checkMove` per target, the summary counts add up, the hint is off by default and never changes the plan.
6. The coach window shows the referee's text verbatim, can be skipped, and has a reduced-motion path. It passes an originality review.
7. The video link appears on Wall 1 only, opens a new tab, and no video file is bundled.
8. The direction map opens before every Plan. Its arrows equal the referee's `dir` (unit test).
9. Dragging an arrowhead sets a custom pull that the next `checkMove` uses (the verdict or loads change accordingly).
10. Dragging the base dot moves the contact point within the hold box, and the referee's contact uses it.
11. Reset restores the default. A change restarts the plan.
12. The whole edit flow works by keyboard.
13. All existing Play and gym E2E tests still pass.

### Builder's Calls (play-feel build, 2026-11-02)

- **K1, physical keys** (game designer). The keys are matched by `KeyboardEvent.code`, so the 2×2 block keeps its shape on any layout (on AZERTY the left hand is the key where QWERTY has Q). The mapping's reason is where the keys sit (Norman's natural mapping), not their letters.
- **K1, when the keys work** (accessibility). Only while the tray is on screen: not in Tag and not on the direction map. Never in a text field, a select or an editable element, and never while any dialog is open (its keys are its own). A modifier shortcut or a key repeat does nothing.
- **K2, one rule for hover and click** (technical director). The hover asks `usePlay.targetFor`, the same `targetAt` call and 24 CSS px radius as a tap, so the outline can't disagree with the click. It uses the target marker that a focused list item already shows. Mouse only: touch and pen never preview.
- **H1 and H3 are session view aids, kept in play-shell** (technical director). They aren't in gym-hub's `Profile`: neither changes the referee or the tray (S8), and the profile's saved shape belongs to `progression` (step 5). "Hold directions" starts on where hints are on (beginners: "coach hints"; others: "hints only on request", amendment (b)). "Plausible holds" is always off until asked for.
- **H1, how an arrow reads** (pro climber; revised 2026-11-02 on review: the first arrows read as crosses and daggers). Standard notation, following the ISO 7000 arrow convention:
  - an arrow is a plain 1 px shaft and a filled triangular head (up to 6 art px long and 7 wide, scaled to the arrow, never under 5 wide), with no crossbar or perpendicular stroke anywhere;
  - its length is the pull's in-plane share of 40 CSS px, or of 11 art px on a coarse pixel grid (a big photo on a desktop), so the head and the shaft always both fit (E1 edit: 56 CSS px or 13 art px);
  - its tail end is the grip point; in E1 edit the plain grip dot is drawn too, set 4 px apart from the shaft so it can't read as a hilt;
  - under 0.35 of |dir| in-plane, the pull is mostly through the wall and is drawn the physics way: ⊙ out of the wall or ⊗ into it, as hold-geometry's ⊙ for out-facing holds (the ⊗'s × is diagonal, never upright);
  - no `dir` is the plain square grip dot alone;
  - a user-set pull is drawn in bloom.

  H3's "falls" mark is the diagonal × as well, never an upright +. Arrows are drawn above the climber, so the start holds' arrows can be read.
- **H1, the step badges come first** (review finding 5, label avoidance). An arrow never runs through a badge:
  - it starts past a badge at its tail (its own, or a neighbour's within 3 art px), keeping at least 8 art px;
  - it ends, head and all, before the next badge on its path;
  - a dot or ring that would touch a badge moves up to 4 px off it, and anything left inside a badge is not drawn.

  An arrow pushed past its own length plus 3 px (down a chain of neighbours' badges) would sit by another hold and read as that hold's, so it isn't drawn. On a dense wall on a phone this happens: on Wall 1 at 375 px it is hold 5, with only 1.5 art px between badges 4 and 3, and its edit-mode arrow has no room either. **Corrected on re-review:** the E1 check screen then says each such pull in words under its question ("Hold 5: pulls down (180°)", the "Pulls not drawn on the photo" list), so no direction is confirmed unseen. The hint layer names those holds in `data-dropped-arrows`. In edit mode, every hold's pull is in words in the hold list. A plausible-holds mark on a hold with a pull glyph sits beside it, square to the shaft (review finding 6).
- **H3, what gets a mark** (pro climber). Shape rejections (for example, a foot onto the finish, or a limb onto its own hold) aren't moves, so they get no mark and aren't counted. Marks are only checked from a stance that holds: a fallen start or a top has no next move. The marks are three shapes (dot, ring and cross), not only three colours, and each verdict is also written on its target's button. Chunks are at most 2 candidates per idle slice (`requestIdleCallback`, with a `setTimeout` fallback).
- **D1, where the window sits** (game designer). In the verdict's old slot, directly under the photo: the bottom of the game view, as in a turn-based RPG. Pinned to the bottom of the page, on a phone it would either sit under the target list (hiding the verdict) or cover the targets.
- **D1, the live region stays** (accessibility). The `role="status"` verdict line keeps its exact text and is visually hidden inside the window, so the whole line is announced once. The box mirrors it aria-hidden, one span per letter, so a half-revealed line is never announced and the box doesn't change size as the words appear.
- **D1, paging and keys** (game designer). Pages split at the referee's own sentence: the outcome, then `fail.text` or `move.tip`, then the Numbers breakdown. Joined, they are exactly the verdict line. Letters appear at 50 a second. Enter skips or advances only when no control has the focus, because Enter on a button is that button's.
- **E1, when the map opens** (game designer). On every plan with no moves: a baked level on opening, and a tagged route on each "Plan this route". A plan in progress that comes back from "◀ Gym" resumes without it, because its directions were checked. "Check directions" in Plan reopens it, and says that a change restarts the plan.
- **E1, edits** (technical director):
  - Edits are kept for the session per wall and route, with the plan made on them.
  - A change forgets the plan made on the old directions, so Reset gives a fresh plan rather than bringing an old one back.
  - A drag previews, and only the release commits, so a drag costs one referee check, not one per pointer move.
  - Play never writes the Studio's `pullOverrides`: the edits are Play's copy only, as the amendment says.
- **E1, edit mode geometry** (game designer):
  - Every arrow is drawn 56 CSS px long, so its 44 px head handle stands clear of its 44 px base handle.
  - The out-of-wall part shows in words in the hold list.
  - Turning a pull drawn as ⊙ or ⊗ (no in-plane angle to turn) first gives it the smallest in-plane share drawn as an arrow (0.36), keeping z's sign.
  - Keyboard turn: 15°, or 5° with Shift, on a slider whose bearing has 0 up and 90 right. Grip moves are 5 image px, or 1 with Shift.
- **E1, the grip clamp** (pro climber). A tagged hold's grip snaps to the nearest pixel of its mask. A baked level has no masks, so its grip stays in the hold's box (0.05 × climber height, as its marker), and always on the photo.
- **H2, its own depth request** (technical director). The panel posts `depth:run` itself, once per photo, rather than through `useDepth`. `useDepth` waits for `analysisTriggered`, and setting that would start `PlayAnalysis` (CLIP and the wall footholds), which means more models on a baked level. The result goes into the store, where `PointCloudView` reads it, so the Setting Room reuses it. On a baked level the 3D view has no hold badges, because the store has no tagged holds. The climber and the wall are shown.
- **Existing tests** (QA). The tray tests gained the one "Start planning" step that E1 adds before every plan. Lines were only added, and no assertion changed.

## Amendment 2026-11-02 (b): One-Screen Play HUD and Thin Direction Arrows

Status: **APPROVED 2026-11-02** (user: "approved"), from the user's play-test feedback: "the direction shown on screen is too thick and cover the hold" and "the console under the image is hard to operate, redesign the interface to make player easy to operate".

| # | Change | Builder's call (role), grounded reason |
|---|---|---|
| T1 | **Thin, screen-space direction arrows.** Hold-direction arrows (H1, the E1 map, edit handles) stop being pixel art on the climber's art grid. On a wide screen one art pixel is about 8 CSS px, so the arrows were fat blocks covering the holds. They're now fixed-size annotations in CSS px:<br>• a ~2 px line and an ~8 px triangular head;<br>• white with a 1 px dark outline, so they read on any wall;<br>• ~20 px long, **starting just outside the hold's box** in the pull direction, so the hold stays fully visible;<br>• a small ⊙ or ⊗ (out of or into the wall) beside the hold, not on it.<br>Same no-cross rules (no crossbar or perpendicular stroke). The E1 edit handles keep their 44 px hit areas around the thin arrow, and the badge avoidance still applies. | World designer. Map annotations stay a fixed screen size and sit beside the feature they label, never on it (cartographic label placement). |
| U1 | **The core loop fits on one screen, with no scrolling:** pick a limb, tap a hold, read the verdict. | Game designer, feel. Fitts's law: controls next to the action; game HUDs keep controls beside the playfield. |
| U2 | **Wide layout (≥ 900 px):** two columns. The photo takes the left, as large as fits the viewport height. A right side panel holds:<br>• a header (wall name, ◀ Gym, the beta-video link);<br>• the COACH window;<br>• a **2×2 limb pad shaped like the body** (LH Q · RH W over LF A · RF S);<br>• Undo and Redo;<br>• a hint row of labelled icon toggles (Directions, Plausible, 3D, Numbers).<br>The Numbers breakdown and the 3D panel open inside the side panel. | Game designer, feel. |
| U3 | **Phone layout (< 900 px):** the photo is full width at the top. The COACH shows as a one-line strip at the photo's bottom edge; tap it to expand. A **sticky bottom bar** in the thumb zone holds the 2×2 limb pad, Undo, Redo and a ☰ hints drawer. | Game designer, feel. Mobile thumb-zone ergonomics (Hoober's touch research); a virtual-pad bar is the mobile-game convention. |
| U4 | **The E1 direction check is a banner on the photo** ("Check directions? Edit · Start planning"), not a section below it. Edit mode keeps the hold list in the side panel or drawer. | Game designer, feel. It stays where the arrows are. |
| U5 | **The target list moves behind a "List targets" button** in the panel or drawer. It stays a full keyboard and screen-reader path, but isn't always on screen. | Game designer, feel. Progressive disclosure (Nielsen Norman Group) keeps the accessible path without clutter. |
| U7 | **The Tag step uses the same wide layout as Plan (U2)** (added 2026-11-02, from the user's PR #15 screenshot: "put the console to the right as well"). The photo is on the left at viewport height. The route steps, Plan this route, Open in Setting Room and the hold list sit in the right-hand side panel. Narrow screens keep the stacked Tag layout, with the sticky photo from PR #15 review 1. | Game designer, feel. One layout for both steps of a wall: the controls stay beside the playfield, so tagging doesn't need scrolling either. |
| U6 | **Unchanged:** the referee, the rules, every verdict, Q/W/A/S, 1–4, Esc and every other keyboard path, the `aria-live` verdict, 44 px targets, and reduced motion. Studio is untouched. | Technical director. |

Acceptance:
1. At 1280×800 and 375×740, the limb pad, Undo, Redo and the verdict are all visible without scrolling while a hold on the photo is tapped (E2E).
2. Direction arrows never draw inside their hold's box (unit), are ≤ 3 CSS px thick at every zoom, and keep no cross shape (the existing tests).
3. The direction check banner overlays the photo, and Edit / Start planning work.
4. List targets opens the full target list, and a keyboard-only move still works.
5. All existing Play, gym and accessibility E2E tests pass (selectors updated, assertions kept), and Lighthouse accessibility stays ≥ 95.

### Builder's Calls (HUD build, 2026-11-02)

- **T1, every hold annotation is vector, not only the arrows** (world designer). The arrows, the ⊙ / ⊗ rings, the E1 grip dot and the plausible-holds marks are all SVG in CSS px (`annotate.ts`, `ArrowLayer`). A mark drawn on the art grid would be as fat as the old arrows. The visible stroke is 3 px (a 1.5 px white line on a 3 px dark one): acceptance 2's cap, read as the spec's "~2 px line with a 1 px outline". The art-grid raster (`HintLayer`) is gone.
- **T1, badges** (world designer). An arrow may skip one badge at its tail, its own. A second one is a chain of badges: past it the arrow would sit by another hold, so it isn't drawn, and the E1 check names that pull in words (re-review 1). An SVG mask cuts every badge out as a last guard.
- **U2/U3, the layout switch** (technical director). `useWide()` follows `(min-width: 900px)` through `useSyncExternalStore`, so there are no effects. Where there are no media queries at all (jsdom, an old browser) it's the wide layout, with every control on screen. The header stays the page's banner landmark beside the panel, the photo is `main`, and the controls are an `aside` "Play controls".
- **U2, the hint row** (game designer). It keeps each aid's full name ("Hold directions", "Plausible holds", "Numbers", "Hints") on its toggle, so the accessible name is the visible label (WCAG 2.5.3). The 3D toggle sits in the same row.
- **U3, the drawer** (game designer). ☰ "Hints and tools" holds the hint row, List targets, the tools and the route's actions, in Plan and in the map. The Numbers panel stays in the page, under the COACH strip.
- **U4, the banner** (game designer). It keeps the approved E1 wording ("Do these directions look right?", Edit directions, Start planning) and sits on the photo's bottom edge, usually the mat, so the holds and their arrows stay in view. On a phone, edit mode's Reset all / Done move into the bottom bar, so the photo's 44 px handles stay clear. **Corrected on PR #15 review 7:** "Edit directions" never guesses keyboard or pointer (a touch screen reader can send `detail` 1, like a pointer). The drawer stays shut, so the photo's handles stay in view. If the focus would be lost, it moves to the hold list's first pull when that list is on screen (wide), otherwise to the bar's edit actions (Done), with ☰ for the hold list one Tab away. **Still to do:** a real-device check with VoiceOver (iOS) and TalkBack (Android).
- **Crossing the breakpoint** (technical director, PR #15 review). A resized or rotated window remounts the controls into the other layout. That's accepted: their state is Play's own (the plan, the tray, the open drawer, List targets), and so is the COACH strip's expanded state, so it survives the remount.
- **Esc** (game designer, PR #15 review). Esc stays K1's "clear the selection" (hard rule 1). It doesn't close the drawer; ☰ does, and the focus stays on it.
- **U5** (game designer). "List targets" remembers that it's open while you stay on the wall. With no limb picked, it says how to use it. The plausible-holds count line moves beside it.


## Amendment 2026-11-03: R0, the Playtest Fixes (redesign step R0)

**Status: APPROVED 2026-11-03** (user: "核准"). Step R0 of the approved redesign map (SPEC-game › Amendment 2026-11-03). It fixes the three problems that 7 of the 9 panel roles hit on the live build `b744b47`, plus the goal on entry (UX/UI and game-designer roles). The referee's verdicts don't change: only how limbs are armed, which words are shown, and where. It also touches two referee text tables (climber-stance's diagnosis texts and beta-moves' start text) and the Studio's behaviour stays identical.

| # | Change | Builder's call (role), grounded reason |
|---|---|---|
| R0-1 | **One armed limb by default.** A limb key (Q/W/A/S) or button **replaces** the armed limb. A second limb is added only on purpose: **Shift + key**, or the **"+ limb"** button beside the limb pad (shown only when the tray tier allows 2 limbs, S8). Pressing the armed limb again keeps it armed; Esc still clears (K1). After a fall preview the limb stays armed, so the next tap retries with it, and pressing another limb replaces it. The hint line names the armed limb ("Moving: right hand — tap a hold"). A foot tap that finds nothing says "No foothold there for that foot" | UX/UI and game developer (7 of 9 roles hit it): a plain click replaces the selection and Shift extends it, as in Apple's HIG and the Windows selection guidelines. 2-limb moves (S6, B2) stay, behind an explicit gesture |
| R0-2 | **The fall reason on the first page.** A fall's first COACH page is the verdict and its reason together: "Right hand to 4: you'd fall. Too far: right hand — move your feet up first". A hold that carries a tip (deadpoint, one hand on the finish) shows the tip on the same page too. Numbers stay on their own page. On a phone, the COACH strip opens by itself on a fall preview, a rejection or a tip, and keeps the player's choice otherwise. The reason stays until the next move, Undo, Redo or Esc; arming another limb doesn't erase it | UX/UI, researcher, visual and LLM roles (7 of 9): the reason is the lesson (Nielsen's heuristic 9, help users recognise, diagnose and recover from errors) |
| R0-3 | **No advice Play can't carry out.** (a) Play's out-of-reach text drops the size clause: "Out of reach: left foot — pick a closer hold" (the Setting Room keeps "make the climber bigger", where its Climber size slider is). climber-stance's diagnosis table owns both texts and the caller picks the Play one. (b) Play's direction editor (E1) gains a **Down** preset per hold, and the sloper text becomes "…set its pull to Down in Edit directions". When the player has already set that hold's pull (`forceSource: 'user'`), the advice is the slip text instead ("move your hips under it"). (c) A start that can't be held says why and what to do: "This start can't be held: <the solver's diagnosis>. Tag a second start hold, or edit directions", with **Edit route** and **Edit directions** buttons on the banner. (d) Dead ends ("move your feet up first" where no foot move helps) need `beta-search` and wait for R2 | Game designer, LLM and UX/UI roles: advice must name an action on the screen the player is on (Nielsen's heuristic 6, recognition rather than recall). The verdicts and reasons still come from the referee's own tables (D1) |
| R0-4 | **The goal from the first frame.** On entering Plan, the COACH's first page is "Goal: both hands on 7F" (the route's finish label), then the start verdict. A goal line stays in the header at every width ("Goal · both hands on 7F") | UX/UI and game designer: nothing stated the goal; Nintendo's World 1-1 shows the goal by layout from the first screen |

### Acceptance criteria

1. **Arming (R0-1).** At the gym tier: Q then W → only RH is pressed. Shift+W after Q, or "+ limb" then W → LH and RH. W while RH is armed → RH stays armed. After a fall preview with RH armed, A → only LF, and a tap on a wall foothold moves LF. At the beginner tier (1 limb) Shift and "+ limb" do nothing and "+ limb" isn't shown. A foot tap on bare wall says "No foothold there for that foot".
2. **Reason (R0-2).** At 1280×800 and 375×740, a fall preview shows its reason on the first visible page with no click. Arming another limb keeps it; the next move, Undo, Redo or Esc replace it.
3. **Advice (R0-3).** Play never shows "make the climber bigger". The Setting Room's text is unchanged (its tests unchanged). With a sloper start that can't be held, the banner names the diagnosis and shows Edit route and Edit directions; the Down preset sets that hold's pull to straight down; afterwards "set its pull to Down" no longer appears for that hold.
4. **Goal (R0-4).** On Wall 1, before any move, "both hands on 7F" is visible at both sizes, and a screen reader hears it first.
5. **Referee unchanged.** `checkMove` verdicts on B1-03's recorded betas are identical before and after (the existing sameReferee and B1-03 tests pass unchanged).
6. **Gate.** `npm test`, `npm run lint`, `npm run build`, `npm run e2e` pass; GitHub CI green.
7. **Panel replay.** The UX/UI, researcher (beginner persona on a phone), game developer and game designer roles replay Wall 1 on the PR's build. None reports a limb that adds instead of switching or a hidden fall reason.

### Testing

- Unit: the arming rules as a pure function in `tray.ts` (replace, Shift-add, tier limit, keep on re-press, keep after a preview); `coachPages` (reason and tip on page 1, Numbers apart); climber-stance's Play text variant; the start banner's diagnosis text; the Down preset in `directions.ts`.
- Component: `MoveTray` (+ limb only at 2-limb tiers), the start banner's two buttons, the header goal line.
- E2E: keyboard-only arming with Tab, Q/W/A/S and Shift; the phone strip opening on a fall; the goal line at 375×740.
- Evidence: a before/after capture of the live build and the PR build on the same Wall 1 script (REA browser scenario when its tools are connected, otherwise Playwright), kept with the PR.

### Boundaries

- **Always:** the referee decides; only arming, wording and placement change. The Studio's texts and behaviour stay the same.
- **Ask first:** any change to `MoveRules`, reach limits or the solver.
- **Never:** advice that names a control the current screen doesn't have.

### Builder's Calls (R0 build, 2026-11-03)

- **R0-1, a foot tap on bare wall** (pro climber, UX/UI). A photo tap (and K2's hover, the same rule) picks a route hold or a wall foothold within 24 CSS px and nothing else, so a near miss says "No foothold there for that foot" instead of silently becoming a smear. The smear stays one deliberate choice away, as "Smear" in the target list (S12). This is acceptance 1's wording; targetAt and the referee are unchanged. **PR #17 review 1:** after such a miss, the tapped spot itself is offered as "Smear here", a button in the hint line and an entry in the target list (before "Let go"), so a foot can still be moved up the wall onto bare rock. It belongs to that foot while it waits; picking another limb or trying a move drops it. **Re-review 4:** the button sits beside the live hint line, not in it, and after the choice the focus goes to that foot's limb button, never lost to the page.
- **R0-1, Shift + click** (UX/UI). Shift + click on a limb button adds a limb as Shift + key does, so the mouse has the same gesture (Apple's HIG: Shift-click extends a selection).
- **R0-1, "+ limb"** (game designer). A one-shot toggle (`aria-pressed`): the next limb pressed is added, then it switches off. It sits first in the Undo/Redo group, which wraps, so the phone bar never overflows (U1).
- **R0-1, at the beginner tier** (UX/UI). "Shift does nothing" is read as "adds nothing": Shift + W arms RH alone, as W does, so a stray Shift still answers.
- **R0-1, re-pressing** (UX/UI). A press never disarms (Esc clears, K1). A plain press on one of two armed limbs leaves only that one, as a plain click on one selected item does.
- **R0-1, the hint line at every level** (game designer). "Moving: right hand — tap a hold" is state, not a coaching hint, so it shows with Hints off too. For a 2-limb move it names both and the one whose hold is next ("… — tap a hold for the right hand").
- **R0-2, a tap's own line** (UX/UI). "Pick a limb first" and "No foothold there…" go to the hint line's own slot, so a mis-tap can't erase a fall's reason. The ghost climber stays with its reason.
- **R0-2, the last try** (game developer, PR #17 review 10). Once another limb is picked after a fall preview or a rejection, the ghost climber and its target marker go, so the old try isn't shown as if current; its words stay, marked "Last try: …" in the COACH box (the live region keeps the referee's exact verdict, re-review 2), until the next attempt, move, Undo, Redo or Esc. Pressing the same limb again keeps it the current try.
- **R0-2, the phone strip** (game designer). Folding the auto-opened strip is the player's choice for that attempt; the next fall, rejection or tip opens it again, and any other words go back to the player's last choice. **PR #17 review 3:** the fold is keyed on an attempt counter, not on the words, so a repeated fall (the same blocked hold tapped again) opens a folded strip again, and a new attempt restarts the COACH's letter reveal, so the same words visibly come again (under reduced motion the words show at once, and the strip opening is the answer).
- **The COACH's fold control** (game designer, PR #17 review 2). On a phone it has the box's right-hand column to itself (the 52 px the text never takes), at the top, with the advance arrow at the column's foot, so neither covers a word. It says what it does: expanded it reads "Fold ▴" ("Fold the coach to one line"); folded, ▾ ("Show the whole coach line").
- **The folded strip's words** (researcher, PR #17 review 9). A folded COACH strip wraps to a second line before it clips, so a short line such as "Goal: both hands on 7F" is never cut (the researcher's phone, with larger system text, showed "…on 7"). Longer words are clamped at two lines, the whole text one tap away. This relaxes amendment (b) U3's "one-line strip" to "one or two lines".
- **The direction check answers** (game developer, PR #17 review 11). While "Do these directions look right?" is open, a limb key or a tap on the wall is no longer swallowed: the banner says "Press Start planning to climb" (a status line, so it is announced). Nothing is armed or moved, the K1 rule stands (the tray's keys work only in Plan), and edit mode keeps its own keys and drags.
- **R0-3 (a), where the Play text lives** (technical director). climber-stance's `Diagnosis` gains an optional `playText`, set only where the Studio's advice names a control Play lacks (reach, and the steep sloper below). `text` stays the Studio's and the referee's: beta-moves' `reason` and `fail.text` are unchanged (its tests and B1-03 unchanged). Play's `reasonText` swaps the diagnosis inside the reason, alone or after "While your … moves:".
- **R0-3 (b), which slip text** (pro climber). Once the player has set the pull (`forceSource: 'user'`), the advice is climber-stance's own slip text for that hold type: for a sloper "get your hips lower and under it" (the amendment's "move your hips under it" is the same table's line for other holds). A measured surface keeps the Studio's "get a foot on a hold under it": Play can do that.
- **R0-3 (b), the Down advice by hold** (game designer, PR #17 review 6). The advice is given only when Down would change the hold's pull (not already within the editor's 12° snap of straight down, the Studio's SNAP_DEG); then it is the slip text. It names the hold, its pull and why, and the button: "Right hand: hold 4 pulls mostly into the wall, which a sloper can't take — if its top faces up, press Down for it in Edit directions". climber-stance's table owns the words (`playSteepText`, `playSlipText`); Play fills in the label and the pull in words, with no degree numbers. Without the route (no hold to name) the diagnosis's own Play text says "press Down for it in Edit directions". This supersedes the amendment's "set its pull to Down in Edit directions".
- **R0-3 (a), who is blamed** (game designer, PR #17 review 7). When the stance a move makes leaves a limb that didn't move out of reach, the reason says the move: "Right hand to 6: you'd fall. With your right hand on 6, your left foot can't reach — pick a closer foothold". Out of reach alone stays "Out of reach: left foot — pick a closer foothold". Feet pick a foothold, hands a hold. climber-stance's table owns both forms (`playReachText`); Play fills in the move.
- **R0-3 (b), the Down button** (accessibility). It is last in each hold row, after Reset, so E1's keyboard path (pull, grip, nudges, Reset) is unchanged and Down is one Tab further. **PR #17 review 5:** it is `aria-pressed` when the hold's pull is straight down already (within the 12° snap), and "+ limb" is described ("The next limb you press is added") through `aria-describedby`.
- **R0-3 (c), who words the action** (technical director). beta-moves' start text is now "This start can’t be held: <diagnosis>" and names no control (it said "change it first"). Play adds what its screen has: a tagged route "Tag a second start hold, or edit directions" with Edit route and Edit directions; a baked level has no Tag step, so "Edit directions to fix it" with Edit directions only (Boundaries › Never). The banner shows in the banner slot on the photo once "Start planning" closes the direction map (E1 comes first).
- **R0-4, what a screen reader hears first** (accessibility). The live region keeps the referee's verdict exactly (S12, and the E2E suites that read it). The goal reaches a screen reader through the header, which comes before every control in the reading order: "Goal: both hands on 7F" (the "·" is drawn, a colon is read).
- **R0-4, when the goal page shows** (game designer). While the plan is at its start: on entering Plan and after Undo back to it. A fall preview or a rejection from the start shows its own words first.
- **A plan never resets silently** (game designer and technical director, PR #17 review 8). Root cause of the Wall 2 report: on a tagged route Plan opens once depth and the wall footholds are in (PlayRoute's `settled`), but the hold types (CLIP) can land later; each type is in the route's context key, and a plan belongs to one context, so it started again at defaultStart with no word. Now, when the same route (the same hold ids) gets a new context, the plan is replayed on it (`carryPlan`): the start, then each move while the referee still holds it and its shape is still legal, committed one by one so Undo walks back through them. The hint line says what happened: "The wall’s analysis finished: your 2 moves were checked again and still hold", or "…: move 3 no longer holds (<reason>), so your plan is back to move 2". A route edit and an E1 direction change still restart the plan on purpose (the player asked). **Re-review 1:** the session memory also keeps the latest plan per wall and route (its hold ids) with the context key it was made on, so the carry works after a return to the wall too (the plan restored under the old key, then the types landing; or the types landing while the wall was closed), and leaving before any action keeps it. A restart on purpose forgets it. **Re-review 5:** if the old start isn't a legal start on the new context (a foothold it stands on is gone), the plan goes back to the default start and the line says so: "The wall’s analysis finished: your start no longer fits this wall — it was reset to the default start".
- **Existing tests** (QA). Assertions changed only where R0 reverses the old behaviour, each with an R0 comment: K1's toggle-off and add-by-default steps (keys.test, play.spec K1), the 2-limb tray test (Shift + click), K2's hover equality (a smear is never a tap), D1's coach pages (the reason on page 1; play.spec D1 pages to the Numbers line instead), the COACH-fit E2E (the Numbers page is now page 3) and beta-moves' start text (plan.test). sameReferee and B1-03 are unchanged.

## Amendment 2026-11-04: L1, a Phone on Its Side (the iPhone check)

**L1.** A phone in landscape gets U2's side-by-side layout, not U3's bottom bar. `useWide()` now follows `(min-width: 900px), (orientation: landscape) and (max-height: 500px)`. Below 900 px in short landscape, the side panel takes its 320 px minimum and the header, gaps and COACH margin tighten. Touch targets stay at 44 px.

- **Why.** WebKit with the iPhone 15 landscape profile (734 × 343) showed U3 had broken there. The photo was ~250 × 187 between black bars. The fixed bar took ~40% of the height and covered the COACH, so a move's verdict wasn't visible without scrolling. The bar is `position: fixed; left: 0; right: 0` with a 16 px side padding, so on a notched iPhone in landscape LH and LF would also sit under the notch (WebKit can't emulate safe-area insets, so this part is from the CSS, not a screenshot).
- **After.** The photo is 378 × 284 (about 2.3× the area). The COACH, the whole limb pad and the goal are in view, and the panel scrolls for the rest (Undo's bottom ~3 px sits at the fold).
- **Test.** `e2e/hud.spec.ts` › L1: at 734 × 343 the wide layout, no bottom bar, the photo in view and ≥ 240 px tall, a touch-profile move by tapping the photo, and the COACH ("Left foot to Wall foothold 61: holds") and LF in view.
- **Portrait is unchanged.** On the live site, the iPhone SE (3rd gen), iPhone 15 and iPhone 16 Pro Max profiles in WebKit all had no horizontal overflow, no form control under 16 px (so no focus zoom), no tap target under 44 px, no fixed bar off screen, and a real `touchscreen.tap` move. On a real iPhone 12 (iOS 27.0.1), Wall 1 played the same way.

## Amendment 2026-11-04 (b): L2, an Upright Tablet (the iPad check)

**L2.** In the phone layout (U3), the photo's height limit is the space left above the bar: `max(45dvh, 100dvh − --play-bar-h − 200 px)`, where 200 px covers the header, the COACH and the gaps. It is no longer the phone's `45dvh`. The rule is on `.play-hud.play-narrow` only, so the Setting Room and the Tag step keep their sticky 45dvh photo above the hold list.

- **Why.** In WebKit on iPad profiles (Air 5 portrait 820 × 1106 with iPadOS's Mac user agent, gen 7, Mini), an upright iPad got U3 with the photo capped at 45dvh (~664 × 497 inside a 788 × 510 stage). That left an empty band ~330 px tall between the COACH and the bar. Landscape iPads (1180 × 746, 1194 × 834) already get U2 and look right.
- **After.** On an upright iPad Air the photo fills the width (788 × 591). On a phone the photo's width binds first, so nothing changes (a 4:3 photo at 375 px is 281 px tall, under both limits).
- **Test.** `e2e/hud.spec.ts` › L2: at 820 × 1106, U3 with the photo ≥ 570 px tall, and the COACH in view and clear of the bar.

## Amendment 2026-11-06: V1 retired (ADR-0002 (c))

**V1 is retired.** No wall shows a beta-video link. The `videoUrl` prop, the header link and the route-page table (`ROUTE_PAGES` and `videoUrlFor` in `src/app/playWall.ts`) are removed, and acceptance 7 of the 2026-11-02 amendment is dropped.

- **Why.** [ADR-0002](docs/adr/0002-replacement-photos.md) (c): the photo that had beta videos is being replaced, and the owner's video shows a different wall. A link would show moves on holds that aren't in the photo, and no link is better than a wrong one.
- **Test.** `src/app/Root.test.tsx` checks that Wall 1's baked level shows no beta-video link. V1's own tests (`PlayScreen.videos.test.tsx`, the V1 block of `playWall.test.ts` and e2e AC 7) are deleted with it.

## Amendment 2026-11-06 (b): No Baked Level Ships (ADR-0002)

**S9, for now.** No level ships, so Wall 1 opens in Tag like any photo, which S9 already allowed. `LEVELS` in `src/app/playWall.ts` is empty in the app, and no level is in `public/`. Wall 1 gets a level again on photo A ([ADR-0002](docs/adr/0002-replacement-photos.md), Which photo goes where).

- **Why.** The old level is data from a photo the release keeps private (`docs/adr/0001-open-source-release.md:50-53`), and the deployed site still served it (follow-up 21 in `docs/ARCHITECTURE.md`).
- **The E2E test level.** The Play E2E suite keeps running on the old level, now a private test fixture: `tests/fixtures/e2e/wall-1.level.json`. `playwright.config.ts` starts the dev server with `VITE_E2E_WALL1_LEVEL=/levels/e2e-wall-1.json`, which puts that URL in `LEVELS` for Wall 1, and `e2e/wall1Level.ts` answers the URL from the fixture on every page. The env value is the URL itself, so a build without it has no level and no test path. PR 9 of the photo-replacement series moves the suite onto the level that ships and removes the fixture, the env var and `e2e/wall1Level.ts`.
- **Test.** `src/app/playWall.test.ts` › baked levels: `LEVELS` is empty, and with the env var set Wall 1 maps to its URL. "Play this wall" with your own route on Wall 1 now goes to Wall 1's bay (S14), because that wall has no level.

## Amendment 2026-11-10: the E2E test level is served as Wall 2's (SPEC-launch-wall-2 R1)

**S9, now.** Wall 2's level ships (`public/levels/wall-b.json`) and Wall 1 is removed, so
`LEVELS` is `{ 'wall-b': '/levels/wall-b.json' }` and the app has no test switch:
`VITE_E2E_WALL1_LEVEL` and `e2e/wall1Level.ts` are gone. The Play E2E suite keeps the private
test level (`tests/fixtures/e2e/wall-1.level.json`) and its photo: `e2e/testLevel.ts` answers
Wall 2's level and photo URLs with them through `page.route`. `e2e/wall2-top.spec.ts` plays the
shipped level.
- **Test.** `src/app/playWall.test.ts` › baked levels; the Play E2E specs.

## Amendment 2026-11-10 (b): no direction check before a baked level's plan (SPEC-launch-wall-2 R7)

**E1, amended.** The direction map opens by itself only before the plan of a route tagged in Play.
A baked level opens straight on the tray: the setter already set each pull. "Check directions"
still opens the map, with Edit directions and Start planning as before. **Acceptance 8 now reads:
before every Plan of a tagged route.** The E1 notes above that put a direction map first on a
baked level, or before every plan (E1, acceptance 8, the R0 notes on "Start planning"), apply to
tagged routes only.
- **Test.** `directions.test.tsx` › the direction map (E1); E2E `openTestWallMap` in
  `e2e/testLevel.ts` opens it the player's way.
