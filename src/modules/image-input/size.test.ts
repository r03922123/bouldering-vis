import { computeWorkingSize, MAX_WORKING_EDGE } from './size';

describe('computeWorkingSize', () => {
  it('caps the long edge at 1536 by default', () => {
    expect(MAX_WORKING_EDGE).toBe(1536);
  });

  it('downscales a landscape 4032×3024 photo to 1536×1152', () => {
    expect(computeWorkingSize(4032, 3024)).toEqual({ width: 1536, height: 1152 });
  });

  it('downscales an EXIF-rotated (portrait) 3024×4032 photo to 1152×1536', () => {
    expect(computeWorkingSize(3024, 4032)).toEqual({ width: 1152, height: 1536 });
  });

  it('downscales a square image to 1536×1536', () => {
    expect(computeWorkingSize(4000, 4000)).toEqual({ width: 1536, height: 1536 });
  });

  it('never upscales a small image', () => {
    expect(computeWorkingSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('keeps an image whose long edge is exactly 1536', () => {
    expect(computeWorkingSize(1536, 1000)).toEqual({ width: 1536, height: 1000 });
  });

  it('rounds odd sizes to integers with aspect error under 1px', () => {
    const { width, height } = computeWorkingSize(3001, 1999);
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true);
    expect(width).toBe(1536);
    expect(Math.abs(height - (1999 * 1536) / 3001)).toBeLessThan(1);
  });

  it('honors a custom max edge', () => {
    expect(computeWorkingSize(2048, 1024, 1024)).toEqual({ width: 1024, height: 512 });
  });
});
