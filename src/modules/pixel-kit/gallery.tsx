import { StrictMode, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import '../../app/app.css';
import hang48 from '../../../tests/fixtures/pixel-kit/poses/hang-48.json';
import reachLeft48 from '../../../tests/fixtures/pixel-kit/poses/reach-left-48.json';
import { blit, createBuffer } from './buffer';
import type { Mood, PixelClimber } from './climber';
import { GripMeter, MoveCounter, Stars } from './hud/Hud';
import { PixelButton } from './hud/PixelButton';
import { PixelText } from './hud/PixelText';
import type { HoldMarker, ReachGap } from './markers';
import { DEFAULT_LOOK, OUTFITS, type OutfitId } from './outfits';
import { COLOR } from './palette';
import { PixelLayer, type PixelLayerProps } from './PixelLayer';
import type { ChalkPuff } from './puffs';
import { renderScene, type PixelScene } from './scene';
import type { SfxName } from './sfx';
import { SoundToggle } from './SoundToggle';
import type { PixelJoints, Pt } from './types';
import { sfxContextState, useSfx } from './useSfx';
import { artGrid, pixelSize, type PixelView } from './view';

// Dev-only gallery of the pixel layer (SPEC-pixel-kit › Testing, Tasks T11), served by Vite at
// /px-gallery.html. It is not exported from index.ts, and `vite build` only builds index.html;
// scripts/check-dist.ts fails the build if it ever leaks into dist/ (AC 45).
//   /px-gallery.html          fixed scenes for E2E (AC 41–44), a live showcase and the HUD
//   /px-gallery.html?bench    the frame-cost bench for spike/pixel-timing.mjs (AC 46)
//   /px-gallery.html?photo    an empty photo stage, filled by window.pxGallery.showPhoto (AC 49)

type SceneInput = PixelLayerProps['scene'];
type BoxView = Omit<PixelView, 'dpr'>;

interface FixedScene {
  view: BoxView;
  climberHeightPx: number;
  scene: SceneInput;
}

interface PhotoInput {
  src: string;
  /** Working-image width in image px; the photo is shown at the box width. */
  imageW: number;
  imageH: number;
  climberHeightPx: number;
  scene: SceneInput;
}

declare global {
  interface Window {
    pxGallery?: {
      /** RGBA that the page's own renderScene gives for a fixed scene, at this dpr. */
      expected(name: string): { width: number; height: number; px: number; rgba: number[] };
      setTime(ms: number): void;
      audioState(): string;
      showPhoto(input: PhotoInput): void;
    };
    pxBench?: (
      fixture: BenchFixture,
      opts?: { frames?: number; warmup?: number },
    ) => Promise<BenchResult>;
  }
}

const dpr = () => window.devicePixelRatio || 1;
const NO_LIMBS = { lh: true, rh: true, lf: true, rf: true } as const;

const climberOf = (
  pose: { joints: unknown; heightPx: number },
  over: Partial<PixelClimber> = {},
): PixelClimber => ({
  joints: pose.joints as PixelJoints,
  heightPx: pose.heightPx,
  outfit: OUTFITS.starter,
  look: DEFAULT_LOOK,
  gripping: NO_LIMBS,
  selected: null,
  mood: 'ok',
  ...over,
});

const box = (x: number, y: number, w = 6, h = 6) => ({ x, y, w, h });

/** Scenes whose pixels the E2E compares with renderScene (AC 41) or across time (AC 44). */
const FIXED: Record<string, FixedScene> = {
  'hang-48': {
    view: { scale: 4, tx: 90, ty: 46, boxW: 343, boxH: 333 },
    climberHeightPx: 48,
    scene: { climber: climberOf(hang48), markers: [], gaps: [], puffs: [] },
  },
  // A target and a puff only: the puff is the only chalk on this stage.
  motion: {
    view: { scale: 4, tx: 0, ty: 0, boxW: 343, boxH: 200 },
    climberHeightPx: 48,
    scene: {
      climber: null,
      markers: [{ holdId: 't', role: 'target', bbox: box(14, 12, 8, 8), limb: 'lh' }],
      gaps: [],
      puffs: [{ seed: 7, at: { x: 62, y: 30 }, bornMs: 0 }],
    },
  },
};

function fixedTime(name: string, t: number): number {
  return name === 'motion' ? t : 0;
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function expectedRgba(name: string, t: number) {
  const f = FIXED[name];
  if (!f) throw new Error(`No fixed scene "${name}"`);
  const view: PixelView = { ...f.view, dpr: dpr() };
  const px = pixelSize(f.climberHeightPx, view);
  const grid = artGrid(view, px);
  const buf = renderScene(createBuffer(grid.width, grid.height), grid, {
    ...f.scene,
    timeMs: fixedTime(name, t),
    reducedMotion: reducedMotion(),
  });
  const rgba = new Uint8ClampedArray(4 * grid.width * grid.height);
  blit(buf, rgba);
  return { width: grid.width, height: grid.height, px, rgba: [...rgba] };
}

/** A positioned, overflow-clipped box (P3) holding a PixelLayer. */
function Stage({
  name,
  view,
  climberHeightPx,
  scene,
  clock,
  background = 'black',
  children,
  time,
}: FixedScene & {
  name: string;
  clock?: () => number;
  background?: string;
  children?: React.ReactNode;
  time?: number;
}) {
  const v = useMemo(() => ({ ...view, dpr: dpr() }), [view]);
  const style: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: view.boxW,
    maxWidth: '100%',
    height: view.boxH,
    background,
  };
  return (
    <div className="px-gallery-stage" data-scene={name} data-time={time} style={style}>
      {children}
      <PixelLayer view={v} climberHeightPx={climberHeightPx} scene={scene} clock={clock} />
    </div>
  );
}

const frozen = () => 0;

// ── the live showcase: every role, a reach gap, puffs on demand, outfits and moods ──

const SHOWCASE_MARKERS: HoldMarker[] = (() => {
  const j = reachLeft48.joints;
  const around = (p: Pt, w = 6, h = 5) => box(p.x - w / 2, p.y - h / 2, w, h);
  return [
    { holdId: 'lf', role: 'planned', bbox: around(j.lFoot), step: 1 },
    { holdId: 'rf', role: 'planned', bbox: around(j.rFoot), step: 2 },
    { holdId: 'rh', role: 'start', bbox: around(j.rHand) },
    { holdId: 'lh', role: 'start', bbox: around(j.lHand) },
    { holdId: 'top', role: 'finish', bbox: box(30, -12, 7, 5) },
    { holdId: 'next', role: 'target', bbox: box(33, 2, 6, 5), limb: 'rh' },
  ];
})();
const SHOWCASE_GAPS: ReachGap[] = [
  { limb: 'rh', from: reachLeft48.joints.rHand, to: { x: 36, y: 4.5 } },
];
const MOODS: Mood[] = ['ok', 'strain', 'fail'];
const OUTFIT_IDS = Object.keys(OUTFITS) as OutfitId[];
const SHOWCASE_VIEW: BoxView = { scale: 4, tx: 100, ty: 80, boxW: 343, boxH: 333 };

function Showcase() {
  const [outfit, setOutfit] = useState(0);
  const [mood, setMood] = useState(0);
  const [puffs, setPuffs] = useState<ChalkPuff[]>([]);
  const scene = useMemo<SceneInput>(
    () => ({
      climber: climberOf(reachLeft48, {
        outfit: OUTFITS[OUTFIT_IDS[outfit % OUTFIT_IDS.length]!],
        mood: MOODS[mood % MOODS.length]!,
        selected: 'rh',
        gripping: { lh: true, rh: false, lf: true, rf: true },
      }),
      markers: SHOWCASE_MARKERS,
      gaps: SHOWCASE_GAPS,
      puffs,
    }),
    [outfit, mood, puffs],
  );
  const chalk = () =>
    setPuffs((p) => [
      ...p.slice(-5),
      { seed: p.length + 1, at: reachLeft48.joints.lHand, bornMs: performance.now() },
    ]);
  return (
    <section>
      <h2>Showcase</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Stage
          name="showcase-dark"
          view={SHOWCASE_VIEW}
          climberHeightPx={48}
          scene={scene}
          background="dimgray"
        />
        <Stage
          name="showcase-light"
          view={SHOWCASE_VIEW}
          climberHeightPx={48}
          scene={scene}
          background="gainsboro"
        />
      </div>
      <div className="px-gallery-row">
        <PixelButton label="Outfit" onClick={() => setOutfit((o) => o + 1)} />
        <PixelButton label="Mood" onClick={() => setMood((m) => m + 1)} />
        <PixelButton label="Chalk" onClick={chalk} />
      </div>
    </section>
  );
}

// ── HUD ──

const SFX_NAMES: SfxName[] = ['tick', 'grab', 'slip', 'fall', 'send'];

function HudSection() {
  const { play } = useSfx();
  return (
    <section>
      <h2>HUD</h2>
      <div className="px-gallery-row">
        <PixelButton label="Undo" icon="undo" />
        <PixelButton label="Send" icon="send" />
        <PixelButton label="Back" icon="back" />
        <PixelButton label="Off" icon="fail" disabled />
        <SoundToggle />
      </div>
      <div className="px-gallery-row">
        <MoveCounter moves={7} />
        <Stars count={0} />
        <Stars count={2} />
        <Stars count={3} />
      </div>
      <div className="px-gallery-row">
        <GripMeter value={0.8} tone="ok" label="Grip" />
        <GripMeter value={0.45} tone="warn" label="Balance" />
        <GripMeter value={0.1} tone="fail" label="Grip, failing" />
      </div>
      <div className="px-gallery-row">
        <PixelText text="SEND!" scale={3} color={COLOR.sun} />
        <PixelText text="0O 1I 5S 8B 2Z" />
      </div>
      <p>Effects (turn Sound on first):</p>
      <div className="px-gallery-row">
        {SFX_NAMES.map((n) => (
          <PixelButton key={n} label={`Play ${n}`} onClick={() => play(n)} />
        ))}
      </div>
    </section>
  );
}

// ── photo stage (AC 49 real-photo check) ──

function PhotoStage({ input }: { input: PhotoInput }) {
  const [boxW, setBoxW] = useState(() => Math.min(window.innerWidth - 32, 900));
  useEffect(() => {
    const onResize = () => setBoxW(Math.min(window.innerWidth - 32, 900));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const scale = boxW / input.imageW;
  const view = useMemo<BoxView>(
    () => ({ scale, tx: 0, ty: 0, boxW, boxH: input.imageH * scale }),
    [scale, boxW, input.imageH],
  );
  return (
    <Stage name="photo" view={view} climberHeightPx={input.climberHeightPx} scene={input.scene}>
      <img src={input.src} alt="Wall photo" style={{ display: 'block', width: boxW }} />
    </Stage>
  );
}

// ── the page ──

function Gallery({ mode }: { mode: 'main' | 'photo' }) {
  const [t, setT] = useState(0);
  const [photo, setPhoto] = useState<PhotoInput | null>(null);
  const motionClock = useCallback(() => t, [t]);
  useEffect(() => {
    window.pxGallery = {
      expected: (name) => expectedRgba(name, t),
      setTime: (ms) => setT(ms),
      audioState: () => sfxContextState(),
      showPhoto: (input) => setPhoto(input),
    };
  }, [t]);

  if (mode === 'photo')
    return <main className="px-gallery">{photo && <PhotoStage input={photo} />}</main>;
  return (
    <main className="px-gallery" style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1>pixel-kit gallery</h1>
      <p>Dev only. Every sprite, icon, glyph and sound here is original to Bloc Hall.</p>
      <section>
        <h2>hang-48</h2>
        <Stage name="hang-48" {...FIXED['hang-48']!} clock={frozen} />
      </section>
      <section>
        <h2>Target and puff (fake clock)</h2>
        <Stage name="motion" {...FIXED.motion!} clock={motionClock} time={t} />
      </section>
      <Showcase />
      <HudSection />
    </main>
  );
}

// ── bench (AC 46) ──

export type BenchFixture = 'busy' | 'busy-desktop';
export interface BenchResult {
  fixture: BenchFixture;
  grid: string;
  frames: number;
  medianMs: number;
  p90Ms: number;
  maxMs: number;
}

const BENCH_GRID: Record<BenchFixture, [number, number]> = {
  busy: [260, 260],
  'busy-desktop': [700, 500],
};

/** A climber at art height 60, 20 markers, 2 reach gaps and 6 live puffs on a w × h grid. */
function benchScene(w: number, h: number): (t: number) => PixelScene {
  const k = 60 / 48;
  const ox = w / 2 - 20.5 * k;
  const oy = h / 2 - 30 * k;
  const joints = Object.fromEntries(
    Object.entries(hang48.joints).map(([n, j]) => [
      n,
      { x: ox + j.x * k, y: oy + j.y * k, z: j.z },
    ]),
  ) as PixelJoints;
  const climber = climberOf({ joints, heightPx: 60 }, { selected: 'lh' });
  const roles: HoldMarker['role'][] = ['planned', 'start', 'planned', 'finish', 'planned'];
  const markers: HoldMarker[] = Array.from({ length: 20 }, (_, i) => {
    const role = i === 19 ? 'target' : roles[i % roles.length]!;
    const size = 4 + ((i * 7) % 26);
    return {
      holdId: `h${i}`,
      role,
      bbox: box(10 + ((i * 53) % (w - 50)), 14 + ((i * 37) % (h - 50)), size, size * 0.8),
      step: role === 'planned' ? i + 1 : undefined,
      limb: role === 'target' ? 'rh' : undefined,
    };
  });
  const gaps: ReachGap[] = [
    { limb: 'lh', from: joints.lHand, to: { x: joints.lHand.x - 20, y: joints.lHand.y - 15 } },
    { limb: 'rf', from: joints.rFoot, to: { x: joints.rFoot.x + 25, y: joints.rFoot.y - 5 } },
  ];
  return (t) => ({
    climber,
    markers,
    gaps,
    puffs: Array.from({ length: 6 }, (_, i) => ({
      seed: i + 1,
      at: { x: 30 + i * ((w - 60) / 5), y: h * 0.3 + (i % 2) * 40 },
      bornMs: t - 40 - 90 * i,
    })),
    timeMs: t,
    reducedMotion: false,
  });
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

async function bench(
  fixture: BenchFixture,
  { frames = 200, warmup = 20 }: { frames?: number; warmup?: number } = {},
): Promise<BenchResult> {
  const [w, h] = BENCH_GRID[fixture];
  const grid = artGrid({ scale: 1, tx: 0, ty: 0, boxW: w, boxH: h, dpr: 1 }, 1);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.className = 'px-gallery-bench';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(w, h);
  const buf = createBuffer(w, h);
  const sceneAt = benchScene(w, h);
  const times: number[] = [];
  for (let i = 0; i < warmup + frames; i++) {
    await nextFrame();
    const scene = sceneAt(i * 16);
    const t0 = performance.now();
    renderScene(buf, grid, scene);
    blit(buf, image.data);
    ctx.putImageData(image, 0, 0);
    const dt = performance.now() - t0;
    if (i >= warmup) times.push(dt);
  }
  canvas.remove();
  times.sort((a, b) => a - b);
  const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))]!;
  return {
    fixture,
    grid: `${w}x${h}`,
    frames,
    medianMs: (times[(frames - 1) >> 1]! + times[frames >> 1]!) / 2,
    p90Ms: q(0.9),
    maxMs: times.at(-1)!,
  };
}

// ── mount ──

const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root')!);
if (params.has('bench')) {
  window.pxBench = bench;
  root.render(<p style={{ padding: 16 }}>pixel-kit bench: call window.pxBench('busy').</p>);
} else {
  root.render(
    <StrictMode>
      <Gallery mode={params.has('photo') ? 'photo' : 'main'} />
    </StrictMode>,
  );
}
