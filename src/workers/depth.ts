import { flyingPixels } from '../modules/point-cloud-view/worker';
import { pipeline, RawImage, type Tensor } from '@huggingface/transformers';
import {
  computeNormals,
  normalizeDepth,
  upsampleBilinear,
} from '../modules/depth-estimation/worker';
import { pickBackend } from './backend';
import type { HandlerContext, Handlers } from './host';

const MODEL_ID = 'onnx-community/depth-anything-v2-small';

type Estimator = (image: RawImage) => Promise<{ predicted_depth: Tensor }>;
let loading: Promise<Estimator> | null = null;
let forceWasm = false;

export function loadDepthModel({ progress }: HandlerContext): Promise<Estimator> {
  loading ??= (async () => {
    const { device, dtype } = forceWasm
      ? ({ device: 'wasm', dtype: 'q8' } as const)
      : await pickBackend();
    return (await pipeline('depth-estimation', MODEL_ID, {
      device,
      dtype,
      progress_callback: (p: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (p.status === 'progress' && p.total) {
          progress({ model: 'depth', file: p.file, loaded: p.loaded ?? 0, total: p.total });
        }
      },
    })) as unknown as Estimator;
  })();
  loading.catch(() => (loading = null)); // allow a retry after a failed download
  return loading;
}

/** Runs on the picked backend; if WebGPU fails (load or run), falls back to WASM once. */
async function run(image: RawImage, ctx: HandlerContext) {
  try {
    return await (
      await loadDepthModel(ctx)
    )(image);
  } catch (err) {
    if (forceWasm || (await pickBackend()).device !== 'webgpu') throw err;
    forceWasm = true;
    loading = null;
    return (await loadDepthModel(ctx))(image);
  }
}

export const depthHandlers: Pick<Handlers, 'depth:run'> = {
  'depth:run': async (req, ctx) => {
    const { width, height } = req.pixels;
    const out = await run(new RawImage(req.pixels.data, width, height, 4).rgb(), ctx);
    // fp16 models may return float16 tensors.
    const pd =
      out.predicted_depth.type === 'float32'
        ? out.predicted_depth
        : out.predicted_depth.to('float32');
    const [dh, dw] = pd.dims.slice(-2) as [number, number];
    const raw = pd.data as Float32Array;
    const sized =
      dw === width && dh === height ? raw : upsampleBilinear(raw, dw, dh, width, height);
    const depth = normalizeDepth(sized);
    const normals = computeNormals(depth, width, height, { gain: 'auto' });
    const discontinuities = flyingPixels(depth, width, height);
    return {
      type: 'depth:result',
      imageId: req.imageId,
      depth,
      normals,
      discontinuities,
      width,
      height,
    };
  },
};
