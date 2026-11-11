# Spec: pixel-kit

Module id: `pixel-kit` · Depends on: — · Used by: `play-shell`, `move-animation`, `gym-hub`
Status: **DRAFT (2026-10-31), revised after the skeptical review below; awaiting the user's approval**

Results dated before 2026-11-06 that mention the earlier sample wall or the earlier sample route
were measured on an earlier sample photo that the project no longer ships
([ADR-0003](docs/adr/0003-public-repo.md)). Their verdicts, timings and ratios stand as recorded;
points, foothold ids and heights measured on that photo are given as labels.

Parent: [SPEC-game.md](SPEC-game.md) (capability map approved 2026-10-31) · App conventions: [SPEC.md](SPEC.md)

## Objective

Draw the 8-bit layer of Bloc Hall on top of the **real wall photo**: an original pixel climber posed from the solver's joints, hold markers for each role, chalk puffs, a small pixel HUD, a pixel font, and chiptune sound effects made in the browser. Everything in this module is original art. Nothing is copied, traced or remade from an existing game.

This module only draws and plays what the game logic has already decided. It never computes a stance, a move or a score, and no rendering result feeds back into the rules (SPEC-game › Code Style).

User stories:
- On my wall photo I see a small pixel climber hanging on the holds where the solver put it. Its hands sit on the holds, and it is easy to see on light and dark walls (backed by the contrast rule, AC 2).
- I can tell the start holds, the finish hold, the holds already in my plan, and the hold my selected limb is about to go to. I can tell them apart by shape, not only by colour (AC 3, AC 47).
- When a hand grabs, a small puff of chalk comes off it. When a stance can't be held, the climber looks like a "ghost", the pixel version of the Studio overlay's dashed figure (`StanceLayout.dashed`).
- The HUD shows my move count, a grip/balance meter and my stars, with buttons of at least 44 × 44 CSS px that I can tap with one thumb.
- If I turn sound on, I hear short chiptune blips for a grab, a slip, a fall, a send and button taps. Sound is off until I turn it on, and the game remembers my choice on this device.

**Not in this module:** choosing poses or tweening between them (`move-animation`), deciding the meter value, mood or stars (`play-shell`, `scoring`), unlocking outfits and saving the look (`progression`), any picker UI for outfits or looks (Open Question 10), the hub scene and its side-view walk cycle (`gym-hub`, see Open Question 2), haptics (`game-feel`), and getting the photo viewport out of `SelectionCanvas` (`play-shell`, Open Question 7).

## Decisions (proposed; the review can change any of these)

| # | Topic | Decision | Why |
|---|---|---|---|
| P1 | Buffer | Rasterise into an **indexed buffer** (`Uint8Array` of palette indices, one byte per art pixel), then map it to RGBA in one pass (`blit`) into one reused `ImageData`. | Snapshots are exact and readable as text. Unit tests need no canvas (jsdom has none; `tests/setup.ts` stubs `getContext` to `null`). The frame cost is one small `putImageData`. |
| P2 | Art pixel size | One art pixel = **P whole device pixels**. P is chosen so the climber is about **48 art px tall** (band 36–60, with hysteresis). P is never smaller than `Pmin = max(2, round(2·dpr))`. | Each art pixel covers a whole number of device pixels at every devicePixelRatio. Sprite sizes are fixed **in art pixels**. On screen they grow with zoom in steps of P, and within one P step the sprites keep their size while the joints spread or close (up to 60/36). |
| P3 | Layering | `PixelLayer` renders a `<canvas class="px-layer">`. It is `position: absolute; left: 0; top: 0`, `pointer-events: none`, `aria-hidden`, with `image-rendering: crisp-edges` declared first and then `image-rendering: pixelated`. Its bitmap is `⌈box·dpr / P⌉` in each direction and its CSS size is `bitmap·P/dpr`, which can be up to `P/dpr` CSS px larger than the box. **The caller must put it in a positioned parent with `overflow: hidden`** (for example the existing `.selection-box`). | Taps go through to whatever is under it. Absolute positioning means the layer never changes layout, so the photo never moves (the rule behind SPEC.md › Amendment 2026-10-31). The overflow clip stops the extra width from causing horizontal scroll at 375 px. |
| P4 | No module imports | `pixel-kit` defines its own `Pt`, `PixelView`, `PixelLimb`, `PixelJointName` and `PixelJoints`. The limb and joint strings are the same as climber-stance's `Limb` and `JointName`, but joints are `{x, y, z?}` objects, while climber-stance's `Joints` are `Vec3` tuples `[x, y, z]`. A caller adapts between them (`play-shell`). | The map gives `pixel-kit` no dependencies. `PixelView` has the same fields as hold-segmentation's internal `Viewport` (`scale`, `tx`, `ty`, `boxW`, `boxH`, in CSS px) plus `dpr`. Getting that viewport to `play-shell` is not settled: `Viewport` is not exported and `SelectionCanvas` keeps it in internal state (Open Question 7). |
| P5 | Line rule | Limbs are **capsules**: a pixel is filled when its centre is within t/2 of the segment, inclusive. For 1-px lines, a pixel is filled when its centre is within 0.5 of the line along the minor axis, inclusive (so both pixels are filled on a tie). Quads are filled by pixel-centre inclusion, and a centre exactly on an edge counts as inside. | Symmetric under mirroring and deterministic. Standard Bresenham always breaks ties the same way, so a line and its mirror image can come out different. |
| P6 | Palette | **16 entries**: index 0 is transparent, plus 15 original colours. Role and limb colours must pass a worst-case contrast rule over any photo (AC 2). | Sixteen entries fit the 8-bit look and fit in a nibble. A contrast rule can be tested; "looks fine on my wall" cannot. |
| P7 | Font | **Decided 2026-10-31 (user): an original 5×7 bitmap font drawn in code** (option b). Press Start 2P is not used. | No dependency, so no ask-first step. It is original by construction (SPEC-game › Never), the glyph data is about 350 bytes, and it can be tested pixel by pixel in Node. |
| P8 | Sound | Short effects defined as **pure data** (oscillator type, frequency and gain ramps) and scheduled on Web Audio. Noise comes from the seeded RNG. **No audio files.** | Tests check the parameters without playing any audio (SPEC-game › Testing Strategy). |
| P9 | Randomness | **mulberry32**, a seeded 32-bit generator (Tommy Ettinger). It is written from the published algorithm, and the AC 23 test vectors pin it. Its licence is usually described as public domain; T7 records the source and confirms that. There is no `Math.random` anywhere in the module. | A replay looks the same every time. |
| P10 | Time | `renderScene` takes `timeMs` as input. Only `PixelLayer` reads a clock (`performance.now` by default, or a `clock` prop such as `move-animation`'s replay clock). Between phase changes it sleeps with a timeout and does not poll with rAF. | The rendering logic stays deterministic. Scheduling is presentation, not rules. |

## The Climber (original design)

**Silhouette.** We see the climber from behind. The camera is square to the wall (climber-stance S5) and the climber faces the wall, so the climber's left side is on the image's left. This is an art choice for this module; climber-stance itself says nothing about facing. The climber's identity is a **rolled-brim beanie, a cylinder chalk bag at the small of the back, and chalky hands**. It has no cap with a front logo, no overalls, no tunic, no pointy hat, no long braid, no helmet and no visor. These rules keep it away from well-known game heroes, and the originality review (T12) checks it against them.

**Proportions.** Bone lengths come straight from the solver's joints (Winter ratios, climber-stance S6), so the body has real proportions and is not chibi. Only the head sprite is drawn about 1.25× life size, so it reads at 48 px. At the target art height of 48 px, the shoulders are about 12 art px wide (2 × 0.1295 H) and the hips about 9 (2 × 0.0955 H).

**Outfit slots** (each one is a palette index):

| Slot | Used for |
|---|---|
| `hat` | beanie dome |
| `band` | rolled brim (1 px row) |
| `hair` | hair below the brim |
| `skin` | ears, nape, neck, bare arms and legs, hands (set by the player's look, not the outfit) |
| `top` | trunk; the upper arms when `sleeves` is `tee`; the whole arm (not the hand) when `sleeves` is `long` |
| `bottoms` | thighs, plus shanks when `legs` is `pants`; 2-px waistband at the hip line |
| `shoes` | climbing shoes (with a 1-px `dusk` rubber rand) |
| `bag` | chalk bag (with a 1-px `chalk` rim showing chalk at the top) |

Style switches: `sleeves: 'tank' | 'tee' | 'long'` and `legs: 'shorts' | 'pants'`.

**Sprites** (regular size; `.` is clear, letters are slots: H hat, B band, R hair, S skin, F shoes, r rubber, G bag, C chalk). The rasteriser adds the ink outline, so it is not part of the grids.

```
head 7×8, anchor (3,4)   hand grip 3×3, anchor (1,1)   hand open 3×4, anchor (1,1)
..HHH..                  CSC                           S.S
.HHHHH.                  SSS                           SSS
HHHHHHH                  .S.                           SSS
BBBBBBB                                                .S.
RRRRRRR                  right foot 4×3, anchor (1,2)  chalk bag 3×4, anchor (1,1) at pelvis
SRRRRRS                  FFF.                          CCC
.RRRRR.                  FFFF                          GGG
..SSS..                  rrrr                          GGG
                         (left foot = mirrored,        .G.
                          anchor (2,2))
```

**Compact set** (used when the art height is under 36):

| Sprite | Size | Rows | Anchor |
|---|---|---|---|
| head | 5×5 | `.HHH.`, `HHHHH`, `BBBBB`, `RRRRR`, `.SSS.` | (2,2) |
| hand (grip and open) | 1×1 | `S` | (0,0) |
| right foot | 2×1 | `FF` | (0,0) |
| left foot | 2×1 | mirror of the right foot | (1,0) |
| bag | 1×2 | `C`, `G` | (0,1) |

The compact set is not covered by the mirror test, because a 2-px foot cannot be centred on a pixel. Each sprite in `sprites.ts` is preceded by a provenance comment, `// original, drawn for Bloc Hall, <date>`, and a unit test checks that the comments are there (AC 17b).

**Launch outfits** (`progression` decides when they unlock):

| id | hat / band | top | bottoms | shoes | bag | sleeves / legs |
|---|---|---|---|---|---|---|
| `starter` (default) | brick / chalk | tide | slate | ember | sun | tee / pants |
| `sunset` | ember / brick | bloom | brick | navy | tide | tee / shorts |
| `moss` | leaf / lime | sun | leaf | slate | bloom | tank / pants |
| `chalkdust` | chalk / slate | chalk | slate | brick | lime | long / pants |

**Look** (data only; the player's choice is saved by `progression`): `skin` is one of `skinLight`, `skinMid` or `skinDeep` (default `skinMid`). `hair` is one of `ink`, `dusk`, `brick`, `sun` or `skinDeep` (default `dusk`).

## Palette

| # | Name | Hex | Luminance | Worst-case contrast with an ink outline* |
|---|---|---|---|---|
| 0 | clear | transparent | — | — |
| 1 | ink | `#1b1325` | 0.008 | — (the outline) |
| 2 | dusk | `#3d2e52` | 0.036 | 1.21 |
| 3 | slate | `#6e6a86` | 0.153 | 1.87 |
| 4 | chalk | `#f7f3e8` | 0.897 | **4.03** |
| 5 | skinLight | `#f5cfa6` | 0.668 | 3.51 |
| 6 | skinMid | `#c68a5c` | 0.310 | 2.48 |
| 7 | skinDeep | `#6e4128` | 0.072 | 1.45 |
| 8 | brick | `#b8432e` | 0.144 | 1.82 |
| 9 | ember | `#ffab57` | 0.511 | **3.10** |
| 10 | sun | `#ffd94a` | 0.714 | **3.62** |
| 11 | leaf | `#3f9e4a` | 0.260 | 2.31 |
| 12 | lime | `#7ee88f` | 0.641 | **3.44** |
| 13 | tide | `#45d3f2` | 0.543 | **3.19** |
| 14 | navy | `#2c4fa3` | 0.088 | 1.54 |
| 15 | bloom | `#ffa3d6` | 0.523 | **3.13** |

\* A fill with a 1-px ink outline, on any background, shows at least one edge (fill against background, or ink against background) with at least this contrast: `worst = √((L_fill + 0.05) / (L_ink + 0.05))`. The worst case is a background whose luminance sits at the geometric middle between the two. Luminance follows the WCAG 2.x definition. The values in this table were recomputed during the review (2026-10-31).

**Contrast rules over photos**
- Every sprite, marker and glyph has a **1-px ink outline**. Chalk puffs are the only exception (see Chalk puffs). Fill colours carry the shape on dark walls, and the ink carries it on light walls.
- **Role markers and limb colours** (lime, sun, chalk, bloom, tide, ember) must have a worst-case value of **≥ 3.0:1**. This is our rule, modelled on the 3:1 ratio in WCAG 1.4.11 (non-text contrast). It is not a claim of formal conformance, which depends on the actual adjacent colours.
- **Outfit tops** must be ≥ 3.0, so the trunk reads on any wall. **Bottoms** must be ≥ 1.8. Skin tones are free (diversity matters more), and chalk pixels on the hands keep a bright cue there.
- **Role colours:** start = lime, finish = sun, planned = chalk, target = bloom. **Limb colours:** left = tide, right = ember. These are close to the Studio stance overlay (`STANCE_COLOR.left` `#22d3ee`, `.right` `#fb923c`). The role colours **differ** from Studio's badges (start green `#16a34a`, finish red `#e11d48`), because a red finish fails the contrast rule (brick = 1.82).
- **Accepted overlap:** only the six role and limb colours pass ≥ 3.0, so every outfit top reuses one of them. Roles are therefore carried by marker **shape** (AC 3), never by colour alone.

## Rendering Rules

**Grid.** `pixelSize(H, view, prev?)` works out `H_dev = H · view.scale · view.dpr`, where H is the climber height in image px.
- If `H_dev` is not finite or is ≤ 0, it returns `Pmin`.
- If `prev ≥ Pmin` and `36 ≤ H_dev / prev ≤ 60`, it returns `prev`.
- Otherwise it returns `max(Pmin, round(H_dev / 48))`, where `Pmin = max(2, round(2 · dpr))`.

The art height is `H_dev / P`, and the compact set is used below 36. `PixelLayer` keeps `prev` between renders.

`artGrid(view, P)` has width `⌈boxW·dpr / P⌉` and height `⌈boxH·dpr / P⌉`, and is 0 × 0 when the box is empty. `toArt(p) = ((p.x·scale + tx)·dpr / P, (p.y·scale + ty)·dpr / P)`. The art pixel that holds a point is `floor(toArt(p))`, so a drawn anchor is within one art pixel of the solver's point on each axis.

**Clipping.** Every raster function clips to the buffer. A shape partly outside the grid is drawn where it overlaps, and a shape wholly outside writes nothing and does not throw. This covers holds panned or zoomed off-screen, a climber partly off-box, and a flag or puff past the top edge. A climber with any non-finite joint is skipped.

**Draw order** (later draws on top): planned markers → finish markers → reach gaps → climber → start markers → target marker → chalk puffs. **Amended 2026-11-01:** the start brackets moved from under the climber to over it. Markers with the same `holdId` and `role` are drawn only once, using the last one in the array.

**Climber.**
1. **Groups:** each limb (its two segments plus its hand or foot sprite), the trunk group (trunk quad, neck, waistband, chalk bag), the head, and then the four end sprites (hands and feet) again.
2. **Limb order:** limb groups are drawn far to near, in ascending mean `z` of their joints (+z points out of the wall, toward the camera). Ties go `lf, rf, lh, rh`. If any joint has no `z`, that fixed order is used. The trunk group comes after the limbs and the head after the trunk, because the back faces the camera. **Amended 2026-11-01 (Open Question 11):** the hand and foot sprites are then drawn again, in the same limb order, on top of the trunk and the head. Each gets its own outline, which skips pixels still showing its own limb's fill, so a hand stays joined to its forearm. Limb segments keep the depth order above.
3. **Outline:** each group is filled into a reused scratch mask. Its 4-neighbour outline is written in ink, and then its fill is written. The outline of a nearer group therefore separates it from the group behind it.
4. **Limb thickness** (art px; `Ha` is the art height): arm = `max(2, round(Ha/20))`, thigh = `max(2, round(Ha/13))`, shank = `max(2, round(Ha/16))`, neck = 2. In the compact set, limbs are 1 and the trunk is at least 2 wide.
5. **Trunk:** the quad lShoulder–rShoulder–rHip–lHip, filled by pixel-centre inclusion (P5). Pixels within 2 art px of the hip line take the `bottoms` colour.
6. **Hands and feet:** a hand uses the grip sprite when `gripping[limb]` is true and the open sprite otherwise. Feet always use the foot sprite. The sprite anchor sits on `floor(toArt(joint))`.
7. **Selected limb:** the outline pixels of its hand or foot sprite (the group's outline pixels that are 4-adjacent to that sprite's fill) are drawn in **sun** instead of ink.
8. **Mood** (decided by the caller):
   - `'fail'`: fill pixels where `(x + y)` is odd are cleared and the outline is kept, giving a "ghost".
   - `'strain'`: a 2×3 tide sweat drop with an ink outline appears 1 px above the head's top-right corner.

**Markers.** The frame is the hold's bbox in art px (`x0 = floor(toArt(x))`, `x1 = ceil(toArt(x + w))`, and the same for y), grown by 2 px on each side, then clamped to 7–40 px in each direction around its centre. When an odd number of pixels has to be removed or added, the extra pixel goes to the right or bottom. **Amended 2026-11-02:** a `target` frame is at least 13 px a side (see Amendment 2026-11-02 below).

| Role | Shape (1-px stroke in the role colour, with an ink outline) | Extra |
|---|---|---|
| `start` | Four L-shaped corner brackets; each arm is `max(2, ⌊min(w,h)/3⌋)` long | — |
| `finish` | A stepped diamond inscribed in the frame | A 5×7 flag (pole and pennant) on the top vertex |
| `planned` | A circle ring inscribed in the frame | The step number in the pixel font at the top right. The step is floored and clamped to 1–99. |
| `target` | Four inward ticks, 3 px long | The limb glyph (`LH`/`RH`/`LF`/`RF`) centred below the frame. If that spot would cover one of the climber's hand or foot sprites (with its outline), the glyph moves to the side away from the nearest such contact (amended 2026-11-01; Builder's Calls). A "breathing" effect: the ticks sit 1 px in from the frame for `timeMs mod 600` in 0–299, and 2 px in for 300–599. They stay at 1 px with reduced motion. |

**Reach gaps.** A 1-px line from the limb's end joint to the hold centroid. Its pixels alternate between the limb colour and ink, starting with the limb colour at the limb's end, so it reads on any wall.

**Chalk puffs.** `rng = createRng(puff.seed)`. Each of 8 particles draws 5 values in this order:
1. angle `θ = −π/2 + (r − 0.5)·(5π/6)`;
2. speed `v = 10 + 14r` art px/s;
3. life `350 + 250r` ms;
4. start offset `x0 = (r − 0.5)·2`;
5. start offset `y0 = (r − 0.5)·2`.

At age `a` (in seconds), the position relative to `floor(toArt(at))` is `x = x0 + v·cosθ·a` and `y = y0 + v·sinθ·a + ½·30·a²`, and the particle is drawn at `floor` of that. A particle is 2×2 while `a < 0.12` s and 1×1 after that. In the last 30 % of its life it is drawn only where `(x + y)` is even. It is gone once its age reaches its life, and no particle exists at a negative age. All particles are chalk-coloured with no outline. At most **6 puffs** (the newest by `bornMs`) are drawn, which is ≤ 48 particles. With reduced motion, no puffs are drawn.

## Edge Cases

| Case | Behaviour |
|---|---|
| Empty scene (no climber, no markers, no gaps, no puffs) | The buffer is cleared, `nextChangeAt` is `null`, and `PixelLayer` schedules no frames. |
| No stance (`Stance.joints` is `null`) | `climber: null`. Markers still draw, at the P given by `climberHeightPx`. |
| One start hold (both hands matched), or two starts | One start marker per hold. A hold can carry several roles (AC 20). |
| The same hold planned twice | The caller passes one planned marker per hold. Duplicate `(holdId, role)` pairs draw only the last one. |
| A hold or climber partly or wholly off the grid (pan or zoom) | Clipped (Rendering Rules › Clipping). No edge indicators (out of scope). |
| A hold bbox wider than 40 art px (a volume) | The frame is clamped to 40 and centred. It can be smaller than the hold. |
| Zero-size box (before the first `ResizeObserver` callback) | The grid is 0 × 0. `PixelLayer` sets the bitmap to 0 × 0 and makes no `createImageData` or `putImageData` call, because a zero size throws `IndexSizeError`. |
| `dpr` or box size changes | A new grid. `resizeBuffer` reallocates only when the size changes, and the hysteresis `prev` is kept. |
| Stage origin not on a whole device pixel | The browser snaps the layer, so one art row or column can render P±1 device px. This is accepted and not tested. |
| Blocked or throwing storage | Sound is off. Saving the choice silently does nothing. |
| Sound saved as on after a reload (no user gesture yet) | The context is created and resumed on the first `pointerdown` or `keydown` anywhere (a one-shot listener). Until then, `play()` does nothing. |
| `AudioContext` suspended or interrupted (phone lock, iOS) | `play()` calls `resume()` and drops that effect. It never throws. |
| `GripMeter` value NaN or outside 0–1 | Clamped to 0–1, and NaN counts as 0. |
| `MoveCounter` above 99 or negative | Drawn as `99` or `00`. The hidden text gives the real count, floored at 0. |
| Pixel text over 12 characters | Drawn in full, with no truncation. Callers keep labels ≤ 12 characters. |
| Low-end phone | Frame budget in AC 44. No frames while idle (AC 45). Scratch masks are reused. |

## Pixel Font (original, 5×7)

- **Glyphs** (50): `A–Z`, `0–9`, space, and the 13 symbols `. , ! ? : - + / % ' ( ) ×`. Text is read one code point at a time. A code point whose single-character uppercase form is in the set uses that glyph. Every other code point draws as `?`, including `é` and `ß`, whose uppercase is two characters. `\n` starts a new line.
- **Shapes:** `0` has a diagonal slash so it can't be read as `O`. `1` has a flag and a base. Each of the pairs 0/O, 1/I, 5/S, 8/B and 2/Z differs by at least 3 pixels.
- **Metrics:** each glyph is 5×7 in a 6-px advance, with a 9-px line height.
  - A line of n characters is `6n − 1` px wide. A block is as wide as its longest line and `7 + 9·(lines − 1)` px tall.
  - The empty string is 0 × 0.
  - An outline adds 1 px on every side.
- **Where it is used:** short labels only (≤ 12 characters: `MOVES 07`, `SEND`, `UNDO`, digits). Diagnoses and coach tips stay in the system font, so they stay readable, zoomable and translatable. Canvas pixel text does not follow browser text zoom, which counts against WCAG 1.4.4 and 1.4.5. The ≤ 12-character limit keeps that risk small, and Open Question 1 weighs it.
- **Accessibility:** every canvas text has its real text in a `.visually-hidden` span (the class already exists in `app.css`), and the canvas is `aria-hidden`.
- **Provenance:** the glyph table is preceded by `// original, drawn for Bloc Hall, <date>; revised <date> to move away from HD44780-like forms` (see Check Results › AC 48).

## Sound Effects (Web Audio, no files)

All times are seconds from the moment the effect starts. Ramp curves are `set` (setValueAtTime), `lin` (linearRampToValueAtTime) and `exp` (exponentialRampToValueAtTime; its targets and start values are always ≥ 0.0001).

`pulse25` is a `PeriodicWave` built from arrays of length 33: `real[0] = imag[0] = 0`, and for n = 1..32, `real[n] = 2·sin(nπ/4) / (nπ)` and `imag[n] = 0`. Noise comes from a 1-s mono buffer at the context's sample rate, filled from `createRng(0x5eed)` as `2r − 1`.

| Effect | Voice | Wave | Frequency | Gain | Ends at |
|---|---|---|---|---|---|
| `tick` (UI) | 1 | square | set 1320 Hz | set 0 at 0 → lin 0.12 at 0.002 → exp 0.0001 at 0.03 | **0.035** |
| `grab` | 1 | pulse25 | set 392 → exp 784 at 0.05 | set 0 → lin 0.16 at 0.003 → set 0.16 at 0.04 → exp 0.0001 at 0.09 | **0.10** |
| | 2 ("chalk tap") | noise, highpass 3000 Hz | — | set 0.06 → exp 0.0001 at 0.02 | |
| `slip` | 1 | square | set 660 → exp 330 at 0.20 | three blips: set 0.0001 at 0 → lin 0.14 at 0.003 → set 0.14 at 0.045 → lin 0.0001 at 0.05; set 0.0001 at 0.07 → lin 0.14 at 0.073 → set 0.14 at 0.115 → lin 0.0001 at 0.12; set 0.0001 at 0.14 → lin 0.14 at 0.143 → exp 0.0001 at 0.22 | **0.24** |
| `fall` | 1 | triangle | set 880 → exp 110 at 0.55 | set 0.18 → lin 0.10 at 0.50 → exp 0.0001 at 0.60 | **0.70** |
| | 2 (thump, starts at 0.55) | noise, lowpass 500 Hz | — | set 0.25 at 0.55 → exp 0.0001 at 0.70 | |
| `send` | 1 (lead) | pulse25 | G4 392.00 (0–0.10), D5 587.33 (0.12–0.22), B4 493.88 (0.24–0.34), C5 523.25 (0.36–0.80) | each note: set 0.0001 at its start → lin 0.14 over 5 ms → hold → exp 0.0001 over its last 20 ms | **0.85** |
| | 2 (bass) | triangle | C3 130.81 (0–0.85) | set 0.0001 at 0 → lin 0.10 at 0.005 → exp 0.0001 at 0.85 | |

- **Mixing:** master gain is 0.5. Each voice peaks at ≤ 0.25, and within one effect the peaks of voices that sound at the same time add up to ≤ 0.5. At most 4 effects play at once, so the output is ≤ 4 × 0.5 × 0.5 = 1.0 and nothing clips.
- **Originality:** `send` is a short figure written for this game: G4, then a turn D5–B4 that settles on C5 over a C3 bass. It was re-voiced on 2026-11-01. The first version (G–C–D–G over G3) ended on the SMB 1-Up's C–D–G tail and shared the contour of the "Charge!" call (Check Results › AC 48). That it resembles no known jingle is a design intent, not a proven fact. Its rhythm is unchanged, so the stars still land on its last three notes. Each `SFX` entry is preceded by a provenance comment.
- **Off by default.** No `AudioContext` is created until the player turns sound on, and that tap is the user gesture that starts it. After a reload with sound saved as on, see Edge Cases.
- **Saved choice:** `localStorage['bouldering-vis:sound'] = 'on'`. This follows the app's existing `bouldering-vis:` key prefix, as in `point-cloud-view/coach.ts`. Any other value, a missing key or a storage error means off. Every read and write is in try/catch.
- **When it stays silent:** nothing plays while `document.hidden`, or when `window.AudioContext` doesn't exist (then `play()` does nothing).
- **Overlap:** playing an effect again fades its earlier instance to 0.0001 over 5 ms and stops it. If a fifth effect starts, the oldest one is stopped the same way.

## Public Interface (`src/modules/pixel-kit/index.ts`)

```ts
import type { ButtonHTMLAttributes, JSX } from 'react';

// ── shared types (strings match climber-stance's JointName and Limb; P4) ──
export interface Pt { x: number; y: number }
export type PixelLimb = 'lh' | 'rh' | 'lf' | 'rf';
export type PixelJointName =
  | 'pelvis' | 'neck' | 'head' | 'lShoulder' | 'rShoulder' | 'lElbow' | 'rElbow'
  | 'lHand' | 'rHand' | 'lHip' | 'rHip' | 'lKnee' | 'rKnee' | 'lFoot' | 'rFoot';
/** Image px; z is +out of the wall (draw order only). climber-stance's Vec3 [x,y,z] → {x,y,z}. */
export type PixelJoints = Record<PixelJointName, Pt & { z?: number }>;

// ── palette.ts ──
export const COLOR: {
  readonly clear: 0; readonly ink: 1; readonly dusk: 2; readonly slate: 3; readonly chalk: 4;
  readonly skinLight: 5; readonly skinMid: 6; readonly skinDeep: 7; readonly brick: 8;
  readonly ember: 9; readonly sun: 10; readonly leaf: 11; readonly lime: 12; readonly tide: 13;
  readonly navy: 14; readonly bloom: 15;
};
export type ColorName = keyof typeof COLOR;
export type PaletteIndex = (typeof COLOR)[ColorName];
/** 16 entries; '#rrggbb', or null for index 0 (clear). */
export const PALETTE: readonly (string | null)[];
export type MarkerRole = 'start' | 'finish' | 'planned' | 'target';
export const ROLE_COLOR: Readonly<Record<MarkerRole, PaletteIndex>>;
export const LIMB_COLOR: Readonly<Record<PixelLimb, PaletteIndex>>;
export function relativeLuminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;
/** min over all backgrounds of max(C(fill,bg), C(outline,bg)) = √((Lf+.05)/(Lo+.05)) for Lf ≥ Lo. */
export function worstCaseContrast(fill: string, outline?: string /* default ink */): number;

// ── buffer.ts ──
export interface PixelBuffer { width: number; height: number; data: Uint8Array } // row-major indices
export function createBuffer(width: number, height: number): PixelBuffer;
/** Returns `buf` itself when the size is unchanged (no allocation). */
export function resizeBuffer(buf: PixelBuffer, width: number, height: number): PixelBuffer;
/** '.' = 0, '1'–'9' = 1–9, 'a'–'f' = 10–15; rows joined by '\n'. */
export function bufferToText(buf: PixelBuffer): string;
/** Skips lines starting with '#'. Throws on ragged rows or an unknown character. */
export function bufferFromText(text: string): PixelBuffer;
/** RGBA into `out` (length 4·w·h): clear → 0,0,0,0; others → palette rgb, alpha 255. */
export function blit(buf: PixelBuffer, out: Uint8ClampedArray): void;

// ── view.ts ──
/** CSS px, same meaning as hold-segmentation's Viewport fields, plus devicePixelRatio. */
export interface PixelView { scale: number; tx: number; ty: number; boxW: number; boxH: number; dpr: number }
export interface ArtGrid { view: PixelView; px: number; width: number; height: number }
export const TARGET_ART_HEIGHT: 48;
export const ART_HEIGHT_BAND: readonly [36, 60];
export function minPixelSize(dpr: number): number;
export function pixelSize(climberHeightPx: number, view: PixelView, prev?: number): number;
export function artGrid(view: PixelView, px: number): ArtGrid;
export function toArt(grid: ArtGrid, p: Pt): Pt;    // fractional art coords
export function artPixel(grid: ArtGrid, p: Pt): Pt; // floor(toArt)

// ── outfits.ts ──
export type OutfitId = 'starter' | 'sunset' | 'moss' | 'chalkdust';
export interface Outfit {
  id: OutfitId; name: string;
  hat: PaletteIndex; band: PaletteIndex; top: PaletteIndex; bottoms: PaletteIndex;
  shoes: PaletteIndex; bag: PaletteIndex;
  sleeves: 'tank' | 'tee' | 'long'; legs: 'shorts' | 'pants';
}
export interface Look { skin: PaletteIndex; hair: PaletteIndex }
export const OUTFITS: Readonly<Record<OutfitId, Outfit>>;
export const DEFAULT_LOOK: Look;               // { skin: skinMid, hair: dusk }
export const SKIN_TONES: readonly PaletteIndex[];
export const HAIR_COLORS: readonly PaletteIndex[];

// ── climber.ts ──
export type Mood = 'ok' | 'strain' | 'fail';
export interface PixelClimber {
  joints: PixelJoints;
  heightPx: number;                              // climber height, image px (sets the art height)
  outfit: Outfit;
  look: Look;
  gripping: Readonly<Record<PixelLimb, boolean>>; // hands: grip sprite vs open hand
  selected: PixelLimb | null;
  mood: Mood;
}
export interface LimbThickness { arm: number; thigh: number; shank: number; compact: boolean }
export function limbThickness(artHeight: number): LimbThickness;
/** Clips to `buf`; draws nothing if any joint is non-finite. */
export function rasterClimber(buf: PixelBuffer, grid: ArtGrid, c: PixelClimber): void;

// ── markers.ts ──
export interface HoldMarker {
  holdId: string;
  role: MarkerRole;
  bbox: { x: number; y: number; w: number; h: number }; // image px (DecodedHold.bbox)
  step?: number;                                       // planned: floored, clamped to 1–99
  limb?: PixelLimb;                                    // target
}
export interface ReachGap { limb: PixelLimb; from: Pt; to: Pt } // image px
export function markerFrame(grid: ArtGrid, bbox: HoldMarker['bbox']): { x: number; y: number; w: number; h: number };
/** `avoid`: art-px boxes a target's label must not cover (renderScene passes the climber's hands and feet). */
export function rasterMarker(buf: PixelBuffer, grid: ArtGrid, m: HoldMarker, timeMs: number, reducedMotion: boolean, avoid?: readonly { x: number; y: number; w: number; h: number }[]): void;

// ── rng.ts, puffs.ts ──
export function createRng(seed: number): () => number;   // mulberry32, [0, 1)
export function hashSeed(...parts: number[]): number;    // FNV-1a over int32 parts → uint32
export interface ChalkPuff { seed: number; at: Pt; bornMs: number } // at: image px
export interface Particle { x: number; y: number; size: 1 | 2; dither: boolean } // art px from floor(toArt(at))
export const PUFF_PARTICLES: 8;
export const PUFF_MAX_LIFE_MS: 600;
export const MAX_PUFFS: 6;
export function puffParticles(seed: number, ageMs: number): readonly Particle[];

// ── font.ts ──
export const GLYPH_W: 5; export const GLYPH_H: 7; export const ADVANCE: 6; export const LINE_HEIGHT: 9;
/** 7 rows per glyph, each a 5-bit mask (bit 4 = left column). */
export const GLYPHS: Readonly<Record<string, readonly number[]>>;
/** '' → 0×0; '\n' breaks lines; `outline` adds 1 px per side. */
export function measurePixelText(text: string, outline?: boolean): { width: number; height: number };
export function rasterText(buf: PixelBuffer, x: number, y: number, text: string, color: PaletteIndex, outline?: PaletteIndex): void;

// ── scene.ts ──
export interface PixelScene {
  climber: PixelClimber | null;
  markers: readonly HoldMarker[];
  gaps: readonly ReachGap[];
  puffs: readonly ChalkPuff[];
  timeMs: number;
  reducedMotion: boolean;
}
/**
 * Clears `buf` and draws the scene in the order of Rendering Rules. Deterministic (the output depends
 * only on the inputs); it writes into `buf` and returns that same object.
 */
export function renderScene(buf: PixelBuffer, grid: ArtGrid, scene: PixelScene): PixelBuffer;
/** The next time the picture changes without new input (target phase or a live puff), or null. */
export function nextChangeAt(scene: PixelScene): number | null;

// ── React (PixelLayer.tsx, hud/*.tsx, SoundToggle.tsx) ──
export interface PixelLayerProps {
  view: PixelView;
  /** Sets P even when `scene.climber` is null; normally equals climber.heightPx. */
  climberHeightPx: number;
  scene: Omit<PixelScene, 'timeMs' | 'reducedMotion'>;
  clock?: () => number;   // default performance.now; move-animation passes its replay clock
}
/** aria-hidden canvas; must sit in a positioned parent with overflow: hidden (P3). */
export function PixelLayer(props: PixelLayerProps): JSX.Element;
/** One art px = round(scale·dpr) device px (scale in CSS px, default 2). */
export function PixelText(props: { text: string; scale?: 2 | 3 | 4; color?: PaletteIndex }): JSX.Element;
export type PixelIcon = 'undo' | 'send' | 'sound-on' | 'sound-off' | 'back' | 'star' | 'ok' | 'warn' | 'fail';
export function PixelButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon?: PixelIcon; pressed?: boolean },
): JSX.Element;
export function MoveCounter(props: { moves: number }): JSX.Element;
export function GripMeter(props: { value: number; tone: 'ok' | 'warn' | 'fail'; label: string }): JSX.Element;
export function Stars(props: { count: 0 | 1 | 2 | 3 }): JSX.Element;
export function SoundToggle(): JSX.Element;
/** Subscribes to the media query's change event (not read once). */
export function useReducedMotion(): boolean;

// ── sfx.ts, useSfx.ts ──
export type SfxName = 'tick' | 'grab' | 'slip' | 'fall' | 'send';
export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'pulse25' | 'noise';
export interface Ramp { t: number; v: number; curve: 'set' | 'lin' | 'exp' }
export interface Voice {
  wave: Wave; start: number; end: number;
  freq: readonly Ramp[];   // empty for noise
  gain: readonly Ramp[];
  filter?: { type: 'lowpass' | 'highpass'; hz: number };
}
export interface SfxDef { name: SfxName; duration: number; voices: readonly Voice[] }
export const SFX: Readonly<Record<SfxName, SfxDef>>;
export const MASTER_GAIN: 0.5;
export const MAX_VOICES_AT_ONCE: 4; // effects
export const SOUND_KEY: 'bouldering-vis:sound';
/** Arrays of length harmonics + 1; index 0 (DC) is 0. */
export function pulseWaveCoefficients(duty: number, harmonics: number): { real: Float32Array; imag: Float32Array };
export function noiseSamples(length: number, seed?: number /* 0x5eed */): Float32Array;
/** Schedules every voice of `def` at `when`; returns a stop function (5-ms fade, then stop). */
export function scheduleSfx(ctx: BaseAudioContext, def: SfxDef, when: number, out: AudioNode, noise: AudioBuffer): () => void;
/** `storage` defaults to localStorage, or null when that access throws. */
export function loadSoundOn(storage?: Pick<Storage, 'getItem'> | null): boolean;
export function saveSoundOn(on: boolean, storage?: Pick<Storage, 'setItem'> | null): void;
export function useSfx(): { play(name: SfxName): void; soundOn: boolean; setSoundOn(on: boolean): void };
```

There is one module-level player behind `useSfx`, exposed through `useSyncExternalStore`, so every `SoundToggle` stays in sync. It adds no fields to the app store. `PixelLayer` re-renders when `view`, `climberHeightPx` or `scene` change. Between changes it renders only at `nextChangeAt`: every frame while a puff is alive, and otherwise one timeout per target phase.

## Acceptance Criteria

**Palette and contrast (unit)**
1. `PALETTE` has exactly 16 entries. Index 0 is `null`, and the 15 hex values are distinct.
2. Each role and limb colour (lime, sun, chalk, bloom, tide, ember) has `worstCaseContrast ≥ 3.0`. The expected values are 3.44, 3.62, 4.03, 3.13, 3.19 and 3.10 (± 0.01).
3. **Colour-blind safety.**
   - **Method:** Machado, Oliveira & Fernandes 2009 matrices at severity 1.0 (pinned in the test), applied to linear sRGB and clamped to 0–1, then converted to CIELAB (D65) and compared with ΔE76.
   - **Role colours:** under protanopia, deuteranopia and tritanopia, the four role colours must be pairwise ≥ 20 ΔE76 apart. The review computed minima of 32.4 (protan), **21.5** (deutan, chalk vs bloom) and 21.9 (tritan, sun vs chalk).
   - **Limb colours:** tide and ember must be ≥ 60 apart. The minimum computed is 74.4 (protan).
   - **Achromatopsia:** lime and sun differ by only 3.6 L*, so start and finish rely on shape alone.
   - **Shape:** the four role markers drawn on the same 12×12 frame (strokes and the flag, not text) have pairwise mask IoU **≤ 0.5**. The target is measured as drawn, on its frame grown to 13 × 13 (`TARGET_FRAME_MIN`, Amendment 2026-11-02), so its centre is open.
4. Every outfit uses only palette indices, with a top of `worstCaseContrast ≥ 3.0` and bottoms of ≥ 1.8.

**Buffer and grid (unit)**
5. `bufferFromText(bufferToText(b))` equals `b`, and `bufferFromText` skips `#` header lines and throws on ragged rows. `blit` writes the exact palette RGB with alpha 255 for indices 1–15, and `0,0,0,0` for index 0.
6. **Pixel size on a phone** (box 343 wide, `scale` 343/1536, `dpr` 2.625):
   - `pixelSize(399.36, …)` = **5**, art height 46.8. 399.36 = 0.26 × 1536 is the uncalibrated default.
   - `pixelSize(424.32, …)` = **5**, art height 49.7. 424.32 = 170 cm × 2.6 × 1536/1600 is the calibrated B1 sample.
   - `minPixelSize(2.625)` = 5, `minPixelSize(1)` = 2 and `minPixelSize(3)` = 6.
   - **Desktop:** `pixelSize(399.36, { scale: 0.5, dpr: 1, … })` = **4**.
   - `pixelSize(0, …)` and `pixelSize(NaN, …)` = `Pmin`.
7. **Hysteresis** (`dpr` 2.625, so Pmin = 5): with `prev = 5`, an `H_dev` of 280 (art height 56) keeps 5, and 310 (62) gives 6. Without `prev`, 310 gives 6. With `prev = 1` (below Pmin), `prev` is ignored.
8. **Grid size:** `artGrid` for a 343 × 333 box at dpr 2.625 with P = 5 is **181 × 175**. Its CSS width (181·5/2.625 = 344.76 px) covers the box, and the overflow is clipped by the parent. A 0 × 0 box gives a 0 × 0 grid.
9. `artPixel` puts a point exactly on an art-pixel boundary into the pixel to its right or below it.

**Climber (unit, exact goldens)**
10. **Anchors:** the anchor pixel of each hand and foot sprite equals `artPixel(joint)` exactly, and the head sprite's anchor equals `artPixel(head)`. The drawn contact is therefore less than 1 art px from the solver's point on each axis, which is `P / (scale·dpr)` image px (≈ 8.5 image px on the phone fit; see Open Question 9).
11. **Thickness:** `limbThickness(48)` = arm 2, thigh 4, shank 3. `limbThickness(60)` = 3, 5, 4. `limbThickness(36)` = 2, 3, 2. `limbThickness(30)` gives `compact: true` with every limb at 1.
12. **Outline:** after `rasterClimber` with mood `'ok'` or `'strain'`, no fill pixel is 4-adjacent to a clear pixel.
13. **Mirror:** take the symmetric `hang-48` pose on a grid where `toArt` is the identity, with an odd-width buffer, the pelvis on the centre column, and every joint's x at an art-pixel centre (k + 0.5), so no x lies on a pixel boundary. Its left-right mirror (with the left foot sprite mirrored, anchor (2,2)) gives exactly the column-reversed buffer.
14. **Draw order:** in `cross-48`, swapping the `z` of the two arms changes which arm's outline crosses the other. Without `z`, the order is `lf, rf, lh, rh`. Every hand and foot sprite is fully visible, never under the trunk or the head. The old start pose is the regression case: its right hand lies inside the shoulder–hip quad, and it shows in full with an ink outline.
15. **Selected limb:** `selected: 'rf'` changes only the outline pixels 4-adjacent to the right foot sprite's fill, from ink to sun. Every other pixel matches `hang-48`.
16. **Mood:** with `'fail'`, every fill pixel where `(x + y)` is odd is clear, and the ink outline matches `'ok'` exactly. With `'strain'`, exactly 6 tide pixels and their ink outline are added next to `'ok'`, and nothing else changes.
17. **Goldens:** each of these matches its `.txt` golden exactly:
    - `hang-48`, `reach-left-48`, `campus-48` (feet off; open hands where `gripping` is false), `compact-24`, `fail-48`, `strain-48` and `selected-rf-48`;
    - `hang-48` in each of the 4 outfits;
    - `edge-48` (a climber half off the grid's left edge, clipped).

    **17b.** A source-text test checks that `sprites.ts`, `font.ts` and `sfx.ts` carry the provenance comment before every sprite, the glyph table and every effect.

**Markers, gaps, puffs (unit, exact goldens)**
18. **Frame:** `markerFrame` gives 7×7 for a 3×3 art bbox and 40×24 for a 50×20 bbox, centred on the bbox (the extra pixel goes right or below).
19. **Goldens:** each role matches its golden at frames 7×7, 12×8 and 30×30. A `planned` marker with `step: 12` shows "12", one with `step: 140` shows "99", and one with `step: 0` shows "1".
20. **Overlap:** a hold that is both start and planned shows the ring, the number and the brackets. A target drawn over the climber stays fully visible. Two planned markers for the same `holdId` draw only the last one. The start brackets are drawn over the climber: on the old start pose, all four corner brackets of hold 1's start marker show, and both hands stay fully visible (`scene.test.ts`).
21. **Target breathing:** the ticks sit 1 px in for `timeMs` 0–299 and 2 px in for 300–599, repeating. That is one phase change every 300 ms (≈ 1.7 on/off cycles a second), within the "Never flash more than 3 times a second" rule. With `reducedMotion`, they sit 1 px in at every time.
22. **Reach gap:** pixels alternate between the limb colour and ink, starting with the limb colour at the limb's end.
23. **RNG:** `createRng(1)` returns `0.6270739406`, `0.0027357212` and `0.5274470400` (to 1e-10). `noiseSamples(2)` = `[0.420064, -0.427327]` (to 1e-6). Both were recomputed during the review.
24. **Puffs:**
    - `puffParticles(s, a)` is identical across calls and returns ≤ 8 particles.
    - It returns none for `a < 0` or `a ≥ 600`.
    - Seeds 1 and 2 differ in at least one particle at `a = 100`.
    - `renderScene` draws at most the 6 newest puffs, and none with `reducedMotion`.

**Clipping and empty input (unit)**
25. A marker, reach gap, puff or climber wholly outside the grid leaves the buffer unchanged and does not throw. One partly outside draws only its in-grid pixels. `renderScene` on an empty scene gives an all-clear buffer, and on a 0 × 0 grid it does not throw. A climber with a `NaN` joint draws nothing.

**Font (unit)**
26. All 50 glyphs exist. Each is 7 rows of masks below 32, and no two are identical. The pairs 0/O, 1/I, 5/S, 8/B and 2/Z differ by at least 3 pixels. Lowercase renders like uppercase, and `'é'` and `'ß'` each render as one `'?'`.
27. `measurePixelText('MOVES 07')` = 47 × 7. `'AB\nC'` gives 11 × 16, `''` gives 0 × 0, and `'MOVES 07'` with an outline gives 49 × 9.

**Scene (unit)**
28. **Determinism:** `renderScene` gives the same buffer for the same input and returns the same buffer object it was given.
29. **Next change:** `nextChangeAt` gives the next multiple of 300 ms while a target is present (and reduced motion is off), the current time while a puff is alive, the smaller of the two when both apply, and `null` otherwise.

**Sound (unit, no audio played)**
30. **Effect table:**
    - `SFX` durations are tick 0.035, grab 0.10, slip 0.24, fall 0.70 and send 0.85 s (± 0.001), and no voice's `end` or last ramp is after its effect's duration.
    - Every voice peaks at ≤ 0.25, and overlapping peaks within an effect add up to ≤ 0.5.
    - Every `exp` target is ≥ 0.0001, and so is the value before it.
    - The send lead plays 392.00, 587.33, 493.88 and 523.25 Hz, in that order (re-voiced 2026-11-01).
31. `pulseWaveCoefficients(0.25, 32)` returns arrays of length 33 with `real[0] = 0`, `real[1] = 0.45016` and `real[2] = 0.31831` (± 1e-5), and every `imag` value is 0.
32. On a recording fake `BaseAudioContext`, `scheduleSfx` creates the oscillator types, filters and buffer sources from the table and calls the matching `AudioParam` methods with the table values offset by `when`. Its stop function ramps the gain down and stops every node.
33. **Saving the choice:**
    - With no stored key, sound is **off**.
    - A storage whose getter or methods throw also leaves it off, without throwing.
    - `saveSoundOn(true, s)` writes `'on'` under `bouldering-vis:sound`, and a stored value of `'off'` loads as off.

**Components (Vitest + Testing Library)**
34. **Audio context:**
    - While sound is off, no `AudioContext` is constructed (the constructor spy count is 0 after 5 `play()` calls).
    - After the user turns sound on, one context is created and then reused.
    - Nothing plays while `document.hidden`.
    - With sound loaded as on, the context is created on the first `pointerdown` and not before.
    - A suspended context makes `play()` call `resume()` without throwing.
35. `SoundToggle` is a `<button>` named "Sound", with `aria-pressed` that follows the state. Toggling it writes the stored value, and two toggles on one page stay in sync.
36. `PixelButton` renders a native `<button>` with the `px-button` class (`min-width` and `min-height` 44 px). It passes `disabled` and `onClick` through, and its accessible name is `label`.
37. `Stars` has `aria-label` "2 of 3 stars". Hollow and filled stars differ in shape (the hollow interior is clear).
38. **GripMeter:**
    - It has `role="meter"`, `aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow = round(clamp(value)·100)` and `aria-label = label`.
    - It fills `round(clamp(value)·10)` of 10 segments, and NaN fills 0.
    - Each tone has its own icon (`ok` tick, `warn` `!`, `fail` `×`), not only its own colour.
39. `MoveCounter` shows `MOVES 07` for 7 and `MOVES 99` for 140. Its visually hidden text is "7 moves" and "140 moves".
40. **PixelLayer:**
    - With a stub 2D context (the test overrides the `getContext` stub from `tests/setup.ts`), it calls `putImageData` with the bytes of `blit(renderScene(…))`.
    - With a 0 × 0 box it calls neither `createImageData` nor `putImageData`.
    - It keeps P under hysteresis when the box grows by 1 px.

**E2E (Playwright, both projects: `desktop` and `phone` = Pixel 7 at 375 × 740, fake ML, dev gallery)**
41. **Gallery `hang-48` scene:**
    - `getImageData` on the `.px-layer` canvas equals, byte for byte, `blit` of the buffer that the page renders with the module's own `renderScene` for the same view and dpr. This tests the plumbing; the exact art is AC 17.
    - The canvas has computed `image-rendering: pixelated`, `pointer-events: none`, and a CSS width of `width·P/dpr` (± 0.01 px).
    - Its parent clips overflow.
42. Each `PixelButton` and `SoundToggle` bounding box is **≥ 44 × 44 CSS px** at 375 px wide. There is no horizontal scroll and no console error.
43. Turning sound on and reloading keeps the toggle on, and after the first tap the context's state is `'running'`. A new browser context where `localStorage` throws (via `addInitScript`) starts with sound off and still works.
44. With `reducedMotion: 'reduce'` emulated, the target marker's pixels are the same at 0 ms and 400 ms (driven through the gallery's fake clock), and no puff pixels appear.
45. `npm run build` output contains no gallery code: `scripts/check-dist.ts` fails if any file in `dist/` contains the string `px-gallery`, and `check-dist.test.ts` covers that check.

**Performance**
46. **Frame cost:** median of 200 frames after 20 warm-up frames, for `renderScene` + `blit` + `putImageData`, measured in Chromium on the gallery's bench page by the frame-cost runner (private):
    - `busy` fixture (260 × 260 grid, larger than the 181 × 175 phone grid; a climber at art height 60, 20 markers, 6 puffs): **≤ 1.5 ms** on the dev laptop, and **≤ 4 ms** under 4× CPU throttling.
    - `busy-desktop` fixture (700 × 500 grid): **≤ 3 ms** unthrottled.

    The 4× throttle is a rough proxy for a mid-range phone, not a measured equivalent. A physical phone run is recorded in Check Results when one is available.
47. **Idle and blink:** with no prop changes, a `PixelLayer` with no target and no puffs schedules **0** rAF callbacks and 0 timeouts in 1 s. With only a target, it renders **≤ 4** times per second and schedules no rAF between phase changes. It renders every frame only while a puff is alive (≤ 600 ms after the last puff's birth).

**Originality and real use (manual, recorded in Check Results)**
48. **Originality review:** a reviewer agent with a pixel-art and games-history persona compares the climber (against the silhouette rules above), markers, star, font and the 5 effects with well-known games, and lists any likeness it finds. The user decides on any flagged item. This review is a check, not a legal clearance.
49. **Real-photo check:** on the earlier sample route on a phone (Pixel 7 emulation, and a physical phone if one is available), at the default climber size:
    - the climber's hands read as on their holds;
    - every role marker can be told apart;
    - under Chrome DevTools "Emulate vision deficiencies" (protanopia, deuteranopia, tritanopia, achromatopsia), the roles are still clear by shape.

## Testing

- **Unit (Vitest):** `palette`, `buffer`, `view`, `raster` (capsule, 1-px, quad and clipping rules), `sprites`, `outfits`, `climber`, `markers`, `rng`, `puffs`, `font`, `scene` and `sfx`, covering AC 1–33. Each `*.test.ts` sits next to its file.
- **Component (Vitest + Testing Library):** `PixelLayer`, `PixelButton`, `Stars`, `GripMeter`, `MoveCounter`, `SoundToggle`, and `useSfx` with a fake `AudioContext` and fake storage, covering AC 34–40 and 47.
  - The `PixelLayer` test installs its own 2D context stub over the `tests/setup.ts` null stub. The stub records `createImageData` and `putImageData`, and rAF and timeouts are counted with fake timers, in the test only.
- **E2E (Playwright, fake ML, both projects):** `e2e/pixel-kit.spec.ts` against the dev-only gallery page `px-gallery.html` at the repo root. Vite serves it in dev, and `vite build` leaves it out because the build input is only `index.html`, so no config change is needed. Covers AC 41–45.
- **Timing:** the frame-cost runner (private) runs against the gallery's bench page on the fake-ML dev server (AC 46). The real-model timing runner (private) is not used, because it needs real models and drives the Studio.
- **Fixtures** (`tests/fixtures/pixel-kit/`):
  - `poses/*.json`: joint sets in image px, plus `heightPx`. They are recorded once from `solveStance` by `scripts/record-pixel-poses.ts`, so unit tests never import `climber-stance`. Hand-made symmetric and cross poses use art-pixel-centre coordinates (AC 13).
  - `goldens/*.txt`: the expected buffers. Line 1 is `# <name> <w>x<h> P=<px>`, followed by one character per pixel (see `bufferToText`). They read as ASCII art in review.
- **Golden policy:** `npm test` only compares, and a missing golden fails. Goldens are written only by `UPDATE_PIXEL_GOLDENS=1 npx vitest run src/modules/pixel-kit`. Every changed golden must be in the PR diff and looked at by the reviewer. Never update a golden to make a failing test pass without saying why in the commit.
- **Integration (in `play-shell`, not here):**
  - An adapter test feeds a real stance through `rasterClimber`, converting `Vec3` tuples to `{x, y, z}` and `joints: null` to `climber: null`.
  - It includes a compile-time check that climber-stance's `Limb` and `JointName` can be assigned to `PixelLimb` and `PixelJointName`.
  - Where it may import climber-stance from is Open Question 7.

## Boundaries

**Always**
- Draw original art only, with a provenance comment on every sprite, the glyph table and every effect (AC 17b).
- Draw through `COLOR` indices only. No hex values outside `palette.ts`.
- Give every role both a shape and a colour, and outline every sprite, marker and glyph in ink (chalk puffs are the one exception).
- Use whole device pixels per art pixel and nearest-neighbour scaling. Never smooth the pixel layer.
- Clip every draw to the buffer, and handle empty scenes and zero-size boxes without throwing.
- Keep sound off by default, keep audio off until the user turns sound on, and wrap storage in try/catch.
- Honour `prefers-reduced-motion`, including changes while the page is open: no breathing and no puffs.
- Use deterministic functions with a seeded RNG, and take time as an input.
- Leave the pixel layer `pointer-events: none` and `aria-hidden`, so the HUD and the photo never shift.
- Write tests first, and include golden diffs in the PR.

**Ask first**
- Adding a font dependency (Press Start 2P, Open Question 1), or any sprite, audio or game library.
- Growing the palette past 16 entries, or changing role colours or shapes after `play-shell` ships.
- Adding any audio file.
- Importing another module from `pixel-kit`, which would change the capability map.
- Changing Studio's overlay or badge colours, or `SelectionCanvas`'s props (Open Question 7).

**Never**
- Copy, trace, recolour or remake "inspired by" any sprite, font, tune, jingle or sound effect from an existing game, and never use ripped assets.
- Use `Math.random`, `Date.now`, `performance.now` or timers inside the pure functions (everything except `PixelLayer` and `useSfx`).
- Autoplay sound, or flash more than 3 times a second.
- Make any network request. Fonts and everything else are self-contained, with no CDN and no analytics (SPEC-game › Ask first covers network features).
- Upload anything, or train or serve models on a GPU (memory `no-gpu-budget`). Use Canvas 2D only: no WebGL and no game engine (SPEC-game › Tech Stack).
- Let rendering change game state.

## Tasks

Each task is one commit on the step-2 branch.

**T1. Palette and buffer**
- Acceptance: AC 1–3 (colour parts) and 5.
- Verify: `npx vitest run src/modules/pixel-kit/palette src/modules/pixel-kit/buffer` and `npm run lint`.
- Files: `src/modules/pixel-kit/palette.ts`, `palette.test.ts`, `buffer.ts`, `buffer.test.ts`, `index.ts`.

**T2. Grid and raster primitives** (capsule and 1-px line rules, quad fill, 4-neighbour outline, sprite stamping, clipping)
- Acceptance: AC 6–9, plus line goldens (a 45° line, a shallow line, a t = 3 capsule, a line clipped at the edge).
- Verify: `npx vitest run src/modules/pixel-kit/view src/modules/pixel-kit/raster`.
- Files: `view.ts`, `view.test.ts`, `raster.ts`, `raster.test.ts`, `tests/fixtures/pixel-kit/goldens/lines-*.txt`.

**T3. Sprites and outfits** (the grids in this spec; the outfits table)
- Acceptance: AC 4, and AC 17b for `sprites.ts`. The head, hand and bag grids are left-right symmetric, and the left foot is the mirror of the right.
- Verify: `npx vitest run src/modules/pixel-kit/sprites src/modules/pixel-kit/outfits`.
- Files: `sprites.ts`, `sprites.test.ts`, `outfits.ts`, `outfits.test.ts`.

**T4. Climber rasteriser** (needs T2 and T3)
- Acceptance: AC 10–17, and AC 25 for the climber.
- Verify: `npx vitest run src/modules/pixel-kit/climber`, then review the goldens in the diff.
- Files: `climber.ts`, `climber.test.ts`, `scripts/record-pixel-poses.ts`, `tests/fixtures/pixel-kit/poses/`, `tests/fixtures/pixel-kit/goldens/climber-*.txt`.

**T5. Pixel font** (needs T2)
- Acceptance: AC 26–27, AC 17b for `font.ts`, plus a golden of the whole glyph sheet.
- Verify: `npx vitest run src/modules/pixel-kit/font`.
- Files: `font.ts`, `font.test.ts`, `tests/fixtures/pixel-kit/goldens/font-sheet.txt`.

**T6. Markers and reach gaps** (needs T2 and T5)
- Acceptance: AC 3 (IoU), 18–22, and AC 25 for markers and gaps.
- Verify: `npx vitest run src/modules/pixel-kit/markers`.
- Files: `markers.ts`, `markers.test.ts`, `tests/fixtures/pixel-kit/goldens/marker-*.txt`.

**T7. RNG and chalk puffs**
- Acceptance: AC 23 (RNG part), AC 24, AC 25 for puffs, and a recorded source and licence for mulberry32.
- Verify: `npx vitest run src/modules/pixel-kit/rng src/modules/pixel-kit/puffs`.
- Files: `rng.ts`, `rng.test.ts`, `puffs.ts`, `puffs.test.ts`.

**T8. Scene and PixelLayer** (draw order, dedupe, `nextChangeAt`, the layer canvas and its CSS)
- Acceptance: AC 25 (scene), 28, 29, 40 and 47.
- Verify: `npx vitest run src/modules/pixel-kit/scene src/modules/pixel-kit/PixelLayer`.
- Files: `scene.ts`, `scene.test.ts`, `PixelLayer.tsx`, `PixelLayer.test.tsx`, `src/app/app.css` (`.px-layer`).

**T9. HUD components** (`PixelText`, `PixelButton`, `MoveCounter`, `GripMeter`, `Stars`, and the `PixelIcon` set; needs T5)
- Acceptance: AC 36–39. A HUD art pixel is `round(scale·dpr)/dpr` CSS px.
- Verify: `npx vitest run src/modules/pixel-kit/hud`.
- Files: `hud/PixelText.tsx`, `hud/PixelButton.tsx`, `hud/icons.ts`, `hud/Hud.tsx`, `hud/Hud.test.tsx`, `src/app/app.css` (`.px-*`).

**T10. Sound effects** (the `sfx.ts` core needs T7; `SoundToggle` needs T9)
- Acceptance: AC 23 (noise part), 30–35, and AC 17b for `sfx.ts`.
- Verify: `npx vitest run src/modules/pixel-kit/sfx src/modules/pixel-kit/useSfx src/modules/pixel-kit/SoundToggle`.
- Files: `sfx.ts`, `sfx.test.ts`, `useSfx.ts`, `useSfx.test.tsx`, `SoundToggle.tsx`, `SoundToggle.test.tsx`.

**T11. Dev gallery, E2E and timing**
- Acceptance: AC 41–46.
- Verify: `npm run e2e -- e2e/pixel-kit.spec.ts`, the frame-cost runner (private; with `npx vite` running), and `npm run build`.
- Files: `px-gallery.html`, `src/modules/pixel-kit/gallery.tsx` (not exported from `index.ts`), `e2e/pixel-kit.spec.ts`, the frame-cost runner (private), `scripts/check-dist.ts`, `scripts/check-dist.test.ts`.

**T12. Originality review and real-photo check**
- Acceptance: AC 48–49, recorded in a Check Results section. `npm test`, `npm run lint`, `npm run build` and `npm run e2e` all pass. Lighthouse accessibility is ≥ 95 on the dev gallery and is unchanged on the app.
- Verify: the reviewer agent report and the manual phone check on the earlier sample route.
- Files: `SPEC-pixel-kit.md`.

Dependencies: T1 → T2 → (T3 ∥ T5 ∥ T7). T3 → T4. T5 → T6. (T4, T6, T7) → T8. T5 → T9. T7 → T10 (the core), and T9 → T10 (`SoundToggle`). (T8, T9, T10) → T11 → T12.

## Builder's Calls

Small choices made while building, each with its reason. None changes an AC.

- **T8, future puffs:** `nextChangeAt` returns a puff's `bornMs` when it is still to come, because the picture changes then. Only the drawn puffs (the 6 newest) count.
- **T8, waking late:** `PixelLayer` waits `next − now + 1 ms`, because a timer can fire a hair early against `performance.now` and would cost a second, identical render.
- **T8, nothing to draw on:** with a 0 × 0 grid or no 2D context, `PixelLayer` sizes the canvas and schedules nothing.
- **T8, layout effect:** `PixelLayer` draws in `useLayoutEffect`, so a pan or zoom moves the photo and the layer in the same frame.
- **T9, icons:** 7 × 7 grids (the star 9 × 9) in `hud/icons.ts`, each with a provenance comment and an ink outline. The hollow star is the filled star's edge, so the two differ in shape by construction.
- **T9, tone colours:** `ok` lime, `warn` sun, `fail` bloom; empty meter segments are dusk. The icons carry the meaning, so the colours only need to differ.
- **T9, button content:** `PixelButton` draws its icon and its label, defaults to `type="button"` (no accidental form submit) and uses the app's button colours with square corners.
- **T9, move count wording:** the hidden text says "1 move" for one and "N moves" otherwise; a non-finite count counts as 0.
- **T10, provenance wording:** each `SFX` entry is preceded by `// original, composed for Bloc Hall, <date>`, because "drawn" does not fit a sound. The AC 17b test checks that text.
- **T10, voice ends:** the table gives no end for `grab`'s chalk tap, so it stops at 0.03 s, just after its 0.02-s decay. Every other voice ends at its effect's "Ends at", except `fall`'s thump, which starts at 0.55 and ends at 0.70.
- **T10, turning sound off:** stops the effects that are playing and keeps the context for the next time. `saveSoundOn(false)` writes `'off'`.
- **T10, toggle feedback:** turning sound on plays `tick`, so the player hears that it worked.
- **T11, gallery modes:** `px-gallery.html` shows the fixed E2E scenes, a live showcase (outfits, moods, puffs on demand) and the HUD; `?bench` shows only the bench, so no live layer competes with it; `?photo` is an empty photo stage for the AC 49 check. E2E reads `window.pxGallery` (expected pixels, the fake clock, the audio state).
- **T11, no gallery styles in app.css:** the gallery's own classes (`px-gallery-*`) are styled in `px-gallery.html` and inline, so the string `px-gallery` can never reach `dist/` through the app's CSS. `check-dist.ts` also fails on a file whose name contains it.
- **T11, bench frames:** each frame is timed inside its own rAF callback, the scene object is built outside the timed part, and the 6 puffs are re-born each frame so all of them stay alive. The frame-cost runner takes the dev server's base URL (default `http://localhost:5173`), so a lane can point it at its own port.
- **Font redraw (2026-11-01):** the glyphs that matched the HD44780-like LCD forms were redrawn, and the provenance comment says so. Spec › Never forbids copying or remaking a font, and accurate provenance is standard licence hygiene: a comment that says "original" over a near-copy is worse than either alone.
- **End sprites on top (2026-11-01; role: game designer, feel):** hand and foot sprites are always drawn after the trunk and the head. Contact points are the game's core information, and readability rules say key gameplay information is never covered. The head is included because it can cover a hand just as the trunk can. Goldens: none of the existing climber goldens changed, since no hand or foot overlaps the trunk or the head in those poses. The old start pose (new then; since replaced by `split-start`; recorded by `scripts/record-pixel-poses.ts`) pins the case.
- **Start brackets over the climber (2026-11-01; role: game designer, feel):** start markers are drawn after the climber, so their corner brackets always show. Engines render UI overlays after the scene (Unity's overlay canvas, for example), and the brackets leave the hold centre clear, so they never cover a hand. The finish diamond stays under the climber, because its strokes cross the middle of the hold's sides, where a hand can be. The rest of the order is unchanged. No golden changed: the marker and climber goldens draw one layer each, and no scene golden exists. The order is pinned by `scene.test.ts`.
- **Target label placement (2026-11-01):** follows the cartographic rule that a label never covers the feature beside it.
  - **When it moves:** the limb glyph stays centred below the frame unless that would cover a hand or foot sprite (its box plus the 1-px outline, from `contactBoxes`). Then it goes to the side away from the nearest contact, by centre distance.
  - **Fallback order:** below, above, right, left. The first side that covers no contact and fits in the buffer wins. Failing that, the first clear side wins, and failing that, the side away from the contact.
  - **Tests:** `targetLabelAt` is pure and deterministic. `markers.test.ts` covers a target above the right foot of `hang-48`: the old spot covered the foot, and the label now goes above while the foot stays exactly as the climber alone draws it.
  - **Goldens:** none changed. The marker goldens have no climber, so the old spot always fits.

## Check Results

### AC 46: frame cost (T11 and T12, 2026-11-01)

The frame-cost runner (private), headless Chromium 156 (Playwright 1.64.1), on the dev laptop (Apple M1, 8 cores), fake-ML dev server. The machine was under heavy unrelated load from other lanes' test runs; the 1-minute load average is shown per run. Medians in ms, with p90 in brackets. CI is the reference for timing.

| Run (load) | `busy` 260 × 260, 1× (≤ 1.5) | `busy`, 4× throttle (≤ 4) | `busy-desktop` 700 × 500 (≤ 3) |
|---|---|---|---|
| 1 (33–35) | **0.75** (1.02) ✅ | **2.99** (4.15) ✅ | **1.88** (2.27) ✅ |
| 2 (26–27) | **1.31** (1.62) ✅ | **4.30** (5.88) ❌ | **2.84** (4.13) ✅ |
| 3 (23–27) | **0.79** (1.07) ✅ | **2.23** (2.85) ✅ | **1.82** (2.03) ✅ |
| 4 (22–23) | **0.74** (1.03) ✅ | **3.33** (4.01) ✅ | **2.51** (2.87) ✅ |

⚠️ The unthrottled budgets held in all 4 runs. The 4× budget held in 3 of 4. Run 2 was slower on every fixture at about the same load, which points at contention from the other lanes rather than at the code. The 4× margin is thin on this loaded machine, so it should be confirmed on CI or a quiet machine. No physical phone run yet.

### AC 48: originality review (T12, 2026-11-01)

A reviewer agent with a pixel-art and games-history persona read the sprites, outfits, climber goldens, markers, icons, meter, font and the 5 effects (`sfx.ts`). Its verdicts, summarised (this is a check, not a legal clearance):

| Item | Verdict |
|---|---|
| Climber (hang, reach, strain, fail) | **No likeness.** It follows the silhouette rules; the back view is the strongest difference from side-on and front-on game heroes. There is no pompom, so it does not echo the Ice Climbers' hoods. |
| Outfits | Generic colour echoes only. `starter` (red hat, cyan top) loosely echoes the red-over-blue of Madeline and Mario. `moss` (all green) reads a little "Link-ish" at thumbnail size, though it has no tunic and no pointed hat. |
| Ghost dither, sweat drop | Generic conventions of the era. |
| Markers | Generic. The finish pennant on a diamond is not the SMB goal flag, which points the other way, carries an emblem and stands on a tall pole with a ball on top. |
| Star, icons, meter | Generic. A 5-point star with no eyes, standard arrows, speaker, check, `!` and ×. |
| `tick`, `grab`, `slip`, `fall` | Generic families: a UI click, an upward sweep, a stuttered descending square and a slide-whistle fall. No note-level match. |
| `send`, first version (G4 C5 D5 G5 over G3; since re-voiced) | **Not a known jingle**, with partial echoes. It shares the C–D–G tail of the SMB 1-Up, but the 1-Up has six even notes and a distinctive E–G–E′ opening. Its contour is close to the traditional "Charge!" call (G C E G), which is not a game asset. The reviewer could not check every level-up fanfare. |
| **Font (5×7)** | **Close to the Hitachi HD44780 LCD character ROM**, the de facto 5×7 font, also Adafruit GFX's default. From memory, the reviewer puts about 40 of the 50 glyphs as identical; A, G, M, 1, 3, 7 and % differ. No game font is involved, since NES, Game Boy and arcade fonts are 8×8. A 5×7 grid leaves little room, so independent fonts converge on these shapes, but a match this exact is more than that. The reviewer's count was not checked against a published table. |

**Flagged for the user to decide:**
1. **The font (T5).** Its provenance comment says "original, drawn for Bloc Hall", but the glyphs are at least very close to the HD44780 convention. The options are:
   - (a) keep the glyphs and reword the comment, for example "follows the common HD44780-style 5×7 convention";
   - (b) redraw enough glyphs to give the font its own character, keeping AC 26's 3-pixel pair rule and regenerating `font-sheet.txt` and the marker goldens that contain digits.

   Not changed in T12: it was the user's call, and it changes T5's committed art.

   **Decided 2026-11-01 (coordinator): option (b), done.** Every glyph whose shape is a free choice on a 5 × 7 grid was redrawn:
   - **Letters:** B with a smaller top bowl; C open with flat terminals; D with a serifed stem; E and F with a short middle bar; G with a spur; I with wide serifs; J with a full-width top bar; K joined by a 3-px spur; M and W as flat-shouldered mirror pairs; N with a stepped diagonal; P with a deep bowl; Q with a tail below the bowl; R with a small bowl and a long diagonal leg (a straight leg read as B in `RH` on the photo); S closed; V, X and Y with long necks (Y has a foot); Z with a crossbar.
   - **Digits:** a heavier slashed 0; 1 with a high flag; 2 with a bent neck; an open-topped 4; 5 and 6 flat; 7 with a hooked flag; 8 with a small top bowl; 9 with a straight tail.
   - **Punctuation:** `. , ! ? : + ' ( )` redrawn.
   - **Unchanged:** H, L, O, T and U (all but forced by the grid), and A, 3, `-`, `/`, `%` and `×`, which the review found already away from the LCD forms.
   - **Tests:** `font.test.ts` now keeps the common LCD forms (written from memory, for comparison only). Every glyph except H, L, O, T, U and the space is at least 2 px away from its common form; E and F are at least 1 px away, since only the bar differs. The AC 26 pair rule still holds.
   - **Goldens:** `font-sheet.txt` and the three `marker-planned-*` goldens changed. The marker IoU (AC 3) and contrast (AC 2) tests are unchanged and pass.
   - **Readability:** checked on the font sheet and on `MOVES 07`, `SEND`, `UNDO`, `SOUND`, `RH LH RF LF`, `BACK 12` and `GRIP 9`.

   **Fresh review (2026-11-01): AC 48 passed.** A fresh originality review (run separately, not in this lane) passed AC 48.
   - **Apple II:** it found that `2` and `?` matched the Apple II (Signetics 2513) 5 × 7 forms exactly, from the reviewer's memory. Both are fixed: `2` now has a 2-px shoulder on its diagonal (`...#.` then `.##..`), and `?` bends its stem left on the third-from-last row. A test pins both forms at least 2 px away. The pair rule (AC 26) still passes, and the HUD checks (`MOVES 02`, `12 2Z 22`, `SEND? 42`) read clearly. Goldens: `font-sheet.txt` and the three `marker-planned-*`, whose step numbers contain a 2.
   - **Limits:** the automated LCD-form test covers HD44780 only, plus these two Apple II forms. m5x7 and the TRS-80 character ROM were not checked.
2. Optional, not flagged as copies: move `send` further from the 1-Up tail and "Charge!" (for example G–C–E–A, or a dotted second note); give `moss` a contrasting top or brim.

   **Decided 2026-11-01 (coordinator), done:**
   - **`send`:** now G4 D5 B4 C5 over a C3 bass, with the same rhythm. The phrase is not a rising arpeggio, its tail is not C–D–G, and it is still four notes with the stars on the last three. `sfx.test.ts` pins the notes and checks the contour. It was checked against the 1-Up and "Charge!" only, by interval; no wider melody search was done.
   - **`moss`:** the top is now **sun** (worst-case contrast 3.62, so it passes the tops ≥ 3.0 rule, AC 4). The outfit reads leaf, lime and sun, not all green. The `climber-hang-48-moss` golden changed.

### AC 49: real-photo check (T12, 2026-11-01)

The earlier sample photo (1536 × 1152 working size) on the gallery's photo stage, at 375 × 740 with Pixel 7 emulation (dpr 2.625, P = 5, art height 49.7) and at desktop size.
- **Climber:** posed by the real `solveStance` (feasible) on the earlier sample route's recorded start contacts at the default climber size (H = 424, Vertical). Those are the start contacts in `stance.test.ts` (AC 32): LH crimp hold 2, RH sloper hold 1, and the feet on the pink and black wall footholds.
- **Markers:** the earlier sample route's hold list is not in the repo, so the boxes are estimated by eye from the photo. Start is on hold 1, planned 1 on hold 2 and planned 2 on a yellow hold above. The target (RH) and the finish are on holds above and to the right, with a reach gap.
- **Method:** this was a scripted check, not run by a person. The screenshots were taken with Playwright, including CDP `Emulation.setEmulatedVisionDeficiency` for protanopia, deuteranopia, tritanopia and achromatopsia, and then viewed. No physical phone was available.

| Check | Result |
|---|---|
| The left hand reads as on its hold | ✅ The grip sprite sits on the pink crimp, and both feet sit on their footholds. |
| The right hand reads as on its hold | **Re-run 2026-11-01, after the fix:** ✅ The right hand now shows in full, on top of the trunk, with its outline (sun, since it is the selected limb). The start brackets on hold 1 were still mostly under the trunk, with one of the four corner brackets showing. That was fixed by drawing start markers over the climber (Builder's Calls); see the re-run below. **First run:** ❌ It was hidden behind the trunk. In this pose the right hand (1106, 626) falls inside the shoulder–hip quad. Rendering Rules › Climber 2 always draws the trunk after the limbs ("the back faces the camera"), so the trunk covers the hand. That also covers most of hold 1's start brackets. It happens even though the solver puts the right elbow nearer the camera (z 58) than the trunk (z 34). See Open Question 11. |
| Every role marker can be told apart | ✅ Brackets, the ring with its number, the diamond with its flag, and the ticks with "RH" are each recognisable. ⚠️ When holds are close together, a target's limb glyph can cover a nearby planned number or a hand. In a first layout of this check it covered the right hand. Callers should expect this when holds are near each other. |
| Start marker, re-run 2026-11-01 (start brackets over the climber) | ✅ All four corner brackets of hold 1 show around the right hand, both hands stay fully visible, and the brackets still read in greyscale. |
| Roles under the 4 emulated vision deficiencies | ✅ The shapes stay distinct in all four. Under achromatopsia every role colour turns light grey, so shape alone carries the role, as designed (AC 3). |

### T12 gate and accessibility (2026-11-01)

- **Lighthouse accessibility** (12.8.2, mobile, on the fake-ML dev server): the dev gallery scored **100** and the app (`/`) scored **100**, the same as the T21 record. No binary audit failed.
- **Gate:** `npm test`, `npm run lint` and `npm run build` pass. E2E ran with this lane's config (`playwright.lane.config.ts`, port 5181). `e2e/pixel-kit.spec.ts` passed 12 of 12 on every run.
- **Studio failures under load:** the full suite only failed in Studio's timing and 3D tests (`pointcloud*`, `stance` "…in 3D", `feedback` pulse, `full-flow`, `progress`). This happened at load 25–95, from other lanes.
  - Those failures are not caused by this branch. Only `.px-*` CSS rules were added to `src/app/app.css`, and the app imports nothing from pixel-kit.
  - At the same load, the same 3D, stance and full-flow subset gave **17 of 38 failed on the T9 tree with this work stashed**, and 15 of 38 with it.
  - Full runs passed 134 of 134 at load ≈ 20 (T8, and T9 on its third run).
  - The final T12 runs failed 2, 20 and 29 of 146 tests at load 22–66. Every failure was in `pointcloud*`, `stance` "…in 3D", `controls`, `feedback` or `full-flow`, and `pixel-kit.spec.ts` passed 12 of 12 in each run.
  - CI is the reference.

## Amendment 2026-11-02: Target Marker Size (originality review)

Raised by the originality review of the play-feel build (SPEC-play-shell › Check Results › D1 originality), and approved with that review.

- **Problem.** On frames of 7–11 art px, the target's four inward ticks (3 px long, 1 px or 2 px in) meet at the centre in a solid upright "+". In the coach screenshots it showed on 7F as a pink cross. That is religious iconography, which the game never shows (SPEC-gym-hub › Boundaries › Never, the castle's no-religious-imagery rule).
- **Decision (builder's call).** A `target` frame is at least **13 art px** a side (`TARGET_FRAME_MIN`), grown around its centre the way `markerFrame` grows: the odd pixel goes right or down. At 13 the centre keeps a hole of at least 3 px between the ticks in both breathing phases, so a target always reads as four separate ticks pointing at a hold, never as a cross. `rasterMarkerInFrame` applies it, so every path that draws a target gets it. The other roles keep the 7–40 clamp, so their shapes stay distinct (AC 3, AC 47).
- **Tests.** `markers.test.ts` › "target centre": no tick pixel in the centre's 3 × 3 at any frame size from 7 to 16, in both phases. There are new goldens `marker-target-smallest-0` and `-300` (the smallest target, centre open). The `marker-target-7x7` and `-12x8` goldens are rewritten: they recorded the cross. The label-placement scene ("keeps a foot visible") moves its target up 3 px, so the grown frame ends on the same row as before, just above the foot.

## Amendment 2026-11-06: Invented Start Pose (ADR-0003)

**AC 14 and AC 20, amended.** Their regression fixture is now `split-start`, an invented split start. The old start pose was solved from contact points taken off a photo that the public release keeps private ([ADR-0003](docs/adr/0003-public-repo.md) (d)), so its tests could not ship. Where AC 14, AC 20 and Builder's Calls › End sprites on top name the old start pose, read `split-start`.

- **The pose.** `scripts/record-pixel-poses.ts` solves it with `solveStance` at height 424 on a vertical wall: the left hand on a crimp up and to the left, the right hand on a sloper low near the body's midline, and the feet on two blobs below, all inside a 1536 × 1152 photo. Like the old start pose, its right hand lies inside the shoulder–hip quad (Open Question 11).
- **AC 20's hold.** The start marker is hold `b`, with an invented 80 × 80 image-px box centred on the right hand, in place of hold 1.
- **Tests.** The assertions are unchanged (`climber.test.ts`, `scene.test.ts`), and so is the phone-fit view (P = 5). Drawing the start brackets before the climber, or skipping the end-sprite pass, fails the matching test. No golden changed.

## Open Questions

1. **Resolved 2026-10-31 (user): the original 5×7 font.** For the record, the rejected option (a) was to self-host **Press Start 2P** (SIL OFL 1.1) as a `woff2` in `public/fonts/`, with its licence file. It reads well and also works for DOM text, so it would scale with browser text zoom, which helps WCAG 1.4.4 and 1.4.5. But it is a new dependency (ask first), its 8×8 glyphs are wide (fewer characters fit a 343-px HUD), and its look is a common arcade style rather than ours. This spec recommends option (b), the original 5×7 font. Does the user want (a) instead, or both (a for headings, b for HUD numbers)?
2. **Hub sprites:** should the side-view walk cycle for `gym-hub` be specified here as an amendment (keeping all sprites in one module), or in `SPEC-gym-hub.md` using this module's palette and raster primitives?
3. **Limb tint:** should the climber's limbs carry the left/right tint (tide/ember) as the Studio overlay does? This spec says no. Outfit colours keep the character readable, and the left/right cue comes from the selected-limb outline, the target glyph and the move tray. A playtest may show players need it.
4. **Weight shares on the wall:** should the pixel layer show load pips (0–5) next to each contact, or should the numbers stay in the move tray only (`play-shell`)?
5. **Head lean:** should the head get lean-left and lean-right frames picked from the trunk angle? The proposal is to ship upright only and revisit after the first playtest.
6. **Outfit count:** are 4 outfits enough at launch? This is to be settled with `progression`'s unlock pacing.
7. **`play-shell` integration (for the `play-shell` spec):**
   - hold-segmentation does not export `Viewport`, and `SelectionCanvas` keeps it in internal state (it only exposes `data-scale`, `data-tx` and `data-ty`). How does `play-shell` get `PixelView`? Options are a new `onViewport` prop (a Studio-module change, so ask first), or reusing `drawExtras`.
   - Should `SelectionCanvas`'s own badges, outlines and pulse ring be hidden in Play mode, so they don't sit on top of the pixel markers?
   - The map has no `play-shell → hold-segmentation` or `play-shell → climber-stance` arrow. Where may the adapter and its tests import those types from (a re-export from `beta-moves`, or a map change)?
8. **Unplanned route holds:** should holds in the tagged route that are not yet in the plan get their own subtle marker, so the player can see where they can go? That would mean a fifth role and a fifth shape, re-checked under AC 3.
9. **Contact accuracy:** SPEC-game success criterion 3 asks for planted contacts within 2 px at the working resolution. Drawing quantises to art pixels, which is about 8.5 image px on the phone fit. Should criterion 3 be measured on the joints before rasterising (in `move-animation`)? This spec assumes yes.
10. **Who stores what:** this spec stores the sound choice itself (`bouldering-vis:sound`). Should `progression` own that key and the player's look (skin and hair) instead, and which module owns the outfit and look picker UI?
11. **Resolved 2026-11-01 (coordinator; builder's call, role: game designer, feel): hands and feet are always drawn after the trunk** (and the head); limb segments keep their depth order. See Rendering Rules › Climber 2 and AC 14. The original question follows. **Trunk over a hand (from the AC 49 check):** Rendering Rules › Climber 2 always draws the trunk after the limbs. On the earlier sample route's start, this hides the right hand and its start hold, because the hand lies inside the shoulder–hip quad. The solver puts that elbow nearer the camera than the trunk (z 58 against 34), but the hand is on the wall (z 0), so the arm's mean z (31) is still behind the trunk, and a mean-z rule alone would not fix it. Options:
    - always draw the hand and foot sprites (or just the hands) after the trunk;
    - draw a limb after the trunk when its middle joint is nearer the camera than the trunk.

    Either way the draw-order rule, AC 14's wording and the climber goldens change, so this needs the user's decision.
