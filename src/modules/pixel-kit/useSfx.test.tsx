import { act, fireEvent, renderHook } from '@testing-library/react';
import { FakeAudioContext } from '../../../tests/fakeAudio';
import { MASTER_GAIN, SOUND_KEY } from './sfx';
import { resetSfxPlayer, sfxContextState, useSfx } from './useSfx';

// SPEC-pixel-kit › Sound Effects and Edge Cases; AC 34. A fake AudioContext records what the
// player builds; jsdom has no Web Audio, so nothing is played.

const realHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

beforeEach(() => {
  resetSfxPlayer();
  localStorage.clear();
  FakeAudioContext.instances = [];
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  resetSfxPlayer();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  if (realHidden) Object.defineProperty(Document.prototype, 'hidden', realHidden);
  localStorage.clear();
});

const ctx = () => FakeAudioContext.instances[0]!;
const sources = (c: FakeAudioContext) => [...c.of('oscillator'), ...c.of('buffer')];

describe('useSfx (AC 34)', () => {
  it('constructs no AudioContext while sound is off', () => {
    const { result } = renderHook(() => useSfx());
    expect(result.current.soundOn).toBe(false);
    for (let i = 0; i < 5; i++) result.current.play('grab');
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(sfxContextState()).toBe('none');
  });

  it('creates one context when the player turns sound on, then reuses it', () => {
    const { result } = renderHook(() => useSfx());
    act(() => result.current.setSoundOn(true));
    expect(result.current.soundOn).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
    // The master gain feeds the speakers at 0.5.
    const master = ctx().of('gain')[0]!;
    expect(master.gain.value).toBe(MASTER_GAIN);
    expect(master.outputs).toEqual([ctx().destination]);
    result.current.play('tick');
    result.current.play('send');
    act(() => result.current.setSoundOn(false));
    act(() => result.current.setSoundOn(true));
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(sources(ctx())).toHaveLength(3); // tick: 1 voice, send: 2
    expect(localStorage.getItem(SOUND_KEY)).toBe('on');
  });

  it('plays nothing while the document is hidden', () => {
    const { result } = renderHook(() => useSfx());
    act(() => result.current.setSoundOn(true));
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => true });
    result.current.play('grab');
    expect(sources(ctx())).toHaveLength(0);
  });

  it('with sound saved as on, creates the context on the first pointerdown and not before', () => {
    localStorage.setItem(SOUND_KEY, 'on');
    const { result } = renderHook(() => useSfx());
    expect(result.current.soundOn).toBe(true);
    result.current.play('grab');
    expect(FakeAudioContext.instances).toHaveLength(0);
    fireEvent.pointerDown(document.body);
    expect(FakeAudioContext.instances).toHaveLength(1);
    fireEvent.pointerDown(document.body); // one-shot
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(FakeAudioContext.instances).toHaveLength(1);
    result.current.play('grab');
    expect(sources(ctx())).toHaveLength(2);
  });

  it('also starts on the first keydown', () => {
    localStorage.setItem(SOUND_KEY, 'on');
    renderHook(() => useSfx());
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('makes a suspended context resume and drops that effect, without throwing', () => {
    const { result } = renderHook(() => useSfx());
    act(() => result.current.setSoundOn(true));
    const c = ctx();
    c.state = 'suspended';
    const before = c.resumes;
    expect(() => result.current.play('slip')).not.toThrow();
    expect(c.resumes).toBe(before + 1);
    expect(sources(c)).toHaveLength(0);
    // A rejected resume is caught too.
    c.state = 'interrupted';
    c.resume = () => Promise.reject(new Error('not allowed'));
    expect(() => result.current.play('slip')).not.toThrow();
  });

  it('does nothing, and never throws, where AudioContext does not exist', () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    const { result } = renderHook(() => useSfx());
    expect(() => act(() => result.current.setSoundOn(true))).not.toThrow();
    expect(result.current.soundOn).toBe(true);
    expect(() => result.current.play('fall')).not.toThrow();
  });

  it('fades out an earlier instance of the same effect, and the oldest of 5', () => {
    const { result } = renderHook(() => useSfx());
    act(() => result.current.setSoundOn(true));
    const c = ctx();
    const cancelled = () =>
      c.of('gain').map((g) => g.gain.calls.some(([method]) => method === 'cancel'));
    result.current.play('grab'); // gains 1–2 (0 is the master)
    result.current.play('grab'); // gains 3–4; the first grab fades
    expect(cancelled()).toEqual([false, true, true, false, false]);
    for (const n of ['tick', 'slip', 'fall'] as const) result.current.play(n);
    expect(cancelled().filter(Boolean)).toHaveLength(2);
    result.current.play('send'); // a fifth effect: the oldest (the second grab) fades
    expect(cancelled().slice(3, 5)).toEqual([true, true]);
  });

  it('stops what is playing when sound is turned off', () => {
    const { result } = renderHook(() => useSfx());
    act(() => result.current.setSoundOn(true));
    result.current.play('send');
    act(() => result.current.setSoundOn(false));
    const gains = ctx().of('gain').slice(1);
    expect(gains.every((g) => g.gain.calls.some(([m]) => m === 'cancel'))).toBe(true);
    result.current.play('send');
    expect(ctx().of('gain')).toHaveLength(3);
  });
});
