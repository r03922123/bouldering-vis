// A recording stand-in for Web Audio (SPEC-pixel-kit › Testing: sound is tested through its
// parameters; no audio is played). Every node and AudioParam call is kept for assertions.

export type ParamCall = [method: 'set' | 'lin' | 'exp' | 'cancel', value: number, time: number];

export class FakeParam {
  value: number;
  calls: ParamCall[] = [];
  constructor(value = 1) {
    this.value = value;
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['lin', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(['exp', v, t]);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', NaN, t]);
    return this;
  }
}

export class FakeNode {
  outputs: FakeNode[] = [];
  connect(n: FakeNode) {
    this.outputs.push(n);
    return n;
  }
  disconnect() {}
}

export class FakeSource extends FakeNode {
  starts: number[] = [];
  stops: number[] = [];
  start(t = 0) {
    this.starts.push(t);
  }
  stop(t = 0) {
    this.stops.push(t);
  }
}

export class FakeOscillator extends FakeSource {
  kind = 'oscillator' as const;
  type: string = 'sine';
  frequency = new FakeParam(440);
  wave: unknown = null;
  setPeriodicWave(w: unknown) {
    this.wave = w;
    this.type = 'custom';
  }
}

export class FakeBufferSource extends FakeSource {
  kind = 'buffer' as const;
  buffer: unknown = null;
  loop = false;
}

export class FakeGain extends FakeNode {
  kind = 'gain' as const;
  gain = new FakeParam(1);
}

export class FakeFilter extends FakeNode {
  kind = 'filter' as const;
  type = 'lowpass';
  frequency = new FakeParam(350);
}

export class FakeAudioBuffer {
  channels: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c: number) {
    return this.channels[c]!;
  }
  copyToChannel(src: Float32Array, c: number) {
    this.channels[c]!.set(src);
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' | 'closed' | 'interrupted' = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  nodes: (FakeOscillator | FakeBufferSource | FakeGain | FakeFilter)[] = [];
  waves: { real: Float32Array; imag: Float32Array }[] = [];
  resumes = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    return this.add(new FakeOscillator());
  }
  createBufferSource() {
    return this.add(new FakeBufferSource());
  }
  createGain() {
    return this.add(new FakeGain());
  }
  createBiquadFilter() {
    return this.add(new FakeFilter());
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeAudioBuffer(channels, length, rate);
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    const w = { real, imag };
    this.waves.push(w);
    return w;
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  private add<T extends FakeOscillator | FakeBufferSource | FakeGain | FakeFilter>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  of<K extends 'oscillator' | 'buffer' | 'gain' | 'filter'>(kind: K) {
    return this.nodes.filter((n) => n.kind === kind) as Extract<
      FakeOscillator | FakeBufferSource | FakeGain | FakeFilter,
      { kind: K }
    >[];
  }
}

/** The fake as the type scheduleSfx and the player expect. */
export const asContext = (c: FakeAudioContext) => c as unknown as BaseAudioContext;
