import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  asContext,
  FakeAudioContext,
  FakeGain,
  FakeNode,
  type ParamCall,
} from '../../../tests/fakeAudio';
import {
  loadSoundOn,
  MASTER_GAIN,
  MAX_VOICES_AT_ONCE,
  noiseSamples,
  pulseWaveCoefficients,
  saveSoundOn,
  scheduleSfx,
  SFX,
  SOUND_KEY,
  type Ramp,
  type SfxName,
  type Voice,
} from './sfx';

// SPEC-pixel-kit › Sound Effects; AC 17b (sfx.ts), 23 (noise), 30–33. No audio is played: the
// effects are data, and scheduling is checked on a recording fake context.

const NAMES: SfxName[] = ['tick', 'grab', 'slip', 'fall', 'send'];
const FLOOR = 0.0001;

const set = (t: number, v: number): Ramp => ({ t, v, curve: 'set' });
const lin = (t: number, v: number): Ramp => ({ t, v, curve: 'lin' });
const exp = (t: number, v: number): Ramp => ({ t, v, curve: 'exp' });

/** Each lead note: 0.0001 at its start → 0.14 over 5 ms → hold → 0.0001 over its last 20 ms. */
const note = (a: number, b: number) => [
  set(a, FLOOR),
  lin(a + 0.005, 0.14),
  set(b - 0.02, 0.14),
  exp(b, FLOOR),
];

/** The spec's table, written out from SPEC-pixel-kit › Sound Effects. */
const TABLE: Record<SfxName, { duration: number; voices: Omit<Voice, 'end'>[] }> = {
  tick: {
    duration: 0.035,
    voices: [
      {
        wave: 'square',
        start: 0,
        freq: [set(0, 1320)],
        gain: [set(0, 0), lin(0.002, 0.12), exp(0.03, FLOOR)],
      },
    ],
  },
  grab: {
    duration: 0.1,
    voices: [
      {
        wave: 'pulse25',
        start: 0,
        freq: [set(0, 392), exp(0.05, 784)],
        gain: [set(0, 0), lin(0.003, 0.16), set(0.04, 0.16), exp(0.09, FLOOR)],
      },
      {
        wave: 'noise',
        start: 0,
        freq: [],
        gain: [set(0, 0.06), exp(0.02, FLOOR)],
        filter: { type: 'highpass', hz: 3000 },
      },
    ],
  },
  slip: {
    duration: 0.24,
    voices: [
      {
        wave: 'square',
        start: 0,
        freq: [set(0, 660), exp(0.2, 330)],
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
  fall: {
    duration: 0.7,
    voices: [
      {
        wave: 'triangle',
        start: 0,
        freq: [set(0, 880), exp(0.55, 110)],
        gain: [set(0, 0.18), lin(0.5, 0.1), exp(0.6, FLOOR)],
      },
      {
        wave: 'noise',
        start: 0.55,
        freq: [],
        gain: [set(0.55, 0.25), exp(0.7, FLOOR)],
        filter: { type: 'lowpass', hz: 500 },
      },
    ],
  },
  send: {
    duration: 0.85,
    voices: [
      {
        wave: 'pulse25',
        start: 0,
        freq: [set(0, 392), set(0.12, 587.33), set(0.24, 493.88), set(0.36, 523.25)],
        gain: [...note(0, 0.1), ...note(0.12, 0.22), ...note(0.24, 0.34), ...note(0.36, 0.8)],
      },
      {
        wave: 'triangle',
        start: 0,
        freq: [set(0, 130.81)],
        gain: [set(0, FLOOR), lin(0.005, 0.1), exp(0.85, FLOOR)],
      },
    ],
  },
};

const peak = (v: Voice) => Math.max(...v.gain.map((r) => r.v));
const lastT = (v: Voice) => Math.max(...[...v.freq, ...v.gain].map((r) => r.t));

describe('SFX table (AC 30)', () => {
  it('has the five effects, with the durations from the spec', () => {
    expect(Object.keys(SFX).sort()).toEqual([...NAMES].sort());
    const durations = { tick: 0.035, grab: 0.1, slip: 0.24, fall: 0.7, send: 0.85 };
    for (const n of NAMES) {
      expect(SFX[n].name).toBe(n);
      expect(SFX[n].duration).toBeCloseTo(durations[n], 3);
    }
  });

  it('matches the spec table voice by voice', () => {
    for (const n of NAMES) {
      const voices = SFX[n].voices;
      expect(voices.length, n).toBe(TABLE[n].voices.length);
      voices.forEach((v, i) => {
        const want = TABLE[n].voices[i]!;
        expect(v.wave, `${n}[${i}]`).toBe(want.wave);
        expect(v.start).toBeCloseTo(want.start, 9);
        expect(v.filter).toEqual(want.filter);
        for (const key of ['freq', 'gain'] as const) {
          expect(
            v[key].map((r) => r.curve),
            `${n}[${i}].${key}`,
          ).toEqual(want[key].map((r) => r.curve));
          v[key].forEach((r, k) => {
            expect(r.t, `${n}[${i}].${key}[${k}].t`).toBeCloseTo(want[key][k]!.t, 9);
            expect(r.v, `${n}[${i}].${key}[${k}].v`).toBeCloseTo(want[key][k]!.v, 9);
          });
        }
      });
    }
  });

  it('ends no voice, and schedules no ramp, after its effect', () => {
    for (const n of NAMES) {
      for (const v of SFX[n].voices) {
        expect(v.end, n).toBeLessThanOrEqual(SFX[n].duration + 1e-9);
        expect(lastT(v), n).toBeLessThanOrEqual(v.end + 1e-9);
        expect(v.start).toBeGreaterThanOrEqual(0);
        expect(v.start).toBeLessThan(v.end);
        // Ramps run forward in time, from the voice's start.
        for (const ramps of [v.freq, v.gain]) {
          ramps.forEach((r, k) => {
            expect(r.t).toBeGreaterThanOrEqual(k ? ramps[k - 1]!.t : v.start);
          });
        }
      }
    }
  });

  it('peaks each voice at ≤ 0.25, and voices sounding together at ≤ 0.5', () => {
    for (const n of NAMES) {
      const vs = SFX[n].voices;
      for (const v of vs) {
        expect(peak(v), n).toBeLessThanOrEqual(0.25);
        const together = vs.filter((w) => w.start < v.end && v.start < w.end);
        expect(
          together.reduce((s, w) => s + peak(w), 0),
          n,
        ).toBeLessThanOrEqual(0.5);
      }
    }
    expect(MASTER_GAIN).toBe(0.5);
    expect(MAX_VOICES_AT_ONCE).toBe(4);
    // At most 4 effects × 0.5 per effect × the 0.5 master: nothing clips.
    expect(MAX_VOICES_AT_ONCE * 0.5 * MASTER_GAIN).toBeLessThanOrEqual(1);
  });

  it('keeps every exp target, and the value before it, at ≥ 0.0001', () => {
    for (const n of NAMES) {
      for (const v of SFX[n].voices) {
        for (const ramps of [v.freq, v.gain]) {
          ramps.forEach((r, k) => {
            if (r.curve !== 'exp') return;
            expect(k, `${n}: an exp ramp needs a value before it`).toBeGreaterThan(0);
            expect(r.v).toBeGreaterThanOrEqual(FLOOR);
            expect(ramps[k - 1]!.v).toBeGreaterThanOrEqual(FLOOR);
          });
        }
      }
    }
  });

  it('plays the send lead as 392.00, 587.33, 493.88 and 523.25 Hz, in that order', () => {
    expect(SFX.send.voices[0]!.freq.map((r) => r.v)).toEqual([392.0, 587.33, 493.88, 523.25]);
  });

  it('ends send with a turn onto C, not the 1-Up tail or the "Charge!" call', () => {
    const semis = SFX.send.voices[0]!.freq.map((r) => Math.round(12 * Math.log2(r.v / 392)));
    expect(semis).toEqual([0, 7, 4, 5]); // G4 D5 B4 C5
    const steps = semis.slice(1).map((v, i) => v - semis[i]!);
    expect(steps.every((d) => d > 0)).toBe(false); // not a rising arpeggio like G C E G
    expect(steps.slice(1)).not.toEqual([2, 5]); // not the C–D–G tail
    // The stars land on the last three notes (SPEC-game): three notes, each ≥ 100 ms apart.
    const starts = SFX.send.voices[0]!.freq.map((r) => r.t);
    expect(starts.slice(1)).toEqual([0.12, 0.24, 0.36]);
  });
});

describe('pulseWaveCoefficients (AC 31)', () => {
  it('gives the 25 % pulse: length 33, real[1] 0.45016, real[2] 0.31831, imag all 0', () => {
    const { real, imag } = pulseWaveCoefficients(0.25, 32);
    expect(real).toHaveLength(33);
    expect(imag).toHaveLength(33);
    expect(real[0]).toBe(0);
    expect(real[1]).toBeCloseTo(0.45016, 5);
    expect(real[2]).toBeCloseTo(0.31831, 5);
    for (let n = 1; n <= 32; n++) {
      expect(real[n]).toBeCloseTo((2 * Math.sin((n * Math.PI) / 4)) / (n * Math.PI), 6);
    }
    expect([...imag].every((v) => v === 0)).toBe(true);
  });
});

describe('noiseSamples (AC 23)', () => {
  it('fills 2r − 1 from createRng(0x5eed) by default', () => {
    const s = noiseSamples(2);
    expect(s).toBeInstanceOf(Float32Array);
    expect(s[0]).toBeCloseTo(0.420064, 6);
    expect(s[1]).toBeCloseTo(-0.427327, 6);
    expect(noiseSamples(2, 0x5eed)).toEqual(s);
    expect(noiseSamples(2, 1)).not.toEqual(s);
    const long = noiseSamples(8000);
    expect(long).toHaveLength(8000);
    expect(long.every((v) => v >= -1 && v < 1)).toBe(true);
  });
});

describe('scheduleSfx (AC 32)', () => {
  const WHEN = 2;
  const noise = { fake: 'noise buffer' } as unknown as AudioBuffer;

  const expectedCalls = (ramps: readonly Ramp[]): ParamCall[] =>
    ramps.map((r) => [r.curve, r.v, WHEN + r.t]);

  for (const name of NAMES) {
    it(`builds ${name} from the table, offset by \`when\``, () => {
      const ctx = new FakeAudioContext();
      const out = new FakeNode();
      scheduleSfx(asContext(ctx), SFX[name], WHEN, out as unknown as AudioNode, noise);
      const voices = SFX[name].voices;
      const oscs = ctx.of('oscillator');
      const bufs = ctx.of('buffer');
      const gains = ctx.of('gain');
      expect(oscs).toHaveLength(voices.filter((v) => v.wave !== 'noise').length);
      expect(bufs).toHaveLength(voices.filter((v) => v.wave === 'noise').length);
      expect(gains).toHaveLength(voices.length);
      expect(ctx.of('filter')).toHaveLength(voices.filter((v) => v.filter).length);

      let o = 0;
      let b = 0;
      voices.forEach((v, i) => {
        const gain = gains[i]!;
        expect(gain.gain.calls).toEqual(expectedCalls(v.gain));
        expect(gain.outputs).toEqual([out]);
        const source = v.wave === 'noise' ? bufs[b++]! : oscs[o++]!;
        if (source.kind === 'oscillator') {
          expect(source.frequency.calls).toEqual(expectedCalls(v.freq));
          if (v.wave === 'pulse25') {
            const { real, imag } = pulseWaveCoefficients(0.25, 32);
            expect(source.wave).toEqual({ real, imag });
          } else {
            expect(source.type).toBe(v.wave);
          }
        } else {
          expect(source.buffer).toBe(noise);
        }
        expect(source.starts).toEqual([WHEN + v.start]);
        expect(source.stops).toEqual([WHEN + v.end]);
        // source → (filter →) gain
        const next = source.outputs[0]!;
        if (v.filter) {
          const f = next as unknown as { type: string; frequency: { calls: ParamCall[] } };
          expect(f.type).toBe(v.filter.type);
          expect(f.frequency.calls).toEqual([['set', v.filter.hz, WHEN + v.start]]);
          expect((next as FakeNode).outputs).toEqual([gain]);
        } else {
          expect(next).toBe(gain);
        }
      });
    });
  }

  it('returns a stop that fades every voice to 0.0001 over 5 ms and stops it', () => {
    const ctx = new FakeAudioContext();
    scheduleSfx(asContext(ctx), SFX.fall, 0, new FakeNode() as unknown as AudioNode, noise);
    const stop = scheduleSfx(
      asContext(ctx),
      SFX.send,
      1,
      new FakeNode() as unknown as AudioNode,
      noise,
    );
    ctx.currentTime = 1.3;
    const sendGains = ctx.of('gain').slice(2) as FakeGain[];
    sendGains.forEach((g) => (g.gain.value = 0.14));
    stop();
    for (const g of sendGains) {
      expect(g.gain.calls.slice(-3)).toEqual([
        ['cancel', NaN, 1.3],
        ['set', 0.14, 1.3],
        ['exp', FLOOR, 1.305],
      ]);
    }
    const sources = [...ctx.of('oscillator'), ...ctx.of('buffer')];
    const sendSources = sources.filter((s) => s.starts[0]! >= 1);
    expect(sendSources).toHaveLength(2);
    for (const s of sendSources) expect(s.stops.at(-1)).toBeCloseTo(1.305, 9);
    // The other effect is untouched.
    for (const g of ctx.of('gain').slice(0, 2)) {
      expect(g.gain.calls.some((c) => c[0] === 'cancel')).toBe(false);
    }
  });
});

describe('saving the choice (AC 33)', () => {
  const store = (init: Record<string, string> = {}) => {
    const data = { ...init };
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => void (data[k] = v),
    };
  };
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };

  it('is off with no stored key, with a null storage, and for any value but "on"', () => {
    expect(SOUND_KEY).toBe('bouldering-vis:sound');
    expect(loadSoundOn(store())).toBe(false);
    expect(loadSoundOn(null)).toBe(false);
    expect(loadSoundOn(store({ [SOUND_KEY]: 'off' }))).toBe(false);
    expect(loadSoundOn(store({ [SOUND_KEY]: 'true' }))).toBe(false);
    expect(loadSoundOn(store({ [SOUND_KEY]: 'on' }))).toBe(true);
  });

  it('stays off, without throwing, when storage throws', () => {
    expect(loadSoundOn(throwing)).toBe(false);
    expect(() => saveSoundOn(true, throwing)).not.toThrow();
    expect(() => saveSoundOn(true, null)).not.toThrow();
  });

  it('writes "on" and "off" under bouldering-vis:sound', () => {
    const s = store();
    saveSoundOn(true, s);
    expect(s.data[SOUND_KEY]).toBe('on');
    expect(loadSoundOn(s)).toBe(true);
    saveSoundOn(false, s);
    expect(s.data[SOUND_KEY]).toBe('off');
    expect(loadSoundOn(s)).toBe(false);
  });

  it('defaults to localStorage, and to off when reaching it throws', () => {
    localStorage.clear();
    expect(loadSoundOn()).toBe(false);
    saveSoundOn(true);
    expect(localStorage.getItem(SOUND_KEY)).toBe('on');
    expect(loadSoundOn()).toBe(true);
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadSoundOn()).toBe(false);
    expect(() => saveSoundOn(false)).not.toThrow();
    spy.mockRestore();
    localStorage.clear();
  });
});

describe('provenance (AC 17b)', () => {
  it('precedes every effect in sfx.ts with a provenance comment', () => {
    const lines = readFileSync(join(import.meta.dirname, 'sfx.ts'), 'utf8').split('\n');
    const defs = lines.flatMap((line, i) =>
      /^\s*(tick|grab|slip|fall|send): \{$/.test(line) ? [i] : [],
    );
    expect(defs).toHaveLength(5);
    for (const i of defs) {
      expect(lines[i - 1], lines[i]).toMatch(
        /^\s*\/\/ original, composed for Bloc Hall, \d{4}-\d{2}-\d{2}(; [a-z -]+ \d{4}-\d{2}-\d{2} \(originality review\))?$/,
      );
    }
  });
});
