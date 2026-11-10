import { MAX_FILE_BYTES, validateDimensions, validateFile } from './validate';

describe('validateFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateFile({ type, size: 1000 })).toBeNull();
  });

  it.each(['image/gif', 'image/heic', 'text/plain', ''])('rejects %s as unsupported', (type) => {
    expect(validateFile({ type, size: 1000 })).toEqual({
      kind: 'unsupported-type',
      mimeType: type,
    });
  });

  it('accepts a file of exactly 25 MB', () => {
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(validateFile({ type: 'image/jpeg', size: MAX_FILE_BYTES })).toBeNull();
  });

  it('rejects a file over 25 MB', () => {
    expect(validateFile({ type: 'image/jpeg', size: MAX_FILE_BYTES + 1 })).toEqual({
      kind: 'too-large',
      bytes: MAX_FILE_BYTES + 1,
    });
  });
});

describe('validateDimensions', () => {
  it('accepts a short edge of 256 px', () => {
    expect(validateDimensions(256, 400)).toBeNull();
  });

  it('rejects a 200×200 image as too small', () => {
    expect(validateDimensions(200, 200)).toEqual({ kind: 'too-small', width: 200, height: 200 });
  });

  it('checks the short edge regardless of orientation', () => {
    expect(validateDimensions(4000, 255)).toEqual({ kind: 'too-small', width: 4000, height: 255 });
  });
});
