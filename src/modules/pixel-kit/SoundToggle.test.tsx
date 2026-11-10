import { fireEvent, render, screen } from '@testing-library/react';
import { FakeAudioContext } from '../../../tests/fakeAudio';
import { SOUND_KEY } from './sfx';
import { SoundToggle } from './SoundToggle';
import { resetSfxPlayer } from './useSfx';

// SPEC-pixel-kit › Sound Effects; AC 35.

beforeEach(() => {
  resetSfxPlayer();
  localStorage.clear();
  FakeAudioContext.instances = [];
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  resetSfxPlayer();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  localStorage.clear();
});

describe('SoundToggle (AC 35)', () => {
  it('is a button named "Sound" whose aria-pressed follows the state and is saved', () => {
    render(<SoundToggle />);
    const button = screen.getByRole('button', { name: 'Sound' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveClass('px-button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(SOUND_KEY)).toBe('on');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(SOUND_KEY)).toBe('off');
  });

  it('keeps two toggles on one page in sync', () => {
    render(
      <>
        <SoundToggle />
        <SoundToggle />
      </>,
    );
    const [a, b] = screen.getAllByRole('button', { name: 'Sound' });
    fireEvent.click(a!);
    expect(a).toHaveAttribute('aria-pressed', 'true');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(b!);
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(b).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts on when sound was saved as on, and turning it on plays a tick', () => {
    localStorage.setItem(SOUND_KEY, 'on');
    render(<SoundToggle />);
    const button = screen.getByRole('button', { name: 'Sound' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button); // off
    fireEvent.click(button); // on: the tap creates the context and confirms with a tick
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.of('oscillator').map((o) => o.type)).toEqual(['square']);
  });
});
