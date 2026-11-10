import { render, screen } from '@testing-library/react';
import { Root } from './Root';

// PR #44 review: Root gives the crash screen the same way back as the Play header, so the
// front-door wall's crash screen never leads to the gym (SPEC-launch-wall-2 R3). Its own file,
// since it mocks the whole Play screen to throw.
vi.mock('./PlayRoute', () => ({
  PlayRoute: () => {
    throw new Error('boom');
  },
  PlayAnalysis: () => null,
}));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => window.history.replaceState(null, '', '#/gym'));

it.each([
  ['#/', 'Try again', 'Back to the gym'],
  ['#/wall/mine', 'Back to the gym', 'Try again'],
])('%s: a crash offers "%s"', async (hash, shown, hidden) => {
  window.history.replaceState(null, '', hash);
  render(<Root />);
  expect(await screen.findByRole('button', { name: shown })).toBeVisible();
  expect(screen.queryByRole('button', { name: hidden })).not.toBeInTheDocument();
});
