import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  type Tensor,
} from '@huggingface/transformers';
// The same model built src/data/clip-text-embeddings.json.
import { CLIP_MODEL_ID as MODEL_ID } from '../modules/hold-classification/worker';
import type { HandlerContext, Handlers } from './host';

interface Loaded {
  model: CLIPVisionModelWithProjection;
  processor: (image: RawImage) => Promise<Record<string, Tensor>>;
}
let loading: Promise<Loaded> | null = null;

export function loadClipModel({ progress }: HandlerContext): Promise<Loaded> {
  loading ??= (async () => {
    // q8 runs faster on WASM than on WebGPU (T2 spike), so CLIP always uses WASM.
    const model = (await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (p.status === 'progress' && p.total)
          progress({ model: 'clip', file: p.file, loaded: p.loaded ?? 0, total: p.total });
      },
    })) as CLIPVisionModelWithProjection;
    const processor = (await AutoProcessor.from_pretrained(
      MODEL_ID,
    )) as unknown as Loaded['processor'];
    return { model, processor };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export const clipHandlers: Pick<Handlers, 'clip:embed'> = {
  'clip:embed': async (req, ctx) => {
    const { model, processor } = await loadClipModel(ctx);
    const { width, height } = req.crop;
    const inputs = await processor(new RawImage(req.crop.data, width, height, 4).rgb());
    const { image_embeds } = (await model(inputs)) as { image_embeds: Tensor };
    const v = Float32Array.from(image_embeds.data as Float32Array);
    const n = Math.hypot(...v) || 1;
    return { type: 'clip:embedding', holdId: req.holdId, embedding: v.map((x) => x / n) };
  },
};
