import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { fakeMlClient } from '../../../tests/fakeClient';
import { useAppStore } from '../../store/app';
import type { WorkingImage } from '../image-input';
import { useSamSession } from './useSamSession';

const image = (id: string): WorkingImage => ({
  id,
  pixels: { width: 4, height: 4, data: new Uint8ClampedArray(64) } as ImageData,
  width: 4,
  height: 4,
  scale: 1,
  sourceName: 'wall.jpg',
});

function Probe({
  client,
  onRetry,
}: {
  client: ReturnType<typeof fakeMlClient>;
  onRetry?: (r: () => void) => void;
}) {
  const { retry } = useSamSession(client);
  onRetry?.(retry);
  return null;
}

const embedCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([req]) => (req as { type: string }).type === 'sam:embed').length;

describe('useSamSession', () => {
  beforeEach(() => useAppStore.setState({ ...useAppStore.getInitialState(), image: image('a') }));

  it('embeds each image once, even when effects run twice (StrictMode)', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    render(
      <StrictMode>
        <Probe client={client} />
      </StrictMode>,
    );
    await vi.waitFor(() => expect(useAppStore.getState().samStatus).toBe('ready'));
    expect(embedCalls(spy)).toBe(1);
  });

  it('embeds again for a new image and on retry', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    let retry = () => {};
    render(<Probe client={client} onRetry={(r) => (retry = r)} />);
    await vi.waitFor(() => expect(useAppStore.getState().samStatus).toBe('ready'));
    act(() => useAppStore.getState().setImage(image('b')));
    await vi.waitFor(() => expect(embedCalls(spy)).toBe(2));
    act(() => retry());
    await vi.waitFor(() => expect(embedCalls(spy)).toBe(3));
  });

  it('does not embed again when the canvas remounts for the same image (back from 3D)', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    const first = render(<Probe client={client} />);
    await vi.waitFor(() => expect(useAppStore.getState().samStatus).toBe('ready'));
    first.unmount();
    render(<Probe client={client} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(embedCalls(spy)).toBe(1);
    expect(useAppStore.getState().samStatus).toBe('ready');
  });
});

