import { createMlHandlers } from './mlHandlers';
import type { HandlerContext } from './host';

const ctx = { progress: () => {} } as unknown as HandlerContext;
const pixels = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) } as ImageData;

function loaders() {
  return { depth: vi.fn(() => Promise.resolve()), clip: vi.fn(() => Promise.resolve()) };
}

describe('createMlHandlers (SPEC-hold-segmentation › Amendment 2026-11-04)', () => {
  it('on a low-memory device: the light hold finder, and no background model downloads', async () => {
    const load = loaders();
    const segment = vi.fn(() => new Uint8Array(64));
    const handlers = createMlHandlers({ lowMemory: true, load, segment });
    await expect(
      handlers['sam:embed']!({ type: 'sam:embed', imageId: 'a', pixels }, ctx),
    ).resolves.toEqual({ type: 'sam:ready', imageId: 'a' });
    expect(segment).toHaveBeenCalledTimes(1);
    await expect(
      handlers['models:prefetch']!({ type: 'models:prefetch', imageId: 'a' }, ctx),
    ).resolves.toEqual({ type: 'models:ready' });
    expect(load.depth).not.toHaveBeenCalled();
    expect(load.clip).not.toHaveBeenCalled();
  });

  it('elsewhere: SAM, and depth then CLIP downloaded in the background', async () => {
    const load = loaders();
    const handlers = createMlHandlers({ lowMemory: false, load, segment: vi.fn() });
    await handlers['models:prefetch']!({ type: 'models:prefetch', imageId: 'a' }, ctx);
    expect(load.depth).toHaveBeenCalledTimes(1);
    expect(load.clip).toHaveBeenCalledTimes(1);
    expect(load.depth.mock.invocationCallOrder[0]).toBeLessThan(
      load.clip.mock.invocationCallOrder[0]!,
    );
  });
});
