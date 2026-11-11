import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageInput } from './ImageInput';
import { DEFAULT_SAMPLE_ID, SAMPLES } from './samples';
import type { WorkingImage } from './types';

vi.mock('./load', () => ({
  loadImage: vi.fn(
    async (_blob: Blob, name?: string) =>
      ({ id: 'img', sourceName: name, width: 1536, height: 1152 }) as WorkingImage,
  ),
}));

describe('sample wall pool', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['x'], { type: 'image/jpeg' }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers Wall 2's photo, the only sample, as the default (AC S4; SPEC-launch-wall-2 R1)", () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['wall-b']);
    expect(DEFAULT_SAMPLE_ID).toBe('wall-b');
    render(<ImageInput onLoad={() => {}} onError={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Sample wall' })).toHaveValue('wall-b');
  });

  it('shows no credit line and no link for any sample, and bundles no video (AC S5)', () => {
    const { container } = render(<ImageInput onLoad={() => {}} onError={() => {}} />);
    for (const s of SAMPLES) {
      fireEvent.change(screen.getByRole('combobox', { name: 'Sample wall' }), {
        target: { value: s.id },
      });
      expect(container.querySelector('.sample-credit')).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
    }
    expect(SAMPLES.every((s) => !/\.(mp4|mov|webm|m3u8)$/i.test(s.url))).toBe(true);
  });

  it("loads Wall 2's photo with the owner's scale: 1.7 m of grey wall is 365 px (AC S6)", async () => {
    const onLoad = vi.fn();
    render(<ImageInput onLoad={onLoad} onError={() => {}} />);
    expect(screen.queryByRole('link', { name: /Watch/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    // Through the normal image path (AC S4), named and tagged as the sample.
    expect(fetch).toHaveBeenCalledWith('/samples/wall-b.jpg');
    expect(onLoad.mock.calls[0]![0]).toMatchObject({ sourceName: 'Wall 2', sampleId: 'wall-b' });
    // The owner's estimate (SPEC-launch-wall-2): 2.15 px/cm at its 816 px width (a 365 px climber),
    // scaled to the working width (the fake photo here is wider than the real one).
    const img = onLoad.mock.calls[0]![0] as WorkingImage;
    expect(img.pxPerCm).toBeCloseTo((2.15 * img.width) / 816, 6);
  });

  it('reports a failed download as a decode error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    const onError = vi.fn();
    render(<ImageInput onLoad={() => {}} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith({ kind: 'decode-failed' }));
  });
});
