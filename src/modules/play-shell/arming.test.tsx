import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { checkMove, createStanceCache, targetAt, type MoveContext } from '../beta-moves';
import { useAppStore } from '../../store/app';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor } from './play';
import { PlayScreen } from './PlayScreen';
import {
  canvasHarness,
  openMap,
  skipMap,
  targetsRegion,
  ROUTE_FULL,
  routeProps,
} from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-03 R0-1 and acceptance 1, through the screen: one armed limb
// by default; Shift + key, Shift + click or "+ limb" add a second one, at a tier that allows two.

vi.setConfig({ testTimeout: 30_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
let harness: ReturnType<typeof canvasHarness>;

beforeEach(() => {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_FULL });
  harness = canvasHarness();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const beginner = { level: 'beginner', hints: true, numbers: false } as const;

function open(over: Parameters<typeof routeProps>[0] = {}) {
  render(<PlayScreen {...routeProps({ photo: ROUTE_FULL, ...over })} />);
  act(() => harness.flush());
  skipMap();
  act(() => harness.flush());
}
const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
const pressed = () =>
  ['LH', 'RH', 'LF', 'RF'].filter((l) => limb(l).getAttribute('aria-pressed') === 'true');
const key = (code: string, shiftKey = false) =>
  fireEvent.keyDown(document.body, { code, key: code.slice(-1).toLowerCase(), shiftKey });
const stage = () => screen.getByRole('region', { name: 'Wall' });
const hint = () => document.querySelector('.play-hint')!;
const taps = () => document.querySelector<HTMLElement>('.play-taps')!;
/** A tap on the photo at an image point. */
function tap(x: number, y: number) {
  const d = taps().dataset;
  const [s, tx, ty] = [Number(d.scale), Number(d.tx), Number(d.ty)];
  const p = { pointerType: 'mouse', clientX: x * s + tx, clientY: y * s + ty };
  fireEvent.pointerDown(taps(), p);
  fireEvent.pointerUp(taps(), p);
}
const plusLimb = () => screen.queryByRole('button', { name: '+ limb' });

describe('R0-1 at the gym tier (2 limbs allowed)', () => {
  it('Q then W: only the right hand is armed', () => {
    open();
    key('KeyQ');
    key('KeyW');
    expect(pressed()).toEqual(['RH']);
  });

  it('a click replaces as well: LH then RH arms only RH', () => {
    open();
    fireEvent.click(limb('LH'));
    fireEvent.click(limb('RH'));
    expect(pressed()).toEqual(['RH']);
  });

  it('Shift + W after Q arms both hands', () => {
    open();
    key('KeyQ');
    key('KeyW', true);
    expect(pressed()).toEqual(['LH', 'RH']);
    expect(stage()).toHaveAttribute('data-armed', 'lh,rh');
  });

  it('Shift + click adds as well', () => {
    open();
    fireEvent.click(limb('LF'));
    fireEvent.click(limb('RF'), { shiftKey: true });
    expect(pressed()).toEqual(['LF', 'RF']);
  });

  it('"+ limb" then W after Q arms both hands, once', () => {
    open();
    key('KeyQ');
    fireEvent.click(plusLimb()!);
    expect(plusLimb()).toHaveAttribute('aria-pressed', 'true');
    key('KeyW');
    expect(pressed()).toEqual(['LH', 'RH']);
    expect(plusLimb()).toHaveAttribute('aria-pressed', 'false');
    // It was used up: the next press replaces again.
    key('KeyA');
    expect(pressed()).toEqual(['LF']);
  });

  it('W while RH is armed keeps RH armed', () => {
    open();
    key('KeyW');
    key('KeyW');
    expect(pressed()).toEqual(['RH']);
    fireEvent.click(limb('RH'));
    expect(pressed()).toEqual(['RH']);
  });

  it('after a fall preview with RH armed, A arms only LF and a wall foothold tap moves LF', () => {
    open();
    key('KeyW');
    const f7 = ctx.holds.find((h) => h.label === '7F')!;
    tap(f7.centroid.x, f7.centroid.y);
    expect(stage()).toHaveAttribute('data-preview', 'fall');
    // The limb stays armed after the preview, so the next tap retries with it.
    expect(pressed()).toEqual(['RH']);
    key('KeyA');
    expect(pressed()).toEqual(['LF']);
    tap(726, 739); // Wall foothold 23
    expect(stage()).toHaveAttribute('data-moves', '1');
    expect(JSON.parse(stage().dataset.assignment!).lf).toBe('wf:726:739');
  });

  it('the hint line names the armed limb', () => {
    open();
    key('KeyW');
    expect(hint()).toHaveTextContent('Moving: right hand — tap a hold');
    key('KeyA', true);
    expect(hint()).toHaveTextContent(
      'Moving: right hand and left foot — tap a hold for the right hand',
    );
  });
});

describe('R0-1 at the beginner tier (1 limb)', () => {
  it('Shift does nothing more than the key alone, and "+ limb" isn’t shown', () => {
    open({ profile: beginner });
    expect(plusLimb()).toBeNull();
    key('KeyQ');
    key('KeyW', true);
    expect(pressed()).toEqual(['RH']);
    fireEvent.click(limb('LF'), { shiftKey: true });
    expect(pressed()).toEqual(['LF']);
  });
});

describe('R0-1: a foot tap that finds nothing', () => {
  it('on bare wall says "No foothold there for that foot" and moves nothing', () => {
    open();
    key('KeyA');
    const step = JSON.parse(stage().dataset.assignment!);
    const radius = 24 / Number(taps().dataset.scale);
    // Bare wall: no route hold or wall foothold within the tap radius (targetAt's smear fallback).
    const bare = { x: 100, y: 1100 };
    expect(targetAt(ctx, step, 'lf', bare, radius)).toMatch(/^smear:/);
    tap(bare.x, bare.y);
    expect(hint()).toHaveTextContent('No foothold there for that foot');
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(stage()).not.toHaveAttribute('data-preview');
  });

  it('a hand tap off every hold still says the hand’s line', () => {
    open();
    key('KeyQ');
    tap(100, 1100);
    expect(hint()).toHaveTextContent('No route hold there for that hand');
  });

  it('the smear stays an explicit choice in the target list (S12)', () => {
    open();
    key('KeyA');
    expect(targetsRegion('Targets for the left foot')).toHaveTextContent('Smear');
  });
});

// Review 1: after a bare-wall foot miss, the foot can still go to that spot on purpose:
// "Smear here" in the hint line and in the target list, so a foot can be moved up the wall.
describe('Smear here (R0 review 1)', () => {
  const bare = { x: 100, y: 1100 };
  /** What the referee says of the left foot smearing at the tapped spot. */
  const expected = () => {
    const prev = JSON.parse(stage().dataset.assignment!);
    return checkMove(prev, { ...prev, lf: 'smear:100:1100' }, ctx, createStanceCache());
  };
  const after = (want: ReturnType<typeof expected>) => {
    if (want.verdict === 'fall') expect(stage()).toHaveAttribute('data-preview', 'fall');
    else {
      expect(stage()).toHaveAttribute('data-moves', '1');
      expect(JSON.parse(stage().dataset.assignment!).lf).toBe('smear:100:1100');
    }
  };

  it('the hint line offers it after the miss, and it moves the foot there', () => {
    open();
    key('KeyA');
    const want = expected();
    tap(bare.x, bare.y);
    expect(hint()).toHaveTextContent('No foothold there for that foot');
    fireEvent.click(screen.getByRole('button', { name: 'Smear here' }));
    after(want);
  });

  it('the target list offers it too', () => {
    open();
    key('KeyA');
    const want = expected();
    tap(bare.x, bare.y);
    const list = targetsRegion('Targets for the left foot');
    fireEvent.click(within(list).getByRole('button', { name: 'Smear here' }));
    after(want);
  });

  // Re-review 4: the button isn't inside the live hint line, and choosing it doesn't drop the focus
  // to the page when it goes: it goes to that foot's limb button.
  it('sits outside the live region, and the focus goes to the limb pad after the choice', () => {
    open();
    key('KeyA');
    tap(bare.x, bare.y);
    const b = screen.getByRole('button', { name: 'Smear here' });
    expect(b.closest('[aria-live]')).toBeNull();
    b.focus();
    fireEvent.click(b);
    expect(screen.queryByRole('button', { name: 'Smear here' })).toBeNull();
    expect(document.activeElement).toBe(limb('LF'));
  });

  it('belongs to that foot: another limb picked drops it', () => {
    open();
    key('KeyA');
    tap(bare.x, bare.y);
    key('KeyS');
    expect(screen.queryByRole('button', { name: 'Smear here' })).toBeNull();
  });
});

// Review 5 (accessibility): "+ limb" says what it does.
it('"+ limb" is described: the next limb you press is added', () => {
  open();
  expect(plusLimb()).toHaveAccessibleDescription('The next limb you press is added');
});

// Review 10 (game dev): after another limb is picked following a fall preview, the old try
// isn't drawn as if it were the current one; its words stay, as the last try (R0-2).
it('a limb change after a fall clears the ghost and its target; the words say "Last try"', () => {
  open();
  key('KeyQ');
  const f7 = ctx.holds.find((h) => h.label === '7F')!;
  tap(f7.centroid.x, f7.centroid.y);
  expect(stage()).toHaveAttribute('data-preview', 'fall');
  expect(document.querySelector('.play-ghost')).not.toBeNull();
  const fall = document.querySelector('.play-verdict')!.textContent!;
  expect(fall).toMatch(/^Left hand to 7F: you'd fall\. /);
  key('KeyW');
  expect(stage()).not.toHaveAttribute('data-preview');
  expect(document.querySelector('.play-ghost')).toBeNull();
  // Re-review 2: the live region stays the referee's exact verdict; "Last try:" is the box's.
  expect(document.querySelector('.play-verdict')!.textContent).toBe(fall);
  expect(document.querySelector('.play-coach-text')).toHaveTextContent(`Last try: ${fall}`);
});

// Review 11 (game dev): while the direction check is open, a limb key or a tap on the wall
// isn't swallowed: it answers with what to do.
describe('the direction check answers keys and taps (R0 review 11)', () => {
  function onTheMap() {
    render(<PlayScreen {...routeProps({ photo: ROUTE_FULL })} />);
    openMap();
    act(() => harness.flush());
    expect(stage()).toHaveAttribute('data-map', 'check');
  }
  const banner = () =>
    within(stage()).getByRole('region', { name: 'Do these directions look right?' });

  it('a limb key says to press Start planning, and arms nothing', () => {
    onTheMap();
    key('KeyQ');
    expect(within(banner()).getByRole('status')).toHaveTextContent('Press Start planning to climb');
    expect(stage()).not.toHaveAttribute('data-armed');
  });

  it('a tap on the wall says the same, and moves nothing', () => {
    onTheMap();
    const f7 = ctx.holds.find((h) => h.label === '7F')!;
    tap(f7.centroid.x, f7.centroid.y);
    expect(within(banner()).getByRole('status')).toHaveTextContent('Press Start planning to climb');
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(stage()).toHaveAttribute('data-map', 'check');
  });

  it('says nothing before a key or a tap', () => {
    onTheMap();
    expect(within(banner()).queryByText('Press Start planning to climb')).toBeNull();
  });
});
