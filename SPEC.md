# Spec: bouldering-vis

Status: **APPROVED.** Capability map 2026-10-26; all module specs 2026-10-28. Next: planning.
Last updated: 2026-10-26

## Objective

A browser-based viewer for climbers. The user brings a photo of a gym bouldering wall
(like the ones climbers share from their gym), picks the holds that make up the
problem they want to try, and gets a clean visualization of that line:

- selected holds in their real color; everything else flattened into two background colors
- each hold's role (start / hand / foot / finish), type (crimp, jug, sloper…) and a grip hint
- which way each hold faces (surface-normal arrow)
- chalk on a hold highlighted as a "people grab here" hint
- a 2D depth map and an orbitable 3D point cloud of the wall

**Target users:** gym climbers on a phone at the wall, or setters and climbers on a laptop
planning or sharing a problem.

**Non-goals (v1):** accounts, saving routes to a server, sharing links, multiple photos
or true Gaussian splatting, training custom models, grading routes.

## Decisions (confirmed 2026-10-26)

| Topic | Decision | Consequence |
|---|---|---|
| Runtime | **In-browser only.** Models run via transformers.js / onnxruntime-web (WebGPU, WASM fallback) | Ships as a static site; no server; first load downloads the models (cached afterwards) |
| Perpendicular line | **Surface-normal arrow** computed from depth-map normals over the hold's mask | Depends on `depth-estimation`. Monocular depth is relative, so the arrow shows direction only, not metric angle |
| Classification | **Zero-shot CLIP** on the hold crop against text prompts; the user can override | No training data needed; accuracy is moderate, so the UI must make overriding easy |
| 3D view | **Depth-derived colored point cloud** in three.js | Not Gaussian splatting (that needs multiple photos); reuses the 6a depth output |
| Background colors | **Fixed**: wall = `#2B2B2B` (A), non-selected holds = `#8A8A8A` (B) | No color picker; constants in `route-compositor` |
| Hold roles | User tags **1–2 `start`** holds and **exactly 1 `finish`** hold; every other selected hold has role `route` | No hand/foot distinction; no automatic tape detection (the user tags instead) |
| Grip hints | A **simple local hold catalog** (`src/data/hold-catalog.json`): name, short how-to-grip text, hint image path, image source/license | Images must be openly licensed (CC0/CC-BY, with attribution) or self-drawn SVG; no hot-linking |
| Selection | **Click one hold at a time** (click again to deselect) | No lasso or box selection |

## Capability Map

| Module id | Responsibility | Depends on |
|---|---|---|
| `image-input` | Paste (Ctrl/Cmd+V), drag-drop, file picker, phone camera capture (`<input capture>`); EXIF-orient, downscale to working size (long edge ≤ 1536px) | — |
| `hold-segmentation` | Click a hold → mask (SlimSAM/SAM point prompt); add/remove holds; tag role (`start` ×1–2, `finish` ×1, otherwise `route`); route state | `image-input` |
| `route-compositor` | Render selected holds in original pixels; wall → background color A; non-selected holds → color B or hidden (toggle); chalk detection overlay | `hold-segmentation` |
| `depth-estimation` | Depth Anything V2 Small → relative depth map; 2D heatmap view; per-pixel normals | `image-input` |
| `hold-geometry` | Per-hold mean surface normal from the mask and normals → arrow drawn at the hold's centroid | `hold-segmentation`, `depth-estimation` |
| `hold-classification` | CLIP zero-shot hold type + confidence; name label + static grip-hint image; manual override | `hold-segmentation` |
| `point-cloud-view` | Unproject depth into colored points (three.js `Points`); orbit/zoom; selected holds emphasized, others dimmed per compositor toggle; the climber in 3D | `depth-estimation`, `route-compositor`, `climber-stance` |
| `climber-stance` | **(APPROVED 2026-10-30)** Static stance on the selected holds: limb assignment, stick body, reach (IK), balance and per-limb load (% bodyweight), feasibility diagnosis | `hold-segmentation`, `hold-geometry` |

Build order: `image-input` → `hold-segmentation` → (`route-compositor` ∥ `depth-estimation`)
→ (`hold-geometry` ∥ `hold-classification`) → `point-cloud-view`

Module specs (all **APPROVED**, 2026-10-28):

| Module | Spec |
|---|---|
| `image-input` | [SPEC-image-input.md](SPEC-image-input.md) |
| `hold-segmentation` | [SPEC-hold-segmentation.md](SPEC-hold-segmentation.md) |
| `route-compositor` | [SPEC-route-compositor.md](SPEC-route-compositor.md) |
| `depth-estimation` | [SPEC-depth-estimation.md](SPEC-depth-estimation.md) |
| `hold-geometry` | [SPEC-hold-geometry.md](SPEC-hold-geometry.md) |
| `hold-classification` | [SPEC-hold-classification.md](SPEC-hold-classification.md) |
| `point-cloud-view` | [SPEC-point-cloud-view.md](SPEC-point-cloud-view.md) |
| `climber-stance` | [SPEC-climber-stance.md](SPEC-climber-stance.md) (APPROVED 2026-10-30) |

Cross-module contract: `view` in the store is `'original' | 'route' | 'depth' | '3d'`;
holds are selected only in `original` (deselecting works in `route`). The lazy-model
trigger (Show route, Depth view, or 3D view, whichever comes first) starts depth and CLIP.

### Hold type catalog (v1)

**Shape** (from `hold-classification`, CLIP): `jug`, `crimp`, `edge`, `sloper`, `pinch`, `pocket`, `volume`
**Orientation** (from `hold-geometry`, surface normal): `standard`, `sidepull`, `undercling`
The UI shows both together, e.g. "Crimp · sidepull". Orientation is kept separate because a
single crop can't show which way a hold faces, and so `hold-classification` doesn't need
to depend on `hold-geometry`.

## Tech Stack

- Vite + React 18 + TypeScript (strict)
- `@huggingface/transformers` (transformers.js) for SlimSAM, Depth Anything V2 Small, CLIP
- Models run in a **Web Worker**, never on the main thread
- three.js for the point cloud
- Canvas 2D / OffscreenCanvas for compositing
- Zustand for app state (one store: image, holds, view toggles)
- Exact dependency versions pinned in `package.json` when the project is scaffolded

Model checkpoints (verified by the T2 spike, see [docs/ml-runtime.md](docs/ml-runtime.md) for sizes and the
per-model backend/dtype rule: fp16 on WebGPU only when `shader-f16` exists; CLIP always on WASM q8):
`Xenova/slimsam-77-uniform`, `onnx-community/depth-anything-v2-small`,
`Xenova/clip-vit-base-patch32` (quantized variants preferred).

## Commands

```
Install:   npm install
Dev:       npm run dev            # vite, http://localhost:5173
Build:     npm run build          # tsc --noEmit && vite build
Preview:   npm run preview
Test:      npm test               # vitest run
Test watch:npm run test:watch
Coverage:  npm test -- --coverage
E2E:       npm run e2e            # playwright test
Lint:      npm run lint           # eslint . --max-warnings 0
Format:    npm run format         # prettier --write .
```

## Project Structure

```
src/
  app/                 → App shell, layout, routing (single page)
  modules/
    image-input/       → one folder per capability-map module id
    hold-segmentation/
    route-compositor/
    depth-estimation/
    hold-geometry/
    hold-classification/
    point-cloud-view/
  workers/
    ml.worker.ts       → loads models, handles {segment, depth, classify} messages
  lib/                 → shared pure helpers (mask ops, image buffers, color)
  store/               → Zustand store
  data/
    hold-catalog.json  → hold type catalog: name, how-to-grip text, image path, source/license
public/
  grip-hints/          → hint images, one per hold type (<type>.webp|.svg)
tests/
  fixtures/            → small wall photos + golden masks / expected outputs
e2e/                   → Playwright specs
SPEC.md, SPEC-<module-id>.md
```

Each module folder has: `index.ts` (public API only), pure logic files, React components,
and `*.test.ts` next to the code. Modules import each other **only through `index.ts`**,
and only in the direction of the capability map.

## Code Style

```ts
// src/modules/route-compositor/composite.ts
import type { HoldMask } from '../hold-segmentation';

export interface CompositeOptions {
  wallColor: RGB;
  otherHoldColor: RGB;
  showOtherHolds: boolean;
}

/** Pure: same inputs → same pixels. No DOM, no model calls. */
export function compositeRoute(
  source: ImageData,
  selected: readonly HoldMask[],
  allHoldsMask: Uint8Array,
  opts: CompositeOptions,
): ImageData {
  const out = new ImageData(source.width, source.height);
  // ...
  return out;
}
```

- Pure functions for all pixel/geometry math (masks, chalk, normals, unprojection) so they can be unit-tested without models
- Model calls only through `workers/ml.worker.ts` behind a typed message API
- `camelCase` functions/vars, `PascalCase` types/components, `kebab-case` folders = module ids
- Masks are `Uint8Array` (0/1) with row-major `width*height` length; never pass raw tensors across modules
- Prettier defaults, 100-column print width; no `any`

## Testing Strategy

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Pure functions: compositing, chalk detection, normal computation, depth→point unprojection, image normalization |
| Component | Vitest + Testing Library | Toggles, role picker, classification override, hint panel |
| Worker contract | Vitest | Message API shape; the model is swapped for a deterministic fake |
| E2E | Playwright (Chromium) | Upload fixture → click holds → toggle → depth → 3D view, using the **fake model worker** |
| Manual model check | `npm run dev` + fixture photos | Real-model quality (segmentation fit, depth plausibility, classification) recorded in module specs |

- Real models are **not** run in CI (too big and too slow); the fake worker returns fixture masks and depth
- Coverage target: ≥ 80% lines on `src/modules/**` pure logic; no target for UI glue
- Every bug fix comes with a regression test

## Boundaries

**Always**
- Keep model inference off the main thread (Web Worker)
- Keep the user's photo on the device; never upload it anywhere
- Run `npm test && npm run lint && npm run build` before calling a task done
- Respect the capability-map dependency direction
- Show load progress and a clear error when WebGPU or the model download fails (fall back to WASM)

**Ask first**
- Adding any npm dependency beyond the Tech Stack list
- Swapping or adding a model checkpoint, or anything that raises the total model download above **~180 MB** (approved 2026-10-26: SlimSAM ~40 + Depth V2 Small fp16 ~50 + CLIP B/32 vision q8 ~90)
- Adding any backend, external API, analytics, or network call besides model downloads
- Changing module boundaries or the capability map

**Never**
- Send user images to a third-party service
- Commit API keys or model weights to the repo
- Delete or skip failing tests to get green
- Present the CLIP label or the normal arrow as certain (always show confidence and allow overrides)

## Success Criteria (app-level; module specs refine these)

Checked 2026-10-28 (T21) on an Apple M1 laptop with Chromium; ✅ met · ⚠️ partly met · ❌ not met.

1. ✅ A photo pasted, dropped, picked, or taken with the camera shows up within 1s on a mid-range laptop. *A 12 MP JPEG decodes and downscales in 66 ms; paste, drop and pick are covered in E2E. Camera capture on a real phone is untested.*
2. ✅ Clicking a hold produces a mask outline in ≤ 1s after models load (WebGPU, laptop); selected holds are listed with editable roles; a route is complete only with 1–2 `start` holds and exactly 1 `finish` hold. *~300 ms tap → outline with real SlimSAM; the role table is unit- and E2E-tested.*
3. ✅ Composite view: selected hold pixels are identical to the source; the wall is exactly `#2B2B2B`; other holds are `#8A8A8A`, or `#2B2B2B` when the toggle hides them. *Unit test checks exact pixels; E2E samples rendered pixels.*
4. ✅ Chalk overlay appears on selected holds where low-saturation, high-brightness pixels make up > N% of the mask (**N = 3%**, see `SPEC-route-compositor.md`).
5. ⚠️ Each selected hold shows a type label, confidence, grip-hint image, and override dropdown. *All present, but zero-shot accuracy on real holds is low (top-1 21%, top-3 59%); see `SPEC-hold-classification.md` › Check Results.*
6. ⚠️ Each selected hold shows a normal arrow at its centroid; on a fixture with a known tilted plane the arrow is within 15° of expected. *Within 2° on synthetic tilts. On real photos most holds read "Faces you" (the mean normal of domes and volumes ≈ +z); see `SPEC-hold-geometry.md`.*
7. ✅ 2D depth heatmap renders for a 1536px image in ≤ 5s (WebGPU laptop). *689 ms warm; 21.7 s cold, including the model download.*
8. ✅ 3D point cloud renders ≥ 30 fps on a laptop with orbit and zoom; selected holds are visibly highlighted. *~60 fps (vsync-capped) with 261k points.*
9. ⚠️ Usable at 375px width (phone): no horizontal scroll, touch selection works. *No overflow in any view (E2E at 375 px); pinch-zoom and camera need a check on a physical phone.*
10. ✅ `npm test`, `npm run lint`, `npm run build`, `npm run e2e` all pass. *Plus Lighthouse accessibility 100 and best practices 100.*

## Open Questions

None at the app level. Resolved 2026-10-26; see Decisions. Open questions for each module live in its own spec.

## Amendment 2026-10-31: Status Lines Float Over the Photo (pro-climber review)

Download and depth status lines float over the top of the wall photo (`.stage-status`, `pointer-events: none`; Retry stays clickable). They no longer sit above it, so the photo never moves while holds are being tapped. Moving it had sent a phone tap onto the ceiling instead of the finish hold.

## Amendment 2026-11-04: No WebGPU on iPhone or iPad (the iPhone check)

**M1.** On an iPhone or iPad the ML worker always runs on WASM q8, even when WebGPU has `shader-f16`. Everywhere else the rule in Tech Stack stands (fp16 on WebGPU only with `shader-f16`; CLIP always WASM q8).

- **Why (real-device evidence).** An iPhone 12 (iOS 27.0.1, 4 GB) kernel-panicked twice on 2026-11-02, at 22:18 and 22:22, with `memorystatus: all vm-pageshortage victims exhausted`. Only `kernel_task` (~3.2 GB, ~2 GB of it wired) and `com.apple.WebKit.GPU` were left alive. On 2026-11-04, opening the Setting Room on the live site (SAM on WebGPU fp16) took the same phone from ~674 MB free to ~143 MB within a minute, and iOS force-killed 12 daemons for `vm-pageshortage`. WebGPU buffers are wired kernel memory that killing apps can't reclaim, and WebKit allows single buffers up to 683 MiB there. WASM memory belongs to the page, so its worst case is Safari reloading the tab, not a reboot.
- **How.** `isAppleMobile(userAgent, maxTouchPoints)` matches iPhone/iPad/iPod user agents, and a Mac user agent with touch (iPadOS Safari asks for desktop sites). A worker's navigator has no `maxTouchPoints`, so the page names the worker `ml-apple-mobile`, and `pickBackend()` reads `self.name`; the worker's own user agent is a second check.
- **Cost.** SAM and depth are slower on these devices, and single-threaded: Safari doesn't support `COEP: credentialless`, so the page isn't cross-origin isolated there (a separate, known gap; switching to `require-corp` needs CORP headers on the model downloads).
- **Tests.** `src/workers/backend.test.ts`: iPhone Safari, Chrome on iOS, iPadOS (Mac UA plus touch) → WASM; a Mac and Android keep WebGPU fp16 with `shader-f16`; no f16 or no WebGPU → WASM.
- **Still to do:** a real-device check of the Setting Room on WASM (needs the build on an HTTPS origin the phone can open), and whether the background prefetch of depth and CLIP should wait until they're needed on a phone.
