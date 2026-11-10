import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  blit,
  createBuffer,
  resizeBuffer,
  SoundToggle,
  useReducedMotion,
  useSfx,
  type PixelBuffer,
} from '../pixel-kit';
import { LevelDialog } from './LevelDialog';
import { placeAt, placesFor, stripFor, type Place } from './places';
import type { Level, Profile } from './profile';
import { ART_H, cameraFor, renderHub, worldWidth } from './render';
import {
  dashSpeedup,
  easeCamera,
  idleFrame,
  neighbourPlace,
  stageLayout,
  walkBounds,
} from './stage';
import { IDLE_MS } from './sprites';
import { idle, step, type WalkInput, type WalkState } from './walk';

interface Props {
  /** With the level question on: null until it is answered or dismissed this session (G8). */
  profile: Profile | null;
  samples: readonly { id: string; name: string }[];
  /**
   * The front desk's level question (G8). Off since Amendment 2026-11-02 W3: the app passes none,
   * so the question, and with it a beginner's gym (G9), stays unreachable until the level is asked
   * again (W5). Passing it turns the old behaviour back on, whole.
   */
  levelQuestion?: { onAnswer: (level: Level) => void; onDismiss: () => void };
  /** Bays, doors: the app root maps a place to a route. Desk and lockers stay in the hub. */
  onUse: (place: Place) => void;
}

/** The prompt button's words for each place (G6). */
function actionFor(p: Place): string {
  if (p.kind === 'desk') return 'Talk to Mags';
  if (p.kind === 'lockers') return 'Change your level';
  if (p.kind === 'bay') return `Climb ${p.label}`;
  if (p.kind === 'new-wall') return 'Open a new wall';
  return 'Enter the Setting Room';
}

/** Inputs whose ←/→ move something of their own (a caret, a value); only these keep the keys. */
const KEYS_FREE_INPUTS = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'file',
  'image',
  'color',
]);

/**
 * W1: a focused dialog, text field or select keeps ←/→ for itself (so do other inputs whose
 * arrows move a value, such as a slider or radio group); anywhere else they walk the climber.
 */
function keepsArrows(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('dialog, [role="dialog"], [role="alertdialog"]')) return true;
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !KEYS_FREE_INPUTS.has(el.type);
}

/** How near (art px) a tap must land to a place's x to count as tapping that place. */
const TAP_REACH = 22;
/** A first visit starts at the front desk, facing into the gym (G13). */
const START_X = placesFor('gym', [])[0]!.x;

/** The loop's mutable state. It lives in a ref, so it survives the gym being hidden (G13). */
interface Game {
  walk: WalkState;
  /** The camera's left edge (fractional while easing); null until the first frame. */
  cam: number | null;
  /** The arrow key held down, if any. */
  held: -1 | 0 | 1;
  /** A tap or strip trip not yet given to `step`. */
  input: WalkInput | null;
  /** Time multiplier for the current trip (a strip dash, G7). */
  speed: number;
  /** A strip trip uses its place on arrival. */
  arrive: Place | null;
  last: number | null;
  raf: number | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** null while hidden (Root's `hidden`) or before the first size. */
  layout: { width: number } | null;
  ctx: CanvasRenderingContext2D | null;
  buf: PixelBuffer;
  image: ImageData | null;
  drawn: string;
  frames: number;
  here: string | null;
}

const newGame = (): Game => ({
  walk: idle(START_X, 1),
  cam: null,
  held: 0,
  input: null,
  speed: 1,
  arrive: null,
  last: null,
  raf: undefined,
  timer: undefined,
  layout: null,
  ctx: null,
  buf: createBuffer(0, ART_H),
  image: null,
  drawn: '',
  frames: 0,
  here: null,
});

/**
 * The gym (SPEC-gym-hub). A pixel canvas where the climber walks between places, the prompt for
 * the place it stands at, and the quick-travel strip (G7) and front desk's question (G8) as the
 * DOM path to every place. The canvas loop draws only while something moves or animates, and
 * sleeps otherwise (G15); it pauses entirely while Root hides the gym.
 */
export function HubScreen({ profile, samples, levelQuestion, onUse }: Props) {
  const level = profile?.level ?? 'gym';
  const places = placesFor(level, samples);
  const reduced = useReducedMotion();
  const { play } = useSfx();
  const [asking, setAsking] = useState<'first' | 'lockers' | null>(
    levelQuestion && !profile ? 'first' : null,
  );
  const [here, setHere] = useState<string | null>(() => placeAt(places, START_X)?.id ?? null);
  const helpId = useId();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const gameRef = useRef<Game | null>(null);
  const game = () => (gameRef.current ??= newGame());
  // What the loop reads from the latest render; written after each commit, never during render.
  const live = useRef({
    places,
    reduced,
    enter: (() => {}) as (place: Place) => void,
    press: (() => {}) as (dir: -1 | 1) => void,
    release: () => {},
  });
  const hubRef = useRef<HTMLElement>(null);

  /**
   * W4: the front desk and lockers stay in the scenery but do nothing for now (their behaviour is
   * designed later), so they get no strip button and a name-only prompt. Their old job was the
   * level question, which brings them back.
   */
  const usable = (p: Place) => !!levelQuestion || (p.kind !== 'desk' && p.kind !== 'lockers');

  const enter = (place: Place) => {
    if (!usable(place)) return;
    play('tick');
    if (place.kind === 'desk' || place.kind === 'lockers') {
      if (levelQuestion) setAsking('lockers');
    } else onUse(place);
  };

  /** Where the climber stands, for the prompt; set from events and the loop, never in render. */
  const settle = (g: Game) => {
    const moving = g.walk.targetX !== null || g.input !== null || g.held !== 0;
    const id = moving ? null : (placeAt(live.current.places, g.walk.x)?.id ?? null);
    if (id !== g.here) {
      g.here = id;
      setHere(id);
    }
  };

  /** Draws one frame if the picture changed, then schedules the next or sleeps (G15). */
  const frame = (now: number) => {
    const g = game();
    g.raf = undefined;
    g.timer = undefined;
    const canvas = canvasRef.current;
    if (!g.layout || !g.ctx || !canvas) return;
    const { places: ps, reduced: still } = live.current;
    const dt = g.last === null ? 0 : Math.min(now - g.last, 100);
    g.last = now;

    const input = g.input ?? (g.held ? ({ kind: 'hold', dir: g.held } as const) : null);
    g.input = null;
    if (input || g.walk.targetX !== null) {
      const scale = input?.kind === 'hold' ? 1 : g.speed;
      g.walk = step(g.walk, input, dt * scale, walkBounds(ps));
    }
    // Arrived, or the key let go: stand idle (and breathe), never frozen mid-stride.
    if (!input && g.walk.targetX === null && g.held === 0 && g.walk.phaseMs > 0) {
      g.walk = idle(g.walk.x, g.walk.facing);
    }
    if (g.walk.targetX === null) {
      g.speed = 1;
      const arrived = g.arrive;
      g.arrive = null;
      if (arrived && Math.abs(arrived.x - g.walk.x) < 0.5) live.current.enter(arrived);
    }
    settle(g);

    const { width } = g.layout;
    const target = cameraFor(g.walk.x, width, worldWidth(ps));
    g.cam = g.cam === null ? target : easeCamera(g.cam, target, dt, still);
    const camX = Math.round(g.cam);
    const walking = g.walk.phaseMs > 0;
    const breath = idleFrame(now, still);
    const climber = {
      x: g.walk.x,
      facing: g.walk.facing,
      pose: walking ? ('walk' as const) : ('idle' as const),
      frame: walking ? g.walk.frame : breath,
    };
    const prompt = g.here ? (ps.find((p) => p.id === g.here) ?? null) : null;
    const ids = ps.map((p) => p.id).join(',');
    const key = `${Math.round(climber.x)}|${climber.facing}|${climber.pose}|${climber.frame}|${camX}|${g.here}|${ids}|${width}`;
    if (key !== g.drawn) {
      g.drawn = key;
      g.buf = resizeBuffer(g.buf, width, ART_H);
      renderHub(g.buf, { places: ps, climber, camX, prompt, bob: breath });
      if (g.image?.width !== width) g.image = g.ctx.createImageData(width, ART_H);
      blit(g.buf, g.image.data);
      g.ctx.putImageData(g.image, 0, 0);
      g.frames++;
      canvas.dataset.frames = String(g.frames);
      canvas.dataset.x = String(Math.round(g.walk.x));
      canvas.dataset.facing = String(g.walk.facing);
      canvas.dataset.pose = climber.pose;
      canvas.dataset.cam = String(camX);
      if (g.frames === 1) canvas.dataset.paintedAt = String(Math.round(now));
    }

    if (g.walk.targetX !== null || g.held !== 0 || g.cam !== target) {
      g.raf = requestAnimationFrame(frame);
    } else if (!still) {
      g.timer = setTimeout(() => frame(performance.now()), IDLE_MS - (now % IDLE_MS) + 1);
    }
  };

  /** Wakes the loop for new input (a no-op while hidden or without a canvas). */
  const kick = () => {
    const g = game();
    if (!g.layout || !g.ctx || g.raf !== undefined) return;
    if (g.timer !== undefined) clearTimeout(g.timer);
    g.timer = undefined;
    g.last = null;
    g.raf = requestAnimationFrame(frame);
  };

  /** Moving is instant under reduced motion (G14), and when there is no canvas to watch it in. */
  const instant = () => live.current.reduced || !game().layout || !game().ctx;

  const cutTo = (x: number) => {
    const g = game();
    const facing = x > g.walk.x ? 1 : x < g.walk.x ? -1 : g.walk.facing;
    g.walk = idle(x, facing);
    g.input = null;
    g.arrive = null;
    g.speed = 1;
    settle(g);
    kick();
  };

  const walkTo = (x: number, opts: { dash?: boolean; arrive?: Place } = {}) => {
    const g = game();
    if (instant()) {
      cutTo(x);
      if (opts.arrive) enter(opts.arrive);
      return;
    }
    g.input = { kind: 'goto', x };
    g.speed = opts.dash ? dashSpeedup(g.walk.x, x) : 1;
    g.arrive = opts.arrive ?? null;
    settle(g);
    kick();
  };

  /** A strip button walks there (dashing if far), then uses the place (G7). */
  const travel = (place: Place) => {
    const g = game();
    if (g.here === place.id && g.walk.targetX === null) enter(place);
    else if (place.kind === 'new-wall') {
      // A photo picker opens only inside the tap itself on iOS (WebKit's user-activation rule), so
      // the door opens now and the walk there is decoration.
      walkTo(place.x, { dash: true });
      enter(place);
    } else walkTo(place.x, { dash: true, arrive: place });
  };

  /** ← or → went down (held keys repeat; the walk only starts once). */
  const press = (dir: -1 | 1) => {
    const g = game();
    if (instant()) {
      const next = neighbourPlace(live.current.places, g.walk.x, dir);
      if (next) cutTo(next.x);
    } else if (g.held !== dir) {
      // Turn on the press itself, so even a tap shorter than a frame turns the climber.
      g.walk = { ...g.walk, facing: dir, targetX: null };
      g.held = dir;
      g.arrive = null;
      g.speed = 1;
      settle(g);
      kick();
    }
  };

  const release = () => {
    const g = game();
    if (!g.held) return;
    g.held = 0;
    kick();
  };

  // After every commit: the loop sees the latest places and settings, and redraws if they changed
  // the picture. A level change can shrink the gym (a beginner has no Setting Room), so the
  // climber is kept inside it; the next frame settles the prompt.
  useLayoutEffect(() => {
    live.current = { places, reduced, enter, press, release };
    const g = game();
    const [min, max] = walkBounds(places);
    if (g.walk.x < min || g.walk.x > max) {
      g.walk = idle(Math.min(max, Math.max(min, g.walk.x)), g.walk.facing);
    }
    kick();
  });

  // The canvas: sized from the stage box (G2), paused while that box is hidden.
  useEffect(() => {
    const canvas = canvasRef.current;
    const sizer = sizerRef.current;
    const g = game();
    if (!canvas || !sizer) return;
    g.ctx = canvas.getContext('2d');
    if (!g.ctx || typeof ResizeObserver === 'undefined') return;
    const pause = () => {
      if (g.raf !== undefined) cancelAnimationFrame(g.raf);
      if (g.timer !== undefined) clearTimeout(g.timer);
      g.raf = g.timer = undefined;
      // A walk cut short by leaving the gym never uses its place when the gym shows again, and a
      // key held while it hides (whose keyup the gym may never see) stops walking.
      g.arrive = null;
      g.held = 0;
    };
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      const l = stageLayout(width, height, window.devicePixelRatio || 1);
      if (!l.width) {
        g.layout = null;
        pause();
        return;
      }
      if (canvas.width !== l.width) canvas.width = l.width;
      if (canvas.height !== l.height) canvas.height = l.height;
      canvas.style.width = `${l.cssW}px`;
      canvas.style.height = `${l.cssH}px`;
      canvas.dataset.px = String(l.px);
      g.layout = { width: l.width };
      g.drawn = ''; // a resize, or a canvas shown again, repaints
      kick();
    });
    ro.observe(sizer);
    return () => {
      ro.disconnect();
      pause();
      g.layout = null;
    };
    // The loop reads everything else through refs; it is set up once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFloorClick = (e: MouseEvent) => {
    const g = game();
    const canvas = canvasRef.current;
    if (!canvas || !g.layout) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width + Math.round(g.cam ?? 0);
    const ps = live.current.places;
    const tapped = ps.find((p) => Math.abs(p.x - x) <= TAP_REACH);
    if (!tapped) return walkTo(x);
    if (g.here === tapped.id && g.walk.targetX === null) enter(tapped);
    else walkTo(tapped.x);
  };

  /**
   * W2: an on-screen ◀ or ▶ (touch screens) walks while it is held, like the arrow key. Activated
   * without a press (the keyboard, a screen reader), it walks to the next place that way instead.
   */
  const padDown = (e: PointerEvent<HTMLButtonElement>, dir: -1 | 1) => {
    if (e.button > 0) return; // a right or middle click
    // Keep the release coming here even if the finger slides off the button.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // No capture (jsdom, or the pointer is already gone): pointerup/cancel still release.
    }
    press(dir);
  };
  const padClick = (e: MouseEvent, dir: -1 | 1) => {
    if (e.detail !== 0) return; // the click that ends a press: the press already walked
    const next = neighbourPlace(live.current.places, game().walk.x, dir);
    if (next) walkTo(next.x);
  };

  /** Enter, Space or ↑ on the floor use the place you are at (←/→ are page-wide, below). */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const g = game();
    const at = g.here ? live.current.places.find((p) => p.id === g.here) : null;
    if (at) enter(at);
  };

  // W1: ←/→ walk the climber anywhere on the gym page, not only on the focused floor, unless the
  // focus keeps them (keepsArrows), a modifier is down (Alt+← is Back), or the gym is hidden.
  useEffect(() => {
    const arrow = (e: globalThis.KeyboardEvent) =>
      e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const onDown = (e: globalThis.KeyboardEvent) => {
      const dir = arrow(e);
      if (!dir || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const hub = hubRef.current;
      if (!hub || hub.closest('[hidden]') || keepsArrows(document.activeElement)) return;
      e.preventDefault();
      live.current.press(dir);
    };
    // A release always stops the walk, wherever the focus went meanwhile.
    const onUp = (e: globalThis.KeyboardEvent) => {
      if (arrow(e)) live.current.release();
    };
    const onBlur = () => live.current.release();
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /**
   * After the dialog closes, focus goes back to the strip (AC 8). The page behind is still inert
   * until the effect below runs after commit, and a browser can't focus inside an inert subtree,
   * so lift it here first (jsdom ignores inert; e2e/hub.spec.ts catches this).
   */
  const focusStrip = (placeId: string | null) => {
    behindRef.current?.removeAttribute('inert');
    const buttons = [...(stripRef.current?.querySelectorAll('button') ?? [])];
    (buttons.find((b) => b.dataset.place === placeId) ?? buttons[0])?.focus();
  };

  const herePlace = here ? places.find((p) => p.id === here) : undefined;

  const behindRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    behindRef.current?.toggleAttribute('inert', asking !== null);
  }, [asking]);

  return (
    <main className="hub" ref={hubRef}>
      {/* While the level question asks, the page behind it is inert (a true modal). */}
      <div ref={behindRef} data-behind="" style={{ display: 'contents' }}>
        <header className="hub-bar">
          <h1 className="hub-title">Bloc Hall</h1>
          <SoundToggle />
        </header>
        <div
          className="hub-stage"
          role="application"
          aria-label="Gym floor"
          aria-describedby={helpId}
          tabIndex={0}
          onClick={onFloorClick}
          onKeyDown={onKeyDown}
        >
          <div ref={sizerRef} className="hub-sizer" />
          <canvas ref={canvasRef} className="hub-canvas" aria-hidden="true" />
        </div>
        {/* W2: hold to walk, for touch screens; hidden where a fine pointer can hover (app.css). */}
        <div className="hub-pad">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className="hub-walk"
              aria-label={dir < 0 ? 'Walk left' : 'Walk right'}
              onPointerDown={(e) => padDown(e, dir)}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              // A long press would open the context menu (or the text callout) and end the walk.
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => padClick(e, dir)}
            >
              <span aria-hidden="true">{dir < 0 ? '◀' : '▶'}</span>
            </button>
          ))}
        </div>
        <p id={helpId} className="visually-hidden">
          Tap the floor or use the left and right arrow keys to walk. Enter uses the place you are
          at.
        </p>
        <div className="hub-prompt" aria-live="polite">
          {herePlace &&
            (usable(herePlace) ? (
              <button onClick={() => enter(herePlace)}>{actionFor(herePlace)}</button>
            ) : (
              <span className="hub-prompt-name">{herePlace.label}</span>
            ))}
        </div>
        <nav aria-label="Gym" className="hub-strip" ref={stripRef}>
          {stripFor(level, places)
            .filter(usable)
            .map((p) => (
              <button key={p.id} data-place={p.id} onClick={() => travel(p)}>
                {p.label}
              </button>
            ))}
        </nav>
      </div>
      {asking && levelQuestion && (
        <LevelDialog
          current={asking === 'lockers' ? (profile?.level ?? null) : null}
          onAnswer={(l) => {
            const from = asking;
            setAsking(null);
            levelQuestion.onAnswer(l);
            focusStrip(from === 'lockers' ? 'lockers' : null);
            // A beginner is walked to the first wall (G9); the Setting Room stays hidden.
            const firstBay = placesFor(l, samples).find((p) => p.kind === 'bay');
            if (l === 'beginner' && firstBay) walkTo(firstBay.x);
          }}
          onDismiss={() => {
            const from = asking;
            setAsking(null);
            // Only the first visit's "Not now" sets the default; the lockers keep the answer.
            if (from === 'first') levelQuestion.onDismiss();
            focusStrip(from === 'lockers' ? 'lockers' : null);
          }}
        />
      )}
    </main>
  );
}
