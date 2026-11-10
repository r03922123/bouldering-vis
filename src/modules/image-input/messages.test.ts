import { errorMessage } from './messages';

describe('errorMessage', () => {
  it('names the unsupported type and the accepted ones', () => {
    expect(errorMessage({ kind: 'unsupported-type', mimeType: 'image/gif' })).toBe(
      'GIF files aren’t supported. Use a JPEG, PNG or WebP photo.',
    );
  });

  it('explains HEIC separately', () => {
    expect(errorMessage({ kind: 'unsupported-type', mimeType: 'image/heic' })).toMatch(/HEIC/);
  });

  it('reports the file size in MB', () => {
    expect(errorMessage({ kind: 'too-large', bytes: 30 * 1024 * 1024 })).toBe(
      'That file is 30 MB. The limit is 25 MB.',
    );
  });

  it('reports a decode failure', () => {
    expect(errorMessage({ kind: 'decode-failed' })).toBe(
      'Couldn’t read that image. The file may be damaged or in an unsupported format.',
    );
  });

  it('reports a too-small image with its size', () => {
    expect(errorMessage({ kind: 'too-small', width: 200, height: 200 })).toBe(
      'That image is 200×200. It needs to be at least 256 px on its shorter side.',
    );
  });
});
