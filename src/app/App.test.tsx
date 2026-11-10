import { fireEvent, render, screen } from '@testing-library/react';
import type { HoldMask } from '../modules/hold-segmentation';
import type { ImageInputError, WorkingImage } from '../modules/image-input';
import { useAppStore } from '../store/app';
import { App } from './App';
import { getMl } from './ml';

vi.mock('./ml', async () => {
  const { fakeMlClient } = await import('../../tests/fakeClient');
  const client = fakeMlClient();
  return { getMl: () => client };
});

// Replace the real input with buttons that simulate a load or an error.
vi.mock('../modules/image-input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/image-input')>()),
  ImageInput: (p: { onLoad: (i: WorkingImage) => void; onError: (e: ImageInputError) => void }) => (
    <>
      <button onClick={() => p.onLoad(image('next'))}>fake-load</button>
      <button onClick={() => p.onError({ kind: 'decode-failed' })}>fake-error</button>
    </>
  ),
}));

const image = (id: string): WorkingImage => ({
  id,
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: 'wall.jpg',
});

/** A 1-pixel hold on the 4×3 test image. */
const aHold = (): HoldMask =>
  ({
    id: 'h',
    imageId: 'current',
    mask: Uint8Array.from({ length: 12 }, (_, i) => (i === 5 ? 1 : 0)),
    bbox: { x: 1, y: 1, w: 1, h: 1 },
    centroid: { x: 1, y: 1 },
    area: 1,
    role: 'route',
    order: 0,
  }) as HoldMask;

describe('App', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bouldering Vis' })).toBeInTheDocument();
  });

  it('shows a loaded image without asking when there is no route', () => {
    render(<App />);
    fireEvent.click(screen.getByText('fake-load'));
    expect(useAppStore.getState().image?.id).toBe('next');
    expect(screen.getByLabelText('Wall photo')).toBeInTheDocument();
  });

  it('asks before replacing a photo that has a route, and keeps it on cancel', () => {
    useAppStore.setState({ image: image('current'), holds: [aHold()] });
    render(<App />);
    fireEvent.click(screen.getByText('fake-load'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('clears your route');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().image?.id).toBe('current');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('replaces the photo and clears the route on confirm', () => {
    useAppStore.setState({ image: image('current'), holds: [aHold()] });
    render(<App />);
    fireEvent.click(screen.getByText('fake-load'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace photo' }));
    expect(useAppStore.getState().image?.id).toBe('next');
    expect(useAppStore.getState().holds).toEqual([]);
  });

  it('posts the hold-type jobs before the depth job, so the queue runs them first (I1)', () => {
    // The worker can't interrupt a running job: whichever request arrives first on an idle queue
    // runs first, whatever its priority. The cards must not wait for the depth map.
    useAppStore.setState({ image: image('current'), holds: [aHold()] });
    const sent = vi.spyOn(getMl(), 'request');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Show route' }));
    const types = sent.mock.calls.map(([req]) => req.type);
    expect(types).toContain('clip:embed');
    expect(types).toContain('depth:run');
    expect(types.indexOf('clip:embed')).toBeLessThan(types.indexOf('depth:run'));
    sent.mockRestore();
  });

  it('shows input errors and keeps the current image', () => {
    useAppStore.setState({ image: image('current') });
    render(<App />);
    fireEvent.click(screen.getByText('fake-error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t read that image');
    expect(useAppStore.getState().image?.id).toBe('current');
  });
});
