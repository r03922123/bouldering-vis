import { computeWorkingSize } from './size';
import { ImageInputException, type WorkingImage } from './types';
import { validateDimensions, validateFile } from './validate';

/** Blob → WorkingImage: validates, decodes with EXIF orientation, downscales. Browser only. */
export async function loadImage(blob: Blob, sourceName = 'pasted-image'): Promise<WorkingImage> {
  const fileError = validateFile(blob);
  if (fileError) throw new ImageInputException(fileError);

  let oriented: ImageBitmap;
  try {
    oriented = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageInputException({ kind: 'decode-failed' });
  }
  const { width: ow, height: oh } = oriented;
  oriented.close();

  const sizeError = validateDimensions(ow, oh);
  if (sizeError) throw new ImageInputException(sizeError);

  const { width, height } = computeWorkingSize(ow, oh);
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: 'from-image',
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageInputException({ kind: 'decode-failed' });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return {
    id: crypto.randomUUID(),
    pixels: ctx.getImageData(0, 0, width, height),
    width,
    height,
    scale: width / ow,
    sourceName,
  };
}
