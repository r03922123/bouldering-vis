import type { Sample, WorkingImage } from '../modules/image-input';
import { loadSampleImage } from './sampleImage';

const loadImage = vi.hoisted(() => vi.fn());
vi.mock('../modules/image-input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/image-input')>()),
  loadImage,
}));

const decoded = (width: number): WorkingImage => ({
  id: 'img',
  pixels: {} as ImageData,
  width,
  height: 1200,
  scale: 1,
  sourceName: 'x',
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['jpg']))));
  loadImage.mockImplementation(async () => decoded(1536));
});
afterEach(() => vi.unstubAllGlobals());

describe('loadSampleImage', () => {
  it("keeps the sample's id and scales its px/cm to the working width, like the Studio", async () => {
    const sample: Sample = {
      id: 'b1',
      name: 'B1',
      url: '/samples/b1.jpg',
      scale: { pxPerCm: 2.6, refWidth: 1600 },
    };
    const img = await loadSampleImage(sample);
    expect(fetch).toHaveBeenCalledWith('/samples/b1.jpg');
    expect(img.sampleId).toBe('b1');
    expect(img.pxPerCm).toBeCloseTo((2.6 * 1536) / 1600, 9);
  });

  it('leaves px/cm unset for an unmeasured sample', async () => {
    const img = await loadSampleImage({ id: 'd2', name: 'D2', url: '/samples/d2.jpg' });
    expect(img.pxPerCm).toBeUndefined();
  });

  it('fails on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(loadSampleImage({ id: 'x', name: 'X', url: '/x.jpg' })).rejects.toThrow('404');
  });
});
