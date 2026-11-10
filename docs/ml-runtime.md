# ML runtime

Where the models run and the rules the ML worker follows. These are the durable findings from the
model spike (2026-10-28) and the iPhone checks (2026-11-02 to 2026-11-04). The decisions themselves
live in `SPEC.md`, `SPEC-hold-segmentation.md` and the code cited in each section.

## Models

All three run in the browser, in a Web Worker (`src/workers/ml.worker.ts`), through transformers.js.
Their weights come from the Hugging Face Hub, then from the browser cache. Each model downloads when
it is first needed. On devices that aren't low-memory, depth and then CLIP also download in the
background once SAM is ready (`models:prefetch`, sent by `src/app/useModelPreload.ts` and handled in
`src/workers/mlHandlers.ts`).

| Model | Variant | Download |
|---|---|---|
| `Xenova/slimsam-77-uniform` (encoder + decoder) | fp16 / q8 | 20.8 MB / 13.8 MB |
| `onnx-community/depth-anything-v2-small` | fp16 / q8 | 49.6 MB / 27.3 MB |
| `Xenova/clip-vit-base-patch32`, vision only | q8 | 89.1 MB |

Worst case (SAM fp16 + depth fp16 + CLIP q8) is about 160 MB. A cold load took 6–18 s per model in
the spike, so each one shows load progress.

## Backend and dtype rule

Code: `backendFor` in `src/workers/backend.ts`.

| Model | WebGPU adapter has `shader-f16` | Otherwise |
|---|---|---|
| SAM | WebGPU fp16 | WASM q8 |
| Depth | WebGPU fp16 | WASM q8 |
| CLIP vision | WASM q8 | WASM q8 |

Why:

- **Not every WebGPU adapter supports fp16.** Headless Chromium gets SwiftShader, which has no
  `shader-f16`, and fp16 models then fail with "device does not support fp16". So the dtype comes
  from `adapter.features.has('shader-f16')`, not from WebGPU being present.
- **q8 on WebGPU is slower than on WASM** (CLIP 155 vs 98 ms in the spike), because quantized
  weights are dequantized on the GPU. So CLIP always runs on WASM q8.
- **The first SAM decode on WebGPU takes ~1.1 s** (shader compile). So, as the spike recommended,
  `sam:embed` in `src/workers/sam.ts` runs one throwaway decode at the centre of the photo right
  after the embedding. The compile then happens before SAM reports ready, not on the user's first
  tap, whose target is ≤ 1 s.

## No WebGPU on iPhone or iPad

Decision: `SPEC.md` › Amendment 2026-11-04 M1. On an iPhone or iPad the worker always uses WASM q8,
even when WebGPU has `shader-f16`.

- **Why.** On iOS, WebGPU buffers are wired kernel memory that iOS can't reclaim by killing apps.
  An iPhone 12 (4 GB) kernel-panicked twice on 2026-11-02 (`all vm-pageshortage victims
  exhausted`). On 2026-11-04 the Setting Room's models on WebGPU fp16 took the same phone from
  ~674 MB free to ~143 MB within a minute. WASM memory belongs to the page, so its worst case is
  Safari reloading the tab, not a reboot.
- **Cost.** Depth is slower there (WASM instead of WebGPU), and every WASM model is single-threaded
  (see [Cross-origin isolation](#cross-origin-isolation-coopcoep)). SAM doesn't run there at all:
  an iPhone or iPad counts as a low-memory device, so the light hold finder answers instead
  ([next section](#the-light-hold-finder-on-low-memory-devices)).
- **Detection.** `isAppleMobile` matches iPhone, iPad and iPod user agents, and a Mac user agent
  with touch points (iPadOS Safari sends a Mac user agent). A worker's `navigator` has no
  `maxTouchPoints`, so the page names the worker `ml-apple-mobile` (`src/workers/client.ts`).

## The light hold finder on low-memory devices

Decision: `SPEC-hold-segmentation.md` › Amendment 2026-11-04. A low-memory device is an iPhone, an
iPad, or anything reporting `navigator.deviceMemory ≤ 4` (`isLowMemory` in
`src/workers/backend.ts`). There, a tap in the Setting Room takes the hold under it from the colour
wall mask (`segmentWall`), not from SAM, and nothing downloads in the background: depth and CLIP
load only when first needed (`createMlHandlers` in `src/workers/mlHandlers.ts`).

- **Why.** SAM's encoder peaks at ~2.4 GB on WASM. That is its working set. Turning off ONNX
  Runtime's memory arena and memory pattern saved only ~190 MB, and turning off weight prepacking
  ~84 MB more.
- **Measured** on the iPhone 12 twin (Playwright WebKit with the phone's user agent, viewport, DPR
  and touch points): SAM on WASM peaked at +2,562 MB above idle, enough for iOS to kill the tab.
  The light finder peaked at +270 MB and was ready in 3 s with no download.
- **Limits.** A hold whose colour matches the wall can be missed, and touching holds of one colour
  come back as one. With CLIP, depth and 3D also loaded, the twin still peaks over the phone's
  headroom.

## The onnxruntime-web build

- `@huggingface/transformers` is pinned to an exact version (4.3.1) in `package.json`, as the Tech
  Stack in `SPEC.md` requires. That version depends on exactly `onnxruntime-web`
  1.31.0-dev.20260914-8d85527a0 (see `package-lock.json`), so the runtime build is fixed through it.
- transformers.js loads the onnxruntime WASM from jsDelivr, pinned to the installed version. Vite
  would still emit a local 26.9 MB copy that nothing loads. That is over Cloudflare Pages' 25 MiB
  per-file limit, so the `drop-onnxruntime-wasm` plugin in `vite.config.ts` removes it from the
  build.
- Planned (`SPEC-game.md` › `offline-shell`): self-host the model weights and use a pinned stable
  runtime instead of the Hugging Face Hub and jsDelivr.

## Cross-origin isolation (COOP/COEP)

Headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
credentialless`. They are set in `vite.config.ts` for dev and preview, and in `public/_headers` for
Cloudflare Pages.

- **Why.** Cross-origin isolation gives onnxruntime-web `SharedArrayBuffer`, so WASM runs
  multithreaded. `credentialless` (not `require-corp`) keeps the cross-origin model downloads from
  the Hugging Face Hub working.
- **Known gap.** Safari doesn't support `COEP: credentialless`
  ([caniuse](https://caniuse.com/mdn-http_headers_cross-origin-embedder-policy_credentialless),
  checked 2026-11-05), so the page isn't cross-origin isolated there and WASM is single-threaded. Switching to `require-corp` needs CORP headers on the
  model downloads.

## CI and E2E never run real models

Real models are too big and too slow to run in CI (`SPEC.md` › Testing Strategy), and headless
browsers can't be relied on for WebGPU (see the SwiftShader note above). So `playwright.config.ts`
starts the dev server with `VITE_FAKE_ML=1`, and `createMlClient` in `src/workers/client.ts` then
starts `fake.worker.ts` instead of the real worker.

## Not measured yet

- **Windows and Android GPUs.** The spike measured the models on an Apple M1 Mac in Chromium, and
  the phone checks since then used an iPhone 12. No ML measurement on a Windows or Android GPU is
  on record, so the `shader-f16` rule and the timings above are untested there.
