# Spec: depth-estimation

Module id: `depth-estimation` · Depends on: `image-input` · Used by: `hold-geometry`, `point-cloud-view`
Status: **APPROVED (2026-10-26)**
Parent: [SPEC.md](SPEC.md)

## Objective

Estimate how near or far each pixel is from a single wall photo, show it as a **2D depth
heatmap** (requirement 6a), and provide per-pixel **surface normals** for the hold arrows
(`hold-geometry`) plus the depth needed for the 3D point cloud (`point-cloud-view`).

User stories:
- I switch to **Depth view** and see which holds and volumes stick out from the wall and where the wall overhangs.
- Depth is computed once, when I've finished choosing holds; the arrows and the 3D view then reuse it.

## How It Works

Model: **Depth Anything V2 Small** (`onnx-community/depth-anything-v2-small`, ~25M params)
through the transformers.js `depth-estimation` pipeline in `ml.worker.ts`.
Precision: `fp16` on WebGPU, `q8` on the WASM fallback.

1. **When it runs:** **only after the user has finished choosing holds.** The trigger is
   the first of: tapping **Show route**, opening Depth view, or opening the 3D view. Nothing
   is downloaded or computed before that. Depth covers the whole image, so holds added
   later don't trigger a rerun. One job at a time in the worker; progress is shown while it runs.
2. **Inference:** the pipeline resizes internally (~518px short edge). The raw output is
   **relative inverse depth** (bigger = closer, no units).
3. **Postprocess (pure):**
   - Bilinearly upsample to working-image size.
   - Normalize robustly to [0, 1]: clip to the 1st–99th percentile, then rescale. **1 = nearest.**
4. **Normals (pure):**
   - Smooth with a Gaussian (σ = 2px).
   - Compute central-difference gradients `gx`, `gy`.
   - `n = normalize(-k·gx, -k·gy, 1)` with a fixed **relief gain** `k = 40` (a display constant, since depth is relative).
   - Stored as `Float32Array` of length 3·w·h. Camera convention: +x right, +y down, +z toward the viewer.
5. Cache both by `imageId`; drop them when a new image loads.

## Public Interface (`src/modules/depth-estimation/index.ts`)

```ts
export interface DepthMap {
  imageId: string;
  width: number;            // = working image width
  height: number;
  depth: Float32Array;      // w*h, normalized 0–1, 1 = nearest (relative, unitless)
  normals: Float32Array;    // 3*w*h unit vectors, +z toward the viewer
}

export type DepthStatus =
  | { state: 'idle' } | { state: 'loading-model'; progress: number }
  | { state: 'running' } | { state: 'ready' } | { state: 'error'; message: string };

// pure
export function upsampleBilinear(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array;
export function normalizeDepth(d: Float32Array, lowPct?: number, highPct?: number): Float32Array;
export function computeNormals(depth: Float32Array, w: number, h: number, opts?: { sigma?: number; gain?: number }): Float32Array;
export function depthToColormap(depth: Float32Array, w: number, h: number): ImageData;   // viridis

// UI
export function DepthView(): JSX.Element;    // heatmap canvas + "near ↔ far" legend + status
```

Worker message: `{ type: 'depth:run'; imageId; pixels }` → `{ type: 'depth:result'; imageId; depth: Float32Array; width; height }`
(transferable buffers; normals are computed in the worker right after).

Store: `view` gains `'depth'` → `'original' | 'route' | 'depth'`. In Depth view, taps do
nothing and show "Switch to Original to add holds". The overlay (outlines, S/F badges)
stays on in Depth view.

## Acceptance Criteria

1. Depth for a 1536px working image is ready in **≤ 5s** after the model is cached (WebGPU laptop), and in ≤ 30s on the WASM fallback. Never more than 50 ms of main-thread blocking.
2. **Nothing depth-related happens before the trigger:** no model download and no inference until Show route, Depth view, or 3D view is first opened (check in the Network panel). The worker queue is serialized. If the user goes back and taps a hold while depth is running, the decode is queued ahead of other jobs and runs when the inference finishes (≤ 5s), with a pending spinner on the hold.
3. `DepthMap.depth` has length w·h of the working image; values are in [0, 1]; 1st–99th percentile normalization holds on a synthetic input (unit).
4. **Normals (unit):** constant depth → every normal is (0, 0, 1) ± 1e-6. A linear ramp in x → constant normals matching the analytic value within **2°** away from the border.
5. The heatmap uses viridis (perceptually uniform and colorblind-safe) with a "near / far" legend and a note that the scale is relative, not metric.
6. Model download shows a progress bar (bytes); a failed download or a WebGPU error falls back to WASM once, then shows a retry button.
7. On 3 real wall photos, a visual check confirms volumes and big jugs read as nearer than the flat wall (manual; record it here).

## Testing

- **Unit (Vitest):** `upsampleBilinear` (2×2 → 4×4 known values), `normalizeDepth` (outliers clipped), `computeNormals` (flat plane, x-ramp, y-ramp, sphere-cap sign check), `depthToColormap` (end colors match viridis).
- **Worker contract:** a fake depth model returns a fixture ramp; check queue order (embed → depth; a decode jumps ahead of queued depth) and that results are dropped when `imageId` is stale.
- **E2E (fake worker):** load image → Depth view → heatmap canvas shows the expected end colors at fixture corners.
- **Manual:** criteria 1, 6 and 7 on real hardware.

## Out of Scope

Metric depth, camera calibration, depth editing, using other depth models, a depth/photo
blend slider.

## Resolved Questions (2026-10-26)

1. Depth does **not** auto-run. It starts once the user has finished choosing holds (first of: Show route, Depth view, 3D view). Users who never get that far download nothing, and it never competes with selection taps.

## Check Results (2026-10-28, M1, WebGPU fp16)

| Check | Result | Target |
|---|---|---|
| Real photo `mingde-A1`, 1536×1152, warm (incl. normalize + normals) | **689 ms** | ≤ 5 s ✓ |
| Cold first run (download + load + run) | 21.7 s | progress shown |
| Unit: flat/ramp/sphere normals, percentile normalization, viridis ends | pass | AC 3, 4, 5 |

Visual check (harness `spike/depth-check.html`): physically plausible. Floor and mats are nearest (yellow), the wall is farther, and volumes
and large holds read as nearer than the wall, so AC 7 holds for A1. **Finding:** the floor takes most of the 0–1 range, which squeezes
the wall and holds into a narrow band. The heatmap stays correct but has low contrast on the wall, and hold relief is small, so fixed-gain
normals are close to +z. `hold-geometry` (T14) tunes the normal gain against real photos.

## Amendment 2026-10-30: Background Preload (T37, review item P1-6)

Approved by the human as part of the AAA review: once the hold detector is ready, the worker downloads and
initialises the depth and hold-type models in the background (`models:prefetch`, lowest queue priority, so
taps and analysis always go first). **Inference still waits for the trigger**, but the downloads no longer do
(this replaces AC 2's "no download before the trigger"). Download progress is reported per file and shown by
name ("Downloading depth model · 31 / 50 MB").

