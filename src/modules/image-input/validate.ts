import type { ImageInputError } from './types';

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MIN_SHORT_EDGE = 256;

export function validateFile(file: { type: string; size: number }): ImageInputError | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { kind: 'unsupported-type', mimeType: file.type };
  }
  if (file.size > MAX_FILE_BYTES) return { kind: 'too-large', bytes: file.size };
  return null;
}

export function validateDimensions(width: number, height: number): ImageInputError | null {
  return Math.min(width, height) < MIN_SHORT_EDGE ? { kind: 'too-small', width, height } : null;
}
