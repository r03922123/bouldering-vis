import { fireEvent, render, screen, within } from '@testing-library/react';
import { fakeMlClient } from '../../../tests/fakeClient';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { checkStart, createStanceCache, type MoveContext, type Plan } from '../beta-moves';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { numbersFor } from './numbers';
import { attempt, contextFor, startPlan } from './play';
import { PlayScreen, type PlayScreenProps } from './PlayScreen';
import { targetsRegion } from './screen.fixture';

/** E1: the direction map opens before every plan; "Start planning" goes on to the tray. */
function startPlanning() {
  const go = screen.queryByRole('button', { name: 'Start planning' });
  if (go) fireEvent.click(go);
}

// SPEC-play-shell › Component tests on the synthetic route (AC 1; S2, S5, S13).

vi.setConfig({ testTimeout: 30_000 });

const image: WorkingImage = {
  id: 'synthetic',
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: 'wall-landscape.jpg',
  sampleId: 'synthetic',
};

const client = fakeMlClient();
const props = (over: Partial<PlayScreenProps> = {}): PlayScreenProps => ({
  wallId: 'synthetic',
  title: 'Synthetic wall',
  profile: { level: 'gym', hints: false, numbers: false },
  onBack: () => {},
  client,
  photo: image,
  level: SYNTHETIC,
  tagged: null,
  tagReady: false,
  footholds: null,
  onPlan: () => {},
  onSetAid: () => {},
  ...over,
});

beforeEach(() => {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image });
});

const stage = () => screen.getByRole('region', { name: 'Wall' });

describe('PlayScreen: the start (C5)', () => {
  it('opens a baked level straight into Plan, with the climber on the start and the verdict', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic wall' })).toBeInTheDocument();
    expect(stage()).toHaveAttribute('data-climber', 'shown');
    expect(stage()).toHaveAttribute('data-verdict', 'hold');
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(JSON.parse(stage().dataset.assignment!)).toEqual({
      lh: 'synthetic-1',
      rh: 'synthetic-2',
      lf: 'wf:699:863',
      rf: 'wf:922:786',
    });
    expect(screen.getByText('Start: Balanced: this position can be held')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.queryByRole('button', { name: 'Edit route' })).not.toBeInTheDocument();
  });

  it('has "◀ Gym" in the header, a link back to the gym', () => {
    const onBack = vi.fn();
    render(<PlayScreen {...props({ onBack })} />);
    startPlanning();
    const back = within(screen.getByRole('banner')).getByRole('link', { name: 'Gym' });
    expect(back).toHaveAttribute('href', '#/gym');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('has no way back to the gym on the front-door wall (SPEC-launch-wall-2 R3)', () => {
    render(<PlayScreen {...props({ onBack: undefined })} />);
    startPlanning();
    expect(within(screen.getByRole('banner')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('says the wall is opening until its photo is in', () => {
    render(<PlayScreen {...props({ photo: null })} />);
    startPlanning();
    expect(screen.getByRole('status')).toHaveTextContent('Opening the wall…');
    expect(screen.queryByRole('region', { name: 'Wall' })).not.toBeInTheDocument();
  });
});

describe('PlayScreen: a wall without a level (S2)', () => {
  it('opens in Tag with the Studio’s route steps, and plans once the route is ready', () => {
    const onPlan = vi.fn();
    const { rerender } = render(<PlayScreen {...props({ level: null, onPlan })} />);
    expect(screen.getByLabelText('Wall photo')).toBeInTheDocument();
    const plan = screen.getByRole('button', { name: 'Plan this route' });
    expect(plan).toBeDisabled();
    rerender(<PlayScreen {...props({ level: null, onPlan, tagReady: true })} />);
    fireEvent.click(plan);
    expect(onPlan).toHaveBeenCalledOnce();
    // Until the analysis is in, there is nothing to referee yet.
    expect(screen.getByText('Reading the wall…')).toHaveAttribute('role', 'status');
    rerender(<PlayScreen {...props({ level: null, onPlan, tagReady: true, tagged: SYNTHETIC })} />);
    expect(stage()).toHaveAttribute('data-verdict', 'hold');
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    expect(screen.getByRole('button', { name: 'Plan this route' })).toBeInTheDocument();
  });

  it('shows makeContext’s reason when the tagged route can’t be refereed', () => {
    const noFinish = { ...SYNTHETIC, holds: SYNTHETIC.holds.filter((h) => h.role !== 'finish') };
    render(<PlayScreen {...props({ level: null, tagReady: true, tagged: noFinish })} />);
    startPlanning();
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    expect(screen.getByRole('alert')).toHaveTextContent('Tag 1–2 start holds and 1 finish');
  });
});

describe('PlayScreen: the move tray (C6)', () => {
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
  const target = (label: string) =>
    within(targetsRegion(/^Targets for/)).getByRole('button', {
      name: label,
    });
  const verdict = () => document.querySelector('.play-verdict')!;
  const assignment = () => JSON.parse(stage().dataset.assignment!);

  it('commits a legal move picked from the target list (AC 2)', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(limb('LH'));
    expect(limb('LH')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(target('3'));
    expect(stage()).toHaveAttribute('data-moves', '1');
    expect(assignment().lh).toBe('synthetic-3');
    expect(verdict()).toHaveTextContent('Left hand to 3: holds');
    expect(limb('LH')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: /^Targets for/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('previews a fall: the plan is unchanged, the reason shows and is announced (AC 3)', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    const before = stage().dataset.assignment;
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F'));
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(stage().dataset.assignment).toBe(before);
    expect(stage()).toHaveAttribute('data-preview', 'fall');
    expect(verdict()).toHaveAttribute('aria-live', 'polite');
    expect(verdict()).toHaveTextContent(
      "Left hand to 7F: you'd fall. Too far: left hand — move your feet up first",
    );
    // The limb stays picked, to try another hold.
    expect(limb('LH')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('shows a shape rejection’s text, and nothing moves', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('7F'));
    expect(verdict()).toHaveTextContent('The finish is for hands');
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(stage()).not.toHaveAttribute('data-preview');
  });

  it('Undo goes back exactly one move, after moves and previews, and Redo forward (AC 4)', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    const start = assignment();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('Wall foothold 23'));
    const one = assignment();
    fireEvent.click(limb('RF'));
    fireEvent.click(target('7F')); // rejected
    fireEvent.click(limb('RF'));
    fireEvent.click(limb('LH'));
    fireEvent.click(target('7F')); // a fall preview
    fireEvent.click(limb('LH'));
    fireEvent.click(limb('RF'));
    const rf = within(targetsRegion(/^Targets for/)).getAllByRole('button');
    fireEvent.click(
      rf.find((b) => b.textContent === `Wall foothold ${footholdNumber('wf:699:863')}`)!,
    );
    expect(stage()).toHaveAttribute('data-moves', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(assignment()).toEqual(one);
    expect(verdict()).toHaveTextContent('Left foot to Wall foothold 23: holds');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(assignment()).toEqual(start);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(assignment()).toEqual(one);
  });

  it('takes a second limb for a 2-limb move: one target each, then the referee’s verdict', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    fireEvent.click(limb('LF'));
    // R0-1: a second limb is added on purpose (Shift + click, or "+ limb").
    fireEvent.click(limb('RF'), { shiftKey: true });
    expect(stage()).toHaveAttribute('data-armed', 'lf,rf');
    expect(
      within(targetsRegion(/^Targets for/)).getByRole('heading', {
        name: 'Where does the left foot go?',
      }),
    ).toBeInTheDocument();
    fireEvent.click(target('Let go'));
    expect(
      screen.getByRole('heading', { name: 'Where does the right foot go?' }),
    ).toBeInTheDocument();
    fireEvent.click(target('Let go'));
    // Cutting both feet keeps two hands: the referee decides whether that holds.
    expect(verdict().textContent).toMatch(/^Left foot lets go and right foot lets go: /);
  });

  it('asks for a limb before a target (the hint is announced)', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    expect(screen.queryByRole('region', { name: /^Targets for/ })).not.toBeInTheDocument();
    expect(document.querySelector('.play-hint')).toHaveAttribute('aria-live', 'polite');
  });

  it('asks before an edit clears a tagged route’s plan (S2)', () => {
    render(<PlayScreen {...props({ level: null, tagReady: true, tagged: SYNTHETIC })} />);
    startPlanning();
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    expect(screen.getByRole('button', { name: 'Keep my plan' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my plan' }));
    expect(stage()).toHaveAttribute('data-moves', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear the plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    expect(stage()).toHaveAttribute('data-moves', '0');
  });
});

/** A wall foothold's number in the list: its place in the level's (y, x) order, 1-based. */
function footholdNumber(id: string) {
  const sorted = [...SYNTHETIC.wallFeet].sort(
    (a, b) => a.point[1] - b.point[1] || a.point[0] - b.point[0],
  );
  return sorted.findIndex((f) => f.id === id) + 1;
}

describe('PlayScreen: presets, Numbers and Aids (C7)', () => {
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
  const pro = { level: 'pro' as const, hints: false, numbers: true };
  const beginner = { level: 'beginner' as const, hints: true, numbers: false };

  it('Numbers mode renders exactly the rows of numbersFor for the check on screen (AC 8)', () => {
    render(<PlayScreen {...props({ profile: pro })} />);
    startPlanning();
    const panel = screen.getByRole('region', { name: 'Numbers' });
    const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
    const start = JSON.parse(stage().dataset.assignment!);
    const rows = numbersFor(checkStart(start, ctx));
    const shown = [...panel.querySelectorAll('dl > div')].map((d) => ({
      label: d.querySelector('dt')!.textContent,
      value: d.querySelector('dd')!.textContent,
    }));
    expect(shown).toEqual(rows.map(({ label, value }) => ({ label, value })));
    expect(panel.querySelectorAll('dt')).toHaveLength(rows.length);
  });

  it('shows a fall preview’s numbers, still only the referee’s', () => {
    render(<PlayScreen {...props({ profile: pro })} />);
    startPlanning();
    fireEvent.click(limb('LH'));
    fireEvent.click(
      within(targetsRegion(/^Targets for/)).getByRole('button', {
        name: '7F',
      }),
    );
    const panel = screen.getByRole('region', { name: 'Numbers' });
    const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
    const start = (startPlan(ctx) as { value: Plan }).value;
    const fall = attempt(start, { lh: 'synthetic-7' }, ctx, createStanceCache());
    if (fall.kind !== 'preview') throw new Error(fall.kind);
    const shown = [...panel.querySelectorAll('dl > div')].map((d) => d.textContent);
    expect(shown).toEqual(numbersFor(fall.check).map((r) => `${r.label}${r.value}`));
    expect(shown[0]).toMatch(
      /^Left hand reach\d\.\d{3} of 1\.000 \(static\) · 1\.100 \(deadpoint\)$/,
    );
    expect(within(panel).queryByText(/ share$/)).not.toBeInTheDocument();
  });

  it('hides Numbers for a gym climber, and the Aids menu turns any aid on at any level', () => {
    const onSetAid = vi.fn();
    const { unmount } = render(<PlayScreen {...props({ onSetAid })} />);
    startPlanning();
    expect(screen.queryByRole('region', { name: 'Numbers' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Numbers' }));
    expect(onSetAid).toHaveBeenLastCalledWith('numbers', true);
    unmount();
    render(<PlayScreen {...props({ profile: beginner, onSetAid })} />);
    startPlanning();
    expect(screen.getByRole('switch', { name: 'Hints' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Hints' }));
    expect(onSetAid).toHaveBeenLastCalledWith('hints', false);
    fireEvent.click(screen.getByRole('switch', { name: 'Numbers' }));
    expect(onSetAid).toHaveBeenLastCalledWith('numbers', true);
  });

  it('shows Numbers to a beginner who turned the aid on', () => {
    render(<PlayScreen {...props({ profile: { ...beginner, numbers: true } })} />);
    startPlanning();
    expect(screen.getByRole('region', { name: 'Numbers' })).toBeInTheDocument();
  });

  it('gives a beginner one limb per move: a second pick replaces the first', () => {
    render(<PlayScreen {...props({ profile: beginner })} />);
    startPlanning();
    expect(document.querySelector('.play-hint')).toHaveTextContent(
      'Pick a limb, then tap where it goes.',
    );
    fireEvent.click(limb('LF'));
    fireEvent.click(limb('RF'));
    expect(stage()).toHaveAttribute('data-armed', 'rf');
  });
});

describe('PlayScreen: the plan survives leaving the wall (session memory)', () => {
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
  const target = (label: string) =>
    within(targetsRegion(/^Targets for/)).getByRole('button', {
      name: label,
    });

  function planThreeMoves() {
    fireEvent.click(limb('LF'));
    fireEvent.click(target('Wall foothold 23'));
    fireEvent.click(limb('RF'));
    fireEvent.click(target('Wall foothold 25'));
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
  }

  it('plans 3 moves, leaves, comes back: the same plan, stance and Undo history', () => {
    const first = render(<PlayScreen {...props()} />);
    startPlanning();
    planThreeMoves();
    expect(stage()).toHaveAttribute('data-moves', '3');
    const before = { ...stage().dataset };
    first.unmount();

    render(<PlayScreen {...props()} />);
    startPlanning();
    expect(stage()).toHaveAttribute('data-moves', '3');
    expect(stage().dataset.assignment).toBe(before.assignment);
    expect(stage().dataset.loads).toBe(before.loads);
    expect(document.querySelector('.play-verdict')).toHaveTextContent('Left hand to 3: holds');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stage()).toHaveAttribute('data-moves', '2');
  });

  it('keeps each wall’s plan to itself', () => {
    const first = render(<PlayScreen {...props()} />);
    startPlanning();
    planThreeMoves();
    first.unmount();
    render(<PlayScreen {...props({ wallId: 'another-wall' })} />);
    startPlanning();
    expect(stage()).toHaveAttribute('data-moves', '0');
  });

  it('forgets the plan when a route edit clears it', () => {
    const tagged = props({ level: null, tagReady: true, tagged: SYNTHETIC });
    const first = render(<PlayScreen {...tagged} />);
    startPlanning();
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear the plan' }));
    first.unmount();
    render(<PlayScreen {...tagged} />);
    startPlanning();
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    expect(stage()).toHaveAttribute('data-moves', '0');
  });
});

describe('PlayScreen: the segmentation model only when tagging (load on demand)', () => {
  type Spy = { mock: { calls: unknown[][] } };
  const samTypes = (spy: Spy) =>
    spy.mock.calls
      .map(([req]) => (req as { type: string }).type)
      .filter((t) => t.startsWith('sam:'));

  it('never prepares SAM in Plan on a baked level', async () => {
    const own = fakeMlClient();
    const spy = vi.spyOn(own, 'request');
    render(<PlayScreen {...props({ client: own })} />);
    startPlanning();
    expect(stage()).toHaveAttribute('data-verdict', 'hold');
    await new Promise((r) => setTimeout(r, 50));
    expect(samTypes(spy)).toEqual([]);
    expect(useAppStore.getState().samStatus).toBe('idle');
  });

  it('prepares it as soon as the wall opens in Tag', async () => {
    const own = fakeMlClient();
    const spy = vi.spyOn(own, 'request');
    render(<PlayScreen {...props({ client: own, level: null })} />);
    startPlanning();
    await vi.waitFor(() => expect(samTypes(spy)).toEqual(['sam:embed']));
  });

  it('draws only the level’s badges, even with a route tagged on the same photo', () => {
    useAppStore.setState({
      holds: [
        {
          id: 'studio-hold',
          imageId: image.id,
          mask: new Uint8Array(12),
          bbox: { x: 1, y: 1, w: 1, h: 1 },
          centroid: { x: 1, y: 1 },
          area: 1,
          role: 'start',
          order: 0,
        } as never,
      ],
    });
    render(<PlayScreen {...props()} />);
    startPlanning();
    const wall = screen.getByRole('img', { name: 'Wall photo' });
    expect(wall).toHaveAttribute('data-badges', '1S,2,3,4,5,6,7F');
    expect(wall).not.toHaveAttribute('data-hold-count');
  });
});

describe('PlayScreen: the photo carries across (S14)', () => {
  it('offers "Open in Setting Room" on a tagged wall, in Tag and in Plan', () => {
    const onOpenStudio = vi.fn();
    render(
      <PlayScreen {...props({ level: null, tagReady: true, tagged: SYNTHETIC, onOpenStudio })} />,
    );
    startPlanning();
    fireEvent.click(screen.getByRole('button', { name: 'Open in Setting Room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    fireEvent.click(screen.getByRole('button', { name: 'Open in Setting Room' }));
    expect(onOpenStudio).toHaveBeenCalledTimes(2);
  });

  it('has nothing to carry on a baked level', () => {
    render(<PlayScreen {...props({ onOpenStudio: () => {} })} />);
    startPlanning();
    expect(screen.queryByRole('button', { name: 'Open in Setting Room' })).not.toBeInTheDocument();
  });
});

describe('PlayScreen: a remembered plan on a re-tagged route (review finding 2)', () => {
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
  const target = (label: string) =>
    within(targetsRegion(/^Targets for/)).getByRole('button', {
      name: label,
    });

  it('never brings a plan back onto holds with new ids (same key otherwise)', () => {
    const first = render(<PlayScreen {...props()} />);
    startPlanning();
    fireEvent.click(limb('LF'));
    fireEvent.click(target('Wall foothold 23'));
    fireEvent.click(limb('RF'));
    fireEvent.click(target('Wall foothold 25'));
    fireEvent.click(limb('LH'));
    fireEvent.click(target('3'));
    expect(stage()).toHaveAttribute('data-moves', '3');
    first.unmount();
    // The same route, re-tapped in the Setting Room: same holds, new ids.
    const retagged = {
      ...SYNTHETIC,
      holds: SYNTHETIC.holds.map((h) => ({ ...h, id: `new-${h.id}` })),
    };
    render(<PlayScreen {...props({ level: retagged })} />);
    startPlanning();
    expect(stage()).toHaveAttribute('data-moves', '0');
    expect(JSON.parse(stage().dataset.assignment!).lh).toBe('new-synthetic-1');
  });
});

describe('PlayScreen: focus and announcements (review suggestions)', () => {
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });

  it('gives the focus back to the limb button after a move from the target list', () => {
    render(<PlayScreen {...props()} />);
    startPlanning();
    fireEvent.click(limb('LF'));
    const list = targetsRegion(/^Targets for/);
    within(list).getByRole('button', { name: 'Wall foothold 23' }).focus();
    fireEvent.click(within(list).getByRole('button', { name: 'Wall foothold 23' }));
    expect(stage()).toHaveAttribute('data-moves', '1');
    expect(limb('LF')).toHaveFocus();
  });

  it('keeps the verdict’s live region from before the wall opens, so the start is announced', () => {
    const { rerender } = render(<PlayScreen {...props({ photo: null })} />);
    const live = document.querySelector('.play-verdict')!;
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Opening the wall…');
    rerender(<PlayScreen {...props()} />);
    expect(document.querySelector('.play-verdict')).toBe(live);
    expect(live).toHaveTextContent('Start: Balanced: this position can be held');
  });
});
