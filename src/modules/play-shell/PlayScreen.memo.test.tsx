import { render } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { PlayScreen, type PlayScreenProps } from './PlayScreen';

// Review suggestion: store updates that hand Play an equal wall (a new object, the same route)
// never re-run defaultStart or the referee's last check.

const calls = vi.hoisted(() => ({ defaultStart: 0, checkStart: 0 }));
vi.mock('../beta-moves', async (importOriginal) => {
  const real = await importOriginal<typeof import('../beta-moves')>();
  return {
    ...real,
    defaultStart: (...a: Parameters<typeof real.defaultStart>) => {
      calls.defaultStart++;
      return real.defaultStart(...a);
    },
    checkStart: (...a: Parameters<typeof real.checkStart>) => {
      calls.checkStart++;
      return real.checkStart(...a);
    },
  };
});

const image: WorkingImage = {
  id: 'synthetic',
  pixels: { width: 4, height: 3, data: new Uint8ClampedArray(48) } as ImageData,
  width: 4,
  height: 3,
  scale: 1,
  sourceName: 'wall-landscape.jpg',
  sampleId: 'synthetic',
};
const props = (level: PlayScreenProps['level']): PlayScreenProps => ({
  wallId: 'synthetic',
  title: 'Synthetic wall',
  profile: { level: 'gym', hints: false, numbers: false },
  onBack: () => {},
  client: null,
  photo: image,
  level,
  tagged: null,
  tagReady: false,
  footholds: null,
  onPlan: () => {},
  onSetAid: () => {},
});

it('keeps the context, start and check for an equal wall', () => {
  forgetPlans();
  useAppStore.setState({ image });
  const { rerender } = render(<PlayScreen {...props(SYNTHETIC)} />);
  const once = { ...calls };
  expect(once.defaultStart).toBe(1);
  rerender(<PlayScreen {...props(structuredClone(SYNTHETIC))} />);
  rerender(<PlayScreen {...props(structuredClone(SYNTHETIC))} />);
  expect(calls).toEqual(once);
});
