import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PROFILE } from '../modules/gym-hub';
import type { HoldMask } from '../modules/hold-segmentation';
import type { WorkingImage } from '../modules/image-input';
import { useAppStore } from '../store/app';
import { useProfileStore } from '../store/profile';
import { Root } from './Root';

const ml = vi.hoisted(() => ({ started: 0 }));
vi.mock('./ml', async () => {
  const { fakeMlClient } = await import('../../tests/fakeClient');
  const client = fakeMlClient();
  return {
    getMl: () => {
      ml.started++;
      return client;
    },
  };
});

const loadSampleImage = vi.hoisted(() => vi.fn());
const loadImage = vi.hoisted(() => vi.fn());
vi.mock('../modules/image-input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/image-input')>()),
  loadImage,
}));
vi.mock('./sampleImage', () => ({ loadSampleImage }));

// Wall 2 with the synthetic route in place of its shipped level, as the Play E2E specs serve it.
// vi.mock factories run before this file's imports, so the sample id is imported here.
vi.mock('./playWall', async (importOriginal) => {
  const real = await importOriginal<typeof import('./playWall')>();
  const { DEFAULT_SAMPLE_ID } = await import('../modules/image-input');
  const level = await import('../../tests/fixtures/synthetic-route.level.json');
  return {
    ...real,
    LEVELS: { [DEFAULT_SAMPLE_ID]: '/levels/test.json' },
    loadLevel: async () => real.wallFromLevel(level.default),
  };
});

const image = (sampleId: string): WorkingImage => ({
  id: `img-${sampleId}`,
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: `${sampleId}.jpg`,
  sampleId,
});

/** A 1-pixel hold on the 4×3 test image (as in App.test.tsx). */
const aHold = (): HoldMask =>
  ({
    id: 'h',
    imageId: 'img-photo-a',
    mask: Uint8Array.from({ length: 12 }, (_, i) => (i === 5 ? 1 : 0)),
    bbox: { x: 1, y: 1, w: 1, h: 1 },
    centroid: { x: 1, y: 1 },
    area: 1,
    role: 'route',
    order: 0,
  }) as HoldMask;

/** Moves to `hash` the way the browser does: set it, then fire hashchange. */
function goTo(hash: string) {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

// The Studio is lazy-loaded (G11). Its first import transforms the whole Studio tree, which can take
// over findBy's 1 s default on a loaded machine, so warm it once and allow 5 s.
const studio = () => screen.findByRole('heading', { name: 'Bouldering Vis' }, { timeout: 5000 });

const play = (name: string) => screen.findByRole('heading', { level: 1, name }, { timeout: 5000 });

beforeAll(async () => {
  await import('./App');
  await import('./PlayRoute');
}, 30_000);

beforeEach(() => {
  useProfileStore.setState({ profile: { level: 'gym', hints: false, numbers: false }, aids: {} });
  loadSampleImage.mockImplementation(async (s: { id: string }) => image(s.id));
});
afterEach(() => {
  window.history.replaceState(null, '', '#/gym');
  useAppStore.setState(useAppStore.getInitialState());
});

describe('Root (SPEC-gym-hub G6, G11–G13)', () => {
  it('opens Wall 2 at #/, with no way to the gym (SPEC-launch-wall-2 R3)', async () => {
    window.history.replaceState(null, '', '#/');
    render(<Root />);
    expect(await play('Wall 2')).toBeVisible();
    expect(window.location.hash).toBe('#/wall/wall-b');
    expect(screen.queryByRole('link', { name: 'Gym' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Gym' })).not.toBeInTheDocument();
  });

  it('opens the gym at #/gym, without loading the Studio', () => {
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    expect(screen.getByRole('navigation', { name: 'Gym' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Bouldering Vis' })).not.toBeInTheDocument();
  });

  it('opens the Studio in the Setting Room at #/studio, with a way back to the gym', async () => {
    window.history.replaceState(null, '', '#/studio');
    render(<Root />);
    expect(await studio()).toBeVisible();
    expect(screen.getByRole('link', { name: 'Gym' })).toHaveAttribute('href', '#/gym');
  });

  it('goes to the Setting Room from its door in the gym', async () => {
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    fireEvent.click(screen.getByRole('button', { name: 'Setting Room' }));
    expect(window.location.hash).toBe('#/studio');
    goTo('#/studio');
    expect(await studio()).toBeVisible();
  });

  it('opens a bay as its wall: #/wall/<sample> loads that sample into Play, not the Studio', async () => {
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    fireEvent.click(screen.getByRole('button', { name: 'Wall 2' }));
    expect(window.location.hash).toBe('#/wall/wall-b');
    goTo('#/wall/wall-b');
    expect(await play('Wall 2')).toBeVisible();
    await vi.waitFor(() => expect(useAppStore.getState().image?.sampleId).toBe('wall-b'));
    // Its baked level opens in Plan, never Tag (S2).
    expect(
      await screen.findByText('Start: Balanced: this position can be held', {}, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Bouldering Vis' })).not.toBeInTheDocument();
  });

  it('never starts the ML worker for a baked level (load on demand)', async () => {
    ml.started = 0;
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    await screen.findByText('Start: Balanced: this position can be held', {}, { timeout: 5000 });
    expect(ml.started).toBe(0);
  });

  it('opens Wall 2 straight into Plan on its baked level, with no "◀ Gym" (C5, R3)', async () => {
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    const verdict = await screen.findByText(
      'Start: Balanced: this position can be held',
      {},
      { timeout: 5000 },
    );
    expect(verdict).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Wall 2' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Gym' })).not.toBeInTheDocument();
  });

  it('asks before a wall replaces a route on another photo, and keeps the route on "Keep"', async () => {
    useAppStore.setState({ image: image('photo-a'), holds: [aHold()] });
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('This clears your route.');
    // The safe answer has the focus (review suggestion).
    expect(screen.getByRole('button', { name: 'Keep my route' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my route' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(useAppStore.getState().image?.sampleId).toBe('photo-a');
    expect(loadSampleImage).not.toHaveBeenCalled();
    expect(screen.getByText(/Your Setting Room route is still open/)).toBeInTheDocument();
  });

  it('opens the wall after "Open the wall"', async () => {
    useAppStore.setState({ image: image('photo-a'), holds: [aHold()] });
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the wall' }));
    await vi.waitFor(() => expect(useAppStore.getState().image?.sampleId).toBe('wall-b'));
  });

  it('asks again on the next visit: a route made after a confirm is never wiped silently', async () => {
    useAppStore.setState({ image: image('photo-a'), holds: [aHold()] });
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the wall' }));
    await vi.waitFor(() => expect(useAppStore.getState().image?.sampleId).toBe('wall-b'));
    // In the Setting Room: photo B, with a route on it.
    goTo('#/studio');
    act(() => useAppStore.setState({ image: image('photo-b'), holds: [aHold()] }));
    goTo('#/gym');
    goTo('#/wall/wall-b');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('This clears your route.');
    expect(useAppStore.getState().image?.sampleId).toBe('photo-b');
  });

  it('asks again after "Keep my route", on the next visit', async () => {
    useAppStore.setState({ image: image('photo-a'), holds: [aHold()] });
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my route' }));
    goTo('#/gym');
    goTo('#/wall/wall-b');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('This clears your route.');
  });

  it('tries a failed wall again on the next visit', async () => {
    loadSampleImage.mockRejectedValueOnce(new Error('offline'));
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open that wall.");
    goTo('#/gym');
    goTo('#/wall/wall-b');
    await vi.waitFor(() => expect(useAppStore.getState().image?.sampleId).toBe('wall-b'));
    expect(loadSampleImage).toHaveBeenCalledTimes(2);
  });

  it('says so when a wall fails to load', async () => {
    loadSampleImage.mockRejectedValue(new Error('offline'));
    window.history.replaceState(null, '', '#/wall/wall-b');
    render(<Root />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open that wall.");
  });

  it('keeps the Studio and the gym mounted across routes, hiding the one not shown', async () => {
    window.history.replaceState(null, '', '#/studio');
    render(<Root />);
    const heading = await studio();
    goTo('#/gym');
    expect(heading).not.toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Gym' })).toBeVisible();
    goTo('#/studio');
    expect(await studio()).toBe(heading);
    expect(heading).toBeVisible();
  });

  it('opens the New wall door’s photo picker, then your photo as My wall in Tag (S14)', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    loadImage.mockResolvedValue({ ...image('x'), id: 'own', sampleId: undefined });
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    fireEvent.click(screen.getByRole('button', { name: 'New wall' }));
    expect(click).toHaveBeenCalledOnce();
    const file = new File(['x'], 'my-wall.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a wall photo'), { target: { files: [file] } });
    await vi.waitFor(() => expect(window.location.hash).toBe('#/wall/mine'));
    expect(loadImage).toHaveBeenCalledWith(file, 'my-wall.jpg');
    expect(useAppStore.getState().image?.id).toBe('own');
    goTo('#/wall/mine');
    expect(await play('My wall')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Plan this route' })).toBeInTheDocument();
    click.mockRestore();
  });

  it('asks before your new photo replaces a route', async () => {
    useAppStore.setState({ image: image('photo-a'), holds: [aHold()] });
    loadImage.mockResolvedValue({ ...image('x'), id: 'own', sampleId: undefined });
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    const file = new File(['x'], 'my-wall.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a wall photo'), { target: { files: [file] } });
    expect(await screen.findByRole('button', { name: 'Keep my route' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my route' }));
    expect(useAppStore.getState().image?.id).toBe('img-photo-a');
    expect(window.location.hash).toBe('#/gym');
  });

  it('drops a slow photo when the player has moved on (review suggestion)', async () => {
    let finish!: (img: WorkingImage) => void;
    loadImage.mockReturnValue(new Promise<WorkingImage>((r) => (finish = r)));
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    const file = new File(['x'], 'slow.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a wall photo'), { target: { files: [file] } });
    goTo('#/studio');
    await act(async () => finish({ ...image('x'), id: 'slow', sampleId: undefined }));
    expect(window.location.hash).toBe('#/studio');
    expect(useAppStore.getState().image?.id).not.toBe('slow');
  });

  it('opens the baked Wall 2 from "Play this wall" when its photo has no route of yours', async () => {
    useAppStore.setState({ image: image('wall-b'), holds: [] });
    window.history.replaceState(null, '', '#/studio');
    render(<Root />);
    await studio();
    const bar = screen.getByRole('navigation', { name: 'Setting Room' });
    expect(within(bar).getByRole('link', { name: 'Play this wall' })).toHaveAttribute(
      'href',
      '#/wall/wall-b',
    );
  });

  it('says why a photo can’t be used', async () => {
    const { ImageInputException } = await import('../modules/image-input');
    loadImage.mockRejectedValue(new ImageInputException({ kind: 'decode-failed' }));
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    const file = new File(['x'], 'broken.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a wall photo'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('links the Setting Room’s photo back to Play from the room bar', async () => {
    useAppStore.setState({ image: { ...image('x'), sampleId: undefined } });
    window.history.replaceState(null, '', '#/studio');
    render(<Root />);
    await studio();
    const bar = screen.getByRole('navigation', { name: 'Setting Room' });
    expect(within(bar).getByRole('link', { name: 'Play this wall' })).toHaveAttribute(
      'href',
      '#/wall/mine',
    );
  });

  it('says there is no photo yet at #/wall/mine without one', async () => {
    window.history.replaceState(null, '', '#/wall/mine');
    render(<Root />);
    expect(await screen.findByText(/No photo yet/)).toBeInTheDocument();
  });

  it('sends an unknown wall to Wall 2, as its hash (R3)', async () => {
    window.history.replaceState(null, '', '#/wall/foo');
    render(<Root />);
    expect(await play('Wall 2')).toBeVisible();
    expect(window.location.hash).toBe('#/wall/wall-b');
  });

  it('writes any unknown hash back as Wall 2’s (C1, R3)', () => {
    window.history.replaceState(null, '', '#/nowhere');
    render(<Root />);
    expect(window.location.hash).toBe('#/wall/wall-b');
    goTo('#/studio/extra');
    expect(window.location.hash).toBe('#/wall/wall-b');
  });

  it('never asks the level question: a new session is a gym climber (Amendment 2026-11-02 W3)', () => {
    useProfileStore.setState(useProfileStore.getInitialState());
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useProfileStore.getState().profile).toEqual(DEFAULT_PROFILE);
    // W5: so a beginner's gym can't happen: the Setting Room door is there.
    expect(screen.getByRole('button', { name: 'Setting Room' })).toBeVisible();
  });

  it('hides the Setting Room door from a beginner, but #/studio still opens it', async () => {
    useProfileStore.setState({ profile: { level: 'beginner', hints: true, numbers: false } });
    window.history.replaceState(null, '', '#/gym');
    render(<Root />);
    expect(screen.queryByRole('button', { name: 'Setting Room' })).not.toBeInTheDocument();
    goTo('#/studio');
    expect(await studio()).toBeVisible();
  });
});
