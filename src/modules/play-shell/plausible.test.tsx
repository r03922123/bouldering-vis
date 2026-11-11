import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  checkMove,
  createStanceCache,
  decodeBeta,
  validateShape,
  type BetaStep,
  type MoveContext,
  type Plan,
} from '../beta-moves';
import { LIMBS } from '../climber-stance';
import { useAppStore } from '../../store/app';
import { resetViewAids } from './aids';
import { betaText, SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor, listTargets, startPlan } from './play';
import { CHUNK, MARK_WORDS, markOf, summaryLine, type Mark } from './plausible';
import { PlayScreen } from './PlayScreen';
import { ROUTE_IMAGE, routeProps, targetsRegion } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-02 H3 and acceptance 5: the plausible holds view. Its marks
// equal checkMove per target, the counts add up, it is off by default and it never changes the plan.

vi.setConfig({ testTimeout: 60_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
const start = (startPlan(ctx) as { value: Plan }).value.beta.steps[0]!;

/** checkMove's own verdict for one move, read without play-shell's code. */
function referee(prev: BetaStep, next: BetaStep) {
  if (!validateShape(prev, next, ctx).ok) return null;
  const c = checkMove(prev, next, ctx, createStanceCache());
  return c.verdict === 'fall' ? 'falls' : c.style === 'deadpoint' ? 'deadpoint' : 'holds';
}

describe('markOf (acceptance 5)', () => {
  it('equals checkMove’s verdict for every candidate of every limb from the start', () => {
    const cache = createStanceCache();
    let checked = 0;
    for (const limb of LIMBS) {
      for (const t of listTargets(ctx, limb, { x: 900, y: 900 })) {
        if (t.target === null) continue;
        const next = { ...start, [limb]: t.target };
        expect(markOf(start, next, ctx, cache), `${limb} → ${t.label}`).toBe(referee(start, next));
        checked++;
      }
    }
    // Every limb's whole list: 7 holds, 33 wall feet, Smear for the feet (none for a hand's).
    expect(checked).toBe(96);
  });

  // From the start no candidate is a deadpoint; three moves into the reference, the left hand's
  // reach to 4 is one, so every kind of mark is compared there.
  it('equals it for every candidate of every limb three moves in, deadpoints included', () => {
    const from = decodeBeta(betaText('reference'), ctx)!.steps[3]!;
    const cache = createStanceCache();
    const seen = new Set<string | null>();
    for (const limb of LIMBS) {
      for (const t of listTargets(ctx, limb, { x: 900, y: 900 })) {
        if (t.target === null) continue;
        const next = { ...from, [limb]: t.target };
        const want = referee(from, next);
        expect(markOf(from, next, ctx, cache), `${limb} → ${t.label}`).toBe(want);
        seen.add(want);
      }
    }
    expect(seen).toEqual(new Set(['holds', 'deadpoint', 'falls', null]));
  });

  it('summaryLine counts each mark once, and the counts add up to the total', () => {
    const marks: Mark[] = [
      { target: 'a', label: '1', kind: 'holds' },
      { target: 'b', label: '2', kind: 'holds' },
      { target: 'c', label: '3', kind: 'deadpoint' },
      { target: 'd', label: '4', kind: 'falls' },
    ];
    expect(summaryLine(marks)).toBe('4 targets: 2 hold · 1 deadpoint · 1 fall');
    expect(summaryLine(marks.slice(0, 1))).toBe('1 target: 1 hold · 0 deadpoint · 0 fall');
  });
});

describe('PlayScreen: Plausible holds (H3)', () => {
  beforeEach(() => {
    forgetPlans();
    resetViewAids();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState({ image: ROUTE_IMAGE });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const stage = () => screen.getByRole('region', { name: 'Wall' });
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
  const line = () => document.querySelector<HTMLElement>('.play-plausible');
  /** Runs timers one at a time, rendering between them, until none is left (the idle checks and
   * the coach window's reveal both end on their own). */
  const settle = () => {
    for (let i = 0; i < 2000 && vi.getTimerCount() > 0; i++)
      act(() => vi.advanceTimersToNextTimer());
    expect(vi.getTimerCount()).toBe(0);
  };
  function open() {
    render(<PlayScreen {...routeProps()} />);
    const go = screen.queryByRole('button', { name: 'Start planning' });
    if (go) fireEvent.click(go);
  }

  it('is off by default: no marks and no checks', () => {
    open();
    expect(screen.getByRole('switch', { name: 'Plausible holds' })).not.toBeChecked();
    fireEvent.click(limb('LH'));
    settle();
    expect(line()).toBeNull();
    expect(document.querySelector('.play-mark')).toBeNull();
  });

  it('marks each target as checkMove decides, counts them, and never changes the plan', () => {
    open();
    const before = { ...stage().dataset };
    fireEvent.click(screen.getByRole('switch', { name: 'Plausible holds' }));
    fireEvent.click(limb('LF'));
    expect(line()).toHaveTextContent(/^Checking 0 of \d+ targets…/);
    settle();
    const marks = JSON.parse(line()!.dataset.marks!) as Mark[];
    const list = targetsRegion('Targets for the left foot');
    const offered = within(list)
      .getAllByRole('button')
      .map((b) => b.firstChild!.textContent ?? '');
    // Every candidate the list offers (route holds, wall feet, smear; not "Let go") was checked.
    const prev = JSON.parse(before.assignment!) as BetaStep;
    for (const m of marks) {
      expect(m.kind, m.label).toBe(referee(prev, { ...prev, lf: m.target }));
      expect(offered).toContain(m.label);
    }
    // Every offered target without a mark is one beta-moves rejects as a shape (not a move).
    const byLabel = new Map(listTargets(ctx, 'lf', null).map((t) => [t.label, t.target]));
    const unmarked = offered.filter((l) => l !== 'Let go' && !marks.some((m) => m.label === l));
    for (const l of unmarked) {
      expect(byLabel.has(l), l).toBe(true);
      expect(referee(prev, { ...prev, lf: byLabel.get(l)! }), l).toBeNull();
    }
    expect(marks.length + unmarked.length).toBe(offered.length - 1);
    const n = (k: string) => marks.filter((m) => m.kind === k).length;
    expect(n('holds') + n('deadpoint') + n('falls')).toBe(marks.length);
    expect(line()).toHaveTextContent(summaryLine(marks));
    expect(line()).toHaveAttribute('data-done', 'true');
    // The words are on the buttons too, so the list reads the same as the photo.
    const first = marks[0]!;
    expect(
      within(list).getByRole('button', {
        name: new RegExp(`^${first.label} ?· ${MARK_WORDS[first.kind]}$`),
      }),
    ).toBeInTheDocument();
    // It never commits: the plan, the stance and the verdict are as they were.
    expect(stage().dataset.moves).toBe('0');
    expect(stage().dataset.assignment).toBe(before.assignment);
    expect(stage().dataset.loads).toBe(before.loads);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('checks in small chunks and can be stopped; what is checked so far stays', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: 'Plausible holds' }));
    fireEvent.click(limb('RF'));
    act(() => vi.advanceTimersToNextTimer());
    const after1 = JSON.parse(line()!.dataset.marks!) as Mark[];
    expect(line()).toHaveTextContent(new RegExp(`^Checking ${CHUNK} of`));
    fireEvent.click(within(line()!).getByRole('button', { name: 'Stop' }));
    settle();
    expect(line()).toHaveTextContent(new RegExp(`^Stopped after ${CHUNK} of \\d+`));
    expect(JSON.parse(line()!.dataset.marks!)).toEqual(after1);
    // Another limb asks a new question, and it runs again.
    fireEvent.click(limb('RF'));
    fireEvent.click(limb('LH'));
    settle();
    expect(line()).toHaveAttribute('data-done', 'true');
  });

  it('review suggestion: a re-pick shows its cached answer at once, with no checks run', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: 'Plausible holds' }));
    fireEvent.click(limb('LF'));
    settle();
    const first = line()!.dataset.marks;
    fireEvent.click(limb('LF'));
    fireEvent.click(limb('LF'));
    // The same question (route, stance, limb): answered from the cache, nothing scheduled.
    expect(line()).toHaveAttribute('data-done', 'true');
    expect(line()!.dataset.marks).toBe(first);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('review suggestion: after Stop, a re-pick resumes where it stopped', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: 'Plausible holds' }));
    fireEvent.click(limb('RF'));
    act(() => vi.advanceTimersToNextTimer());
    fireEvent.click(within(line()!).getByRole('button', { name: 'Stop' }));
    fireEvent.click(limb('RF'));
    fireEvent.click(limb('RF'));
    expect(line()).toHaveTextContent(new RegExp(`^Checking ${CHUNK} of`));
    settle();
    expect(line()).toHaveAttribute('data-done', 'true');
  });

  it('review suggestion: the status line announces only the final summary', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: 'Plausible holds' }));
    fireEvent.click(limb('LH'));
    expect(line()).toHaveAttribute('role', 'status');
    expect(line()).toHaveAttribute('aria-busy', 'true');
    act(() => vi.advanceTimersToNextTimer());
    expect(line()).toHaveAttribute('aria-busy', 'true');
    settle();
    expect(line()).toHaveAttribute('aria-busy', 'false');
  });
});
