import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '../store/app';
import { PlayBoundary } from './PlayBoundary';

// Review finding 2 (c): a crash on a wall never takes the app, or the photo and route, with it.

function Boom(): never {
  throw new RangeError('That isn’t on this route');
}

it('shows a way back to the gym, and keeps the store', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  useAppStore.setState({ holds: [{ id: 'kept' } as never] });
  const onBack = vi.fn();
  render(
    <PlayBoundary onBack={onBack}>
      <Boom />
    </PlayBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this wall');
  fireEvent.click(screen.getByRole('button', { name: 'Back to the gym' }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(useAppStore.getState().holds).toEqual([{ id: 'kept' }]);
  quiet.mockRestore();
});

it('offers a reload, not the gym, on the front-door wall (SPEC-launch-wall-2 R3)', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  render(
    <PlayBoundary>
      <Boom />
    </PlayBoundary>,
  );
  expect(screen.queryByRole('button', { name: 'Back to the gym' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(reload).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
  quiet.mockRestore();
});
