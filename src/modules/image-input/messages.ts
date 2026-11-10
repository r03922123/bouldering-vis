import type { ImageInputError } from './types';

const MB = 1024 * 1024;

export function errorMessage(err: ImageInputError): string {
  switch (err.kind) {
    case 'unsupported-type': {
      if (/heic|heif/i.test(err.mimeType)) {
        return 'HEIC photos aren’t supported yet. Use the Take photo button, or export the photo as JPEG.';
      }
      const name = err.mimeType.split('/')[1]?.toUpperCase() || 'That';
      return `${name} files aren’t supported. Use a JPEG, PNG or WebP photo.`;
    }
    case 'too-large':
      return `That file is ${Math.round(err.bytes / MB)} MB. The limit is 25 MB.`;
    case 'decode-failed':
      return 'Couldn’t read that image. The file may be damaged or in an unsupported format.';
    case 'too-small':
      return `That image is ${err.width}×${err.height}. It needs to be at least 256 px on its shorter side.`;
  }
}
