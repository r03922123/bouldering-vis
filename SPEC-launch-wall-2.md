# Spec: Launch with Wall 2 only

Status: **approved** (2026-11-06, owner: "go with your recommendations on both"). Takeover phase: tidy.

## Objective
Ship today with one wall, Wall 2 (`public/samples/wall-b.jpg`, the owner's photo, usable permanently).
A player opens the app, sees the climber on the setter's start (two hands, two feet), and can plan
moves from there to the top. Wall 1 and the steps that only served choosing between walls are gone.

Today: Wall 2 has no baked level, so Play opens in **Tag** (the player taps holds); after Tag the
climber stands but the next move fails. Wall 1 has no level at all since PR #36.

## Assumptions (correct me now)
1. "Setter's tagged start" = a baked level file for Wall 2, like the private `tests/fixtures/e2e/wall-1.level.json`,
   recorded with the real models (`spike/beta-level.html`) and shipped as static data.
2. The level format marks start *hands* (`role: 'start'`) but not start *feet*; feet come from `wallFeet`
   under `rules.feet: 'any'`. If "two start feet" must be pinned, the format gets a start-foot field (plan step).
3. Root cause of "can't make the next move" is unknown until reproduced (debug step); follow-up 19
   (poses drift since the 2026-11-04 solver commits) is a lead, not a conclusion.
4. Out of scope: picking start holds, the release chain (#42 and later), parked branches, ML accuracy work.

## Steps proposed for removal (your call)
| # | Step | Why it adds nothing with one wall |
|---|---|---|
| R1 | Wall 1: its bay, `wall-a.jpg` sample, the `VITE_E2E_WALL1_LEVEL` plumbing (E2E moves to Wall 2's level) | The goal; it can't even stand |
| R2 | Play's **Tag** phase on Wall 2 | The baked level opens straight in Plan; picking holds is out of scope |
| R3 | The gym as the front door (walk to a bay, quick-travel strip, inert desk and lockers, level dialog) | Its job is choosing a wall; with one wall the app opens straight into Wall 2 |
| R4 | **New wall** door and **Setting Room** (own photo, `#/studio`) | They add other walls; "only Wall 2" |
| R5 | Model preload and download progress at start | Only R4 needs ML at play time; a baked level needs none, so start gets faster |
| R6 | Root's "replace this wall?" confirm and "Setting Room route still open" banner | Exist only for switching between photos |
| R7 | Direction map (E1) before Plan, if it shows on a baked level | The setter already set each pull; to check during planning |

Kept: Plan, referee, coach, undo/redo, aids, Numbers, 3D, sounds, the top-out.

## Success criteria (pass/fail)
1. E2E `e2e/wall2-top.spec.ts` (new, written failing first): open `#/` → Wall 2 Play in Plan, climber
   on the start (2 hands on the start holds, 2 feet on the setter's footholds: holds 1 and 2 in
   `public/levels/wall-b.json`), referee says the start holds;
   play a recorded move list to the finish; the top-out shows. Runs on `desktop`, `phone`, `iphone`.
2. No route, text or file mentions Wall 1 / `wall-a`; `#/wall/wall-a` and removed routes open Wall 2.
3. `npm test`, `npm run lint`, `npm run build`, full E2E green in CI.
4. Screenshot evidence: the climber moving on Wall 2 on phone viewport.

## Commands
`npm test` · `npm run lint` · `npm run build` · `npx playwright test` (E2E; see CLAUDE.md traps).

## Boundaries
- Always: failing test first; PRs ≤ ~300 lines (A: Wall 2 level + move fix; B+: removals); learning-log entry per PR.
- Ask first: deleting whole modules (R3/R4 code), changing the level format, re-recording pixel goldens.
- Never: ship private fixture photos (`tests/fixtures/**`), touch parked branches, push without OK.

## Decisions (were open questions)
1. The setter's route is the orange line, tagged from the photo by the agent; the owner confirms it on a screenshot.
2. R3/R4: unlink first (no visible entry; dev URLs `#/gym`, `#/studio` remain), delete their code in follow-up PRs.
3. Root cause (debug step): Wall 2 had no measured scale, so the climber was 212 px and its start a fall.
   The owner's estimate (grey section about 1.7 m) gives 2.15 px/cm, a 365 px climber (ADR-0002 amendment).
