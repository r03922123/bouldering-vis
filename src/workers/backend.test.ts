import { APPLE_MOBILE_WORKER, backendFor, isAppleMobile, isLowMemory } from './backend';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
// iPadOS Safari asks for desktop sites by default: a Mac user agent, told apart only by touch.
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

/** A WebGPU stand-in whose adapter has (or lacks) shader-f16. */
const gpu = (f16: boolean) =>
  ({
    requestAdapter: () => Promise.resolve({ features: new Set(f16 ? ['shader-f16'] : []) }),
  }) as never;

describe('isAppleMobile (SPEC.md › Amendment 2026-11-04 M1)', () => {
  it('is true for an iPhone, in Safari or in Chrome', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true);
    expect(isAppleMobile(CHROME_IOS, 5)).toBe(true);
  });

  it('is true for an iPad that sends a Mac user agent but has a touch screen', () => {
    expect(isAppleMobile(MAC_SAFARI, 5)).toBe(true);
  });

  it('is false for a Mac (no touch) and for Android', () => {
    expect(isAppleMobile(MAC_SAFARI, 0)).toBe(false);
    expect(isAppleMobile(ANDROID, 5)).toBe(false);
  });
});

describe('backendFor (SPEC.md › Amendment 2026-11-04 M1)', () => {
  it('never uses WebGPU on an iPhone or iPad, even with shader-f16', async () => {
    expect(await backendFor({ appleMobile: true, gpu: gpu(true) })).toEqual({
      device: 'wasm',
      dtype: 'q8',
    });
  });

  it('keeps fp16 WebGPU elsewhere when the adapter has shader-f16', async () => {
    expect(await backendFor({ appleMobile: false, gpu: gpu(true) })).toEqual({
      device: 'webgpu',
      dtype: 'fp16',
    });
  });

  it('falls back to WASM q8 without shader-f16 or without WebGPU', async () => {
    expect(await backendFor({ appleMobile: false, gpu: gpu(false) })).toEqual({
      device: 'wasm',
      dtype: 'q8',
    });
    expect(await backendFor({ appleMobile: false, gpu: undefined })).toEqual({
      device: 'wasm',
      dtype: 'q8',
    });
  });

  it('names the worker so it knows, since a worker has no maxTouchPoints', () => {
    expect(APPLE_MOBILE_WORKER).toMatch(/^ml/);
  });
});

describe('isLowMemory (SPEC-hold-segmentation › Amendment 2026-11-04)', () => {
  it('is true on an iPhone or iPad, whatever memory it reports', () => {
    expect(isLowMemory({ appleMobile: true })).toBe(true);
    expect(isLowMemory({ appleMobile: true, deviceMemory: 8 })).toBe(true);
  });

  it('is true on a device reporting 4 GB or less, and false above or when unknown', () => {
    expect(isLowMemory({ appleMobile: false, deviceMemory: 4 })).toBe(true);
    expect(isLowMemory({ appleMobile: false, deviceMemory: 2 })).toBe(true);
    expect(isLowMemory({ appleMobile: false, deviceMemory: 8 })).toBe(false);
    expect(isLowMemory({ appleMobile: false })).toBe(false);
  });
});
