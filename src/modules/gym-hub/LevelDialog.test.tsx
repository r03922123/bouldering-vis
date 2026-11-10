import { fireEvent, render, screen } from '@testing-library/react';
import { LevelDialog } from './LevelDialog';

// SPEC-gym-hub G8, AC 8.
describe('LevelDialog', () => {
  it('asks how long you have been climbing, from the front desk', () => {
    render(<LevelDialog current={null} onAnswer={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'How long have you been climbing?' })).toBeVisible();
    expect(screen.getByText('Mags')).toBeInTheDocument();
  });

  it.each([
    ["I'm new to climbing", 'beginner'],
    ['I climb in gyms', 'gym'],
    ['I climb hard, set or coach', 'pro'],
  ] as const)('maps "%s" to %s', (answer, level) => {
    const onAnswer = vi.fn();
    render(<LevelDialog current={null} onAnswer={onAnswer} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: answer }));
    expect(onAnswer).toHaveBeenCalledWith(level);
  });

  it('can be dismissed with "Not now" or Escape', () => {
    const onDismiss = vi.fn();
    render(<LevelDialog current={null} onAnswer={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('moves focus to the first answer when first asked', () => {
    render(<LevelDialog current={null} onAnswer={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: "I'm new to climbing" })).toHaveFocus();
  });

  it('shows and focuses the current answer when reopened at the lockers', () => {
    render(<LevelDialog current="pro" onAnswer={() => {}} onDismiss={() => {}} />);
    const pro = screen.getByRole('button', { name: 'I climb hard, set or coach' });
    expect(pro).toHaveAttribute('aria-pressed', 'true');
    expect(pro).toHaveFocus();
    expect(screen.getByRole('button', { name: 'I climb in gyms' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
