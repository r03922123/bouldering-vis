import { act, render, screen } from '@testing-library/react';
import { fakeMlClient } from '../../../tests/fakeClient';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { DepthStatusLine } from './DepthView';
import { useDepth } from './useDepth';

const image = (id: string): WorkingImage => ({
  id,
  pixels: { width: 8, height: 4, data: new Uint8ClampedArray(8 * 4 * 4) } as ImageData,
  width: 8,
  height: 4,
  scale: 1,
  sourceName: 'wall.jpg',
});

function Probe({ client }: { client: ReturnType<typeof fakeMlClient> }) {
  useDepth(client);
  return <DepthStatusLine />;
}

const depthCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([r]) => (r as { type: string }).type === 'depth:run').length;

describe('useDepth', () => {
  beforeEach(() => useAppStore.setState({ ...useAppStore.getInitialState(), image: image('a') }));

  it('does nothing before the analysis is triggered', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(depthCalls(spy)).toBe(0);
    expect(useAppStore.getState().depth).toBeNull();
  });

  it('runs once after the trigger and stores the depth map', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setView('route'));
    await vi.waitFor(() => expect(useAppStore.getState().depthStatus.state).toBe('ready'));
    act(() => useAppStore.getState().setView('depth'));
    await new Promise((r) => setTimeout(r, 10));
    expect(depthCalls(spy)).toBe(1);
    const d = useAppStore.getState().depth!;
    expect([d.imageId, d.width, d.height, d.depth.length, d.normals.length]).toEqual([
      'a',
      8,
      4,
      32,
      96,
    ]);
  });

  it('shows an error with a Retry button when the model fails, and retries', async () => {
    const client = fakeMlClient();
    const real = client.request.bind(client);
    let fail = true;
    vi.spyOn(client, 'request').mockImplementation((req, t) =>
      req.type === 'depth:run' && fail
        ? Promise.reject(new Error('download failed'))
        : real(req, t),
    );
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setView('depth'));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    fail = false;
    act(() => retry.click());
    await vi.waitFor(() => expect(useAppStore.getState().depthStatus.state).toBe('ready'));
  });
});

describe('analysis trigger', () => {
  beforeEach(() => useAppStore.setState({ ...useAppStore.getInitialState(), image: image('a') }));

  it('is set by any non-Original view and reset by a new image', () => {
    expect(useAppStore.getState().analysisTriggered).toBe(false);
    useAppStore.getState().setView('original');
    expect(useAppStore.getState().analysisTriggered).toBe(false);
    useAppStore.getState().setView('depth');
    expect(useAppStore.getState().analysisTriggered).toBe(true);
    useAppStore.getState().setImage(image('b'));
    expect(useAppStore.getState().analysisTriggered).toBe(false);
    expect(useAppStore.getState().depth).toBeNull();
  });
});
