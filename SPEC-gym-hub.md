# Spec: gym-hub v0, the App Root

Status: **APPROVED 2026-11-01** (user, "approve both"). Open questions 1 and 2 are settled as proposed: the hub sprites live in `gym-hub`, and the bays are "Wall 1", "Wall 2". Question 3 (Mags's look) stays open: until the pillars are decided, she is an original design recorded in the AC 15 review.
Parent: [SPEC-game.md](SPEC-game.md) › Amendment 2026-11-01 (b) (approved). Build step 3.

`gym-hub` v1 (stars on bays, the badge board, route cards, lockers' outfit mirror) stays in step 5 and gets its own section in this file then.

## Objective

`/` opens into Bloc Hall: a side-view pixel gym where the player's beanie climber walks between places, and every feature of the app is a place you walk to. v0 is the smallest gym that does this job:

- **Front desk.** Mags asks, once, how long you have been climbing, and that sets the starting aids (amendment (b) › What "beginner to pro" means here).
- **Wall bays.** One per built-in sample wall. Entering a bay opens that wall.
- **New wall door.** Opens your own photo (task C8 wires it to Play).
- **Setting Room door.** Today's Studio, at `#/studio`.
- **Lockers.** Change your level answer.

User stories:
- When I open the site, I'm in a gym, not a form. I can tell straight away what I can walk to.
- I tap a wall bay, my climber walks there and I'm on that wall. "◀ Gym" brings me back to the same spot.
- As a pro, I get to the Setting Room or my own photo without a tutorial in the way.
- On a keyboard or a switch, I can reach every place without the canvas.

**Not in v0:**
- stars, badges, route cards, saving anything (step 5, `progression`);
- the tutorial rooms, coach lines, haptics (step 6, `game-feel`);
- outfits or a look picker;
- any hub toy that touches a stance, verdict or star;
- the pixel murals and the mosaic step-in (pillars §4, still proposed).

## Decisions

| # | Topic | Decision | Why |
|---|---|---|---|
| G1 | Layout | One straight floor, left to right: **Front desk** · **Lockers** · one **bay per sample** (now 2) · **New wall** door · **Setting Room** door. Places are evenly spaced 56 art px apart. The world is wider than a phone, so a camera follows the climber. | A fixed, readable order. Adding a sample adds a bay, with no layout work. |
| G2 | Art grid | The hub canvas is **108 art px tall**. It fills the width of the screen and is `min(60dvh, 108·P_css)` tall. The art pixel size is P = `max(Pmin, floor(cssHeight·dpr / 108))` whole device pixels (pixel-kit P2's `minPixelSize`). | Whole device pixels at every dpr, the same rule as the wall layer. |
| G3 | Drawing | Draw through pixel-kit's indexed `PixelBuffer` and `blit`, with its `COLOR` palette, `rasterText` and outline rule. Static scenery is rasterised once per size into a cached buffer, and each frame copies that buffer and adds the climber, people and prompts. | Exact text snapshots in unit tests (no canvas in jsdom), one `putImageData` a frame. |
| G4 | Hub sprites | The **side-view walk cycle** (4 frames), the idle pose (2 frames) and the front-desk character are drawn **in this module**. They are original grids in pixel-kit's grid format, stamped by a tiny local helper, with an ink outline. *Builder's call:* this settles pixel-kit Open Question 2, because the hub's sprites are the hub's concern and pixel-kit exports no sprite stamper. If the user prefers one sprite home, it becomes a pixel-kit amendment later. | Keeps step 3 from waiting on a pixel-kit API change (ask-first). |
| G5 | Moving | **Tap or click the floor**: the climber walks to that x at 72 art px/s. **Tap a place**: it walks there and the place's prompt opens on arrival. **Keys:** ←/→ walk, Enter/Space/↑ use the place you are at. Walking is a pure function, `step(state, input, dtMs) → state` (`walk.ts`), with no clock or randomness inside. | Deterministic, so it is unit-testable. The DOM strip (G7) is the non-pointer path. |
| G6 | Prompts | Arriving at a place shows a pixel prompt above it (for example "B1 ▲") and a DOM button with the same action. Using it navigates: bay → `#/wall/<id>`, Setting Room → `#/studio`, New wall → the file picker (C8), desk → the level question, lockers → the level question with the current answer selected. | One action per place, and always reachable without the canvas. |
| G7 | Quick travel | A `<nav aria-label="Gym">` strip of real buttons below the canvas, one per visible place. Each button walks there or, under reduced motion, cuts there, then uses it. | Accessibility and fast travel (pillars §4 idea, adopted here as a requirement because amendment (b) SC 2 needs "≤ 2 taps"). |
| G8 | Level question | Asked by the front-desk character, Mags, in a DOM dialog on the **first hub visit of the session**. The question is "How long have you been climbing?", with three answers: "I'm new to climbing" → `beginner`, "I climb in gyms" → `gym`, "I climb hard, set or coach" → `pro`. The dialog can be dismissed, which counts as `gym`. The answer goes into an in-memory **profile** slice whose type is the future `progression` profile. | Amendment (b): asked once and changeable at the lockers. Saving it is step 5. |
| G9 | What the level changes in v0 | **Beginner:** the climber walks to the first bay after answering, and the Setting Room door is **not drawn and not in the strip** (amendment (b) OQ 2, settled: hidden until the first send, which arrives in step 4). **Gym:** nothing is hidden. **Pro:** nothing is hidden, and the strip lists the Setting Room and New wall first. `#/studio` always works for everyone. | Defaults only, never a gate (amendment (b): "No grade gate"). |
| G10 | Bay names | Bays are signed **"Wall 1"**, **"Wall 2"**, … in sample order. The sample's own name and credit show inside the wall (Studio's `SampleCredit`). | No gym or third-party name painted into the game world (pillars cut list; the licence question is still open). |
| G11 | The Studio while in the gym | The Studio (`App`) is **lazy-loaded** on the first visit to `#/studio` or a wall, then stays mounted, with the `hidden` attribute, while the hub shows. C1 already keeps it at one place in the tree. | The hub's first paint doesn't wait for the Studio's bundle (SC 1), and a route built in the Setting Room survives a walk in the gym. |
| G12 | Until Play lands (C5) | `#/wall/<id>` opens the Setting Room with that sample loaded. If a different photo already has a route, the Studio's own replace confirm appears. C5 then points the route at the Play screen. | The bay already leads somewhere real during C3, with no placeholder screen. |
| G13 | Back to the same spot | Leaving the hub remembers the climber's x and facing in memory. "◀ Gym" restores them. A first visit starts at the desk. | "◀ Gym returns to the hub at the same bay" (C5 acceptance). |
| G14 | Motion and sound | Under `prefers-reduced-motion`: no walking (the climber cuts to the target), no idle bob and no camera easing. Sound uses pixel-kit's `useSfx` (muted by default) and `SoundToggle` in the hub's top bar: `tick` when a place is used. | SPEC-game › Boundaries › Always. |
| G15 | Drawing pace | The canvas redraws only while the climber walks, the camera eases, or the idle bob or prompt changes frame. Otherwise it sleeps until the next frame change, like pixel-kit's `nextChangeAt` (P10). | Battery, and ≥ 30 fps while walking. |

## Interface (`src/modules/gym-hub/index.ts`)

```ts
export type Level = 'beginner' | 'gym' | 'pro';
export interface Profile { level: Level; hints: boolean; numbers: boolean }
export const DEFAULT_PROFILE: Profile; // gym, hints off, numbers off
export function profileFor(level: Level): Profile; // amendment (b)'s table

export type PlaceKind = 'desk' | 'lockers' | 'bay' | 'new-wall' | 'setting-room';
export interface Place { id: string; kind: PlaceKind; x: number; label: string; sampleId?: string }
/** The places for this level, in floor order (G1, G9). Pure. */
export function placesFor(level: Level, samples: readonly { id: string }[]): readonly Place[];

export interface WalkState { x: number; facing: 1 | -1; targetX: number | null; frame: number; phaseMs: number }
export type WalkInput = { kind: 'goto'; x: number } | { kind: 'hold'; dir: -1 | 0 | 1 };
/** Pure and deterministic (G5). */
export function step(s: WalkState, input: WalkInput | null, dtMs: number, bounds: [number, number]): WalkState;
export function placeAt(places: readonly Place[], x: number): Place | null; // within ±8 art px

/** The hub screen: canvas + prompt + quick-travel strip + level dialog. */
export function HubScreen(props: {
  onUse: (place: Place) => void; // the app root maps a place to a route
}): JSX.Element;
```

The profile slice lives in `src/store/profile.ts` (in memory). `progression` adds persistence in step 5 without changing the type.

## Project Structure

```
src/modules/gym-hub/
  index.ts         public API
  places.ts        placesFor, placeAt                  (+ .test.ts)
  walk.ts          step                                (+ .test.ts)
  sprites.ts       walk/idle/desk grids, local stamper (+ .test.ts, exact buffer snapshots)
  render.ts        renderHub(buf, scene) → buffer      (+ .test.ts, exact snapshots)
  HubScreen.tsx    canvas loop, prompt, strip          (+ .test.tsx)
  LevelDialog.tsx  the front-desk question             (+ .test.tsx)
src/store/profile.ts (+ .test.ts)
src/app/Root.tsx   maps routes and places; lazy-loads App (G11, G12)
e2e/hub.spec.ts
```

Imports follow the map: `gym-hub` imports only `pixel-kit` (through its `index.ts`) and React. The app root wires it to the Studio and the store.

## Code Style

The same as SPEC.md and SPEC-game. Example of the expected shape:

```ts
// src/modules/gym-hub/walk.ts
/** 72 art px/s (G5). */
export const WALK_SPEED = 0.072;

/** Pure: the same state, input and dt always give the same next state. */
export function step(s: WalkState, input: WalkInput | null, dtMs: number, [min, max]: [number, number]): WalkState {
  // ...
}
```

## Acceptance Criteria

1. **Opens into the gym.** `/` and `#/` render the hub: the canvas, the prompt area and the quick-travel strip. No Studio heading is visible.
2. **First tap within 2 s** (amendment (b) SC 1): on the Pixel 7 E2E profile with 4× CPU throttle, a strip button is enabled and the canvas has painted within 2 s of navigation. The Studio's bundle is not requested before the first Studio or wall visit (G11).
3. **Places:** `placesFor('gym', SAMPLES)` returns, in order, desk, lockers, Wall 1, Wall 2, new-wall, setting-room, 56 art px apart. For `beginner` there is no setting-room. For `pro` the strip order puts setting-room and new-wall first (G9).
4. **Walking:** `step` moves at `WALK_SPEED`, stops exactly on the target without overshooting, never leaves `bounds`, turns `facing` towards the target, and advances the walk frame every 125 ms while moving. The same inputs always give the same output (a snapshot over 100 steps).
5. **Using a place:** tapping a bay walks there, and using it navigates to `#/wall/<sampleId>`. Before C5, that opens the Setting Room with the sample loaded (G12). Setting Room → `#/studio`, desk and lockers → the level dialog.
6. **≤ 2 taps to the Setting Room** (amendment (b) SC 2) for `gym` and `pro`, through the strip. The Studio's full E2E suite still passes at `#/studio`.
7. **Back to the same spot:** after Wall 2 → "◀ Gym", the climber stands at Wall 2 facing the same way (G13).
8. **Level question:** shown once a session, on the first hub visit. Each answer sets the profile from amendment (b)'s table. Dismissing it gives `gym`. The lockers reopen it with the current answer selected. Focus moves into the dialog and back to the strip when it closes. It works by keyboard.
9. **Beginner door rule:** with `beginner`, the Setting Room door is not drawn and not in the strip, but `#/studio` still opens it (G9).
10. **Keyboard path:** with the canvas focused, ←/→ walk and Enter uses the place you are at. Every action is also in the strip, so the hub works with the canvas never focused.
11. **Reduced motion:** with `prefers-reduced-motion: reduce`, using a strip button moves the climber to the place in one frame, and there is no idle bob (E2E with emulated media).
12. **Pixels:** sprite and scene snapshots are exact (`bufferToText`). Every sprite has a 1 px ink outline (pixel-kit's outline rule). Hub text uses the 5×7 font, except the dialog and buttons, which use system-font DOM text.
13. **Phone:** at 375 px wide there is no horizontal scroll, every strip button and the dialog answers are ≥ 44 × 44 CSS px, and the canvas is never taller than 60 dvh.
14. **Performance:** ≥ 30 fps while walking on the Pixel 7 profile at 4× throttle (`hub-timing`). When idle with reduced motion, no frames are drawn after the first paint.
15. **Originality:** a recorded review for the walk cycle, the idle pose and the front-desk character before merge (SPEC-game › Never). Mags's silhouette follows pillars §4 only if the user approves the pillars, and is otherwise an original design noted in the review.
16. **Accessibility:** the canvas is `aria-hidden`, and the strip, prompt button and dialog carry all meaning. Lighthouse accessibility ≥ 95 on `/`.

## Testing Strategy

| Level | Covers |
|---|---|
| Unit (Vitest) | `placesFor`, `placeAt`, `step` (AC 3, 4), sprite and scene buffer snapshots (AC 12), profile slice (AC 8's mapping) |
| Component (Testing Library) | Strip buttons and their actions, the level dialog's focus and answers, beginner door rule (AC 5, 8, 9) |
| E2E (Playwright, desktop + Pixel 7) | `e2e/hub.spec.ts`: AC 1, 2, 5, 6, 7, 10, 11, 13. The Studio suite at `#/studio` stays green |
| Timing | `hub-timing`: fps while walking at 4× throttle (AC 14). CI is the reference, because local load spikes distort timing |

## Boundaries

- **Always:** keep the Studio unchanged (only Root, routes and the room bar around it); phone first; reduced motion; sound muted by default; exact pixel snapshots for new art.
- **Ask first:** any pixel-kit API change (for example exporting `stampSprite`); new dependencies; any Studio component change; anything that saves to storage before step 5.
- **Never:** paint a real gym's name, logo or route codes into the world; let a hub element affect a stance, verdict or star; copy sprites, characters or layouts from existing games.

## Open Questions

1. **Sprite home (G4):** the hub's sprites live in `gym-hub` with a local stamper (proposed). Or should they go into pixel-kit through an amendment that exports `stampSprite`?
2. **Bay names (G10):** "Wall 1", "Wall 2" (proposed), or the samples' own names once the licence question is answered?
3. **Mags's look (AC 15):** wait for the pillars decision, or draw her now from pillars §4's description and treat that one item as approved?

## Amendment 2026-11-01: The Hall Is a Converted Castle

Status: **APPROVED 2026-11-01** (the user said "yes" to the castle or church theme as task C3b). The choice of a castle over a church is a builder's call (roles: world designer, pro climber):
- a castle's long great hall maps onto the side-view floor (G1), with each wall bay set in an arch;
- a castle avoids the religious-imagery risk in Boundaries › Never;
- switching to a church later changes only the scenery.

**What it is.** Bloc Hall is an indoor climbing gym inside an **original, fictional converted European castle**. Real climbing centres in historic buildings exist, so the setting fits climbing culture. No real venue is named, drawn or copied (G10, Never). The climbing is unchanged: real indoor walls and real photos, judged by the same referee.

**What changes (scenery and props only)**

| v0 element | Castle version |
|---|---|
| Plain back wall, beams | Stone masonry (`slate`, `dusk`, `ink`), and a timber roof with trusses (`skinDeep`, `brick`) |
| Lamps | Wrought-iron lanterns, with **static** warm light pools on the mats as dither (`sun`, `ember`). No flicker animation, so no flashing and no reduced-motion issue |
| Windows (new, background only) | Tall arched leaded windows with coloured glass (`tide`, `bloom`, `lime`, `sun`). Their light falls on the floor as static dither |
| Wall bays | A climbing wall set in each stone arch between buttresses, with a carved "Wall n" plaque |
| Front desk | A timber gatehouse counter. Mags stands behind it, unchanged |
| Lockers | A row of iron-banded wooden chests |
| New wall door | An arched oak door |
| Setting Room door | A low door to the "workshop" in a tower stair |
| Banners (new, decoration) | Original heraldic banners in simple shapes (chevron, bend, quarters) and palette colours. **No real coat of arms** |

**What does not change:**
- places, the order and spacing of the floor, walking, the strip, routes and the level question;
- the climber and Mags sprites;
- the palette: all 16 existing colours, with no new hex values;
- sound;
- every Play, referee and Studio behaviour.

Rendering never feeds back into rules (SPEC-game › Code Style), so this is a theme pass on `render.ts` and the prop sprites.

**Never (added):**
- real coats of arms;
- real castle, church or venue names and layouts;
- religious iconography;
- castle art copied from games (for example the *Castlevania* or *Zelda* castles).

**Acceptance (C3b):**
1. The scene snapshots are updated, and every new grid is marked `// original, drawn for Bloc Hall`.
2. Pixel text on stone stays readable: the signs and prompts keep their ink outline.
3. Nothing animates except the existing climber and idle frames. With reduced motion the frame count stays at 0 after the first paint (AC 14).
4. A recorded originality review of the scenery, windows, banners and props before merge (AC 15).
5. AC 13 still holds at 375 px. All hub E2E tests pass.

## Check Results

- **AC 15, originality (2026-11-02, fresh reviewer, from memory with no web access): pass.** Nothing in the walk and idle frames, Mags, the hold shapes, the "+" or the ▲ is close enough to change, and nothing is a copy.
  - **Side-on view.** The hub shows the climber side-on, which removes the back-view argument the pixel-kit AC 48 review leaned on. The nearest associations are colour and genre conventions only: Celeste's Madeline (red top, a side-view climbing game), and Mario (red on top; no brim, emblem, moustache or overalls here).
  - **Mags.** Nearest in role and colour: Animal Crossing's Isabelle (yellow clerk, green vest) and Pokémon's Elesa (blonde bob, headphones). Neither one's identifying features are present.
  - **Fix applied:** Mags's headset band moves from ink to slate, so the headset reads on screen as described (task C3b branch).
  - **Note for testers:** a white "+" on an orange door could read as first aid. The "NEW WALL" sign carries the meaning.

## Amendment 2026-11-02: Walking With ←/→, and No Level Question Yet

Status: **APPROVED 2026-11-02** (user: "approve"), from the user's play-test feedback ("add walking by left right direction in homepage"; "remove redundant talking window of asking level in both front desk and fitting room, design behavior later").

| # | Change | Builder's call (role), grounded reason |
|---|---|---|
| W1 | **← / → walk the climber anywhere on the gym page,** not only when the floor has focus. This applies while no dialog or text field has focus; held keys walk and release stops. Enter or ↑ still use the place you're at. | Game designer, feel. In platformers the direction keys move the character without clicking on it first, and WCAG 2.1.1 requires every action to be possible by keyboard. |
| W2 | **On-screen ◀ ▶ buttons** under the canvas (≥ 44 px, press and hold to walk) for touch screens. They're hidden on devices with a fine pointer only (`@media (hover: hover) and (pointer: fine)`). | Game designer, feel. A virtual D-pad is the mobile-platformer convention, and Apple's HIG sets 44 pt touch targets. |
| W3 | **The level question is removed,** both the first-visit dialog and the lockers. Everyone starts with `DEFAULT_PROFILE` (gym). The Play screen's Aids menu still toggles hints and Numbers. | **User decision 2026-11-02.** This supersedes amendment (b)'s "Mags asks once". |
| W4 | **The front desk and lockers stay in the scenery but do nothing for now.** Their strip buttons are hidden, and their prompt shows only the place name, with no action button. Their behaviour will be designed later. | Game designer, feel. Nielsen's heuristics say not to show a control that does nothing. |
| W5 | **Consequences of W3:** with no beginner answer, a beginner's hidden Setting Room door (G9) and the walk to Wall 1 can't happen. The code stays and is unreachable until the level is asked again. | Technical director. It keeps the later redesign cheap. |

Acceptance: `/` shows no dialog. ← / → walk the climber without focusing the floor, and the ◀ ▶ buttons walk it on a touch profile. The strip has no Front desk or Lockers button. Every other gym AC still passes.

## Amendment 2026-11-06: No Sample Credit Line (ADR-0003)

**G10, amended.** Bays still read **"Wall 1"**, **"Wall 2"**, … in sample order. There is no sample credit line: both samples are the owner's own photos ([ADR-0003](docs/adr/0003-public-repo.md) (c)), so there is no source to name, and the Studio's `SampleCredit` is removed. The picker still lists each sample by its own name ("Sample wall A").

- **Test.** `ImageInput.samples.test.tsx` (SPEC-image-input AC S5): no sample shows a `.sample-credit` element.

## Amendment 2026-11-10: The Gym Moves to #/gym (SPEC-launch-wall-2 R3)

**AC 1, amended.** `#/gym` renders the hub. `/`, `#/` and any unknown hash open Wall 2's Play screen
(`#/wall/wall-b`), which has no "◀ Gym" link; other walls keep theirs, and the Setting Room's bar
still links to the gym. The gym's code stays until the follow-up that deletes it (SPEC-launch-wall-2
decision 2).

- **Test.** `src/app/route.test.ts`, `src/app/Root.test.tsx`, `e2e/routes.spec.ts`.

## Amendment 2026-11-10: One Bay, Named by Its Sample

**G10, amended.** A bay's name is its sample's `name`, so the one bay reads **"Wall 2"**
(SPEC-launch-wall-2 R1 removed Wall 1). The places keep their 56 art px spacing, so Wall 2 now
stands where Wall 1 did (art x 140) and New wall at 196.
- **Test.** `places.test.ts`, `e2e/hub.spec.ts`.
