import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { fakeMlClient } from '../../../tests/fakeClient';
import { checkStart, createStanceCache, defaultStart, type MoveContext } from '../beta-moves';
import type { DepthStatus } from '../depth-estimation';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';
import { resetViewAids } from './aids';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { contextFor } from './play';
import { PlayScreen } from './PlayScreen';
import { skipMap, targetsRegion, ROUTE_IMAGE, routeProps } from './screen.fixture';
import { stanceFor } from './Wall3D';

// SPEC-play-shell › Amendment 2026-11-02 H2 and acceptance 4: "3D" opens the Studio's 3D view with
// the current stance in it, and no depth request (no worker, even) is made before it is opened.
// Review finding 1: only a baked level may ask for depth; on a tagged route it is referee input.

vi.setConfig({ testTimeout: 60_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;

function spiedClient() {
  const client = fakeMlClient();
  const sent: string[] = [];
  const real = client.request.bind(client);
  vi.spyOn(client, 'request').mockImplementation((req, transfer) => {
    sent.push(req.type);
    return real(req, transfer);
  });
  return { client, sent };
}

/** PlayRoute's part, in small: the photo's depth state, and (baked level only) the request. */
function WithDepth({
  ml,
  baked = true,
  initial = { ready: false, status: { state: 'idle' } },
  onAsk,
}: {
  ml: () => MlClient;
  baked?: boolean;
  initial?: { ready: boolean; status: DepthStatus };
  onAsk?: () => void;
}) {
  const [depth, setDepth] = useState(initial);
  const request = () => {
    onAsk?.();
    setDepth({ ready: false, status: { state: 'running' } });
    void ml()
      .request({ type: 'depth:run', imageId: ROUTE_IMAGE.id, pixels: ROUTE_IMAGE.pixels })
      .then(() => setDepth({ ready: true, status: { state: 'ready' } }));
  };
  return (
    <PlayScreen
      {...routeProps(
        baked
          ? { ml, depth3d: depth, onRequestDepth: request }
          : { ml, depth3d: depth, level: null, tagReady: true, tagged: SYNTHETIC },
      )}
    />
  );
}

beforeEach(() => {
  forgetPlans();
  resetViewAids();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_IMAGE });
});
afterEach(() => vi.restoreAllMocks());

const panel = () => screen.queryByRole('region', { name: '3D view' });
const body = () => panel()!.querySelector('.play-3d-body');
const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });

it('makes no depth request before 3D is opened, then one, with a one-time notice (acceptance 4)', async () => {
  const { client, sent } = spiedClient();
  const ml = vi.fn(() => client);
  render(<WithDepth ml={ml} />);
  skipMap();
  // A move and the hints: none of it asks for the worker.
  fireEvent.click(limb('LH'));
  fireEvent.click(within(targetsRegion(/^Targets for/)).getByRole('button', { name: '3' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Hold directions' }));
  await new Promise((r) => setTimeout(r, 20));
  expect(ml).not.toHaveBeenCalled();
  expect(sent.filter((t) => t.startsWith('depth:'))).toEqual([]);

  const open = screen.getByRole('button', { name: '3D' });
  expect(open).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(open);
  expect(ml).toHaveBeenCalled();
  expect(await screen.findByText(/3D needs the depth model/)).toBeInTheDocument();
  await waitFor(() => expect(sent).toContain('depth:run'));
  await waitFor(() => expect(body()).toHaveAttribute('data-depth', 'ready'));

  // Closed and opened again: no second notice, and the depth it has is used.
  fireEvent.click(within(panel()!).getByRole('button', { name: 'Close' }));
  expect(panel()).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '3D' }));
  await waitFor(() => expect(body()).not.toBeNull());
  expect(screen.queryByText(/3D needs the depth model/)).toBeNull();
  expect(sent.filter((t) => t === 'depth:run')).toHaveLength(1);
});

it('never asks twice while a request is running', async () => {
  const { client } = spiedClient();
  const onAsk = vi.fn();
  render(
    <WithDepth
      ml={() => client}
      initial={{ ready: false, status: { state: 'running' } }}
      onAsk={onAsk}
    />,
  );
  skipMap();
  fireEvent.click(screen.getByRole('button', { name: '3D' }));
  await waitFor(() => expect(body()).toHaveAttribute('data-depth', 'running'));
  expect(onAsk).not.toHaveBeenCalled();
});

it('asks for no depth when the app already has it for this photo', async () => {
  const { client, sent } = spiedClient();
  const ml = vi.fn(() => client);
  render(<WithDepth ml={ml} initial={{ ready: true, status: { state: 'ready' } }} />);
  skipMap();
  fireEvent.click(screen.getByRole('button', { name: '3D' }));
  await waitFor(() => expect(body()).toHaveAttribute('data-depth', 'ready'));
  expect(sent).toEqual([]);
  expect(ml).not.toHaveBeenCalled();
});

it('has no 3D button where the app gives no worker and no depth', () => {
  render(<PlayScreen {...routeProps()} />);
  skipMap();
  expect(screen.queryByRole('button', { name: '3D' })).toBeNull();
});

it('review 1: on a wall without a baked level, 3D never asks for depth (it would change the referee’s input)', async () => {
  const { client, sent } = spiedClient();
  render(
    <WithDepth
      ml={() => client}
      baked={false}
      initial={{ ready: false, status: { state: 'error', message: 'x' } }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
  skipMap();
  const before = screen.getByRole('region', { name: 'Wall' }).dataset.assignment;
  fireEvent.click(screen.getByRole('button', { name: '3D' }));
  await screen.findByRole('region', { name: '3D view' });
  await new Promise((r) => setTimeout(r, 50));
  expect(sent.filter((t) => t.startsWith('depth:'))).toEqual([]);
  expect(useAppStore.getState().depth).toBeNull();
  expect(screen.getByRole('region', { name: 'Wall' }).dataset.assignment).toBe(before);
  expect(panel()).toHaveTextContent('No depth for this wall yet');
  expect(screen.queryByText(/3D needs the depth model/)).toBeNull();
  expect(within(panel()!).queryByRole('button', { name: 'Retry' })).toBeNull();
});

it('stands the referee’s own stance in the 3D view', () => {
  const check = checkStart(defaultStart(ctx), ctx, createStanceCache());
  const s = stanceFor(check, ctx);
  expect(s.stance).toBe(check.stance);
  expect(s.contacts).toBe(check.contacts);
  expect(s.assignment).toBe(check.assignment);
  expect(s.height).toBe(ctx.height);
});
