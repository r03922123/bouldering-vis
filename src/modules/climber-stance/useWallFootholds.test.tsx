import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { fakeMlClient } from '../../../tests/fakeClient';
import { useAppStore } from '../../store/app';
import type { MlClient } from '../../workers/client';
import { createFakeHandlers } from '../../workers/fakeHandlers';
import type { ResponseMap } from '../../workers/protocol';
import { createMaskCache, wallHandlers } from '../../workers/wallCache';
import type { WorkingImage } from '../image-input';
import { useWallFootholds } from './useWallFootholds';

const W = 40;
const H = 30;

const image = (id: string): WorkingImage => ({
  id,
  pixels: { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) } as ImageData,
  width: W,
  height: H,
  scale: 1,
  sourceName: 'wall.jpg',
});

/** A stand-in for segmentWall: one 10 × 5 hold at (5, 4), counted per call. */
function spySegment() {
  return vi.fn((pixels: ImageData) => {
    const mask = new Uint8Array(pixels.width * pixels.height);
    for (let y = 4; y < 9; y++) for (let x = 5; x < 15; x++) mask[y * pixels.width + x] = 1;
    return mask;
  });
}

/** The fake worker with a spied wall mask cache, as the real worker wires it. */
const spiedClient = (segment: (pixels: ImageData) => Uint8Array) =>
  fakeMlClient({ ...createFakeHandlers(), ...wallHandlers(createMaskCache(segment)) });

const calls = (spy: { mock: { calls: unknown[][] } }, type: string) =>
  spy.mock.calls.filter(([r]) => (r as { type: string }).type === type).length;

/**
 * Route view's own wall:segment request, sent the way route-compositor's useWallMask sends it.
 * climber-stance doesn't import route-compositor, so the test speaks the worker protocol instead.
 */
function RouteViewRequest({ client }: { client: MlClient }) {
  const image = useAppStore((s) => s.image);
  const inRoute = useAppStore((s) => s.view === 'route');
  useEffect(() => {
    if (image && inRoute)
      void client.request({ type: 'wall:segment', imageId: image.id, pixels: image.pixels });
  }, [client, image, inRoute]);
  return null;
}

function Probe({ client, route = false }: { client: MlClient; route?: boolean }) {
  useWallFootholds(client);
  return route ? <RouteViewRequest client={client} /> : null;
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 10)));

/** A request whose answer the test gives by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useWallFootholds (AC 35)', () => {
  beforeEach(() => useAppStore.setState({ ...useAppStore.getInitialState(), image: image('a') }));

  it('sends exactly one wall:footholds request with the climber on, in Original view', async () => {
    const client = spiedClient(spySegment());
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setShowClimber(true));
    await vi.waitFor(() => expect(useAppStore.getState().wallFootholdsStatus).toBe('ready'));
    // Other store changes (and the climber's own controls) don't send it again.
    act(() => useAppStore.getState().setClimberScale(1.2));
    await settle();
    expect(useAppStore.getState().view).toBe('original');
    expect(calls(spy, 'wall:footholds')).toBe(1);
    const f = useAppStore.getState().wallFootholds!;
    expect([f.imageId, f.width, f.height, f.blobs.map((b) => b.id)]).toEqual([
      'a',
      W,
      H,
      ['blob:1'],
    ]);
  });

  it('sets the status to pending in the same effect that sends the request', () => {
    const client = spiedClient(spySegment());
    render(<Probe client={client} />);
    expect(useAppStore.getState().wallFootholdsStatus).toBe('idle');
    act(() => useAppStore.getState().setShowClimber(true));
    expect(useAppStore.getState().wallFootholdsStatus).toBe('pending');
  });

  it('sends none with the climber off, even after Route view opens', async () => {
    const client = spiedClient(spySegment());
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} route />);
    act(() => useAppStore.getState().setView('route'));
    await settle();
    expect(calls(spy, 'wall:segment')).toBe(1);
    expect(calls(spy, 'wall:footholds')).toBe(0);
    expect(useAppStore.getState().wallFootholdsStatus).toBe('idle');
  });

  it('runs segmentWall once in total when Route opens with the climber on', async () => {
    const segment = spySegment();
    const client = spiedClient(segment);
    render(<Probe client={client} route />);
    act(() => useAppStore.getState().setShowClimber(true));
    act(() => useAppStore.getState().setView('route'));
    await vi.waitFor(() => expect(useAppStore.getState().wallFootholdsStatus).toBe('ready'));
    await settle();
    expect(segment).toHaveBeenCalledTimes(1);
  });

  it('ignores an error for a replaced image', async () => {
    const client = spiedClient(spySegment());
    const forA = deferred<ResponseMap['wall:footholds']>();
    vi.spyOn(client, 'request').mockImplementation((req) =>
      req.type === 'wall:footholds'
        ? req.imageId === 'a'
          ? forA.promise
          : new Promise(() => {})
        : Promise.reject(new Error(`unexpected ${req.type}`)),
    );
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setShowClimber(true));
    act(() => useAppStore.getState().setImage(image('b')));
    act(() => useAppStore.getState().setShowClimber(true));
    expect(useAppStore.getState().wallFootholdsStatus).toBe('pending');
    await act(async () => forA.reject(new Error('worker crashed')));
    await settle();
    expect(useAppStore.getState().image?.id).toBe('b');
    expect(useAppStore.getState().wallFootholdsStatus).toBe('pending');
  });

  it('ignores an answer for a replaced image', async () => {
    const client = spiedClient(spySegment());
    const forA = deferred<ResponseMap['wall:footholds']>();
    const real = client.request.bind(client);
    vi.spyOn(client, 'request').mockImplementation((req, t) =>
      req.type === 'wall:footholds' && req.imageId === 'a' ? forA.promise : real(req, t),
    );
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setShowClimber(true));
    act(() => useAppStore.getState().setImage(image('b')));
    // The climber is off for the new photo, so nothing is asked for it yet.
    const stale = await real({ type: 'wall:footholds', imageId: 'a', pixels: image('a').pixels });
    await act(async () => forA.resolve(stale));
    await settle();
    expect(useAppStore.getState().wallFootholds).toBeNull();
    expect(useAppStore.getState().wallFootholdsStatus).toBe('idle');
  });

  it('reports an error without retrying, and retries when the climber is turned off and on', async () => {
    const client = spiedClient(spySegment());
    const real = client.request.bind(client);
    let fail = true;
    const spy = vi
      .spyOn(client, 'request')
      .mockImplementation((req, t) =>
        req.type === 'wall:footholds' && fail
          ? Promise.reject(new Error('worker crashed'))
          : real(req, t),
      );
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setShowClimber(true));
    await vi.waitFor(() => expect(useAppStore.getState().wallFootholdsStatus).toBe('error'));
    await settle();
    expect(calls(spy, 'wall:footholds')).toBe(1);
    fail = false;
    act(() => useAppStore.getState().setShowClimber(false));
    act(() => useAppStore.getState().setShowClimber(true));
    await vi.waitFor(() => expect(useAppStore.getState().wallFootholdsStatus).toBe('ready'));
    expect(calls(spy, 'wall:footholds')).toBe(2);
  });

  it('asks again for a new image', async () => {
    const client = spiedClient(spySegment());
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setShowClimber(true));
    await vi.waitFor(() => expect(useAppStore.getState().wallFootholdsStatus).toBe('ready'));
    // Turning the climber off and on keeps the answer it has.
    act(() => useAppStore.getState().setShowClimber(false));
    act(() => useAppStore.getState().setShowClimber(true));
    await settle();
    expect(calls(spy, 'wall:footholds')).toBe(1);
    act(() => useAppStore.getState().setImage(image('b')));
    act(() => useAppStore.getState().setShowClimber(true));
    await vi.waitFor(() => expect(useAppStore.getState().wallFootholds?.imageId).toBe('b'));
    expect(calls(spy, 'wall:footholds')).toBe(2);
  });
});
