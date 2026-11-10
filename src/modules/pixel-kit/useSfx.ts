import { useMemo, useSyncExternalStore } from 'react';
import {
  loadSoundOn,
  MASTER_GAIN,
  MAX_VOICES_AT_ONCE,
  noiseSamples,
  saveSoundOn,
  scheduleSfx,
  SFX,
  type SfxName,
} from './sfx';

// SPEC-pixel-kit › Sound Effects and Edge Cases. One module-level player behind useSfx, exposed
// through useSyncExternalStore so every SoundToggle stays in sync; it adds nothing to the app
// store. Sound is off by default and no AudioContext exists until the player turns sound on (that
// tap is the user gesture). After a reload with sound saved as on, the context starts on the first
// pointerdown or keydown anywhere. play() never throws.

type Ctor = typeof AudioContext;

interface Playing {
  name: SfxName;
  endsAt: number;
  stop: () => void;
}

interface Player {
  /** null until first read, so importing this file never touches storage. */
  soundOn: boolean | null;
  ctx: AudioContext | null;
  master: GainNode | null;
  noise: AudioBuffer | null;
  playing: Playing[];
  listeners: Set<() => void>;
  disarm: (() => void) | null;
}

const fresh = (): Player => ({
  soundOn: null,
  ctx: null,
  master: null,
  noise: null,
  playing: [],
  listeners: new Set(),
  disarm: null,
});

let player = fresh();

const audioCtor = (): Ctor | null => {
  const g = globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
};

function soundOn(): boolean {
  if (player.soundOn === null) player.soundOn = loadSoundOn();
  return player.soundOn;
}

function resume(ctx: AudioContext): void {
  try {
    void ctx.resume().catch(() => {});
  } catch {
    // An older or closed context: the next play() tries again.
  }
}

/** Creates the context, master gain and noise buffer once (call from a user gesture). */
function ensureContext(): AudioContext | null {
  if (player.ctx) return player.ctx;
  const Audio = audioCtor();
  if (!Audio) return null;
  try {
    const ctx = new Audio();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    const samples = noiseSamples(ctx.sampleRate);
    const noise = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    noise.getChannelData(0).set(samples);
    Object.assign(player, { ctx, master, noise });
    resume(ctx);
    return ctx;
  } catch {
    return null;
  }
}

/** With sound saved as on, start the context on the first pointerdown or keydown anywhere. */
function armGesture(): void {
  if (player.disarm || player.ctx || typeof window === 'undefined') return;
  const onGesture = () => {
    disarm();
    if (soundOn()) ensureContext();
  };
  const disarm = () => {
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    player.disarm = null;
  };
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  player.disarm = disarm;
}

function stopAll(): void {
  for (const p of player.playing.splice(0)) p.stop();
}

function play(name: SfxName): void {
  try {
    if (!soundOn() || (typeof document !== 'undefined' && document.hidden)) return;
    const { ctx, master, noise } = player;
    if (!ctx || !master || !noise) return; // no AudioContext, or no gesture yet
    if (ctx.state !== 'running') {
      resume(ctx); // suspended or interrupted (phone lock, iOS): this effect is dropped
      return;
    }
    const now = ctx.currentTime;
    const playing = (player.playing = player.playing.filter((p) => p.endsAt > now));
    const again = playing.findIndex((p) => p.name === name);
    if (again >= 0) playing.splice(again, 1)[0]!.stop();
    if (playing.length >= MAX_VOICES_AT_ONCE) playing.shift()!.stop();
    const def = SFX[name];
    playing.push({
      name,
      endsAt: now + def.duration,
      stop: scheduleSfx(ctx, def, now, master, noise),
    });
  } catch {
    // Sound is decoration: never let it break the game.
  }
}

function setSoundOn(on: boolean): void {
  player.soundOn = on;
  saveSoundOn(on);
  if (on) ensureContext();
  else stopAll();
  for (const l of [...player.listeners]) l();
}

function subscribe(listener: () => void): () => void {
  player.listeners.add(listener);
  if (soundOn()) armGesture();
  return () => {
    player.listeners.delete(listener);
  };
}

export function useSfx(): {
  play(name: SfxName): void;
  soundOn: boolean;
  setSoundOn(on: boolean): void;
} {
  const on = useSyncExternalStore(subscribe, soundOn, () => false);
  return useMemo(() => ({ play, soundOn: on, setSoundOn }), [on]);
}

/** The audio context's state, or 'none' before one exists (dev gallery and tests only). */
export function sfxContextState(): AudioContextState | 'interrupted' | 'none' {
  return player.ctx?.state ?? 'none';
}

/** Forgets the player (tests only): stops effects, drops the context and the gesture listener. */
export function resetSfxPlayer(): void {
  stopAll();
  player.disarm?.();
  player = fresh();
}
