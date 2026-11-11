import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  checkStart,
  createStanceCache,
  defaultStart,
  type MoveCheck,
  type MoveContext,
  type RouteHold,
} from '../beta-moves';
import { useAppStore } from '../../store/app';
import { SYNTHETIC } from './synthetic.fixture';
import { applyEdits, DOWN_PULL, downPreset, withEdit } from './directions';
import { forgetPlans } from './memory';
import { contextFor, reasonText, startBannerText, verdictLine, type PlayWall } from './play';
import { PlayScreen } from './PlayScreen';
import { skipMap, ROUTE_IMAGE, routeProps } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-03 R0-3 and acceptance 3: no advice Play can't carry out.
// (a) Play's out-of-reach text has no size clause; (b) a Down preset in Edit directions, and the
// sloper text names it; (c) a start that can't be held says why and offers Edit route and Edit
// directions.

vi.setConfig({ testTimeout: 60_000 });

/**
 * A tagged route whose start can't be held: beta-moves' sloper ladder (its unit fixture, rebuilt
 * here since modules are imported only through their index): both start holds slopers on the
 * type rule's assumed surface, the Studio's "if its top faces up, set its pull to Down" case.
 */
const hold = (
  order: number,
  label: string,
  x: number,
  y: number,
  role: RouteHold['role'],
  type: string,
  dir: [number, number, number] | null,
): RouteHold => ({
  id: `hold-${order}`,
  order,
  label,
  role,
  centroid: { x, y },
  type,
  dir,
  wallNormal: null,
});
const DOWN: [number, number, number] = [0, 1, 0];
const SLOPER: [number, number, number] = [0, 0.6, -1];
const UNFIXED: PlayWall = {
  holds: [
    hold(0, '1S', 400, 1000, 'start', 'sloper', SLOPER),
    hold(1, '2S', 600, 1000, 'start', 'sloper', SLOPER),
    hold(2, '3', 400, 700, 'route', 'jug', DOWN),
    hold(3, '4', 600, 700, 'route', 'jug', DOWN),
    hold(4, '5', 400, 400, 'route', 'jug', DOWN),
    hold(5, '6', 600, 400, 'route', 'jug', DOWN),
    hold(6, '7F', 500, 150, 'finish', 'jug', DOWN),
    hold(7, '8', 420, 1580, 'route', 'edge', null),
    hold(8, '9', 580, 1580, 'route', 'edge', null),
    hold(9, '10', 420, 1300, 'route', 'edge', null),
    hold(10, '11', 580, 1300, 'route', 'edge', null),
  ],
  wallFeet: [],
  height: 1000,
  wallAngleDeg: 0,
  photo: { width: 1000, height: 2000 },
};
const [S1, S2] = UNFIXED.holds.filter((h) => h.role === 'start') as [RouteHold, RouteHold];
const ctxOf = (w: PlayWall) => (contextFor(w) as { value: MoveContext }).value;
const startOf = (w: PlayWall) => {
  const c = ctxOf(w);
  return checkStart(defaultStart(c), c, createStanceCache());
};

describe('reasonText (R0-3 a, b): the referee’s reason in Play’s words', () => {
  it('a sloper start that can’t be held: Play says to press Down in Edit directions', () => {
    const start = startOf(UNFIXED);
    expect(start.verdict).toBe('fall');
    expect(start.fail?.diagnosis?.kind).toBe('sloper-steep');
    expect(reasonText(start)).toMatch(
      /^(Left|Right) hand: this sloper may be too steep — if its top faces up, press Down for it in Edit directions$/,
    );
    // The referee's own reason (the Studio's words) is unchanged.
    expect(start.reason).toMatch(/set its pull to Down$/);
  });

  it('never says "make the climber bigger"', () => {
    const start = startOf(UNFIXED);
    const reach: MoveCheck = {
      ...start,
      reason: 'Out of reach: left foot — make the climber bigger or pick a closer hold',
      fail: {
        kind: 'stance',
        diagnosis: {
          kind: 'reach',
          limb: 'lf',
          text: 'Out of reach: left foot — make the climber bigger or pick a closer hold',
          playText: 'Out of reach: left foot — pick a closer hold',
        },
        text: 'Out of reach: left foot — make the climber bigger or pick a closer hold',
      },
    };
    expect(reasonText(reach)).toBe('Out of reach: left foot — pick a closer hold');
    expect(verdictLine(ctxOf(UNFIXED), reach)).not.toMatch(/bigger/);
    // Inside a pivot's "While your … moves:" too.
    const pivot: MoveCheck = {
      ...reach,
      reason: `While your left foot moves: ${reach.fail!.text}`,
      fail: {
        ...reach.fail!,
        kind: 'pivot',
        text: `While your left foot moves: ${reach.fail!.text}`,
      },
    };
    expect(reasonText(pivot)).toBe(
      'While your left foot moves: Out of reach: left foot — pick a closer hold',
    );
  });

  it('keeps a reason with no Play words as the referee gave it', () => {
    const start = startOf(SYNTHETIC);
    expect(start.verdict).toBe('hold');
    expect(reasonText(start)).toBeNull();
    const barn = { ...start, verdict: 'fall' as const, reason: 'Barn door: you’d swing off' };
    expect(reasonText(barn)).toBe('Barn door: you’d swing off');
  });
});

// Review: reasonText must apply the Play text wherever the diagnosis appears, never leave
// the Studio's words in by accident.
describe('reasonText always applies a set playText', () => {
  const studio = 'Out of reach: left foot — make the climber bigger or pick a closer hold';
  const play = 'Out of reach: left foot — pick a closer hold';
  const withReason = (reason: string): MoveCheck => {
    const start = startOf(UNFIXED);
    return {
      ...start,
      reason,
      fail: {
        kind: 'pivot',
        diagnosis: { kind: 'reach', limb: 'lf', text: studio, playText: play },
        text: reason,
      },
    };
  };

  it('replaces every occurrence of the Studio’s words', () => {
    const twice = withReason(`While your left foot moves: ${studio}; and again: ${studio}`);
    expect(reasonText(twice)).not.toContain(studio);
    expect(reasonText(twice)).toBe(`While your left foot moves: ${play}; and again: ${play}`);
  });

  // Re-review 3: an empty diagnosis text would split between every letter.
  it('leaves the reason alone when the diagnosis text is empty', () => {
    const start = startOf(UNFIXED);
    const empty: MoveCheck = {
      ...start,
      reason: 'Keep at least two points on the wall',
      fail: {
        kind: 'pivot',
        diagnosis: { kind: 'reach', limb: 'lf', text: '', playText: 'X' },
        text: 'Keep at least two points on the wall',
      },
    };
    expect(reasonText(empty)).toBe('Keep at least two points on the wall');
  });

  it('on every solver check that carries a playText, the Play words are in and the Studio’s out', () => {
    const checks = [startOf(UNFIXED)];
    for (const c of checks) {
      const d = c.fail!.diagnosis!;
      expect(d.playText).toBeDefined();
      expect(reasonText(c)).toContain(d.playText!);
      // Applied: the line differs from the referee's (the Studio's) own words.
      expect(reasonText(c)).not.toBe(c.reason);
    }
  });
});

// Review 6 (game designer): the Down advice only when Down would change the pull, and
// saying why, by hold.
describe('reasonText with the context: the Down advice by hold (R0 review 6)', () => {
  it('names the hold and its pull, and says why', () => {
    const start = startOf(UNFIXED);
    expect(reasonText(start, ctxOf(UNFIXED))).toBe(
      "Left hand: hold 1S pulls mostly into the wall, which a sloper can't take — if its top faces up, press Down for it in Edit directions",
    );
    expect(verdictLine(ctxOf(UNFIXED), start)).toBe(`Start: ${reasonText(start, ctxOf(UNFIXED))}`);
  });

  it('never advises Down for a pull already straight down (within the editor’s 12° snap)', () => {
    // Both start slopers on a type pull 5° off straight down: still the assumed surface, so too
    // steep, but Down wouldn't change the pull.
    const tilt = Math.sin((5 * Math.PI) / 180);
    const nearDown: PlayWall = {
      ...UNFIXED,
      holds: UNFIXED.holds.map((h) =>
        h.role === 'start' ? { ...h, dir: [tilt, Math.cos((5 * Math.PI) / 180), 0] } : h,
      ),
    };
    const start = startOf(nearDown);
    expect(start.fail?.diagnosis?.kind).toBe('sloper-steep');
    const text = reasonText(start, ctxOf(nearDown))!;
    expect(text).not.toMatch(/Down/);
    expect(text).toBe(
      "Left hand: a sloper can't take this pull — get your hips lower and under it",
    );
  });
});

// Review 7 (game designer): a new stance that fails on a limb the player didn't move says
// the context, not "Out of reach" alone.
describe('the blame wording (R0 review 7)', () => {
  const w1 = ctxOf(SYNTHETIC);
  const reachOn = (
    limb: 'lf' | 'lh',
    moved: Partial<Record<'lh' | 'rh' | 'lf' | 'rf', string>>,
  ) => {
    const start = startOf(SYNTHETIC);
    const studio = `Out of reach: ${limb === 'lf' ? 'left foot' : 'left hand'} — make the climber bigger or pick a closer hold`;
    const limbs = Object.keys(moved) as ('lh' | 'rh' | 'lf' | 'rf')[];
    return {
      ...start,
      verdict: 'fall',
      legal: false,
      reason: studio,
      move: { kind: 'hand', limbs, from: {}, to: moved },
      fail: {
        kind: 'stance',
        diagnosis: { kind: 'reach', limb, text: studio, playText: 'unused' },
        text: studio,
      },
    } as MoveCheck;
  };

  it('names the move and the unmoved limb: "With your right hand on 6, your left foot can’t reach"', () => {
    const c = reachOn('lf', { rh: 'synthetic-6' });
    expect(verdictLine(w1, c)).toBe(
      "Right hand to 6: you'd fall. With your right hand on 6, your left foot can't reach — pick a closer foothold",
    );
  });

  it('a hand says hold', () => {
    const c = reachOn('lh', { rf: 'synthetic-2' });
    expect(reasonText(c, w1)).toBe(
      "With your right foot on 2, your left hand can't reach — pick a closer hold",
    );
  });

  // SPEC-climber-stance Amendment 2026-11-04, M2: a cramped limb reaches, just not that close.
  it('a cramped limb keeps the referee’s words', () => {
    const c = reachOn('lf', { rh: 'synthetic-6' });
    const cramped = 'Too cramped: left foot — pick a hold further from your body';
    const check = {
      ...c,
      reason: cramped,
      fail: {
        kind: 'stance',
        diagnosis: { kind: 'reach', limb: 'lf', text: cramped, cramped: true },
        text: cramped,
      },
    } as MoveCheck;
    expect(reasonText(check, w1)).toBe(cramped);
  });

  it('the limb that moved out of reach keeps the plain words', () => {
    const c = reachOn('lf', { lf: 'synthetic-2' });
    expect(reasonText(c, w1)).toBe('unused');
  });
});

describe('the Down preset (R0-3 b)', () => {
  it('sets a hold’s pull straight down, as the user’s pull (the Studio’s Down preset)', () => {
    expect(DOWN_PULL).toEqual([0, 1, 0]);
    const edits = withEdit({}, S1.id, downPreset(), S1.centroid);
    expect(edits).toEqual({ [S1.id]: { custom: [0, 1, 0] } });
    const h = applyEdits(UNFIXED, edits).holds.find((x) => x.id === S1.id)!;
    expect(h.dir).toEqual([0, 1, 0]);
    expect(h.forceSource).toBe('user');
  });

  it('Down on both start slopers makes the start hold', () => {
    let edits = withEdit({}, S1.id, downPreset(), S1.centroid);
    edits = withEdit(edits, S2.id, downPreset(), S2.centroid);
    expect(startOf(applyEdits(UNFIXED, edits)).verdict).toBe('hold');
  });
});

describe('startBannerText (R0-3 c)', () => {
  it('says why and what to do, on a tagged route', () => {
    const start = startOf(UNFIXED);
    expect(startBannerText(start, true)).toBe(
      `This start can’t be held: ${reasonText(start)}. Tag a second start hold, or edit directions`,
    );
  });

  it('on a baked level, names only what that screen has', () => {
    const start = startOf(UNFIXED);
    const text = startBannerText(start, false);
    expect(text).toBe(`This start can’t be held: ${reasonText(start)}. Edit directions to fix it`);
    expect(text).not.toMatch(/Tag/);
  });
});

describe('the start banner (R0-3 c, acceptance 3)', () => {
  beforeEach(() => {
    forgetPlans();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState({ image: ROUTE_IMAGE });
  });

  const openTagged = () => {
    render(<PlayScreen {...routeProps({ level: null, tagReady: true, tagged: UNFIXED })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    skipMap();
  };
  const wall = () => screen.getByRole('region', { name: 'Wall' });
  const banner = () => within(wall()).queryByRole('region', { name: 'This start can’t be held' });

  it('names the diagnosis on the photo, with Edit route and Edit directions', () => {
    openTagged();
    const b = banner()!;
    expect(b).toBeInTheDocument();
    expect(b).toHaveTextContent(startBannerText(startOf(UNFIXED), true, ctxOf(UNFIXED)));
    expect(within(b).getByRole('button', { name: 'Edit route' })).toBeInTheDocument();
    expect(within(b).getByRole('button', { name: 'Edit directions' })).toBeInTheDocument();
  });

  it('Edit route goes back to Tag', () => {
    openTagged();
    fireEvent.click(within(banner()!).getByRole('button', { name: 'Edit route' }));
    expect(screen.getByRole('button', { name: 'Plan this route' })).toBeInTheDocument();
  });

  it('Edit directions, then Down: the Down advice is gone for that hold, then the start holds', () => {
    openTagged();
    const live = () => document.querySelector('.play-verdict')!;
    expect(live()).toHaveTextContent(
      /^Start: Left hand: hold 1S .*press Down for it in Edit directions$/,
    );
    fireEvent.click(within(banner()!).getByRole('button', { name: 'Edit directions' }));
    expect(wall()).toHaveAttribute('data-map', 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'Set hold 1S’s pull to Down' }));
    expect(JSON.parse(wall().dataset.edits!)).toEqual({ [S1.id]: { custom: [0, 1, 0] } });
    // 1S (the left hand's) is set: its advice is gone; the right hand's 2S is still unset.
    expect(live()).not.toHaveTextContent(/hold 1S .*press Down/);
    fireEvent.click(screen.getByRole('button', { name: 'Set hold 2S’s pull to Down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(wall()).toHaveAttribute('data-verdict', 'hold');
    expect(banner()).toBeNull();
    expect(document.body).not.toHaveTextContent(/press Down for it/);
  });

  it('a tap on the photo after it says the same thing, never "change it first"', () => {
    openTagged();
    fireEvent.click(screen.getByRole('button', { name: /^LH\b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'List targets' }));
    const list = screen.getByRole('region', { name: /^Targets for/ });
    fireEvent.click(within(list).getByRole('button', { name: '3' }));
    expect(wall()).toHaveAttribute('data-moves', '0');
    const live = document.querySelector('.play-verdict')!;
    expect(live).toHaveTextContent(/^This start can’t be held: .*in Edit directions$/);
    expect(document.body).not.toHaveTextContent(/change it first/);
  });

  it('on a baked level the banner offers only Edit directions', () => {
    render(<PlayScreen {...routeProps({ level: UNFIXED })} />);
    skipMap();
    const b = banner()!;
    expect(b).toHaveTextContent(startBannerText(startOf(UNFIXED), false, ctxOf(UNFIXED)));
    expect(within(b).queryByRole('button', { name: 'Edit route' })).toBeNull();
    expect(within(b).getByRole('button', { name: 'Edit directions' })).toBeInTheDocument();
  });

  it('a start that holds shows no banner', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    expect(banner()).toBeNull();
  });
});

// Review 5 (accessibility): the Down preset says when the pull is already straight down.
describe('the Down button’s pressed state (R0 review 5)', () => {
  beforeEach(() => {
    forgetPlans();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState({ image: ROUTE_IMAGE });
  });
  const down = (label: string) =>
    screen.getByRole('button', { name: `Set hold ${label}’s pull to Down` });

  it('is pressed for a hold whose pull is straight down, not for one that isn’t', () => {
    render(<PlayScreen {...routeProps({ level: UNFIXED })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    expect(down('1S')).toHaveAttribute('aria-pressed', 'false');
    // The ladder's jugs pull straight down already.
    expect(down('3')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(down('1S'));
    expect(down('1S')).toHaveAttribute('aria-pressed', 'true');
  });
});
