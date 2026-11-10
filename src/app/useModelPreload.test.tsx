import { act, render, screen } from '@testing-library/react';
import { fakeMlClient } from '../../tests/fakeClient';
import { useAppStore } from '../store/app';
import { LoadingStatus } from './LoadingStatus';
import { useModelPreload } from './useModelPreload';

function Probe({ client }: { client: ReturnType<typeof fakeMlClient> }) {
  useModelPreload(client);
  return null;
}

const image = {
  id: 'img',
  width: 4,
  height: 4,
  pixels: {} as ImageData,
  scale: 1,
  sourceName: 'x',
};

describe('useModelPreload', () => {
  beforeEach(() => useAppStore.setState({ ...useAppStore.getInitialState(), image }));

  it('prefetches the later models once, after the hold detector is ready', async () => {
    const client = fakeMlClient();
    const spy = vi.spyOn(client, 'request');
    render(<Probe client={client} />);
    expect(spy).not.toHaveBeenCalled();
    act(() => useAppStore.getState().setSamStatus('ready'));
    act(() => useAppStore.getState().setSamStatus('ready'));
    await vi.waitFor(() =>
      expect(spy.mock.calls.filter(([r]) => r.type === 'models:prefetch')).toHaveLength(1),
    );
  });

  it('records download progress per model and file', async () => {
    const client = fakeMlClient();
    render(<Probe client={client} />);
    act(() => useAppStore.getState().setSamStatus('ready'));
    await vi.waitFor(() =>
      expect(useAppStore.getState().modelProgress.clip).toEqual({
        'vision_model.onnx': { loaded: 1, total: 1 },
      }),
    );
  });
});

describe('LoadingStatus', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('names each model that is still downloading, with its size', () => {
    useAppStore.setState({
      modelProgress: { sam: { a: { loaded: 9 * 2 ** 20, total: 21 * 2 ** 20 } } },
    });
    render(<LoadingStatus />);
    expect(screen.getByText('Downloading hold detector · 9 / 21 MB')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Downloading hold detector' }),
    ).toBeInTheDocument();
  });

  it('shows nothing when no download is running', () => {
    const { container } = render(<LoadingStatus />);
    expect(container).toBeEmptyDOMElement();
  });
});
