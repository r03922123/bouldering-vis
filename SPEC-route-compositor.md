# Spec: route-compositor

Module id: `route-compositor` · Depends on: `hold-segmentation` · Used by: `point-cloud-view`
Status: **APPROVED (2026-10-26)**
Parent: [SPEC.md](SPEC.md)

## Objective

Make the chosen route stand out. Selected holds keep their real pixels; the wall turns
flat `#2B2B2B`; every other hold turns flat `#8A8A8A`, or disappears into the wall when the
user switches **Show other holds** off. Chalk on selected holds is detected and shown as a
"people grab here" hint.

User stories:
- I pick holds on the real photo (Original view), then tap **Show route** to see only my line in color against a plain background.
- I turn off **Show other holds** to see the line with nothing else around it.
- I can see where the chalk is on each of my holds, which hints at the best grip spot.

## Three Pieces

### 1. Wall vs. hold mask (`segmentWall`), once per image

A color heuristic, not ML (fast and offline). Gym walls are large, fairly uniform painted panels:

1. Downsample to a 256px long edge and convert to CIELAB.
2. k-means with k = 6 (seeded, deterministic). Clusters that each cover **≥ 15%** of the pixels are **wall clusters**.
3. At full working size, a pixel is "hold" when its ΔE76 to the nearest wall-cluster center is **> 18**.
4. Clean up: morphological open (3×3), then close (5×5), then remove connected components smaller than **0.02%** of the image area (T-nut holes, screws, specks) or larger than **8%** (ceiling, beams, mats: too big to be one hold; added 2026-10-28 after the real-photo check).
5. OR in every selected hold's mask, so selected holds always count as holds.

The result is `otherHoldsMask = holdMask AND NOT (union of selected masks)`. It's computed in
`ml.worker.ts` (message `wall:segment`) because it's ~1.7M pixels. It's recomputed only when
the image changes; changing the selection reuses the cached `holdMask`.

### 2. Composite (`compositeRoute`), on every selection or toggle change

Per pixel, first match wins:

| Pixel is in… | Output |
|---|---|
| any selected hold mask | **source pixel, unchanged** |
| `otherHoldsMask` and `showOtherHolds` | `#8A8A8A` |
| otherwise | `#2B2B2B` |

Hard mask edges; no blending in the composite itself. A separate **overlay layer** (canvas
on top, not part of the composite pixels) draws a 2px white outline on selected holds (so a
black hold on a dark grey wall is still visible), the S/F role badges from `hold-segmentation`,
and the chalk overlay.

### 3. Chalk hint (`detectChalk`), per selected hold

1. The hold's **base color** is the median Lab of its mask pixels.
2. If the base color is itself bright and low-chroma (L > 75 and chroma < 15, i.e. a white or light grey hold), the result is `level: 'unknown'`, because chalk can't be told apart from the hold.
3. Otherwise a pixel is chalk when its L is ≥ base L + 20 and its chroma is < 12.
4. `ratio = chalkPixels / area` → level: `none` < 3% ≤ `light` < 15% ≤ `heavy`.
5. Also return the chalk-pixel centroid (the likely grip spot) when the level is not `none`.

## Public Interface (`src/modules/route-compositor/index.ts`)

```ts
export const WALL_COLOR = { r: 0x2b, g: 0x2b, b: 0x2b } as const;
export const OTHER_HOLD_COLOR = { r: 0x8a, g: 0x8a, b: 0x8a } as const;

export type ChalkLevel = 'none' | 'light' | 'heavy' | 'unknown';
export interface ChalkInfo {
  holdId: string;
  level: ChalkLevel;
  ratio: number;                          // 0–1; 0 when 'unknown'
  mask: Uint8Array;                       // chalk pixels, working-image size
  centroid: { x: number; y: number } | null;
}

// pure
export function segmentWall(pixels: ImageData, seed?: number): Uint8Array;           // 1 = hold
export function compositeRoute(
  source: ImageData,
  selected: readonly HoldMask[],
  otherHoldsMask: Uint8Array,
  opts: { showOtherHolds: boolean },
): ImageData;
export function detectChalk(source: ImageData, hold: HoldMask): ChalkInfo;

// UI
export function RouteView(): JSX.Element;        // composite canvas + overlay layer
export function ViewToggles(): JSX.Element;      // Original/Route, Show other holds, Show chalk, Outlines
```

Store additions: `view: 'original' | 'route'` (default `original`; **never switches automatically**),
`showOtherHolds: true`, `showChalk: true`, `showOutlines: true`.

### View modes: pick in Original, view in Route

| | Original view | Route view |
|---|---|---|
| Shows | Source photo + overlay (outlines, S/F badges, chalk) | Composite + overlay |
| Tap on an unselected spot | Adds a hold (`hold-segmentation`) | Nothing; inline hint "Switch to Original to add holds" |
| Tap on a selected hold | Deselects | Deselects |

- A **Show route** button switches to Route view. It's always present, but highlighted (primary style) only when `routeStatus().complete`.
- The Original/Route switch can be used at any time.

## Acceptance Criteria

1. **Pixel exactness (unit):** every pixel inside a selected mask equals the source RGBA; every other pixel is exactly `#2B2B2B` or `#8A8A8A` with alpha 255.
2. With `showOtherHolds = false`, no `#8A8A8A` pixels remain.
3. The composite updates within **≤ 100 ms** of a selection or toggle change (1536×1152, laptop).
4. `segmentWall` finishes in **≤ 1s** in the worker, and is deterministic for a fixed seed.
5. On `tests/fixtures/wall-landscape.jpg` with its hand-labeled `all-holds.png`, `segmentWall` reaches hold-pixel recall ≥ **0.80** and IoU ≥ **0.60** (manual check; record the result here).
6. No component smaller than 0.02% of the image area survives in `holdMask`.
7. **Chalk (unit, synthetic fixtures):** a red hold with a 20% white patch is `heavy` with ratio 0.20 ± 0.02, and its centroid sits inside the patch. A red hold with no white is `none`. A white hold is `unknown`.
8. The app never changes `view` by itself. In Route view, tapping an unselected spot adds nothing and shows the hint; tapping a selected hold deselects it. **Show route** is highlighted only when the route is complete.
9. The chalk overlay draws chalk pixels as a cyan hatch; each hold-list row shows its chalk level ("Chalk: heavy · likely grip spot" / "Chalk: n/a on white hold").
10. The toggles are labeled switches that work by keyboard; outlines keep every selected hold visible on `#2B2B2B`, including black holds.

## Testing

- **Unit (Vitest):** `compositeRoute` on small synthetic `ImageData` (e.g. 8×8) for every row of the table and both toggle states; `detectChalk` on synthetic holds; the cleanup steps of `segmentWall` (opening and closing, removing small components) on synthetic masks; k-means determinism.
- **Component:** the toggles change the store and the canvas redraws (spy on the draw call).
- **E2E (fake worker):** select 3 holds in Original view → tag S, F → Show route becomes highlighted → tap it → toggle Show other holds → assert sampled canvas pixel colors at known coordinates.
- **Manual:** criterion 5, plus a visual check on 3 real wall photos (one multi-colored wall, one with heavy chalk, one with strong shadows). Record the results here.

Fixtures needed: `wall-landscape.all-holds.png` (golden mask of all holds), synthetic chalk-hold generators in `tests/fixtures/synthetic.ts`.

## Out of Scope

User-picked colors, exporting or sharing the composite, chalk on non-selected holds,
ML-based chalk or wall segmentation.

## Resolved Questions (2026-10-26)

1. Wall separation starts with the color heuristic. If the manual check misses criterion 5, fall back to SAM "segment everything" (separate change, ask first).
2. Views: **pick in Original, view in Route** (option B). No automatic switching; a highlighted **Show route** button appears when the route is complete. Reason: holds are chosen by their real color, which Route view hides.

## Check Results (2026-10-28, M1, Chromium)

| Check | Result | Target |
|---|---|---|
| `compositeRoute` 1536×1152, 10 holds | **25 ms** | ≤ 100 ms ✓ |
| `segmentWall` on the synthetic wall vs exact all-holds mask | recall **1.000**, IoU **0.946**, ~300 ms | recall ≥ 0.80, IoU ≥ 0.60, ≤ 1 s ✓ |
| `segmentWall` on real photos (`real-1`, `heldout`, `real-2`) | 320–370 ms each; visual check below | ≤ 1 s ✓ |

Visual check (a real-model check page, private): on `real-1` every colored hold and volume on the wall face is found. On the dense spray
wall almost all holds are found; white or chalky holds and chalk patches are partly missed, as predicted. Before the > 8% rule the
dark ceiling and beams on `real-1` counted as one huge "hold". With it they're dropped, but **holds touching that ceiling region are dropped
with it** (e.g. a top yellow ball on `real-1`), and a few light-blue glare blobs remain. Acceptable for v1; the SAM segment-everything
fallback stays available.

