import { loadImage, type Sample, type WorkingImage } from '../modules/image-input';

/**
 * Fetches and loads a built-in sample the way the Studio's "Load sample" does: it keeps the
 * sample's id and, if measured, its scale in working-image pixels. A copy of image-input's private
 * `withSample`, kept here so the Studio's modules stay unchanged (SPEC-gym-hub G12);
 * `sampleImage.test.ts` pins the scale rule.
 */
export async function loadSampleImage(sample: Sample): Promise<WorkingImage> {
  const res = await fetch(sample.url);
  if (!res.ok) throw new Error(`Sample ${sample.id}: HTTP ${res.status}`);
  const img = await loadImage(await res.blob(), sample.name);
  const out: WorkingImage = { ...img, sampleId: sample.id };
  if (sample.scale) out.pxPerCm = (sample.scale.pxPerCm * img.width) / sample.scale.refWidth;
  return out;
}
