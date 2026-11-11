import { fireEvent, render, screen, within } from '@testing-library/react';
import { decodeBeta, type MoveContext, type Target } from '../beta-moves';
import { LIMBS, type Limb } from '../climber-stance';
import { profileFor, type Level } from '../gym-hub';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { betaText, SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor, targetLabel } from './play';
import { PlayScreen } from './PlayScreen';
import { targetsRegion } from './screen.fixture';

/** E1: the direction map opens before every plan; "Start planning" goes on to the tray. */
function startPlanning() {
  const go = screen.queryByRole('button', { name: 'Start planning' });
  if (go) fireEvent.click(go);
}

// SPEC-play-shell AC 6 (amendment (b) SC 6), through the screen: one beta played with the limb
// buttons and the target list under each profile gives the same verdicts, stances and shares.
// The profile reaches the screen as a prop; if it ever reached the referee, this would differ.

vi.setConfig({ testTimeout: 120_000 });

const image: WorkingImage = {
  id: 'synthetic',
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: 'wall-landscape.jpg',
  sampleId: 'synthetic',
};
const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;
const SHORT: Record<Limb, string> = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' };

/** What the screen shows after a step: the stance's assignment, the shares and the verdict. */
function snapshot() {
  const stage = screen.getByRole('region', { name: 'Wall' });
  return {
    assignment: stage.dataset.assignment,
    loads: stage.dataset.loads,
    moves: stage.dataset.moves,
    verdict: document.querySelector('.play-verdict')!.textContent,
  };
}

function pick(limb: Limb, target: Target) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${SHORT[limb]}\\b`) }));
  const list = targetsRegion(/^Targets for/);
  fireEvent.click(within(list).getByRole('button', { name: targetLabel(ctx, target) }));
}

/** The reference beta, plus a fall preview and a rejection on the way, under `level`. */
function playUnder(level: Level) {
  forgetPlans();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image });
  const view = render(
    <PlayScreen
      wallId="synthetic"
      title="Synthetic wall"
      profile={profileFor(level)}
      onBack={() => {}}
      client={null}
      photo={image}
      level={SYNTHETIC}
      tagged={null}
      tagReady={false}
      footholds={null}
      onPlan={() => {}}
      onSetAid={() => {}}
    />,
  );
  startPlanning();
  const beta = decodeBeta(betaText('reference'), ctx)!;
  const shown = [snapshot()];
  for (let i = 1; i < beta.steps.length; i++) {
    const [a, b] = [beta.steps[i - 1]!, beta.steps[i]!];
    if (i === 2) {
      pick('lh', ctx.holds.at(-1)!.id); // a fall preview
      shown.push(snapshot());
      fireEvent.click(screen.getByRole('button', { name: /^LH\b/ })); // put the limb down
      pick('lf', ctx.holds.at(-1)!.id); // a shape rejection
      shown.push(snapshot());
      fireEvent.click(screen.getByRole('button', { name: /^LF\b/ }));
    }
    for (const l of LIMBS.filter((l) => a[l] !== b[l])) pick(l, b[l]);
    shown.push(snapshot());
  }
  view.unmount();
  return shown;
}

it('plays one beta to the top identically under the beginner, gym and pro profiles', () => {
  const [beginner, gym, pro] = (['beginner', 'gym', 'pro'] as const).map(playUnder);
  expect(beginner!.at(-1)!.verdict).toMatch(/Topped out!$/);
  expect(beginner!.at(-1)!.moves).toBe('7');
  expect(beginner!.some((s) => s.verdict!.includes("you'd fall"))).toBe(true);
  expect(beginner!.some((s) => s.verdict === 'The finish is for hands')).toBe(true);
  expect(gym).toEqual(beginner);
  expect(pro).toEqual(beginner);
});
