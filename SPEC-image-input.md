# Spec: image-input

Module id: `image-input` · Depends on: — · Used by: `hold-segmentation`, `depth-estimation`
Status: **APPROVED (2026-10-26)**
Parent: [SPEC.md](SPEC.md)

## Objective

Get a wall photo into the app from any input path and turn it into the one
**working image** that every later module uses. This module owns nothing else:
it has no ML and no route state.

User stories:
- On a laptop, I copy a wall photo (e.g. from routemake) and **paste** it into the page.
- On a laptop, I **drag and drop** an image file, or use **Choose file**.
- On my phone at the gym, I tap **Take photo**; the rear camera opens and the shot loads straight in.

## Public Interface (`src/modules/image-input/index.ts`)

```ts
export interface WorkingImage {
  id: string;            // new UUID per loaded image; downstream caches key on it
  pixels: ImageData;     // EXIF-oriented, downscaled, sRGB RGBA
  width: number;         // = pixels.width
  height: number;        // = pixels.height
  scale: number;         // working / original long edge (≤ 1)
  sourceName: string;    // file name, or "pasted-image"
}

export type ImageInputError =
  | { kind: 'unsupported-type'; mimeType: string }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'decode-failed' }
  | { kind: 'too-small'; width: number; height: number };

/** Pure sizing rule: long edge ≤ maxEdge, keep aspect ratio, never upscale. */
export function computeWorkingSize(w: number, h: number, maxEdge?: number): { width: number; height: number };

/** Blob → WorkingImage. Validates, decodes with EXIF orientation, downscales. */
export function loadImage(blob: Blob, sourceName?: string): Promise<WorkingImage>;

/** UI: drop zone + paste listener + file/camera buttons. Calls onLoad / onError. */
export function ImageInput(props: {
  onLoad: (img: WorkingImage) => void;
  onError: (err: ImageInputError) => void;
}): JSX.Element;
```

On success the app shell writes the `WorkingImage` to the store. That **clears all route
state** (holds, depth, classifications), because masks belong to one image.

## Rules

| Rule | Value |
|---|---|
| Accepted types | `image/jpeg`, `image/png`, `image/webp` |
| Max file size | 25 MB |
| Min dimensions | 256 px on the short edge (after orientation) |
| Working size | long edge ≤ **1536 px**, aspect ratio kept, no upscaling |
| Orientation | Apply EXIF orientation (`createImageBitmap(blob, { imageOrientation: 'from-image' })`) |
| Resampling | `createImageBitmap` resize with `resizeQuality: 'high'`, then draw to OffscreenCanvas → `ImageData` |
| Paste | `paste` listener on `window` while the input screen is shown; use the first `image/*` item in `clipboardData.items` |
| Camera | `<input type="file" accept="image/*" capture="environment">` (no `getUserMedia` in v1) |
| Privacy | Decode stays on the device; no network calls |

## Acceptance Criteria

1. Pasting an image from the clipboard loads it; pasting text does nothing and shows no error.
2. Dropping a JPEG/PNG/WebP loads it; while dragging, the drop zone shows a visible highlight.
3. **Choose file** and **Take photo** both work. On iOS Safari and Android Chrome, Take photo opens the rear camera.
4. A 4032×3024 JPEG with EXIF orientation 6 (rotated phone photo) produces a **1152×1536** upright working image (`scale` ≈ 0.381).
5. An 800×600 image stays 800×600 with `scale = 1`.
6. A `.gif`, a `.heic` the browser can't decode, a > 25 MB file, a corrupt file, and a 200×200 image each show their own error message, and the current image is left unchanged.
7. Loading a new image while a route exists asks for confirmation (inline, not `window.confirm`), then clears the route state.
8. Decoding and downscaling a 12 MP JPEG takes ≤ 1s on a mid-range laptop.
9. Usable at 375px width; the drop zone and buttons can be reached by keyboard and have accessible labels.

## Testing

- **Unit (Vitest):** `computeWorkingSize`: landscape, portrait, square, already-small, exactly-1536 and odd sizes (round to an integer, aspect error < 1px).
- **Unit:** the validation function's mapping of type, size and dimensions to `ImageInputError`.
- **Component (Testing Library):** fire `paste` with an image item and a text item; fire `drop`; check that `onLoad`/`onError` are called.
- **E2E (Playwright):** drop `tests/fixtures/wall-landscape.jpg` and `tests/fixtures/wall-exif6.jpg`, then check the canvas dimensions on screen.
- **Manual:** camera capture on one iOS and one Android device; record the result in this spec.

Fixtures needed: `wall-landscape.jpg` (any wall photo, ~4000px), `wall-exif6.jpg`,
`tiny-200.png`, `corrupt.jpg`, `sample.gif`.

## Out of Scope

Cropping or rotation tools, HEIC conversion, multiple images, live camera preview
(`getUserMedia`), loading from a URL.

## Resolved Questions (2026-10-26)

1. HEIC: v1 shows a clear `unsupported-type` / `decode-failed` error. No HEIC decoder.
2. Working long edge stays **1536 px**.

## Amendment 2026-10-29: Sample Wall Pool (T30)

A small built-in pool of sample wall photos the user can pick from (`public/samples/`, listed in
`samples.ts`). The default selection is **T-UP D2** (the human's test file `D2-1793184628535.jpg`). Picking a
sample and pressing **Load sample** runs the same `loadImage` path as a file, including the replace
confirmation when a route exists. Note: files in `public/` are served publicly.


## Amendment 2026-10-31: Default Sample With Climbing Videos

The default sample becomes **Wanhua gym B1** (routemake zone `f6606326-4ebf-4c36-98c9-971f73e86dac`,
gym g2 萬華館): a wall photo (no people in it) whose routes have 24 climbing videos on routemake.
T-UP D2 stays in the pool as the second sample.

- **Publishing:** routemake photos were local-only (tests/fixtures/real/, gitignored). The human approved
  publishing **this one photo** as a public sample on 2026-10-31, credited to routemake. Every other
  routemake photo stays local-only.
- **Videos stay on routemake.** They show identifiable climbers, so the app never bundles or embeds
  them. It links to the zone page instead: "Watch 24 climbs on routemake ↗" (opens in a new tab,
  `rel="noopener noreferrer"`).
- **Known scale:** a sample may carry `scale: { pxPerCm, refWidth }`, the wall's photo pixels per cm
  measured from its videos (SPEC-climber-stance › Amendment: Default Climber Size). Loading the sample
  sets `WorkingImage.pxPerCm` (working-image pixels per cm). For Wanhua B1: **2.6 px/cm at 1600 px**,
  the median of 6 verified climbs (2.40–2.85 across the wall).
- **Credit:** the picker shows the selected sample's credit and video link; once a sample is loaded,
  the same line shows under the Change photo bar, and the footer Credits name the source.

AC S1: the picker preselects `routemake-g2-b1`; loading it sets `pxPerCm` = 2.6 × width / 1600.
AC S2: the credit line links to the routemake zone in a new tab; no video file is fetched or bundled.
AC S3: T-UP D2 still loads, with no `pxPerCm`.

## Amendment 2026-11-06: no video link

[ADR-0002](docs/adr/0002-replacement-photos.md) (c) retires the climbing videos: the photo that had
them is being replaced, and the owner's video shows a different wall. `Sample` loses its `videos`
field, and the credit line shows only the photo's source. The credit text and the measured scale
stay while the current default photo is still served.

AC S2 (amended): the credit line has no video link, and no video file is fetched or bundled.

Tests: `ImageInput.samples.test.tsx` checks that the credit line holds no link and that no sample
URL is a video; `e2e/samples.spec.ts` checks that no video is requested while Wall 1's sample loads.

## Amendment 2026-11-06: the owner's photos

[ADR-0002](docs/adr/0002-replacement-photos.md) replaces the pool with the owner's two photos, in the
gym's bay order (Wall 1, then Wall 2):

| id | Name | Bay | Size (portrait) |
|---|---|---|---|
| `wall-a` (default) | Sample wall A | Wall 1 | 864 × 1536 px |
| `wall-b` | Sample wall B | Wall 2 | 816 × 1536 px |

- **Source:** both are cut from the owner's screenshots and saved with no metadata (no EXIF, XMP or
  ICC data).
- **No credit, video or scale:** the picker shows no credit line, and without a scale the climber
  starts at its default size (ADR-0002 (f)).
- **E2E:** the Play specs (`e2e/wall1Level.ts`) serve their private test photo in place of
  `wall-a`, because the test level's points are in that photo's 1536 × 1152 frame.

AC S1–S3 are superseded by S4–S6.

AC S4: the picker preselects `wall-a`; loading it fetches `/samples/wall-a.jpg`, names the image
"Sample wall A" and sets no `pxPerCm`. It loads at 864 × 1536.
AC S5: no sample shows a credit line (`.sample-credit`) or a link.
AC S6: `wall-b` loads from `/samples/wall-b.jpg` at 816 × 1536, with no `pxPerCm`.

Tests: `ImageInput.samples.test.tsx` (S4–S6) and `e2e/samples.spec.ts`, which loads the real photos.

`SampleCredit` and `Sample`'s optional `credit` field are removed, since no sample has a credit (S5 still holds).

## Amendment 2026-11-10: one sample, Wall 2 (SPEC-launch-wall-2 R1)

The pool is Wall 2 alone: `wall-a` and `public/samples/wall-a.jpg` are removed. `wall-b` is the
default, and its name is **"Wall 2"**, which is also its bay's name in the gym and Play's title.

AC S4, amended: the picker preselects `wall-b`, the only sample; loading it fetches
`/samples/wall-b.jpg` and names the image "Wall 2". AC S6 (its scale) still holds.
- **E2E:** the Play specs serve their private test photo and level in place of Wall 2's
  (`e2e/testLevel.ts`).
- **Tests:** `ImageInput.samples.test.tsx`, `e2e/samples.spec.ts`.
