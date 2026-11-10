import type { WallFootholds } from '../modules/climber-stance';
import type { HoldMask } from '../modules/hold-segmentation';
import type { WorkingImage } from '../modules/image-input';
import { useAppStore } from './app';

const image = (id: string): WorkingImage => ({
  id,
  pixels: { width: 4, height: 4, data: new Uint8ClampedArray(64) } as ImageData,
  width: 4,
  height: 4,
  scale: 1,
  sourceName: 'wall.jpg',
});

const hold = (id: string) => ({ id, imageId: 'a' }) as HoldMask;

const footholds = (imageId: string): WallFootholds => ({
  imageId,
  width: 4,
  height: 4,
  labels: new Uint16Array(16),
  blobs: [],
});

describe('app store', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('starts in the original view with no image', () => {
    expect(useAppStore.getState().view).toBe('original');
    expect(useAppStore.getState().image).toBeNull();
    expect(useAppStore.getState().samStatus).toBe('idle');
  });

  it('switches view with setView', () => {
    useAppStore.getState().setView('route');
    expect(useAppStore.getState().view).toBe('route');
  });

  it('setImage stores the image and clears all route state', () => {
    useAppStore.setState({
      image: image('a'),
      holds: [hold('h1')],
      view: 'route',
      samStatus: 'ready',
    });
    useAppStore.getState().setImage(image('b'));
    const s = useAppStore.getState();
    expect(s.image?.id).toBe('b');
    expect(s.holds).toEqual([]);
    expect(s.view).toBe('original');
    expect(s.samStatus).toBe('idle');
  });

  it('adds and removes holds by id', () => {
    useAppStore.getState().addHold(hold('h1'));
    useAppStore.getState().addHold(hold('h2'));
    useAppStore.getState().removeHold('h1');
    expect(useAppStore.getState().holds.map((h) => h.id)).toEqual(['h2']);
  });

  it('resets the stance for a new image but keeps the wall angle', () => {
    useAppStore.setState({
      stanceAssignment: { lh: 'h1', rh: null, lf: null, rf: null },
      climberScale: 1.5,
      showClimber: true,
      wallAngle: 35,
    });
    useAppStore.getState().setImage(image('b'));
    const s = useAppStore.getState();
    expect(s.stanceAssignment).toBeNull();
    expect(s.climberScale).toBe(1);
    expect(s.showClimber).toBe(false);
    expect(s.wallAngle).toBe(35);
  });

  it('resets the feet mode and the wall footholds for a new image (Amendment 2026-10-31 (b))', () => {
    useAppStore.setState({
      feetMode: 'follow',
      wallFootholds: footholds('a'),
      wallFootholdsStatus: 'ready',
    });
    useAppStore.getState().setImage(image('b'));
    const s = useAppStore.getState();
    expect(s.feetMode).toBe('any');
    expect(s.wallFootholds).toBeNull();
    expect(s.wallFootholdsStatus).toBe('idle');
  });

  it('starts with any feet and no footholds', () => {
    const s = useAppStore.getState();
    expect([s.feetMode, s.wallFootholds, s.wallFootholdsStatus]).toEqual(['any', null, 'idle']);
  });

  it('re-picks the start position when the feet mode changes', () => {
    useAppStore.setState({ stanceAssignment: { lh: 'h1', rh: 'h2', lf: 'blob:3', rf: null } });
    useAppStore.getState().setFeetMode('follow');
    expect(useAppStore.getState().feetMode).toBe('follow');
    expect(useAppStore.getState().stanceAssignment).toBeNull();
  });

  it('stores the wall footholds as ready, and the status on its own', () => {
    useAppStore.getState().setWallFootholdsStatus('pending');
    expect(useAppStore.getState().wallFootholdsStatus).toBe('pending');
    useAppStore.getState().setWallFootholds(footholds('a'));
    expect(useAppStore.getState().wallFootholds?.imageId).toBe('a');
    expect(useAppStore.getState().wallFootholdsStatus).toBe('ready');
    useAppStore.getState().setWallFootholdsStatus('error');
    expect(useAppStore.getState().wallFootholdsStatus).toBe('error');
  });

  it('frees a limb when its hold is removed', () => {
    useAppStore.setState({
      holds: [hold('h1'), hold('h2')],
      stanceAssignment: { lh: 'h1', rh: 'h2', lf: 'h1', rf: null },
    });
    useAppStore.getState().removeHold('h1');
    expect(useAppStore.getState().stanceAssignment).toEqual({
      lh: null,
      rh: 'h2',
      lf: null,
      rf: null,
    });
  });

  // SPEC-climber-stance Amendment 2026-11-04, M3: a hook belongs to a foot on one hold.
  it('stores a foot’s hook with its hold, clears it, and drops all hooks with a new image', () => {
    useAppStore.getState().setStanceHook('lf', 'h1', 'heel');
    useAppStore.getState().setStanceHook('rf', 'h2', 'toe');
    expect(useAppStore.getState().stanceHooks).toEqual({
      lf: { holdId: 'h1', hook: 'heel' },
      rf: { holdId: 'h2', hook: 'toe' },
    });
    useAppStore.getState().setStanceHook('rf', 'h2', null);
    expect(useAppStore.getState().stanceHooks).toEqual({ lf: { holdId: 'h1', hook: 'heel' } });
    useAppStore.getState().setFeetMode('follow');
    expect(useAppStore.getState().stanceHooks).toEqual({});
    useAppStore.getState().setStanceHook('lf', 'h1', 'heel');
    useAppStore.getState().setImage(image('b'));
    expect(useAppStore.getState().stanceHooks).toEqual({});
  });
});
