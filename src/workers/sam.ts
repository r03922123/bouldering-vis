import { AutoProcessor, RawImage, SamModel, Tensor } from '@huggingface/transformers';
import { HoldLedger } from '../modules/hold-segmentation/worker';
import { pickBackend } from './backend';
import type { HandlerContext, Handlers } from './host';
import type { Point } from './protocol';

const MODEL_ID = 'Xenova/slimsam-77-uniform';

type Sizes = [number, number][];
interface SamProcessorLike {
  (
    image: RawImage,
  ): Promise<{ pixel_values: Tensor; original_sizes: Sizes; reshaped_input_sizes: Sizes }>;
  reshape_input_points(points: number[][][], original: Sizes, reshaped: Sizes): Tensor;
  post_process_masks(masks: Tensor, original: Sizes, reshaped: Sizes): Promise<Tensor[]>;
}
interface Loaded {
  model: SamModel;
  processor: SamProcessorLike;
}
interface Embedded {
  imageId: string;
  width: number;
  height: number;
  embeddings: Record<string, Tensor>;
  originalSizes: Sizes;
  reshapedSizes: Sizes;
  /** The holds returned for this image, so later taps never overlap them. */
  ledger: HoldLedger;
}

let loading: Promise<Loaded> | null = null;
let current: Embedded | null = null;

function load({ progress }: HandlerContext): Promise<Loaded> {
  loading ??= (async () => {
    const { device, dtype } = await pickBackend();
    const model = (await SamModel.from_pretrained(MODEL_ID, {
      device,
      dtype,
      progress_callback: (p: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (p.status === 'progress' && p.total) {
          progress({ model: 'sam', file: p.file, loaded: p.loaded ?? 0, total: p.total });
        }
      },
    })) as SamModel;
    const processor = (await AutoProcessor.from_pretrained(
      MODEL_ID,
    )) as unknown as SamProcessorLike;
    return { model, processor };
  })();
  loading.catch(() => (loading = null)); // allow a retry after a failed download
  return loading;
}

async function decode({ model, processor }: Loaded, e: Embedded, point: Point) {
  const input_points = processor.reshape_input_points(
    [[[point.x, point.y]]],
    e.originalSizes,
    e.reshapedSizes,
  );
  const out = (await model({ ...e.embeddings, input_points })) as {
    pred_masks: Tensor;
    iou_scores: Tensor;
  };
  const [masks] = await processor.post_process_masks(
    out.pred_masks,
    e.originalSizes,
    e.reshapedSizes,
  );
  const plane = e.width * e.height;
  const data = masks!.data as Uint8Array;
  const count = data.length / plane;
  return {
    masks: Array.from({ length: count }, (_, i) => data.slice(i * plane, (i + 1) * plane)),
    scores: Array.from(out.iou_scores.data as Float32Array),
  };
}

export const samHandlers: Pick<Handlers, 'sam:embed' | 'sam:decode' | 'sam:candidates'> = {
  'sam:embed': async (req, ctx) => {
    // The same photo again (the canvas remounts after the 3D view): keep the embedding and, above
    // all, the ledger of holds already returned, so new taps still never overlap them.
    if (current?.imageId === req.imageId) return { type: 'sam:ready', imageId: req.imageId };
    const loaded = await load(ctx);
    const { width, height } = req.pixels;
    const image = new RawImage(req.pixels.data, width, height, 4).rgb();
    const inputs = await loaded.processor(image);
    const embeddings = (await loaded.model.get_image_embeddings(inputs)) as Record<string, Tensor>;
    current = {
      imageId: req.imageId,
      width,
      height,
      embeddings,
      originalSizes: inputs.original_sizes,
      reshapedSizes: inputs.reshaped_input_sizes,
      ledger: new HoldLedger(width, height),
    };
    // The first decode compiles GPU shaders (~1 s, T2 spike); do it now, not on the first tap.
    await decode(loaded, current, { x: width / 2, y: height / 2 });
    return { type: 'sam:ready', imageId: req.imageId };
  },
  'sam:decode': async (req, ctx) => {
    if (current?.imageId !== req.imageId) throw new Error(`no embedding for image ${req.imageId}`);
    const { ledger } = current;
    ledger.prune(req.selected, req.seen);
    const { masks, scores } = await decode(await load(ctx), current, req.point);
    // Pick, clean and measure here: a flood fill over the image would freeze the main thread.
    return { type: 'sam:hold', imageId: req.imageId, ...ledger.finish(masks, scores, req.point) };
  },
  'sam:candidates': async (req, ctx) => {
    if (current?.imageId !== req.imageId) throw new Error(`no embedding for image ${req.imageId}`);
    const { masks, scores } = await decode(await load(ctx), current, req.point);
    return { type: 'sam:masks', imageId: req.imageId, masks, scores };
  },
};
