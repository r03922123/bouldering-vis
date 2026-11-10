# Spec: hold-segmentation

Module id: `hold-segmentation` · Depends on: `image-input` · Used by: `route-compositor`, `hold-geometry`, `hold-classification`
Status: **APPROVED (2026-10-26)**
Parent: [SPEC.md](SPEC.md)

## Objective

The user builds a route by tapping holds one at a time. Each tap becomes a clean
pixel mask of that hold, and the user tags 1–2 holds as `start` and one as `finish`.
This module owns the **route state** (the list of selected holds), which every later
module reads.

User stories:
- I tap a hold; a few moments later its outline appears and it's added to my route.
- I tap a selected hold again to remove it.
- I tag up to two start holds and one finish hold, and the app tells me when the route is complete.
- On my phone I can zoom in so I can hit small foot chips accurately.

## How It Works

SlimSAM (`Xenova/slimsam-77-uniform`) through transformers.js in `ml.worker.ts`, in two stages:

1. **Embed once per image.** When a `WorkingImage` loads, the worker runs the SAM
   image encoder (the heavy part) and caches the embedding, keyed by `imageId`. The UI
   shows "Preparing image…" with progress, and taps are queued until the embedding is ready.
2. **Decode per tap.** Each tap sends one positive point prompt to the mask decoder
   (the light part), which returns 3 candidate masks and their IoU scores, upscaled
   to working-image size.

Then, still in the worker (pure, testable functions; see Amendment 2026-10-30):

3. **`pickMask`:** choose the highest-scoring candidate whose area is ≤ **8%** of
   the image and that contains the tap point. If none qualifies, show
   "Couldn't isolate a hold here, try tapping its center" and add nothing.
4. **`cleanMask`:** keep only the connected component that contains the tap point,
   fill holes smaller than 1% of the mask's area, then **subtract pixels already owned by
   selected holds** (the earlier selection wins, so masks never overlap).
5. Compute `bbox`, `centroid` and `area`; the worker returns the finished hold and the main thread
   adds it with role `route`.

Tap rules: a tap **inside an existing selected mask** deselects that hold (no model call).
Any other tap runs steps 2–5.

## Public Interface (`src/modules/hold-segmentation/index.ts`)

```ts
export type HoldRole = 'start' | 'route' | 'finish';

export interface HoldMask {
  id: string;
  imageId: string;               // the WorkingImage.id this mask belongs to
  mask: Uint8Array;              // 0/1, row-major, width*height of the working image
  bbox: { x: number; y: number; w: number; h: number };
  centroid: { x: number; y: number };
  area: number;                  // pixel count
  tapPoint: { x: number; y: number };
  role: HoldRole;
  order: number;                 // selection order, 0-based
}

export interface RouteStatus {
  startCount: number;            // valid: 1–2
  finishCount: number;           // valid: exactly 1
  complete: boolean;
}

// pure
export function pickMask(cands: Uint8Array[], scores: number[], tap: Point, w: number, h: number): Uint8Array | null;
export function cleanMask(mask: Uint8Array, tap: Point, w: number, h: number, taken: Uint8Array): Uint8Array;
export function maskStats(mask: Uint8Array, w: number, h: number): Pick<HoldMask, 'bbox' | 'centroid' | 'area'>;
export function routeStatus(holds: readonly HoldMask[]): RouteStatus;
export function setRole(holds: readonly HoldMask[], id: string, role: HoldRole): HoldMask[] | { error: 'max-start' };

// UI
export function SelectionCanvas(): JSX.Element;   // image + outlines, tap, zoom/pan
export function HoldList(): JSX.Element;          // rows: index, thumbnail, role picker, remove
```

Worker messages (typed, in `src/workers/ml.worker.ts`):

```ts
{ type: 'sam:embed';  imageId; pixels: ImageData }       → { type: 'sam:ready'; imageId } | { type: 'sam:error'; message }
{ type: 'sam:decode'; imageId; point: Point }            → { type: 'sam:masks'; imageId; masks: Uint8Array[]; scores: number[] }
```

## Role Rules

| Action | Result |
|---|---|
| New hold | role `route` |
| Set `start` when 2 starts already exist | Rejected, inline message "Max 2 start holds" |
| Set `finish` when another finish exists | The new hold becomes `finish`; the old one becomes `route` |
| Deselect a hold | Removed; roles of the other holds are unchanged |
| `complete` | `1 ≤ startCount ≤ 2 && finishCount === 1` |

On screen, start holds get an **S** badge (S1/S2 when there are two) and the finish
hold an **F** badge, both at the hold's centroid. All selected holds get an outline.

## Acceptance Criteria

1. After an image loads, the embedding is computed in the worker and the main thread never blocks for more than 50 ms (checked with the Performance panel).
2. A tap on a hold shows its outline within **≤ 1s** once the embedding is ready (WebGPU laptop), and within ≤ 3s on the WASM fallback.
3. On `tests/fixtures/wall-landscape.jpg` with its 10 hand-labeled holds, the real model reaches mean IoU ≥ **0.75** against the golden masks (manual model check; record the result here).
4. A tap on bare wall that only produces large masks (> 8% of the image) adds nothing and shows the retry hint.
5. A tap inside a selected hold deselects it with no worker call.
6. Masks never overlap: the sum of all selected masks equals their union.
7. Role rules behave exactly as in the table above; the route-status chip shows "Route ready" only when `complete`.
8. Loading a new image clears all holds and drops the cached embedding of the old image.
9. Phone (375px): pinch-zoom and two-finger pan on the canvas; a single tap selects. Desktop: wheel zoom and drag pan; a click selects. Tap coordinates map correctly to working-image pixels at every zoom level (±1px).
10. The hold list can be used by keyboard and screen reader: the role picker is a radio group, and the remove button is labeled "Remove hold N".

## Testing

- **Unit (Vitest), all pure:**
  - `pickMask`: chooses the best qualifying candidate; rejects masks over 8%; rejects masks that don't contain the tap; returns `null` when nothing qualifies.
  - `cleanMask`: drops a separate blob, fills a small hole, subtracts `taken`.
  - `maskStats`: rectangle and L-shaped fixtures.
  - `routeStatus` / `setRole`: every row of the role table.
  - Screen ↔ image coordinate transform under zoom and pan.
- **Worker contract:** a fake SAM returns fixture candidate masks; check the message shapes and that an embed is reused across decodes.
- **E2E (Playwright, fake worker):** load fixture → tap 4 holds → tag S, S, F → "Route ready" shows → tap a selected hold → it's removed and the status updates.
- **Manual model check:** criteria 2 and 3 on real hardware (one laptop, one phone).

Fixtures needed: `wall-landscape.golden/*.png` (10 binary hold masks), fake-SAM candidate sets.

## Boundaries Specific to This Module

- Only **selected** holds are segmented. The hold-vs-wall mask for *non-selected* holds (colored `#8A8A8A`) is owned by `route-compositor` and specified there.
- No negative points, box prompts, or brush editing in v1.

## Out of Scope

Automatic "segment everything", lasso or box selection, mask editing, undo/redo
history (deselecting is the undo), saving routes.

## Resolved Questions (2026-10-26)

1. Bad masks: v1 remedy is deselect and tap again. No negative points or refinement.
2. Max mask area stays **8%** of the image; revisit after the manual model check on real photos.

## Model Check Results (2026-10-28, M1, WebGPU fp16)

Harness: `spike/sam-check.html` (real photos) and `spike/sam-iou.html` (synthetic), run with `node spike/run-check.mjs`.

| Check | Result | Target |
|---|---|---|
| Synthetic wall, 10 holds vs exact golden masks | mean IoU **0.98** (min 0.955) | ≥ 0.75 ✓ (easy case: clean ellipses) |
| Real spray wall `mingde-S` (very dense), 52 community taps | **52/52** taps produce a hold mask; median area grows with size class (0.14 → 0.21 → 0.40% of image) | — |
| Decode latency on the real photo | median **109 ms**, p95 117 ms | ≤ 1 s ✓ |
| Real-photo IoU | **not measured**: no hand-drawn golden masks yet | ≥ 0.75 |

Visual review of the spray-wall overlay: most masks fit the tapped hold, including large volumes and small chips. Known misses: a tap on the
ceiling beam gives a beam-shaped mask (correct for that pixel), and a few masks take a volume together with a hold bolted onto it.

## Amendment 2026-10-29: Numbered Badges (T25)

Every selected hold gets a badge with its **list number** (1-based, selection order, the same `N` as the
"Hold N" row), plus a role letter for start and finish: `1S`, `2S`, `3`, `4F`. Colors: start green, finish
red, route slate. The same labels are drawn in 2D (all views) and on the 3D sprites. In 2D the badge sits
just above the hold's bbox (below it at the top edge), so it never hides the hold. Numbers re-flow when
a hold is removed, matching the list.

Acceptance: the badge set equals the list numbers; removing hold 2 renumbers 3 → 2 in both the list and the
badges; 2D and 3D show identical labels.


## Amendment 2026-10-30: Taps Finish in the Worker (C1 of the Cairn review)

**Problem.** Each tap froze the main thread for 350–765 ms *after* the worker answered: `pickMask`,
`cleanMask` (three flood fills over a 1.6-megapixel image) and `maskStats` ran on the main thread.
The pulse, hover and scrolling stalled, and a fast second tap was swallowed.

**Change.** Steps 3–5 of *How It Works* run inside `sam:decode`, which now returns a finished
`DecodedHold` (id, mask, bbox, centroid, area, tapPoint) or `null` for a miss. The worker keeps a
`HoldLedger` per image: every hold it returned, so a tap that was in flight when another hold landed
still never overlaps it. The request carries `selected` (the ids the main thread still has) and
`seen` (the highest hold sequence it has received); the worker forgets holds it has seen and that
are no longer selected, and keeps the rest. Dev harnesses that need the raw candidates use
`sam:candidates`. Embedding the **same** image again (the canvas remounts after the 3D view) keeps the
embedding and the ledger, so it costs nothing and new taps still avoid the selected holds; hold sequence
numbers rise across ledgers, so `seen` never refers to a reused number. A tap sent before an earlier
hold was removed is still carved around that hold ("earlier wins"); the pixels come back on the next
tap. The canvas also doesn't ask again: when it remounts for an image whose embedding is ready or in
progress, it skips the request, which would otherwise queue behind depth and hold types (measured 57 s on a
first visit, now 29 ms). Model downloads never hold the queue: the worker loads a job's model before the
job joins the queue, so a tap during the depth model's download takes 254 ms (was 27 s). A job whose image
was replaced while its model loaded is dropped without running. The main thread also acknowledges a press at pointer-down with a faint ring
(before any inference), dropped if the gesture becomes a pan or pinch.

**Acceptance.** 11. No main-thread task over 150 ms while adding holds (E2E, fake worker; the
real-model harness `spike/loop-timing.mjs` records the tap-phase long tasks). 12. A press shows the
ring before the model answers. 13. Two taps sent without waiting both add holds. 14. Masks still
never overlap (criterion 6), including a hold added while another tap was decoding, and a deselected
hold's pixels are available again.

**Measured (M1, WebGPU, `spike/loop-timing.mjs`).**

| | Before | After |
|---|---|---|
| Main-thread long tasks while tapping (ms) | 350–765 per tap | none in 18 taps; at 4× CPU throttle two tasks (62, 87) in 6 taps, was 87–247 on every tap |
| Tap → hold on the wall, warm (ms) | 300–1500 | 230–440 |
| E2E long tasks while adding 4 holds (fake worker) | not measured | none |

## Amendment 2026-10-30: Route Progress Strip (I3 of the Cairn review)

Reaching "route complete" had no moment: the only signals were the Show route button turning blue and
a form-like line in the hold list ("start 0, finish 0"). `RouteSteps` (exported from this module, shown
above the hold list) is a three-step strip: **Pick holds → Tag start & finish → Show route**. The current
step is lit (`aria-current="step"`), done steps carry a check, and each step has a one-line detail
("Tap holds on the wall", "start 1 of 1–2 · finish 0 of 1", "Route ready", "Press Show route", "Shown").
`routeStep(holds, shown)` is the pure rule: fewer than 2 holds → pick; roles incomplete → tag; then show
until a route view has been opened. The moment the roles complete, "Route set: N holds" is announced in a
polite live region for 2.5 s, the done step glows (motion-safe), and every selected hold pulses once on
the wall. The hold list's status paragraph is gone (the strip replaces it); "Route ready" still appears.
On screens under 1024 px the steps stack as rows so the detail text always fits.

Acceptance: 15. The strip's current step follows `routeStep` at every stage of the E2E journey. 16. The
completion message appears once per completion and the wall's `data-pulse` lists every hold. 17. No
horizontal scroll at 375 px with the strip shown.


## Amendment 2026-11-04: The Light Hold Finder on Low-Memory Devices (the iPhone 12 twin)

**Status: built, waiting on the simulation.** Merge after the iPhone 12 check on the iOS Simulator (or the real phone).

On a low-memory device, a tap in the Setting Room takes the wall mask's hold under it, not SAM's. A low-memory device is an iPhone, an iPad, or anything reporting `navigator.deviceMemory ≤ 4`.

- **How the tap works.** The wall mask is `segmentWall`, the colour heuristic Route view and the footholds already run, shared through one cache per image. A tap up to 1.5% of the photo's short side off a hold snaps to it. The same `HoldLedger` keeps holds from overlapping, so `sam:embed`, `sam:decode` and `sam:candidates` keep their protocol.
- **What changes for the player.** Nothing downloads in the background: depth and CLIP load when first needed (the 3D or depth view, a hold's type).

**Why.** SAM's encoder (a ViT at 1024 × 1024, 4,096 tokens, global attention) peaks at ~2.4 GB on WASM. That is its working set. Turning off ONNX Runtime's memory arena and memory pattern saved only ~190 MB, and turning off weight prepacking saved ~84 MB more.

The iPhone 12 twin is Playwright WebKit with the phone's exact UA, viewport (390 × 699), screen, DPR 3 and touch points, on this M1. The M1 has the same Firestorm cores as the A14. The twin samples the page process's physical footprint, the number iOS jetsam acts on. Results:

| Wall 1 → Setting Room | Production (SAM, WASM) | Light hold finder |
|---|---|---|
| Hold finder ready | 49 s, plus the SAM download | 3 s, no download |
| Two taps (7F, foothold 61) | — | 1 → 2 holds |
| Peak above idle | +2,562 MB | +270 MB |
| The phone's free memory then (978 MB idle) | −1,584 MB: tab killed | 708 MB |

On the real phone, production's Setting Room took free memory from 978 to 331 MB within ~40 s.

**Known limits.**

- **Precision.** A hold whose colour matches the wall can be missed, and touching holds of one colour come back as one.
- **Still over budget with every model.** Hold types (CLIP, +~700 MB on first use, mostly runtime and model setup), then depth and 3D, peak at +1,093 MB on the twin. That is over the phone's ~830 MB headroom. It is the next item, measured on the simulator.

**Tests.** `src/workers/lightSam.test.ts`:

- a tap takes the whole hold, not its neighbour;
- a tap within 1.5% snaps to the hold;
- a tap on bare wall is a miss;
- the ledger never returns a hold twice;
- one mask run per image, shared with `wall:segment`;
- candidates for the preview;
- a tap before the photo is ready.

`src/workers/mlHandlers.test.ts`: on a low-memory device, the light finder and no prefetch; elsewhere, SAM, then depth before CLIP. `src/workers/backend.test.ts` › `isLowMemory`.
