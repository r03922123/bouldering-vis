import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import type { HoldMask, HoldRole } from '../hold-segmentation';
import type { WorkingImage } from '../image-input';
import { SMEAR } from './assign';
import { STANCE_DEBOUNCE_MS, useStance } from './useStance';
import { wallFootholds } from './wallFootholds';

const image = (id: string): WorkingImage =>
  ({ id, width: 1000, height: 1000, scale: 1, sourceName: 'wall.jpg' }) as WorkingImage;

const hold = (id: string, x: number, y: number, role: HoldRole = 'route'): HoldMask =>
  ({
    id,
    imageId: 'a',
    role,
    order: 0,
    centroid: { x, y },
    bbox: { x: x - 25, y: y - 15, w: 50, h: 30 },
  }) as HoldMask;

const types = new Map<string, string | null>();
const forces = new Map<string, { dir: [number, number, number] | null }>();

describe('useStance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      image: image('a'),
      holds: [
        hold('l', 450, 200, 'start'),
        hold('r', 550, 200, 'start'),
        // ~0.77 climber heights below the hands (the default climber is 260 px here).
        hold('fl', 430, 400),
        hold('fr', 570, 400),
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('solves nothing while the climber is hidden, but still reports the start position', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).toBeNull();
    expect(result.current.assignment).toEqual({ lh: 'l', rh: 'r', lf: 'fl', rf: 'fr' });
    // 0.26 × the photo width (SPEC-climber-stance › Amendment: Default Climber Size).
    expect(result.current.height).toBeCloseTo(260, 9);
  });

  // SPEC-climber-stance Amendment 2026-11-04, M3: a hook applies while its foot is on its hold.
  it('puts a foot’s hook on its contact only while that foot is on the hold it was set for', () => {
    useAppStore.getState().setStanceHook('lf', 'fl', 'heel');
    useAppStore.getState().setStanceHook('rf', 'elsewhere', 'toe');
    const { result } = renderHook(() => useStance(types, forces));
    expect(result.current.contacts.lf?.hook).toBe('heel');
    expect(result.current.contacts.rf?.hook).toBeUndefined();
    act(() => useAppStore.getState().setStanceAssignment({ lh: 'l', rh: 'r', lf: 'fr', rf: null }));
    expect(result.current.contacts.lf?.hook).toBeUndefined();
  });

  it('solves the start position once shown, after the debounce', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => useAppStore.getState().setShowClimber(true));
    expect(result.current.stance).toBeNull();
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance?.joints).not.toBeNull();
    const total = Object.values(result.current.stance!.load).reduce((s, v) => s + v!.force[1], 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it('uses the user’s assignment and drops the old stance for a new photo', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => {
      useAppStore.getState().setShowClimber(true);
      useAppStore.getState().setStanceAssignment({ lh: 'l', rh: 'l', lf: null, rf: null });
    });
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();
    expect(result.current.contacts.rh?.holdId).toBe('l');
    expect(result.current.contacts.lf).toBeNull();
    act(() => useAppStore.getState().setImage(image('b')));
    expect(result.current.stance).toBeNull();
  });

  it('never shows a stance solved for other holds or another wall', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => useAppStore.getState().setShowClimber(true));
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();

    act(() => useAppStore.getState().setStanceAssignment({ lh: 'l', rh: 'r', lf: null, rf: 'fr' }));
    expect(result.current.stance).toBeNull();
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();

    act(() => useAppStore.getState().setWallAngle(35));
    expect(result.current.stance).toBeNull();
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();
  });

  it('keeps the climber the same size while holds are added', () => {
    const { result } = renderHook(() => useStance(types, forces));
    const before = result.current.height;
    // A 1 m macro next to 30-50 px holds: the old median-hold rule would have grown the climber.
    const macro = { ...hold('macro', 500, 400), bbox: { x: 300, y: 200, w: 400, h: 400 } };
    act(() => {
      for (let i = 0; i < 5; i++) useAppStore.getState().addHold({ ...macro, id: `macro${i}` });
    });
    expect(result.current.height).toBe(before);
  });

  it('drops the stance when its photo changes, even with the climber still on', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => useAppStore.getState().setShowClimber(true));
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    act(() => useAppStore.setState({ image: image('b') }));
    expect(result.current.stance).toBeNull();
  });
});

// SPEC-climber-stance › Amendment 2026-10-31 (b), rule 14: the footholds feed the start position.
describe('useStance with wall footholds', () => {
  // Start holds only, so the feet need the wall mask. The climber is 260 px tall here, so the
  // ideal feet are about (445, 351) and (555, 351).
  const starts = [hold('l', 450, 200, 'start'), hold('r', 550, 200, 'start')];
  const footholds = () => {
    const mask = new Uint8Array(1000 * 1000);
    // Two 30 × 12 blobs: big enough (≥ 0.012 H) and not a sign (12 px < 0.06 H).
    for (const x0 of [430, 540])
      for (let y = 345; y < 357; y++) for (let x = x0; x < x0 + 30; x++) mask[y * 1000 + x] = 1;
    return wallFootholds(mask, 1000, 1000, 'a');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      image: image('a'),
      holds: starts,
      showClimber: true,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('doesn’t solve while the footholds are pending, so no smear stance flashes first', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => useAppStore.getState().setWallFootholdsStatus('pending'));
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS * 5));
    expect(result.current.stance).toBeNull();
    expect(result.current.footholdsStatus).toBe('pending');

    act(() => useAppStore.getState().setWallFootholds(footholds()));
    expect(result.current.footholdsStatus).toBe('ready');
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();
  });

  it('stands the feet on the wall footholds once they are ready', () => {
    act(() => useAppStore.getState().setWallFootholds(footholds()));
    const { result } = renderHook(() => useStance(types, forces));
    expect(result.current.assignment).toEqual({ lh: 'l', rh: 'r', lf: 'blob:1', rf: 'blob:2' });
    expect(result.current.contacts.lf).toMatchObject({ holdId: 'blob:1', type: null, dir: null });
    expect(result.current.candidates.lf.map((c) => c.id)).toEqual(['blob:1', 'blob:2']);
    expect(result.current.candidates.rf[0]?.id).toBe('blob:2');
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();
  });

  it('solves with picked holds only while following hands, even while pending', () => {
    act(() => {
      useAppStore.getState().setWallFootholds(footholds());
      useAppStore.getState().setFeetMode('follow');
    });
    const { result } = renderHook(() => useStance(types, forces));
    expect(result.current.assignment).toEqual({ lh: 'l', rh: 'r', lf: SMEAR, rf: SMEAR });
    expect(result.current.candidates).toEqual({ lf: [], rf: [] });
    act(() => useAppStore.getState().setWallFootholdsStatus('pending'));
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();
  });

  it('solves with no blobs when the footholds failed', () => {
    const { result } = renderHook(() => useStance(types, forces));
    act(() => useAppStore.getState().setWallFootholdsStatus('error'));
    expect(result.current.assignment).toEqual({ lh: 'l', rh: 'r', lf: SMEAR, rf: SMEAR });
    act(() => vi.advanceTimersByTime(STANCE_DEBOUNCE_MS + 1));
    expect(result.current.stance).not.toBeNull();
    expect(result.current.footholdsStatus).toBe('error');
  });

  it('lets the feet dangle on an overhang when there is nothing to stand on', () => {
    act(() => useAppStore.getState().setWallAngle(35));
    const { result } = renderHook(() => useStance(types, forces));
    expect(result.current.assignment).toEqual({ lh: 'l', rh: 'r', lf: null, rf: null });
  });

  it('ranks the foot candidates from the hands the user chose', () => {
    act(() => useAppStore.getState().setWallFootholds(footholds()));
    const { result } = renderHook(() => useStance(types, forces));
    const auto = result.current.candidates.lf[0]!;
    // Both hands matched on the left start: the feet are measured from x 450, not 500.
    act(() => useAppStore.getState().setStanceAssignment({ lh: 'l', rh: 'l', lf: null, rf: null }));
    const chosen = result.current.candidates.lf.find((c) => c.id === auto.id)!;
    expect(chosen.cost).not.toBeCloseTo(auto.cost, 6);
  });
});
