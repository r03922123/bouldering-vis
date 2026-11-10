import { act, render } from '@testing-library/react';
import { fakeMlClient } from '../../../tests/fakeClient';
import textEmbeddings from '../../data/clip-text-embeddings.json';
import { useAppStore } from '../../store/app';
import type { HoldMask } from '../hold-segmentation';
import type { WorkingImage } from '../image-input';
import { effectiveClassification } from './classification';
import { useClassification } from './useClassification';

const W = 40;
const image: WorkingImage = {
  id: 'img',
  pixels: { width: W, height: W, data: new Uint8ClampedArray(W * W * 4).fill(120) } as ImageData,
  width: W,
  height: W,
  scale: 1,
  sourceName: 'wall.jpg',
};
const hold = (id: string): HoldMask => {
  const mask = new Uint8Array(W * W);
  for (let i = 0; i < 100; i++) mask[i] = 1;
  return {
    id,
    imageId: 'img',
    mask,
    bbox: { x: 0, y: 0, w: 40, h: 3 },
    role: 'route',
    order: 0,
  } as HoldMask;
};

function Probe({ client }: { client: ReturnType<typeof fakeMlClient> }) {
  useClassification(client);
  return null;
}
const clipCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([r]) => (r as { type: string }).type === 'clip:embed').length;

describe('useClassification', () => {
  beforeEach(() =>
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      image,
      holds: [hold('a'), hold('b')],
    }),
  );

  it('does not run CLIP before the analysis trigger', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(clipCalls(spy)).toBe(0);
  });

  it('classifies every hold once after the trigger, and new holds right away', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setView('route'));
    await vi.waitFor(() =>
      expect(Object.keys(useAppStore.getState().classifications)).toHaveLength(2),
    );
    act(() => useAppStore.setState((s) => ({ holds: [...s.holds, hold('c')] })));
    await vi.waitFor(() =>
      expect(Object.keys(useAppStore.getState().classifications)).toHaveLength(3),
    );
    expect(clipCalls(spy)).toBe(3);
    expect(useAppStore.getState().classifications['a']!.top).toHaveLength(3);
  });

  it('keeps a user override after the hold is classified again', async () => {
    const client = fakeMlClient();
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setClassOverride('a', 'volume'));
    act(() => useAppStore.getState().setView('route'));
    await vi.waitFor(() => expect(useAppStore.getState().classifications['a']).toBeDefined());
    const c = effectiveClassification(
      useAppStore.getState().classifications['a']!,
      useAppStore.getState().classOverrides['a'] ?? null,
    );
    expect(c.effectiveType).toBe('volume');
    expect(c.unsure).toBe(false);
  });
});

describe('useClassification size prior', () => {
  it('never lists "volume" for a hold under 0.8% of the image', async () => {
    const small = { ...hold('s'), area: 4 }; // 4 of 1600 px = 0.25%
    useAppStore.setState({ ...useAppStore.getInitialState(), image, holds: [small] });
    // CLIP "sees" a perfect volume: without the prior, volume would rank first.
    const client = fakeMlClient();
    const real = client.request.bind(client);
    const volume = Float32Array.from(textEmbeddings.embeddings.volume);
    vi.spyOn(client, 'request').mockImplementation((req, t) =>
      req.type === 'clip:embed'
        ? Promise.resolve({
            type: 'clip:embedding',
            holdId: req.holdId,
            embedding: volume,
          } as never)
        : real(req, t),
    );
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setView('route'));
    await vi.waitFor(() => expect(useAppStore.getState().classifications['s']).toBeDefined());
    expect(useAppStore.getState().classifications['s']!.top.map((t) => t.type)).not.toContain(
      'volume',
    );
  });
});

describe('effectiveClassification', () => {
  const top = (p: number) => [
    { type: 'crimp' as const, prob: p },
    { type: 'edge' as const, prob: (1 - p) / 2 },
    { type: 'jug' as const, prob: (1 - p) / 2 },
  ];

  it('is unsure below 0.35 without an override', () => {
    expect(effectiveClassification({ holdId: 'a', top: top(0.3) }, null)).toMatchObject({
      effectiveType: 'crimp',
      unsure: true,
      userType: null,
    });
  });

  it('is sure at 0.35 and above', () => {
    expect(effectiveClassification({ holdId: 'a', top: top(0.35) }, null).unsure).toBe(false);
  });

  it('prefers the override', () => {
    expect(effectiveClassification({ holdId: 'a', top: top(0.9) }, 'pinch')).toMatchObject({
      effectiveType: 'pinch',
      userType: 'pinch',
      unsure: false,
    });
  });
});
