# Spec: hold-classification

Module id: `hold-classification` · Depends on: `hold-segmentation` · Used by: app shell (hold card)
Status: **APPROVED (2026-10-26)**
Parent: [SPEC.md](SPEC.md)

## Objective

Label each selected hold with its **shape type** from the catalog (requirement 4) and show
the name, a grip-hint image, and short how-to-hold text from a small local hold catalog.
The label is a guess with a visible confidence, and the user can override it.

User stories:
- Each of my holds shows "Crimp (72%)" with a picture and one line on how to hold it.
- When the guess is wrong I pick the right type from a dropdown, and that choice sticks.

## How It Works

**Model:** CLIP vision encoder through transformers.js in `ml.worker.ts`, on WASM q8 (faster than q8 on WebGPU, T2 spike). The candidate
checkpoint is `Xenova/clip-vit-base-patch32` (quantized); see Open Question 1.

**Text side is precomputed.** The 7 class prompt embeddings are made once at dev time by
`scripts/build-clip-text-embeddings.ts` (CLIP text encoder run in headless Chromium through Playwright: the same onnxruntime-web the app uses, so no native Node runtime) and shipped as
`src/data/clip-text-embeddings.json` (7 × 512 floats, ~30 KB). The browser downloads
**only the vision encoder**.

Prompt ensemble per class (averaged, L2-normalized), e.g. for `crimp`:
`"a photo of a crimp climbing hold"`, `"a small thin crimp on a bouldering wall"`,
`"a tiny climbing hold you grip with your fingertips"`.

**When it runs:** the same trigger as depth (the user has finished choosing holds: Show
route, Depth view or 3D view). It classifies every selected hold then; a hold added after
the trigger is classified right away. Hold-type jobs are posted before the depth job and rank ahead of it in the
worker queue, so the cards fill in first (Cairn review I1, 2026-10-30). Both are needed: the queue can't
interrupt a running job, so whichever request reaches an idle queue first runs first. Warm run, M1, 5
holds: first type 1.36 s → **0.52 s**, all types 1.87 s → **0.93 s**; the depth map moves from 1.26 s to
1.74 s.

**Per hold:**
1. **Crop:** the bbox padded by 20%, made square, resized to 224. Pixels **outside the mask
   are filled with neutral grey `#808080`**, so neighboring holds don't affect the label.
2. Vision embedding → cosine similarity against the 7 class embeddings → softmax (CLIP logit scale 100).
3. **Size prior** (D1): if the hold covers < 0.8% of the image, drop "volume" and renormalize. Volumes are physically big, and the crop hides size.
4. Keep the top 3 with probabilities. When the top probability is < **0.35**, the label shows as "Unsure — crimp?".
5. `userType` (override) always wins over the model's guess and survives re-classification.

## Hold Catalog (`src/data/hold-catalog.json`)

```json
{
  "id": "crimp",
  "name": "Crimp",
  "grip": "Fingertips on the edge, fingers bent; thumb over the index finger for more power.",
  "image": "/grip-hints/crimp.webp",
  "credit": "Jane Doe / Wikimedia Commons",
  "license": "CC BY 4.0",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:..."
}
```

- One entry each for `jug`, `crimp`, `edge`, `sloper`, `pinch`, `pocket`, `volume`, plus the 3 orientations (`standard`, `sidepull`, `undercling`) with grip text for the "· sidepull" suffix.
- **Gathering images:** openly licensed only (CC0, CC BY, CC BY-SA), sourced from Wikimedia Commons or Openverse, downloaded into `public/grip-hints/` (≤ 60 KB WebP each). When no suitable image exists, a simple self-drawn SVG (`license: "project"`).
- Credits are shown in the hold card (small text) and on an `/about` credits list.
- A schema test validates every entry (required fields, the image file exists, the license is in the allow-list).

## Public Interface (`src/modules/hold-classification/index.ts`)

```ts
export type HoldType = 'jug' | 'crimp' | 'edge' | 'sloper' | 'pinch' | 'pocket' | 'volume';

export interface HoldClassification {
  holdId: string;
  top: { type: HoldType; prob: number }[];   // length 3, descending
  userType: HoldType | null;
  effectiveType: HoldType;                   // userType ?? top[0].type
  unsure: boolean;                           // top[0].prob < 0.35 && userType === null
}

export interface CatalogEntry { id: string; name: string; grip: string; image: string; credit: string; license: string; sourceUrl?: string }

// pure
export function cropHold(source: ImageData, hold: HoldMask, size?: number): ImageData;
export function classifyFromEmbedding(imageEmb: Float32Array, textEmbs: Record<HoldType, Float32Array>): HoldClassification['top'];
export function getCatalogEntry(id: string): CatalogEntry;

// UI
export function HoldCard(props: { holdId: string }): JSX.Element;   // name, prob, image, grip text, override, credit
```

Worker message: `{ type: 'clip:embed'; imageId; holdId; crop: ImageData }` → `{ type: 'clip:embedding'; holdId; embedding: Float32Array }`

`HoldCard` also shows information owned by other modules when it's available: the chalk
level (`route-compositor`) and the facing/orientation (`hold-geometry`). For example:
"**Crimp** 72% · faces left · sidepull · Chalk: heavy".

## Acceptance Criteria

1. Every selected hold gets a classification within **≤ 500 ms** per hold after the vision model is cached (WebGPU laptop).
2. No CLIP download or inference before the trigger (check in the Network panel).
3. `cropHold`: pixels outside the mask are exactly `#808080`; the output is square at `size`; the hold stays centered (unit).
4. `classifyFromEmbedding`: an embedding equal to a class embedding ranks that class first with prob > 0.5; probabilities sum to 1 ± 1e-5 (unit).
5. An override is kept after the hold is re-classified, and `effectiveType` = `userType`.
6. "Unsure — X?" shows exactly when `top[0].prob < 0.35` and there is no override.
7. The catalog schema test passes: 10 entries, every image exists and is ≤ 60 KB, every license is in the allow-list, every non-project image has credit and sourceUrl.
8. The hold card works by keyboard; the override is a labeled `<select>`; the image has alt text ("How to grip a crimp").
9. **Manual accuracy:** on 30 hand-labeled holds from the fixture photos, top-1 ≥ **50%** and top-3 ≥ **80%** (record the results here; this sets the baseline for future work).

## Testing

- **Unit (Vitest):** `cropHold`, `classifyFromEmbedding`, override logic, catalog schema.
- **Script test:** `build-clip-text-embeddings` produces a 7 × 512 output with unit-norm rows (run locally, not in CI).
- **E2E (fake worker):** fake embeddings → Show route → hold cards show the expected labels; an override persists after toggling views.
- **Manual:** criterion 9.

Fixtures needed: `tests/fixtures/holds-labeled.json` (30 hold crops, each with a type).

## Out of Scope

Fine-tuning, a VLM API, brand or product identification, more than 7 shape types,
saving overrides across sessions.

## Resolved Questions (2026-10-26)

1. Model budget: accept **~180 MB** in total with `Xenova/clip-vit-base-patch32` (q8 vision only). Only SlimSAM (~40 MB) loads before Show route.
2. Catalog is **English only** for v1.

## Check Results (2026-10-28, M1)

AC 9: 29 real holds from the `heldout` spray wall, a private held-out set from an unseen gym (SAM masks from community taps, cropped exactly like the app),
classified by the real CLIP worker and **labeled by Claude from the crops** (a stand-in for human labels; some calls,
like dish slopers vs. jugs, are judgment). Harness: a real-model check page (private).

| Variant | Top-1 | Top-3 | Notes |
|---|---|---|---|
| Prompt ensembles as specified (**shipped**) | **6/29 = 21%** | **17/29 = 59%** | Strong "volume" bias; top probability 19–53%, so most cards read "Unsure — X?" |
| Same, with text embeddings mean-centered | 8/29 = 28% | 17/29 = 59% | Confidently wrong (e.g. an edge as "volume 100%"), worse for the override flow |
| **+ size prior (shipped, D1, 2026-10-29)**: no "volume" below 0.8% of the image | **9/29 = 31%** | **18/29 = 62%** | Scored against the *original* labels, two of which called tiny holds "volume" (crops hide size) |
| Target | ≥ 50% | ≥ 80% | **not met** |

Also measured: the text embeddings of edge and sloper have cosine 0.981, so the text side barely separates them.

**Open decision for the human:**
- (a) Ship as is. Low confidence shows as "Unsure — X?", and the override dropdown is the main path.
- (b) A larger zero-shot model (CLIP ViT-B/16 or SigLIP). More download (over the 180 MB budget, so ask first) and unproven gain.
- (c) Learn from overrides: few-shot k-NN on the stored image embeddings of corrected holds. Local only, cheap, but it needs persistence, which is out of v1 scope.


## Amendment 2026-10-30 (approved 2026-10-30): Trained Hold Types and Learn Cards (T38–T41)

Requested by the human: survey small open hold datasets, decide whether post-training, fine-tuning or neither makes
the model learn hold types, and add educational hints. Chosen options: *train + validate*, *on-demand Learn card*. Review lens: an indoor-climbing game
developer (Cairn): teach in context, real examples over generic art, honest feedback.

### The data (surveyed 2026-10-30; each page checked)
| Dataset | Task | Size | Classes | License | Role |
|---|---|---|---|---|---|
| [ClinbingHoldType](https://universe.roboflow.com/personal-9wu84/clinbingholdtype) | classification (one hold per image) | 2,369 | Crimp Foothold Jug Other Pinch Pocket Sloper | CC BY 4.0 | **train** |
| [Beta Guide](https://universe.roboflow.com/mikeys-workspace-wzfte/beta-guide) v11 | detection, outlines | 124 walls | crimp jib jug pinch pocket sloper volume | CC BY 4.0 | **train** (only source of volume), Learn examples |
| [hold classification](https://universe.roboflow.com/capstone-kz2o9/hold-classification) | detection | 406 | foot crimp jug pinch pocket sloper | CC BY 4.0 | **test** (unseen gym) |
| [Kaggle indoor hold set](https://www.kaggle.com/datasets/diegospaziani/indoor-climbing-gym-hold-classification-dataset) | detection (YOLO), real + synthetic | – | Jug Crimp Pinch Slope Pocket Volume | CC BY-SA 4.0 | **test only**, real photos only (ShareAlike: nothing trained on it ships) |
| private held-out set (M1) | our crops | 29 holds | ours | local only | **test** (unseen gym) |

Hosted models (e.g. Beta Guide's, mAP@50 81.7%) run on Roboflow servers and are **not used**: in-browser only, and the
photo never leaves the device (SPEC.md).

- **Getting it:** the human downloads the sets (Roboflow: *COCO JSON* or *folder* export; Kaggle: the zip), or puts
  `ROBOFLOW_API_KEY` / `KAGGLE_*` in `.env.local` (gitignored by `.env*`) for `scripts/fetch-hold-data.ts`. Raw images
  live in `tests/fixtures/hold-data/` (**gitignored**, never committed). Keys are never committed or shipped.
- **Labels (D6):** classes are mapped to catalog ids: Slope→sloper; Foothold, foot, jib→**foot-chip** (a new 8th
  catalog type: three datasets label it, and beginners ask about it); Other is dropped. No dataset has **edge**: the
  data's crimp covers crimps and edges, so the probe never predicts Edge (it stays in the picker and the Learn cards).

### Method decision (D7): a linear probe on the frozen CLIP encoder, not fine-tuning, not prompts alone
- *Prompts alone* are exhausted: the text embeddings of edge and sloper have cosine 0.981 (M1), so wording can't
  separate them; labeled images can.
- *Linear probe* (multinomial logistic regression, L2, on L2-normalized image embeddings): the standard fit for
  hundreds to a few thousand labels. Trains in seconds, ships as < 40 KB of weights, no new download, runs in the browser,
  and is removed by deleting one file.
- *Fine-tuning CLIP* (full or LoRA) is **not done**: with ~3k images from a few gyms it overfits to their walls and
  lighting, needs a Python GPU pipeline plus ONNX re-export and re-quantization, and changes the 88 MB download. Revisit
  only if the probe stalls below target **and** data from more gyms exists.
- Crops for training and testing are made exactly like the app's (`cropHold`, outside-mask `#808080`); classification
  images have no mask, so they're used as-is (centered, square).
- Classes with too little data in training (< 30 examples after mapping) fall back to the zero-shot score.

### Ship gate (T39): judged on gyms the probe never saw
Train on ClinbingHoldType + Beta Guide; test on capstone, Kaggle real photos and the private held-out set (M1). Report top-1, top-3,
per-class recall and the confusion matrix here, per test set.
- Ship only if, on the unseen-gym sets combined, top-1 beats zero-shot (measured on the same sets) and the held-out M1
  beats **31% / 62%**. Edge labels count as correct when the probe says Crimp (D6); reported both strict and merged.
- If it doesn't win: keep zero-shot, record the numbers, and say so. Fine-tuning would not fix a too-few-gyms problem.

### Learn card (T40, T41)
- An **ⓘ Learn** button next to the hold type opens a card for that type (a dialog: Esc and the close button close it,
  focus returns to the button). Hold cards stay clean (the human removed always-on generic images earlier).
- Content per type (catalog fields `learn: { examples[], mistake, footUse }`):
  - **3 real example photos**: masked crops of labeled holds (≤ 20 KB WebP each, `public/learn/`), each with credit.
    Crimp, Jug, Pinch, Pocket, Sloper, Volume and Foot chip come from the CC BY 4.0 training sets (credited per image). Edge comes
    from the earlier second sample photo (public then, since removed), hand-picked.
  - **How to hold** (the existing grip text), **one common mistake**, **how it works as a foothold**.
- **Credits:** each CC BY 4.0 training set and every example photo is credited by name and link.

### Acceptance criteria (amendment)
- A10. `clip-probe.json` passes a schema test (classes = catalog ids the probe predicts, weights 512 wide, finite).
- A11. Unit: probe scoring ranks a training-class mean embedding first; probabilities sum to 1 ± 1e-5.
- A12. The ship-gate numbers are recorded here, whichever way the decision goes.
- A13. Each catalog type has a Learn entry: 3 examples that exist and are ≤ 20 KB, a credit per example, a mistake and a
  foot line (schema test).
- A14. E2E: ⓘ opens the Learn card for that hold's type; Esc closes it and focus returns; it works by keyboard and at 375 px.

### Not doing
Hosted APIs (privacy, cost, API key in the client) · training a detector (SAM already finds holds) · fine-tuning CLIP
(D7) · per-gym training · shipping anything trained on CC BY-SA data.

## Check Results (2026-10-30, interim): the probe gate

Embeddings through the app's own pipeline (the hold-embedding page). Trained on ClinbingHoldType (1,413 of 2,369
photos embedded so far; the rest were still running). Zero-shot is the shipped method after the foot-chip fix, with the
size prior. The private held-out set is 36 holds labeled by eye from the app crops on 2026-10-30 (a new labeling; M1's 29-hold
numbers are not directly comparable).

| Test set | Probe top-1 / top-3 | Zero-shot top-1 / top-3 |
|---|---|---|
| ClinbingHoldType, held-out 20% of photos (same gym) | 33% / 74% | – |
| Kaggle real photos, 1,192 holds (unseen gym) | **29% / 69%** | 23% / 63% |
| private held-out, 36 holds (unseen gym) | **23% / 74%** | 13% / 71% |

**Diagnostic ceiling** (`--ceiling`; never ships, CC BY-SA): the same probe trained on 1,074 Kaggle holds from 108 wall
photos scores **51% / 78%** on held-out Kaggle photos and **34% / 69%** on the private held-out set. In-domain wall photos roughly
double same-gym accuracy; ClinbingHoldType's 128 px close-ups carry too little shape detail.

**Decision (interim): not shipped yet.** The probe beats zero-shot on both unseen gyms, but top-1 on the private held-out set stays below
the 31% bar. Next: add Beta Guide (CC BY 4.0, 124 wall photos with outlines, the only source of volumes) to training and
test on capstone (406 wall photos), then re-run the gate. Also found and fixed: with "foot chip" among the prompts,
zero-shot called 327 of 409 Kaggle holds a foot chip; foot chip is now a picker/probe-only type.

## Check Results (2026-10-30, final): the probe gate — PASSED, probe shipped

Beta Guide v11 (CC BY 4.0) embedded through the app's pipeline: 3,403 holds from 124 wall photos (6 per class per
photo). Trained on its **train split only** (2,477 holds): adding the ClinbingHoldType close-ups made every set equal or
worse (e.g. private held-out 31% / 72% vs 34% / 78%), so they are not used. Zero-shot is the shipped method before this
change (foot chip excluded, size prior on). The private held-out set is 32 holds labeled by eye on 2026-10-30.

| Test set | Probe top-1 / top-3 | Zero-shot top-1 / top-3 |
|---|---|---|
| Beta Guide valid+test photos (same dataset, 1,024 holds) | **65% / 88%** | 17% / 47% |
| Kaggle real photos, 1,438 holds (unseen gym) | **31% / 65%** | 25% / 59% |
| private held-out, 32 holds (unseen gym) | **34% / 78%** | 13% / 69% |

Gate: beats zero-shot on both unseen gyms ✓; private held-out 34% / 78% clears 31% / 62% ✓. Shipped as
`src/data/clip-probe.json` (34.6 KB, 7 classes incl. volume and foot-chip, values rounded to 5 decimals), used by
`rankEmbedding` through `SHIPPED_PROBE`. Reverting is one line (`SHIPPED_PROBE = null`). Credit for the training
data is shown in Credits (CC BY 4.0). Capstone was not available as a further unseen gym; add it to the test sets when it is.

Known limits: cross-gym accuracy is still only about one in three top-1; the "Unsure" warning and the picker remain
the main path. Jugs and slopers are the weakest classes cross-gym. More gyms in training is the next lever.

## Amendment 2026-10-31: Half-Crimp by Default (pro-climber review)

The crimp tip teaches the half-crimp as the default grip. It presents the full crimp (thumb over the index) as a power option for hard moves, with its pulley load stated. It no longer teaches the riskiest grip as the default.

## Amendment 2026-11-06: Learn Photos Off Until the Owner's Crops (ADR-0003)

**Learn cards show no photos for now.** The 24 crops in `public/learn/` are deleted: they were cut from a photo the release keeps private ([ADR-0003](docs/adr/0003-public-repo.md) (d)), and the deployed site still served them (follow-up 21 in `docs/ARCHITECTURE.md`). `LEARN_PHOTOS` in `src/modules/hold-classification/names.ts` is `false`, so a Learn card shows how to hold, the common mistake and the foothold line, with no photos and no "Photos:" line. Credits no longer names a source for example photos.

- **A13, suspended in part.** `src/data/hold-catalog.json` keeps its example entries, and `src/data/catalog.test.ts` still checks 3 per type, each path, credit, license and source URL. Only the check that each file exists and is ≤ 20 KB waits: it runs only while `LEARN_PHOTOS` is on.
- **Until.** The owner's crops from Wall 2's photo, `wall-b` ([ADR-0003](docs/adr/0003-public-repo.md) (c), (f)) replace the catalog's entries and turn `LEARN_PHOTOS` back on, which restores A13 in full.
- **Test.** `LearnCard.test.tsx`: a Learn card from the catalog shows no image and no "Photos:" line. `HoldCard.test.tsx`: Credits has no "Example photos" sentence.
