export interface WorkingImage {
  /** New UUID per loaded image; downstream caches key on it. */
  id: string;
  /** EXIF-oriented, downscaled, sRGB RGBA. */
  pixels: ImageData;
  width: number;
  height: number;
  /** Working / original long edge (≤ 1). */
  scale: number;
  /** File name, or "pasted-image". */
  sourceName: string;
  /** Set when the photo is a built-in sample. */
  sampleId?: string;
  /** Working-image pixels per cm on the wall, when known (a measured sample). */
  pxPerCm?: number;
}

export type ImageInputError =
  | { kind: 'unsupported-type'; mimeType: string }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'decode-failed' }
  | { kind: 'too-small'; width: number; height: number };

/** Rejection value of `loadImage`. */
export class ImageInputException extends Error {
  constructor(readonly detail: ImageInputError) {
    super(`image input: ${detail.kind}`);
  }
}
