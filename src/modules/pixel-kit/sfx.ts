import { createRng } from './rng';

// SPEC-pixel-kit › Sound Effects (Decisions P8). Short chiptune effects written for this game, as
// pure data: oscillator type, frequency and gain ramps, scheduled on Web Audio. No audio files.
// All times are seconds from the moment the effect starts. Noise comes from the seeded RNG.

export type SfxName = 'tick' | 'grab' | 'slip' | 'fall' | 'send';
export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'pulse25' | 'noise';

/** set = setValueAtTime, lin = linearRampToValueAtTime, exp = exponentialRampToValueAtTime. */
export interface Ramp {
  t: number;
  v: number;
  curve: 'set' | 'lin' | 'exp';
}

export interface Voice {
  wave: Wave;
  start: number;
  end: number;
  /** Empty for noise. */
  freq: readonly Ramp[];
  gain: readonly Ramp[];
  filter?: { type: 'lowpass' | 'highpass'; hz: number };
}

export interface SfxDef {
  name: SfxName;
  duration: number;
  voices: readonly Voice[];
}

export const MASTER_GAIN = 0.5 as const;
/** Effects playing at once; with ≤ 0.5 per effect and the 0.5 master, nothing clips. */
export const MAX_VOICES_AT_ONCE = 4 as const;
export const SOUND_KEY = 'bouldering-vis:sound' as const;

/** The quietest value exponential ramps start from and end at (they can't reach 0). */
const FLOOR = 0.0001;
const FADE_S = 0.005;

const set = (t: number, v: number): Ramp => ({ t, v, curve: 'set' });
const lin = (t: number, v: number): Ramp => ({ t, v, curve: 'lin' });
const exp = (t: number, v: number): Ramp => ({ t, v, curve: 'exp' });

/** One lead note from a to b: up to `peak` in 5 ms, hold, down to the floor in its last 20 ms. */
const note = (a: number, b: number, peak: number): Ramp[] => [
  set(a, FLOOR),
  lin(a + 0.005, peak),
  set(b - 0.02, peak),
  exp(b, FLOOR),
];

export const SFX: Readonly<Record<SfxName, SfxDef>> = {
  // original, composed for Bloc Hall, 2026-11-01
  tick: {
    name: 'tick',
    duration: 0.035,
    voices: [
      {
        wave: 'square',
        start: 0,
        end: 0.035,
        freq: [set(0, 1320)],
        gain: [set(0, 0), lin(0.002, 0.12), exp(0.03, FLOOR)],
      },
    ],
  },
  // original, composed for Bloc Hall, 2026-11-01
  grab: {
    name: 'grab',
    duration: 0.1,
    voices: [
      {
        wave: 'pulse25',
        start: 0,
        end: 0.1,
        freq: [set(0, 392), exp(0.05, 784)],
        gain: [set(0, 0), lin(0.003, 0.16), set(0.04, 0.16), exp(0.09, FLOOR)],
      },
      // The "chalk tap".
      {
        wave: 'noise',
        start: 0,
        end: 0.03,
        freq: [],
        gain: [set(0, 0.06), exp(0.02, FLOOR)],
        filter: { type: 'highpass', hz: 3000 },
      },
    ],
  },
  // original, composed for Bloc Hall, 2026-11-01
  slip: {
    name: 'slip',
    duration: 0.24,
    voices: [
      {
        wave: 'square',
        start: 0,
        end: 0.24,
        freq: [set(0, 660), exp(0.2, 330)],
        // Three blips, the last one fading out.
        gain: [
          set(0, FLOOR),
          lin(0.003, 0.14),
          set(0.045, 0.14),
          lin(0.05, FLOOR),
          set(0.07, FLOOR),
          lin(0.073, 0.14),
          set(0.115, 0.14),
          lin(0.12, FLOOR),
          set(0.14, FLOOR),
          lin(0.143, 0.14),
          exp(0.22, FLOOR),
        ],
      },
    ],
  },
  // original, composed for Bloc Hall, 2026-11-01
  fall: {
    name: 'fall',
    duration: 0.7,
    voices: [
      {
        wave: 'triangle',
        start: 0,
        end: 0.7,
        freq: [set(0, 880), exp(0.55, 110)],
        gain: [set(0, 0.18), lin(0.5, 0.1), exp(0.6, FLOOR)],
      },
      // The thump on landing.
      {
        wave: 'noise',
        start: 0.55,
        end: 0.7,
        freq: [],
        gain: [set(0.55, 0.25), exp(0.7, FLOOR)],
        filter: { type: 'lowpass', hz: 500 },
      },
    ],
  },
  // original, composed for Bloc Hall, 2026-11-01; ending re-voiced 2026-11-01 (originality review)
  send: {
    name: 'send',
    duration: 0.85,
    voices: [
      // Lead: G4, then a turn D5–B4 that settles on C5. The stars land on the last three notes.
      {
        wave: 'pulse25',
        start: 0,
        end: 0.85,
        freq: [set(0, 392.0), set(0.12, 587.33), set(0.24, 493.88), set(0.36, 523.25)],
        gain: [
          ...note(0, 0.1, 0.14),
          ...note(0.12, 0.22, 0.14),
          ...note(0.24, 0.34, 0.14),
          ...note(0.36, 0.8, 0.14),
        ],
      },
      // Bass: C3 under the whole figure, so the last note lands home.
      {
        wave: 'triangle',
        start: 0,
        end: 0.85,
        freq: [set(0, 130.81)],
        gain: [set(0, FLOOR), lin(0.005, 0.1), exp(0.85, FLOOR)],
      },
    ],
  },
};

/** Arrays of length harmonics + 1; index 0 (DC) is 0. real[n] = 2·sin(nπ·duty) / (nπ). */
export function pulseWaveCoefficients(
  duty: number,
  harmonics: number,
): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) real[n] = (2 * Math.sin(n * Math.PI * duty)) / (n * Math.PI);
  return { real, imag };
}

/** `length` samples of 2r − 1 from createRng(seed): white noise that is the same every time. */
export function noiseSamples(length: number, seed = 0x5eed): Float32Array {
  const r = createRng(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = 2 * r() - 1;
  return out;
}

const pulseWaves = new WeakMap<BaseAudioContext, PeriodicWave>();

function pulse25(ctx: BaseAudioContext): PeriodicWave {
  let wave = pulseWaves.get(ctx);
  if (!wave) {
    const { real, imag } = pulseWaveCoefficients(0.25, 32);
    wave = ctx.createPeriodicWave(real, imag);
    pulseWaves.set(ctx, wave);
  }
  return wave;
}

function automate(param: AudioParam, ramps: readonly Ramp[], when: number): void {
  for (const r of ramps) {
    if (r.curve === 'set') param.setValueAtTime(r.v, when + r.t);
    else if (r.curve === 'lin') param.linearRampToValueAtTime(r.v, when + r.t);
    else param.exponentialRampToValueAtTime(r.v, when + r.t);
  }
}

/** Schedules every voice of `def` at `when`; returns a stop function (5-ms fade, then stop). */
export function scheduleSfx(
  ctx: BaseAudioContext,
  def: SfxDef,
  when: number,
  out: AudioNode,
  noise: AudioBuffer,
): () => void {
  const live: { source: AudioScheduledSourceNode; gain: GainNode }[] = [];
  for (const v of def.voices) {
    let source: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const b = ctx.createBufferSource();
      b.buffer = noise;
      source = b;
    } else {
      const o = ctx.createOscillator();
      if (v.wave === 'pulse25') o.setPeriodicWave(pulse25(ctx));
      else o.type = v.wave;
      automate(o.frequency, v.freq, when);
      source = o;
    }
    const gain = ctx.createGain();
    automate(gain.gain, v.gain, when);
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.frequency.setValueAtTime(v.filter.hz, when + v.start);
      source.connect(f);
      f.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(out);
    source.start(when + v.start);
    source.stop(when + v.end);
    live.push({ source, gain });
  }
  return () => {
    const t = ctx.currentTime;
    for (const { source, gain } of live) {
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(Math.max(FLOOR, gain.gain.value), t);
        gain.gain.exponentialRampToValueAtTime(FLOOR, t + FADE_S);
        source.stop(t + FADE_S);
      } catch {
        // Already stopped or the context is closed: nothing left to fade.
      }
    }
  };
}

type Getter = Pick<Storage, 'getItem'>;
type Setter = Pick<Storage, 'setItem'>;

/** localStorage, or null when reaching it throws (blocked storage, sandboxed frames). */
function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Sound is on only when the stored value is 'on'; anything else, or a storage error, is off. */
export function loadSoundOn(storage: Getter | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveSoundOn(on: boolean, storage: Setter | null = defaultStorage()): void {
  try {
    storage?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Blocked storage: the choice simply isn't remembered.
  }
}
