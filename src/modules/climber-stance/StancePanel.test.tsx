import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import type { HoldMask, HoldRole } from '../hold-segmentation';
import type { FootCandidate } from './anyFeet';
import { solveStance, type StanceContacts } from './stance';
import { StancePanel } from './StancePanel';
import { SMEAR } from './assign';
import type { StanceState } from './useStance';
import { unit } from './vec';

const hold = (id: string, order: number, role: HoldRole = 'route') =>
  ({ id, order, role, centroid: { x: 0, y: 0 }, bbox: { x: 0, y: 0, w: 1, h: 1 } }) as HoldMask;

const contacts: StanceContacts = {
  lh: { holdId: 'a', point: [-100, 0], type: 'jug', dir: [0, 1, 0] },
  rh: { holdId: 'b', point: [100, 0], type: 'jug', dir: [0, 1, 0] },
  lf: { holdId: 'c', point: [-120, 750], type: 'edge', dir: null },
  rf: { holdId: 'd', point: [120, 750], type: 'edge', dir: null },
};
const assignment = { lh: 'a', rh: 'b', lf: 'c', rf: 'd' };
const solved: StanceState = {
  stance: solveStance(contacts, { height: 1000, wallAngleDeg: 0 }),
  assignment,
  contacts,
  height: 1000,
  candidates: { lf: [], rf: [] },
  footholdsStatus: 'idle',
};

describe('StancePanel', () => {
  beforeEach(() =>
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      holds: [hold('a', 0, 'start'), hold('b', 1, 'start'), hold('c', 2), hold('d', 3, 'finish')],
    }),
  );

  it('offers the start position and opens it on the Route view', () => {
    render(<StancePanel state={{ ...solved, stance: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try the start position' }));
    const s = useAppStore.getState();
    expect(s.showClimber).toBe(true);
    expect(s.view).toBe('route');
    expect(s.stanceAssignment).toBeNull();
  });

  it('asks for a start hold before it can try', () => {
    useAppStore.setState({ holds: [hold('a', 0)] });
    render(<StancePanel state={{ ...solved, stance: null }} />);
    expect(screen.getByRole('button', { name: 'Try the start position' })).toBeDisabled();
    expect(screen.getByText('Tag a start hold first.')).toBeInTheDocument();
  });

  it('shows four limbs whose weight shares add up to 100 %', () => {
    useAppStore.setState({ showClimber: true });
    render(<StancePanel state={solved} />);
    expect(screen.getByText('Balanced: this position can be held')).toBeInTheDocument();
    const pcts = [...document.querySelectorAll('.stance-pct')].map((e) => parseInt(e.textContent!));
    expect(pcts).toHaveLength(4);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  // Amendment 2026-11-04, M1: feet cut on Vertical, the hips carry part of it (AC 52).
  it('adds a "Body on the wall" row when the hips rest on the wall, still adding up to 100 %', () => {
    useAppStore.setState({ showClimber: true });
    const hang = { lh: contacts.lh, rh: contacts.rh };
    render(
      <StancePanel
        state={{
          ...solved,
          contacts: hang,
          assignment: { lh: 'a', rh: 'b', lf: null, rf: null },
          stance: solveStance(hang, { height: 1000, wallAngleDeg: 0 }),
        }}
      />,
    );
    const row = document.querySelector('tr[data-limb="body"]')!;
    expect(within(row as HTMLElement).getByText('Body on the wall')).toBeInTheDocument();
    const pcts = [...document.querySelectorAll('.stance-pct')].map((e) => parseInt(e.textContent!));
    expect(pcts).toHaveLength(3);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('has no body row with the feet on', () => {
    useAppStore.setState({ showClimber: true });
    render(<StancePanel state={solved} />);
    expect(document.querySelector('tr[data-limb="body"]')).toBeNull();
  });

  // Amendment 2026-11-04, M3: hooks in the Setting Room (Play gets them in R2, D3-A).
  it('offers Stand · Heel hook · Toe hook for a foot on a route hold, and stores the choice', () => {
    useAppStore.setState({ showClimber: true });
    render(<StancePanel state={solved} />);
    const hook = screen.getByRole('combobox', { name: 'Left foot hook' });
    expect([...(hook as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Stand',
      'Heel hook',
      'Toe hook',
    ]);
    fireEvent.change(hook, { target: { value: 'heel' } });
    expect(useAppStore.getState().stanceHooks.lf).toEqual({ holdId: 'c', hook: 'heel' });
    fireEvent.change(hook, { target: { value: '' } });
    expect(useAppStore.getState().stanceHooks.lf).toBeUndefined();
  });

  it('has no hook choice for hands, smears or wall footholds', () => {
    useAppStore.setState({ showClimber: true });
    const smeared = {
      ...contacts,
      lf: { holdId: SMEAR, point: [-120, 750], type: 'smear', dir: null },
    } satisfies StanceContacts;
    render(
      <StancePanel
        state={{ ...solved, contacts: smeared, assignment: { ...assignment, lf: SMEAR } }}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Left foot hook' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Right foot hook' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Left hand hook' })).toBeNull();
  });

  it('moves a limb to another hold or takes it off the wall', () => {
    useAppStore.setState({ showClimber: true });
    render(<StancePanel state={solved} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Left foot hold' }), {
      target: { value: '' },
    });
    expect(useAppStore.getState().stanceAssignment).toEqual({ ...assignment, lf: null });
    fireEvent.change(screen.getByRole('combobox', { name: 'Right hand hold' }), {
      target: { value: 'a' },
    });
    expect(useAppStore.getState().stanceAssignment?.rh).toBe('a');
  });

  it('lists holds by their numbers', () => {
    useAppStore.setState({ showClimber: true });
    render(<StancePanel state={solved} />);
    const options = [
      ...screen.getByRole('combobox', { name: 'Left hand hold' }).querySelectorAll('option'),
    ];
    expect(options.map((o) => o.textContent)).toEqual([
      'Off',
      'Hold 1S',
      'Hold 2S',
      'Hold 3',
      'Hold 4F',
    ]);
    const foot = [
      ...screen.getByRole('combobox', { name: 'Left foot hold' }).querySelectorAll('option'),
    ];
    expect(foot.map((o) => o.textContent)).toContain('Smear on the wall');
  });

  it('sets the wall angle and climber size, and hides the climber', () => {
    useAppStore.setState({ showClimber: true });
    render(<StancePanel state={solved} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Wall' }), { target: { value: '35' } });
    expect(useAppStore.getState().wallAngle).toBe(35);
    fireEvent.change(screen.getByRole('slider', { name: /Climber size/ }), {
      target: { value: '120' },
    });
    expect(useAppStore.getState().climberScale).toBeCloseTo(1.2);
    fireEvent.click(screen.getByRole('button', { name: 'Hide climber' }));
    expect(useAppStore.getState().showClimber).toBe(false);
  });

  it('explains a stance that can’t be held', () => {
    useAppStore.setState({ showClimber: true });
    const far = { ...contacts, lf: { ...contacts.lf!, point: [-120, 1200] as [number, number] } };
    render(
      <StancePanel
        state={{ ...solved, stance: solveStance(far, { height: 1000, wallAngleDeg: 0 }) }}
      />,
    );
    expect(screen.getByText(/^Out of reach: left foot/)).toBeInTheDocument();
    // No weight shares for a position that can't be held.
    expect(document.querySelectorAll('.stance-pct')).toHaveLength(0);
  });
});

// SPEC-climber-stance › Amendment 2026-10-31 (b), Open Question 1 (user decision 2026-11-01).
describe('StancePanel hands-pull-in note', () => {
  const NOTE = 'Your hands pull you in to the wall; your feet hold your weight.';
  /** The note's bound on each hand's share (% of the weight). */
  const HANDS_IDLE = 2;
  type Load = NonNullable<StanceState['stance']>['load'];
  const limbLoad = (share: number, percent: number) => ({
    share,
    percent,
    force: [0, 0, 0] as [number, number, number],
  });
  /** The solved stance with these loads (B1-03 on Vertical: LH 0 · RH 0 · LF 98 · RF 2). */
  const withLoad = (load: Load, feasible = true): StanceState => ({
    ...solved,
    stance: { ...solved.stance!, feasible, load },
  });
  const feet = { lf: limbLoad(97, 97), rf: limbLoad(2, 2) };

  beforeEach(() => useAppStore.setState({ showClimber: true }));

  it('says the hands pull in when they carry no weight but still pull', () => {
    render(
      <StancePanel state={withLoad({ lh: limbLoad(0, 12), rh: limbLoad(1, 0.4), ...feet })} />,
    );
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('counts only the assigned hands', () => {
    render(<StancePanel state={withLoad({ rh: limbLoad(2, 1), ...feet })} />);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('stays quiet when a hand carries more than 2 %', () => {
    render(<StancePanel state={withLoad({ lh: limbLoad(0, 12), rh: limbLoad(3, 4), ...feet })} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('stays quiet when the hands barely pull at all', () => {
    render(
      <StancePanel state={withLoad({ lh: limbLoad(0, 0.9), rh: limbLoad(0, 0.5), ...feet })} />,
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('stays quiet with no hands on the wall', () => {
    render(<StancePanel state={withLoad({ ...feet })} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('stays quiet for a stance that can’t be held', () => {
    render(
      <StancePanel
        state={withLoad({ lh: limbLoad(0, 12), rh: limbLoad(0, 12), ...feet }, false)}
      />,
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('shows on an invented start on Vertical (the solver’s own numbers)', () => {
    const start: StanceContacts = {
      lh: { holdId: 'a', point: [880, 560], type: 'crimp', dir: unit([1, 0, -0.3]) },
      rh: {
        holdId: 'b',
        point: [1080, 600],
        type: 'sloper',
        dir: unit([0, 0.6, -1]),
        surface: { normal: unit([0, -0.6, 1]), source: 'assumed' },
      },
      lf: { holdId: 'c', point: [930, 815], type: null, dir: null },
      rf: { holdId: 'd', point: [1110, 825], type: null, dir: null },
    };
    const stance = solveStance(start, { height: 420, wallAngleDeg: 0 });
    render(<StancePanel state={{ ...solved, contacts: start, height: 420, stance }} />);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  // An undercling's share is negative (stance.ts): its hands pull the body down hard, so they are
  // not hands that carry nothing (AC 8's solved loads: LH −19 % share at 24 % force).
  it('stays quiet for underclings (the solver’s own numbers)', () => {
    const under: StanceContacts = {
      ...contacts,
      lh: { ...contacts.lh!, type: 'edge', dir: [0, -1, 0] },
      rh: { ...contacts.rh!, type: 'edge', dir: [0, -1, 0] },
    };
    const stance = solveStance(under, { height: 1000, wallAngleDeg: 0 });
    expect(stance.feasible).toBe(true);
    expect(stance.load.lh!.share).toBeLessThan(-HANDS_IDLE);
    render(<StancePanel state={{ ...solved, contacts: under, stance }} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('stays quiet when a hand pulls down with more than 2 % of the weight', () => {
    render(<StancePanel state={withLoad({ lh: limbLoad(-3, 4), rh: limbLoad(0, 12), ...feet })} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('says the hands pull in when one pulls down by no more than 2 %', () => {
    render(<StancePanel state={withLoad({ lh: limbLoad(-2, 3), rh: limbLoad(1, 12), ...feet })} />);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('stays quiet for a symmetric stance whose hands hold weight', () => {
    render(<StancePanel state={solved} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

// SPEC-climber-stance › Amendment 2026-10-31 (b), AC 36 (rules 14–15).
describe('StancePanel with wall footholds', () => {
  const blob = (id: string, cost: number): FootCandidate => ({
    id,
    kind: 'blob',
    point: [0, 0],
    cost,
  });
  const route: FootCandidate = { id: 'c', kind: 'hold', point: [0, 0], cost: 0 };
  const ready: StanceState = {
    ...solved,
    candidates: {
      lf: [route, blob('blob:7', 0.1), blob('blob:3', 0.2)],
      rf: [blob('blob:3', 0.1), blob('blob:9', 0.2), blob('blob:7', 0.3)],
    },
    footholdsStatus: 'ready',
  };
  const optionsOf = (name: string) =>
    [...screen.getByRole('combobox', { name }).querySelectorAll('option')].map((o) => [
      o.textContent,
      o.value,
    ]);

  beforeEach(() =>
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      holds: [hold('a', 0, 'start'), hold('b', 1, 'start'), hold('c', 2), hold('d', 3, 'finish')],
      showClimber: true,
    }),
  );

  it('says it is finding footholds while they are pending, with no shares', () => {
    render(<StancePanel state={{ ...solved, stance: null, footholdsStatus: 'pending' }} />);
    // The E2E waits for the status to stop saying "Working".
    expect(screen.getByText('Working out the position: finding footholds…')).toBeInTheDocument();
    expect(document.querySelectorAll('.stance-pct')).toHaveLength(0);
  });

  it('lists each foot’s wall footholds, in rank order, after the smear and before the holds', () => {
    render(<StancePanel state={ready} />);
    expect(optionsOf('Left foot hold')).toEqual([
      ['Off', ''],
      ['Smear on the wall', SMEAR],
      ['Wall foothold 1', 'blob:7'],
      ['Wall foothold 2', 'blob:3'],
      ['Hold 1S', 'a'],
      ['Hold 2S', 'b'],
      ['Hold 3', 'c'],
      ['Hold 4F', 'd'],
    ]);
    expect(optionsOf('Right foot hold').slice(2, 5)).toEqual([
      ['Wall foothold 1', 'blob:3'],
      ['Wall foothold 2', 'blob:9'],
      ['Wall foothold 3', 'blob:7'],
    ]);
    for (const name of ['Left hand hold', 'Right hand hold'])
      expect(optionsOf(name).some(([t]) => t!.startsWith('Wall foothold'))).toBe(false);

    fireEvent.change(screen.getByRole('combobox', { name: 'Right foot hold' }), {
      target: { value: 'blob:9' },
    });
    expect(useAppStore.getState().stanceAssignment).toEqual({ ...assignment, rf: 'blob:9' });
  });

  it('keeps an assigned wall foothold that is no longer ranked', () => {
    render(<StancePanel state={{ ...ready, assignment: { ...assignment, lf: 'blob:42' } }} />);
    expect(optionsOf('Left foot hold')).toContainEqual(['Wall foothold', 'blob:42']);
    expect(screen.getByRole('combobox', { name: 'Left foot hold' })).toHaveValue('blob:42');
  });

  it('re-picks the start position and drops the wall options when following hands', () => {
    useAppStore.setState({ stanceAssignment: assignment });
    const { rerender } = render(<StancePanel state={ready} />);
    const feet = screen.getByRole('radiogroup', { name: 'Feet' });
    expect(within(feet).getByRole('radio', { name: 'Any feet' })).toBeChecked();
    fireEvent.click(within(feet).getByRole('radio', { name: 'Follow hands' }));
    const s = useAppStore.getState();
    expect(s.feetMode).toBe('follow');
    expect(s.stanceAssignment).toBeNull();
    rerender(<StancePanel state={ready} />);
    expect(within(feet).getByRole('radio', { name: 'Follow hands' })).toBeChecked();
    expect(optionsOf('Left foot hold').some(([t]) => t!.startsWith('Wall foothold'))).toBe(false);
    expect(optionsOf('Right foot hold').some(([t]) => t!.startsWith('Wall foothold'))).toBe(false);

    fireEvent.click(within(feet).getByRole('radio', { name: 'Any feet' }));
    expect(useAppStore.getState().feetMode).toBe('any');
  });

  it('says when it couldn’t find footholds, and still shows the solved stance', () => {
    render(<StancePanel state={{ ...solved, footholdsStatus: 'error' }} />);
    expect(screen.getByText("Couldn't find footholds on this photo")).toBeInTheDocument();
    expect(screen.getByText('Balanced: this position can be held')).toBeInTheDocument();
    expect(document.querySelectorAll('.stance-pct')).toHaveLength(4);
  });

  it('draws the feet toggle as a large segmented control', () => {
    render(<StancePanel state={ready} />);
    // ≥ 44 px per option comes from the stylesheet (checked in the E2E at 375 px).
    const feet = screen.getByRole('radiogroup', { name: 'Feet' });
    expect(feet).toHaveClass('segmented');
    expect(within(feet).getAllByRole('radio')).toHaveLength(2);
  });
});
