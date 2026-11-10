// Runs in the browser (driven by build-clip-text-embeddings.ts): CLIP text encoder on WASM.
import { AutoTokenizer, CLIPTextModelWithProjection, type Tensor } from '@huggingface/transformers';
import { CLIP_MODEL_ID, PROMPTS } from '../src/modules/hold-classification/worker';

const tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID);
const model = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
  device: 'wasm',
  dtype: 'q8',
});

const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

const embeddings: Record<string, number[]> = {};
for (const [type, prompts] of Object.entries(PROMPTS)) {
  const inputs = tokenizer(prompts, { padding: true, truncation: true });
  const { text_embeds } = (await model(inputs)) as { text_embeds: Tensor };
  const [n, d] = text_embeds.dims as [number, number];
  const data = text_embeds.data as Float32Array;
  const mean = new Array<number>(d).fill(0);
  for (let i = 0; i < n; i++) {
    const row = unit(Array.from(data.subarray(i * d, (i + 1) * d)));
    row.forEach((x, k) => (mean[k]! += x / n));
  }
  embeddings[type] = unit(mean).map((x) => +x.toFixed(6));
}
(window as unknown as { __result: unknown }).__result = {
  model: CLIP_MODEL_ID,
  prompts: PROMPTS,
  embeddings,
};
