# Spec: Bloc Hall, a Plan-the-Beta Game (Play mode)

Status: capability map **approved 2026-10-31**. Module specs follow in build order, each reviewed before code.

## Objective

Turn bouldering-vis into a fun game for **gym climbers, V0–V5**. They plan the *beta* (the sequence of moves) for a route on a **real wall photo**, and an honest physics model referees every stance. Then they watch an **original pixel-art climber** send it.

The core loop:

1. In a walkable pixel-art gym, walk up to a wall. A wall is a real photo with a tagged route: a sample, or the player's own.
2. Plan the climb move by move: tap a limb, then a hold. After each move the solver says whether the stance can be held, and why not if it can't.
3. Press **Send** to watch the climber climb the beta. It falls where a move fails.
4. Get 1–3 stars and style badges. These unlock outfits, and show up on the wall in the gym.

Success means:

- a V0–V5 climber can plan and send a beta on the sample wall in under 3 minutes on a phone;
- the moves the game accepts are ones a real climber could hold (the solver's verdict, never faked);
- the climber learns why ("feet would cut — find a foothold").

Decisions (2026-10-31, user):

- **Core loop:** plan the beta, then watch it.
- **Player:** gym climbers, V0–V5.
- **Scope:** a **Play mode beside the Studio**. The current analyzer stays as Studio, unchanged.
- **Device:** phone first.
- **Art:** the **real wall photo** with a **pixel climber, markers and HUD** on top.
- **World:** a **walkable side-view pixel gym hub**.
- **Character and sound:** an **original pixel climber** with a few outfits, plus chiptune sound effects synthesised in the browser, **muted by default**.

## Capability Map

| Module id | Responsibility | Depends on |
|---|---|---|
| `climber-stance` *(existing, amended)* | Real footholds from the wall mask ("any feet"); a sloper cone along the hold's surface normal. Trunk rotation comes later. | — |
| `beta-moves` | Pure logic. A beta is an ordered list of stances, and each move changes 1–2 limbs. Checks legality (reach from the previous stance, the new stance can be held) and detects a fall. | `climber-stance` |
| `pixel-kit` | The 8-bit layer, all original: the pixel climber drawn from solver joints, palette, hold markers, chalk puffs, HUD, pixel font, and synthesised chiptune sound effects. | — |
| `play-shell` | The phone-first Play screen: the real photo with the pixel layer, and a move tray (limb → hold, Undo, Send). Switches between Studio and Play. | `beta-moves`, `pixel-kit` |
| `move-animation` | The send replay: tweens between stances with planted contacts; slip and fall animations. | `beta-moves`, `pixel-kit` |
| `scoring` | Send or fall, move count, effort, style badges, 1–3 stars. | `beta-moves` |
| `progression` | A per-device save in the browser: stars, badges, outfit unlocks, custom walls. | `scoring` |
| `gym-hub` | The walkable side-view pixel gym. Wall sections are levels with their stars shown. Also a "New wall" door and a badge board. | `pixel-kit`, `progression` |
| `game-feel` | Tutorial on the sample wall, coach tips from diagnoses, the send celebration, and haptics. | `play-shell`, `scoring` |

```
climber-stance → beta-moves ─┬→ play-shell ─┬→ move-animation
pixel-kit ───────────────────┘              ├→ scoring → progression → gym-hub
                                            └→ game-feel (with scoring)
```

**Build order** (one branch and PR per step):

| Step | Modules | Result |
|---|---|---|
| 1 | `climber-stance` amendment | Starts become holdable: real feet, real numbers. |
| 2 | `beta-moves` and `pixel-kit`, in parallel | — |
| 3 | `play-shell` | **First playable**: plan a beta on the sample wall. |
| 4 | `move-animation` and `scoring`, in parallel | Send, watch, get stars. |
| 5 | `progression`, then `gym-hub` | The walkable gym. |
| 6 | `game-feel` | Tutorial, polish and haptics. |

Module specs: `SPEC-climber-stance.md` (amendment), `SPEC-beta-moves.md`, `SPEC-pixel-kit.md`, then the rest as each step starts.

## Tech Stack

The same as `SPEC.md` (Vite, React 18, strict TypeScript, Zustand, Vitest, Playwright, transformers.js in a worker). Additions:

- **Canvas 2D at low internal resolution, scaled up with `image-rendering: pixelated`** for the pixel layer. No game engine.
- **Web Audio API** for synthesised sound effects (oscillators and noise). No audio files and no audio library.
- **Pixel font:** an openly licensed (OFL) pixel font, self-hosted, or an original bitmap font. Adding it is an *ask-first* dependency (see `SPEC-pixel-kit.md`).
- **Browser storage** (`localStorage`) for progression, wrapped in try/catch so the game still runs without it.

## Commands

Unchanged from `SPEC.md` (`npm run dev | build | test | e2e | lint | format`).

## Project Structure

```
src/modules/
  climber-stance/   → amended (anyFeet.ts, cones.ts)
  beta-moves/       → pure move model, no React
  pixel-kit/        → sprite rasteriser, palette, HUD components, sfx.ts
  play-shell/       → Play screen + Studio/Play switch
  move-animation/   → replay tweening
  scoring/          → stars, effort, badges
  progression/      → save/load, unlocks
  gym-hub/          → walkable hub scene
  game-feel/        → tutorial, coach tips, celebration, haptics
SPEC-game.md, SPEC-<module-id>.md
```

The same rules as `SPEC.md`: each module exposes `index.ts` only, and imports follow the arrows above.

## Code Style

The same as `SPEC.md`. Game logic is pure and deterministic, so a beta replays identically:

```ts
// src/modules/beta-moves/check.ts
import type { Stance } from '../climber-stance';

export interface MoveCheck {
  legal: boolean;
  /** Why not, in climbing words (from the solver's diagnosis). */
  reason: string | null;
  stance: Stance;
}

/** Pure: the same beta and holds always give the same verdicts. */
export function checkMove(prev: BetaStep, next: BetaStep, ctx: MoveContext): MoveCheck {
  // ...
}
```

- No timers or `Math.random()` in game logic. Randomness (for example, chalk-puff jitter) uses a seeded generator in `pixel-kit`.
- Rendering never feeds back into rules: the pixel layer only draws what the logic decided.

## Testing Strategy

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Move legality, fall detection, scoring, unlocks, sprite rasterising (exact pixel snapshots), sound-effect envelopes (parameters, not audio) |
| Component | Vitest + Testing Library | Move tray, Undo, Send, star display, the Studio/Play switch |
| E2E | Playwright (desktop + Pixel 7, fake models) | Sample wall → plan a 3-move beta → Send → stars appear; hub walk → enter wall; save survives a reload |
| Real-model check | The recorded real-model session script | The sample wall B1-03 is playable to a send with real models |
| Pro playtest | Reviewer agent (pro-climber persona) | Is it fun, honest and clear? A ranked issue list for each step |

- Coverage ≥ 80% on the pure logic in `beta-moves`, `scoring` and `progression`.
- Every bug fix comes with a regression test. Never skip or delete a failing test.

## Boundaries

**Always**
- Keep the photo realistic and the physics honest: a send is the solver's verdict.
- Keep Studio working, with its tests green.
- Phone first: a 16 px gutter, no horizontal scroll, one-handed taps of at least 44 px.
- Sound muted by default; honour `prefers-reduced-motion` (skip the tweens, show the end stances).
- One commit per task, and a branch per step.

**Ask first**
- New dependencies (the pixel font, any audio or game library).
- Changes to Studio's behaviour or the capability map.
- Any network feature (leaderboards, sharing betas, accounts).

**Never**
- Copy characters, sprites, music, level layouts or UI from existing games. Everything is original.
- Upload players' photos.
- Train or serve models on a GPU (memory `no-gpu-budget`).
- Deploy without the user's explicit "merge and deploy".

## Success Criteria

1. On the sample wall (B1-03), a player plans and sends a beta with real models on a phone in under 3 minutes. The default start stance can be held, and the weight shares are real numbers.
2. Every illegal move gives a reason in climbing words, and Undo always restores the previous stance.
3. The send replay keeps every planted contact on its hold (within 2 px at the working resolution) and plays at ≥ 30 fps on a mid-range phone.
4. Stars and badges persist across reloads, and the game still works with storage blocked.
5. The hub runs at ≥ 30 fps on a phone, and every wall in it opens its level.
6. All of `npm test`, `npm run lint`, `npm run build` and `npm run e2e` pass. Lighthouse accessibility stays ≥ 95.

## Open Questions

- The badge list and star thresholds (`scoring` spec).
- Outfit count and unlock pacing (`progression` spec).

## Amendment 2026-11-01: Design Pillars and Game Feel (studio design pass)

Status: **PROPOSED**. This amendment brings together four design proposals (feel, teach, world, mastery) and a technical review. It keeps only the items the review marked Keep or Change, with the review's changes applied. It changes no approved decision. Every item that touches an approved or in-progress spec is marked below.

All content is original. No copy, credit or store text may describe Bloc Hall as being in the style of any studio, or present it as any company's product.

### 1. Design pillars

1. **Every pose you see was checked.** The referee is the only source of a verdict.
   - *This means:* the screen shows only these:
     - solved stances;
     - the solved pivot;
     - in-betweens of two solved stances with planted contacts;
     - the dithered ghost, which always means "can't hold";
     - the plain fall drop.
   - *This does not mean:* stiff motion. Wind-ups, freezes, chalk and camera moves are fine as long as no pose suggests a hold the solver did not approve.
2. **Thinking is the game, and the machine answers on the beat.**
   - *This means:* the player's thinking time is never timed or scored. Every tap answers within one frame, and every verdict arrives with the same rhythm.
   - *This does not mean:* timers, speed stars, or the game making choices for the player.
3. **The photo tells the truth, and the pixels are where you play.**
   - *This means:* the wall photo is never filtered or tinted. Every game element is pixel art with a 1 px ink outline. In the hub, an ink outline means "you can tap this".
   - *This does not mean:* pixel decoration covering holds during planning.
4. **Falling is free, and every fall teaches.**
   - *This means:* previews cost nothing, and each fail points to a limb and to the kind of fix it needs.
   - *This does not mean:* an answer key. Help grows only when the player is stuck.

### 2. The core loop, second by second

| Phase | Who | Budget |
|---|---|---|
| Read the wall, choose a limb | player | 5–20 s, never rushed |
| Tap a limb, tap a hold (highlight on pointerdown, commit on pointerup) | player | 2 taps |
| **Ack:** target ticks lock on, the hand opens, the reach line is drawn, `tick` plays | machine | first paint ≤ 50 ms after pointerup, painted *before* the solve starts |
| **Coil:** this frame holds while `checkMove` runs in its own task | machine | verdict at `max(solve, 80 ms)`, ≤ 260 ms worst case at 4× throttle |
| **Catch (hold):** pivot key frame, then the new stance with the hand open, then grip, puff and `grab` together | machine | 60 + 50 ms |
| **Catch (deadpoint):** a one-frame coil in `strain` (the pivot fails, so this frame must never look settled), then a 60 ms freeze on the catch | machine | ≈ 1 frame + 60 ms |
| **Slip preview:** the ghost, the faulty limb outlined in bloom, and the reason | machine | same verdict budget |
| Read the result, decide | player | 2–5 s |
| Undo: the move plays backwards (new stance → pivot → previous) | machine | responds on pointerdown within 1 frame, finishes in 120 ms |

**Send replay.**
- Route read: 0.8 s, skippable.
- Each move goes previous stance → pivot (the hips lead) → new stance:
  - static hand 420 ms;
  - foot 320 ms;
  - deadpoint 300 ms.
- Moves are animated with key-pose snaps or limb IK. Joints are never lerped, so bones never stretch.
- Camera: a critically damped vertical follow. P stays locked for the whole replay, and zoom is ≤ 1.21× (the fit art height is 49.7 and the cap is 60).
- A fall leaves the view in about 400 ms and lands on the pixel mat. A "Fell at move N · Fix move N" card follows. Retry is ≤ 300 ms after the tap.
- Skip: the first tap plays at 3× speed, a second tap jumps to the result.

**Top-out.**
- A 100 ms freeze on the match, then chalk bursts from both hands.
- Stars land on the `send` jingle's last three notes (0.12, 0.24 and 0.36 s), with the same timing when sound is muted.
- The climber stays on the finish.

**Reduced motion.** Cuts between end stances, every 500 ms or on tap. No freezes, puffs or camera moves. Colour, outlines and words carry all meaning.

### 3. First-time experience and the tutorial course

- **The first wall opens in under 2 s.** Course walls are baked: holds with their boxes, `wallFeet` and a provenance note, saved as static JSON loaded by the app root. The physics still runs live. Each bake gets a human review of the wall footholds, because a route sign currently passes as a foothold.
- **Expectation line, shown once:** "The solver checks whether a stance can be held. It doesn't model strength or dynos."
- **The hub is earned.** After the first send, the climber walks out into the gym.
- **Rules in all three rooms:**
  - `dynamic: false`;
  - Smart limb off;
  - text only from the solver;
  - warm-up problems carry tier names, never V-grades.
- **Content gate:** every problem ships with a reference beta that passes `checkBeta`. Every solver behaviour a room relies on gets a fixture test *before* the content is designed.

| Room | Wall | The one idea |
|---|---|---|
| **A. Three on, one moves** (2-limb chip hidden) | A1 Meet | One chip glows and one hold pulses: a guaranteed grab |
| | A2 Grow | A 4-move ladder. The player chooses the order |
| | A3 Twist | Lifting the right foot causes a barn-door. Move the other foot first |
| | A4 Prove | Send with no committed falls. Par = the reference move count |
| **B. Legs lift you** | B1 Meet | The hand hold is just out of reach: "move your feet up first" |
| | B2 Grow | A feet-hands-feet-hands ladder. Load pips show the weight moving onto the feet |
| | B3 Twist | "What if this wall leaned out 20°": smears are gone, so real footholds keep the pump meter low |
| | B4 Prove | Peak effort at or below the level's threshold |
| **C. Hips over feet** | C1 Meet | A pixel plumb line from the hips (`com` along `gravity`). Get it between your feet |
| | C2 Grow | A sloper slips until a foot goes under it |
| | C3 Twist | All contacts on one line cause a barn-door. Add a contact on the other side |
| | C4 Prove | Send using the sloper |

**After the rooms, the tray grows with the player.**
- The 2-limb chip arrives at tier 2.
- `feet: 'marked'` and slopers arrive at tier 3.
- Match and deadpoint arrive at tier 4.
- Steep what-if variants arrive at tier 5.
- Star thresholds come from each level's reference-beta profile.

**Coach hints.**
- Tier 1: the ghost and the solver's reason.
- Tier 2, the same mistake repeated: the *kind* of fix lights up (the feet chips, nearer holds, the plumb line).
- Tier 3, "Show a move that holds", needs approval (Q1). It would run at most 8 cached checks, one per task, behind a "thinking" state. It is never labelled as "the next move".

**The Course.** The B1 routes after tagging, each with a reference beta. Neutral names ("Wall A · line 3"), grades labelled "setter grade". This waits on the licence answer (Q4).

### 4. World and characters

- **The frame.**
  - Above the photo: a 3 art px slate ceiling beam with a lamp.
  - Below the photo: a 6 art px navy crash mat with stitched seams.
  - Both sit outside the photo box (about 17 CSS px together). A committed fall lands on the mat in a sprawled sprite, and the mat compresses by 1 px for 120 ms.
- **The step-in.**
  - Each hub bay shows a 40×56 dithered pixel mural of its photo, rebuilt from the photo, never stored.
  - Tap it: the climber turns, the mural scales up, and a mosaic resolves to the real photo (5 steps of 90 ms).
  - The start brackets snap in, then the finish flag pops up.
  - It runs in reverse on exit, can be skipped, and is a cut under reduced motion.
- **The hub (v1, four zones).**
  - Front desk with the badge board.
  - Wall bays, each drawn at its angle.
  - Lockers with a mirror.
  - The "New wall" door, with the sign "STAYS ON YOUR PHONE".
  - Tap to walk. No hub toy ever affects a stance, a verdict or stars.
  - After a send, the bay gets a taped route card with its stars.
- **Cast (v1, two characters).** Speech is a DOM bubble, one line per visit. Characters never give a verdict of their own; any coach tip uses the solver's text word for word. They never climb. Their names and silhouettes go through an originality review.
  - *Mags Holloway*, front desk: seen chest-up, a tall round bun with a pencil through it, half-moon glasses on a beaded cord, a bloom cardigan, a mug with a 2-frame steam curl. She stamps the punch card once per star.
  - *Dez Farrow*, route setter: tall and slightly hunched, a lumpy mesh sack of holds over one shoulder, a drill in a hip holster, a dust mask at the neck. Few words: "Read it from the mats first."
- **Sound words** (TOK, POK, FWUMP, TOP!) appear in the replay and in the hub only, never during planning.
- **Accessibility.**
  - The hub has a strip of real buttons below the canvas (Desk, Lockers, Wall A…, New wall) that also works as fast travel.
  - The Play screen gets a DOM path: a hold list and limb buttons usable by keyboard or switch, with verdicts announced through `aria-live`.
  - Text that needs translating is system-font DOM text. Pixel text is limited to digits and short labels.

### 5. Mastery and replay

- **Wall Card challenges.** A chip appears only when a reference beta for that variant passes in CI.
  - **Blind read:** verdicts stay hidden during planning (shape checks still run) and are revealed at Send.
  - **Setter's beta: N moves. Beat it.**
  - **Feet follow hands:** `feet: 'marked'`. This also answers beta-moves Open Question 8.
  - **No match below the finish.**
  - **Light arms:** only after hand `load.percent` has been measured for that variant.
- **Tilt remix.** After a send, "What if this wall leaned 20°" and further steps. The photo stays upright while the hub panel leans. A tilt the referee cannot send never appears.
- **Echo (approval needed, Q2).** v1 draws only the best beta's contact ticks, per move, beside the player's plan. Saved echoes are re-checked lazily when the wall card opens. If a rule change makes one fall, the card says so and keeps the old star, marked.
- **Daily wall: not in v1** (see cut list).
- **Technique cards.** Earned only from `MoveCheck` events in a legal send:
  - Match, Deadpoint, Cut and catch, Smear, Wall reader, Quiet arms;
  - Read the fall: the same variant, a different target for `Fail.limb` at step `fallAt`.
  - The deadpoint card uses the solver's tip text. There are no cards for moves the solver doesn't model.
- **Outfits.**
  - Skin and hair are free from the start.
  - `sunset`: the first tutorial send.
  - `moss`: the first tilt send.
  - `chalkdust`: 5 technique cards.
  - Chalk-bag rim: one row per 10 chips, up to 3.
- **Logbook.** Every send and chip, and a visible total ("Ticks 23 / 61").
- **Anti-dark-pattern charter**, as testable rules in the `progression` spec:
  - no timers, energy or lives;
  - no streaks that reset;
  - every unlock condition visible before it is earned;
  - no random rewards and no notifications;
  - progress never lost to a rule update;
  - the game still runs with storage blocked.

### 6. Audio and haptics palette

**Rule:** the picture comes first and carries all meaning. A haptic backs it up on Android only. Sound is muted by default and is flavour. Haptics and sound fire in the same rAF as the picture they belong to.

**Pitch grammar:** rising means success, a repeated pitch means a warning, falling means failure.

| Event | Sound (if on) | Haptic (ms) |
|---|---|---|
| Select a limb | `tick` | 15 |
| Hold | `grab-jug` / `-crimp` / `-sloper` / `-pinch` / `-pocket`, by hold type | 20 |
| Foot lands | `foot-hold`, or `foot-smear` for a smear | 15 |
| Deadpoint catch | `catch` (one effect; the proposed `deadpoint` sound is merged into it) | 30 |
| Slip preview | `slip` | [20, 40, 20] |
| Fall and mat landing | `fall`, then `mat-land` | [30, 60, 60] |
| Undo / redo | `rewind` | 15 |
| Top-out and stars | `send` (stars on its last three notes) | [20, 40, 20, 40, 60] |

- No haptic pulse is shorter than 15 ms.
- No visual flashes more than 3 times a second.
- The haptics toggle is hidden where `navigator.vibrate` doesn't exist.
- Each new effect needs a provenance comment, a mix-sum check and an originality review. No phrase is longer than 4 notes or quotes a melody.
- New wave: `pulse12`.

### 7. What changes in approved specs

| Module | Change | Mark |
|---|---|---|
| `climber-stance` | Expose the existing `hingeSide` as `Diagnosis.side`. Until it lands, every swing-side picture or hint is left out | needs a spec amendment + approval |
| `beta-moves` | `reachPreview(prev, limb, target, ctx)`, a pure wrapper over `reachRatios` (reach line, Smart limb) | needs a spec amendment + approval, as a follow-up after step 2 merges |
| `beta-moves` | Allow targeted speculative solves: Lift to test, Show a move that holds | needs a spec amendment + approval (Boundaries › Ask first) |
| `beta-moves` | Codec note: "persistable together with `ctx.key` and `BETA_RULES_VERSION`" (echo ticks, resuming a plan) | needs a spec amendment + approval |
| `pixel-kit` | **One post-merge bundle:** <br>• `BEATS` timing data<br>• the `flagged` limb<br>• reach-line styles that differ by shape (solid, gapped, broken)<br>• load pips (answers OQ 4)<br>• the plumb line<br>• the `tried` scuff mark<br>• export of `stampSprite` / `outlineMask` (answers OQ 2)<br>• new `SfxName` entries and `pulse12`<br>• bag-rim rows<br>• 4 launch outfits (OQ 6)<br>• `progression` owns the look (OQ 10)<br>• the echo tick mark<br>• an optional pennant<br><br>Re-check AC 3 and AC 48 | needs a spec amendment + approval, after step 2 merges |
| `play-shell` | Owns its own photo canvas and viewport (settles pixel-kit OQ 7 with no Studio change). Also:<br>• Ack/Coil/Catch scheduling<br>• forgiving taps: a tap on your own hand or foot selects that limb, and a match always needs the limb chosen first<br>• undo plays backwards, plus the beta strip (committed steps only)<br>• the Fix-it chip<br>• scuffs, shown only while the same previous step is current<br>• the fall-preview count<br>• loading baked course data<br>• the accessible DOM path | fits in the current step (step 3 spec) |
| `move-animation` | Replay timings, the camera cap, mat landing, top-out. The 6 px match shift vs SC 3's 2 px (pixel-kit OQ 9) must be decided before the replay acceptance test | fits in the current step (step 4 spec) |
| `scoring` | Chips, technique cards, par from the reference profile. Previews never count | fits in the current step (step 4 spec) |
| `progression` | Charter, logbook, outfit pacing | fits in the current step (step 5 spec) |
| Capability map, `progression` row | Add "betas (echo ticks, resume)" | needs a spec amendment + approval |
| `gym-hub` | New SPEC-gym-hub covering sections 4 and 5 | fits in the current step (step 5 spec) |
| `game-feel` | Rooms A–C, hint tiers 1–2, haptics, copy | fits in the current step (step 6 spec). Tier 3: approval |

"Fits in the current step" means the item goes into that module's own spec when its build step starts. Nothing here changes the running step-2 lanes.

### 8. New or changed success criteria

1. **SC 1, added to:** after tapping Play, the first course wall accepts a tap within 2 s on a mid-range phone.
2. **Tap response** (E2E, 4× CPU throttle):
   - first paint ≤ 50 ms after pointerup;
   - verdict paint ≤ 260 ms;
   - INP ≤ 200 ms;
   - undo starts within 1 frame;
   - retry after a fall ≤ 300 ms.
3. **Honesty test.** Every frame drawn in planning and replay belongs to one of the allowed pose classes, asserted from a render log.
4. **Replay camera.** Zoom ≤ 1.21×, and P stays the same for the whole replay.
5. **Content gate.** Every shipped level and chip has a reference beta that passes `checkBeta` in Node and in WebKit. Every ratio and feasibility value stays a named margin away from its threshold, and CI fails on a regression.
6. **Measure before scoring.** Hand `load.percent` on B1-03 Vertical is recorded in a fixture test before the scoring spec is written. If it is near 0, effort stars and Light arms are not used on that level.
7. **Lesson fixtures.** The A3 barn-door, the B3 loss of smears at 20° and the C2 sloper slip each have a passing fixture test before their content is built.
8. **Accessibility.**
   - The Play screen can be completed with the keyboard alone, with verdicts announced (E2E).
   - Lighthouse accessibility ≥ 95 on Play and on the hub.
   - No haptic pulse < 15 ms.
   - No more than 3 flashes a second.
9. **Originality.** A recorded review for every new character, name and sound before merge.
10. **Playtest.** A manual session with 5 real V0–V5 climbers:
    - at least 4 send problem A1 without help;
    - the median time to a first B1-03 send is under 3 minutes.
11. **Charter.** Each charter rule has a unit test.

### 9. Cut list

| Cut or deferred | Why |
|---|---|
| Reach halos | Speculative, and they work as an answer key |
| Room D "Long arms" | The solver doesn't measure arm extension |
| Room C's visibly locked door | It shows content that doesn't exist |
| "Hips in" lesson | Needs trunk rotation, which is deferred |
| Flash read | Contradicts "previews cost nothing". Replaced by Blind read |
| Swing direction worked out in play-shell or game-feel | That would be physics outside the referee. Wait for `Diagnosis.side` |
| Today's Wall | The pool is too small. Revisit after a content pack |
| Beta Code | Ask-first sharing, little value before launch |
| A full echo climber | It hides holds and needs a second climber in the scene. Contact ticks instead |
| Setter mini-game, custom walls as sealed levels | Large, and needs IndexedDB plus beta persistence. Later |
| Chalk dots on murals | Beta persistence. Waits on Q2 |
| Gym clock lighting | Mood only, with a heavy contrast-test cost. Deferred |
| Ivo and Tuck; training corner, chalk bucket, bell | Trimmed for v1. Ivo would show climbing poses nobody checked |
| Ambient sounds, most hub foley, the ghost wobble sound | Muted by default, so low reach, and each needs a review |
| Sound words during planning | No room at 343 px, and the picture already carries the meaning |
| Smart limb in Rooms A–B | It would make the choice the lesson teaches |
| A `course` module | Static JSON loaded by the app root is enough |
| Gym name, tape-colour branding, route codes, grade ladder from scraped grades | Third-party and real-organisation content |

### 10. Open questions for the user

1. **Speculative solving.** Approve targeted pre-solves (Lift to test, which warms the pivot cache; Show a move that holds) and the `reachPreview` export, as a follow-up beta-moves amendment?
2. **Beta persistence.** Approve saving betas on this device only (echo ticks, resuming a plan after a reload) and adding "betas" to the `progression` row of the capability map?
3. **`Diagnosis.side`.** Approve a small climber-stance amendment that exposes the existing barn-door hinge side?
4. **Licence.** May the B1 photo and its route data (scraped from a third-party site, naming a real gym) ship as game content under neutral names? *Answered in part 2026-11-01 (user):* our own tagging of B1-03, made in this app, ships as a baked level beside the already-public sample photo. No scraped route data ships (SPEC-play-shell › S9).

## Amendment 2026-11-01 (b): The App Opens Into the Gym, From Beginner to Pro

Status: **APPROVED 2026-11-01** ("approved as written"). Open questions 1 and 2 are settled as proposed; 3 and 4 stay open.

This amendment records three user decisions and what follows from them. Where it conflicts with the approved spec above or with the design-pillars amendment (still PROPOSED), this amendment wins. Items that change an approved decision are marked **supersedes**.

### Decisions (2026-11-01, user)

1. **The whole app opens into the gym.** **Supersedes** "Scope: a Play mode beside the Studio" and "the current analyzer stays as Studio, unchanged" as the front door. `/` opens into the walkable pixel gym, and the Studio is a place inside that world.
2. **Keep the spec's art direction.** The real wall photo stays untouched, with pixel climber, markers and HUD on top, inside a side-view pixel gym hub. The "8-bit plus realistic" remix explored on 2026-11-01 (real walls in a pixel gym / real gym with pixel people / pixel walls with realistic light) is **dropped**.
3. **Serve climbers from beginner to pro.** **Supersedes** "Player: gym climbers, V0–V5". The audience runs from someone who has never climbed to a pro (roughly V0 to V10 and above).

### What "beginner to pro" means here

One game, one wall and one referee for everyone. Range comes from **how much the game helps and how much it shows**, never from a separate physics model or a different set of rules about what can be held.

| | Beginner (never climbed, or a first few sessions) | Gym climber (about V2–V6) | Pro (about V7 and up, setters, coaches) |
|---|---|---|---|
| **First visit** | Mags at the front desk walks them to Room A (the tutorial course). | Room A is offered and can be skipped with 1 tap. | Goes straight to the wall bays. Room A is optional. |
| **Move tray** | Grows tier by tier (pillars §3): 1 limb, then 2 limbs, then marked feet, then match and deadpoint. | Full tray once Room A is sent or skipped. | Full tray from the start. |
| **Help** | Coach hints in tiers (pillars §3), plain-words reasons, the plumb line. | Reasons, plus hints only on request. | Reasons only. No hints unless asked. |
| **Numbers** | Hidden. Pictures and words only (load pips, the ghost). | Load pips plus effort stars. | **Numbers mode**: weight shares in %, reach ratio, effort per move, and the solver's margins, all straight from the referee. |
| **Walls** | Course walls (baked, pillars §3). | Course walls plus their own photos (the "New wall" door). | Their own photos first. Challenge chips (Blind read, Setter's beta, Feet follow hands, No match) and Tilt remix (pillars §5). |
| **Studio** | Not shown until the player has sent 1 wall. | The **Setting Room** door in the hub. | The Setting Room is unlocked from the start, and the hub's quick-travel strip goes there. |

- **How the game learns the level:** Mags asks once, on the first visit: "How long have you been climbing?" The three answers map to the three columns. The choice can be changed at any time at the lockers. It is saved on the device (`progression`) and works with storage blocked (it is then asked every visit).
- **No grade gate.** A player of any level can open any wall and turn any aid on or off. The columns only set the starting defaults.
- **Honesty is the pro feature.** The solver models static and deadpoint holds on hands and feet, smears, weight shares, reach and barn-doors. It does **not** model heel or toe hooks, flags, knee bars, mantles, dynos or individual strength (`SPEC-beta-moves` B12, `SPEC-climber-stance` › Not in Stage 1). The game says so in one line on a pro's first visit and in the Setting Room. A wall whose only beta needs a modelled-out move is **not shipped as a level**, at any tier.

### The Studio inside the world

- The Studio becomes the **Setting Room**: a door in the hub, drawn in the same pixel style as the other doors. Through the door is today's Studio **unchanged**: same components, same behaviour, same tests. Only a "◀ Gym" button is added above it.
- **Deep links.** `/#/studio` opens the Setting Room directly, so bookmarks and the existing E2E suite keep working; each E2E `page.goto('/')` becomes `page.goto('/#/studio')`. `/#/wall/<id>` opens a wall's Play screen.
- **A photo carries across.** A photo loaded in the Setting Room can be sent to the hub as a new wall bay, and a bay's photo opens in the Setting Room with its route. Nothing is uploaded (Boundaries › Never).

Module specs for step 3: [SPEC-gym-hub.md](SPEC-gym-hub.md) (v0) and [SPEC-play-shell.md](SPEC-play-shell.md), both APPROVED 2026-11-01.

### Changes to the capability map and build order

| Module id | Change |
|---|---|
| `gym-hub` | **Split into two releases.** *v0, the app root*: hub scene, front-desk level question, doors to wall bays, the Setting Room and "New wall"; hash routing; quick-travel strip. It depends only on `pixel-kit` and the existing Studio, so it does **not** wait for `progression`. *v1*: stars on bays, the badge board, lockers and route cards, as before (step 5). |
| `progression` | Adds the **climber profile**: level (beginner / gym / pro) and aid toggles (hints, numbers). |
| `play-shell` | Reads the profile to set the starting tray, hints and Numbers mode. Numbers mode only shows values the referee already returns. |
| `game-feel` | The front-desk question, plus Room A as the beginner path. A one-line limits note for pros. |
| `scoring` | Stars measure the beta (moves against par, effort), never the player's grade. Pro challenge chips as in pillars §5. |

**New build order:**

| Step | Modules | Result |
|---|---|---|
| 1 | `climber-stance` amendment | **Done** (PR #7). |
| 2 | `beta-moves` and `pixel-kit`, in parallel | In progress (lanes). |
| 3 | `play-shell` **and `gym-hub` v0** | **First playable, and the app now opens into the gym.** The Setting Room door leads to the Studio. |
| 4 | `move-animation` and `scoring`, in parallel | Send, watch, stars. |
| 5 | `progression`, then `gym-hub` v1 | Saved profile and stars; the full hub. |
| 6 | `game-feel` | Tutorial rooms, hint tiers, the level question, polish. |

Until step 5, the level question's answer lives in memory only (asked again after a reload).

### Changed success criteria

These add to or replace the matching criteria above:

1. **Opens into the gym.** `/` shows the hub. The climber is walkable and a wall door can be tapped within 2 s on a mid-range phone.
2. **Studio unchanged.** Every existing Studio unit, component and E2E test passes, the E2E tests via `/#/studio`. The Setting Room is reachable in ≤ 2 taps from the hub.
3. **Beginner** (replaces "a V0–V5 climber can plan and send…in under 3 minutes"). Someone who has never climbed sends Room A's first wall without outside help, and the median time is under 3 minutes.
4. **Gym climber.** Sends B1-03 with real models on a phone in under 3 minutes (the old SC 1).
5. **Pro.**
   - From the first screen, a pro loads their own wall photo and sees the first verdict in ≤ 4 taps plus the hold taps.
   - Numbers mode values match the referee's output exactly (unit test).
6. **Same referee for everyone.** One unit test runs the same beta under all three profiles and gets identical verdicts.
7. **Playtest** (replaces pillars SC 10). One recorded session each with 3 beginners, 3 gym climbers (V2–V6) and 2 pros (V7+), each producing a ranked issue list. Pass: no profile has a blocker issue, and both pros say they would use it to check a beta.

### Boundaries added

- **Ask first:** any change to Studio components beyond the "◀ Gym" button and the hash route.
- **Never:**
  - Gate walls or aids by grade.
  - Show a number the referee didn't compute.
  - Present an unmodelled move (heel hook, dyno and the like) as checked.

### Open questions for the user

1. *(Settled as proposed, 2026-11-01.)* **What makes a pro come back?** Proposed: Numbers mode, their own walls, challenge chips and Tilt remix. Is that enough? Or is the pro hook something else, for example comparing two betas side by side or a setter's checking tool, given that the referee can't judge dynos and hooks?
2. *(Settled as proposed, 2026-11-01.)* **Setting Room for beginners.** Hide the Studio until a beginner's first send (proposed), or show the door to everyone from the start?
3. **Grades on screen.** Pillars §3 bans V-grades in the tutorial. Should pros see setter grades on walls they've tagged themselves?
4. **Pillars amendment.** Treat the design-pillars amendment (pillars §1–10) as approved, with this amendment applied on top? Or review it separately?

## Amendment 2026-11-03: Redesign Capability Map

**Status: APPROVED by the user on 2026-11-03** ("approve, proceed"). The four open questions below are settled as the panel recommended (user: "use your suggested way"). Inputs: the leader's five decisions of 2026-11-03 (doc "Bloc Hall Redesign: Panel Brief", "Leader decided" column), the nine-role panel playtest of the live build `b744b47`, and three research reports (auto route tagging, LLM inference, probabilistic climbing models).

### Decisions this map implements

| # | Leader decided | Where it lands |
|---|---|---|
| D1 | Redesign the game story, the interface, the play rules, how the climber's limbs are drawn, and which holds can be used; improve everything else | `game-story`, `play-shell`, `beta-moves` + `scoring`, `pixel-kit` + `move-animation`, `climber-stance` + `stance-odds` |
| D2 | Usable from anywhere, independent of the local network, at zero cost | `offline-shell`, `progression` |
| D3 | The player boxes the route's area and picks the start hold; the game finds and tags the rest; the player fine-tunes | `route-autotag` |
| D4 | LLM as coach, after researching current LLM inference and open source | `coach` |
| D5 | Counsel reviews before the link is shared more widely | `notices` |

### Modules

Existing modules keep their ids; the redesign amends their specs. New ids are kebab-case and fixed from here on.

| Module id | Status | Responsibility in the redesign | Depends on |
|---|---|---|---|
| `climber-stance` | amended | Mechanics fixes before any probability: cutting both feet (the CoM may swing under the hand line; body-to-wall contact), joint range-of-motion limits in the IK (hip flexion about 130°, knee about 140°; CDC Joint ROM), heel and toe hooks as contact types with their own cones, a sidepull axis for untyped upright holds while pinches stay two-sided (narrowed 2026-11-04 after a spike: SPEC-climber-stance › Amendment 2026-11-04, M4) | — |
| `stance-odds` | **new** | A probabilistic layer on top of each solved stance, deterministic and closed-form: per-contact grip capacity as a Gaussian over pull angle (after Newdick et al., ReachBot), friction from published skin and rubber data, cones tightened by a confidence margin (after Gazar et al.), a shared climber profile (strength, friction, flexibility, height). Outputs P(hold) shown as bands (solid, risky, unlikely), the weakest contact, and an effort that rises as holds get worse | `climber-stance` |
| `beta-moves` | amended | Rules: one armed limb at a time (a key replaces, never adds); the verdict carries the `stance-odds` band; the help-ladder costs (hint 1 ends Flash, hint 3 marks the send assisted) | `climber-stance`, `stance-odds` |
| `beta-search` | **new** | Deterministic search over legal moves: Par (the shortest top found and replayed by the referee), the next-limb / next-hold / whole-line hints, and a climbability check when a route is tagged ("no upward move holds from here") | `beta-moves` |
| `route-autotag` | **new** | Box the area and tap the start hold → candidates of the start hold's colour inside the box (first pass from `route-compositor`'s wall segmentation and Lab ΔE; second pass with SAM prompts per candidate) → filter → order bottom to top → propose the finish → the player fine-tunes. Runs `beta-search`'s climbability check before play | `hold-segmentation`, `route-compositor`, `beta-search` |
| `scoring` | planned, amended | Send, Flash (topped with no Undo and no hint), Par, attempts, the falling move and its reason, effort per move and per climb | `beta-moves`, `beta-search` |
| `progression` | planned, amended | Per-device save that survives reloads and Back: plans in progress, tagged routes, the log (ticks, attempts, best line) | `scoring` |
| `coach` | **new** (absorbs `game-feel`'s coach tips) | Tier 0, every device: templates per referee reason at beginner, gym and pro levels, with numbers filled in by code. Tier 1: Chrome's built-in Prompt API where present. Tier 2: WebLLM on the player's GPU, opt-in download (a 1B model by default, 2–3B on laptops). The model only rewords the referee's fields; numbers are placeholders filled by code and checked against the check data; any mismatch shows the template. Never decides a verdict | `beta-moves`, `stance-odds`, `beta-search` |
| `play-shell` | amended | The interface: the goal on screen from the first frame, the fall reason shown in full, footholds marked and labelled on the wall, badges drawn above the climber, the help ladder, the top-out card (moves against Par, Retry / Next wall / Gym) | `beta-moves`, `pixel-kit`, `coach`, `scoring` |
| `pixel-kit` | amended | How the limbs are drawn: readable hands and feet on their holds, hooks and flags, no limbs piling up, never covering route badges | — |
| `move-animation` | planned, amended | Each move animated over a short tween; a fall as an event (slip, drop); the send replay; the top-out moment | `beta-moves`, `pixel-kit` |
| `game-story` | **new** | The story and world rules as data: the castle gym's premise, the coach character, rooms as sets of four walls (introduce, develop, twist, resolve) that open on a send. Original characters only | — |
| `gym-hub` | amended | Shows `game-story`'s rooms, ticks on walls, visible walking controls (the screen-reader-only help becomes visible) | `pixel-kit`, `progression`, `game-story` |
| `offline-shell` | **new** | Zero cost, usable anywhere: a service worker for the app shell, walls and photos; hashed assets served immutable; ML model weights self-hosted (Cloudflare R2 free tier, since Pages caps files at 25 MiB) instead of Hugging Face and jsDelivr; a pinned stable runtime; ask before any large download | — |
| `notices` | **new** | Privacy notice, terms, credits with licence texts, photo credits on the play screen, and a short safety line by the COACH. Text comes from counsel's review; until then it ships nothing user-facing beyond the existing credits | — |
| `game-feel` | planned, narrowed | Tutorial course, celebration polish and haptics (coach tips move to `coach`) | `play-shell`, `scoring` |

Unchanged: `hold-segmentation`, `hold-classification`, `hold-geometry`, `route-compositor`, `depth-estimation`, `point-cloud-view`, `image-input` and the Studio. `route-autotag` and `offline-shell` only call into them.

Arrows point one way. No module depends on `coach`, `notices` or `game-story` except the screens that show them.

### Build order

| Step | Modules | Result |
|---|---|---|
| R0 | `beta-moves`, `play-shell` (small fixes) | The three problems 7 of 9 roles hit: one armed limb at a time, the fall reason shown in full, no advice the player can't act on; plus the goal on entry |
| R1 | `climber-stance` mechanics · `offline-shell` · `notices` (after counsel) | Honest mechanics; works offline at zero cost with no third-party hosts; legal pages |
| R2 | `stance-odds` · `beta-search` | Hold bands and weakest contact; Par, hints and climbability checks |
| R3 | `route-autotag` · `scoring` · `progression` | Box-and-start wall building; Send, Flash, Par; saves that survive reloads |
| R4 | `coach` tier 0 · `play-shell` interface · `pixel-kit` limbs · `move-animation` | The redesigned screen, limbs and motion, with the template coach |
| R5 | `game-story` · `gym-hub` rooms · `coach` tiers 1–2 · `game-feel` | Story and rooms; the optional LLM coach; polish |

R0 ships first because it removes the biggest blockers with small changes. Each step is its own branch and PR, and each ends with a panel replay of the same nine roles plus, from R3 on, a five-player study.

### Boundary changes

- **Ask first** gains: hosting model weights on our own R2 bucket (a Cloudflare account setting), any LLM download offered to players, and using The Way Up dataset (CC BY 4.0) for validation.
- **Never** gains: an LLM deciding a verdict or writing a number the referee didn't produce; loading code or weights from a third-party host at play time once `offline-shell` ships.
- "Train or serve models on a GPU" stays in **Never**. A model running on the player's own GPU in their browser is not serving.

### Open questions for the leader (settled 2026-11-03, as recommended)

1. Does "holds 82%" stay a deterministic score shown as bands, or become a seeded chance of falling? The panel recommends bands with no dice (the pro-climber and game-designer roles).
2. Which counsel reviews `notices`, and is the doc's Playtest records tab (legal section) the brief for them?
3. LLM licence: the panel prefers Apache-2.0 models (Qwen3.5, SmolLM3) over Llama 3.2 ("Built with Llama") and Gemma 3 (Gemma terms). Is a visible attribution acceptable if Llama tests best?
4. The coach on iPhone: iOS Safari WebGPU is fragile. Is tier 0 (templates) enough on iPhone for this round?

**Settled:** (1) bands, no dice: `stance-odds` shows solid / risky / unlikely and never rolls. (2) The doc's Playtest records tab (legal section) is the brief for counsel; the user names the counsel. (3) Apache-2.0 models first; Llama with a visible "Built with Llama" only if it tests clearly best. (4) iPhone gets `coach` tier 0 (templates) this round.
