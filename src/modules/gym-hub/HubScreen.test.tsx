import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { HubScreen } from './HubScreen';
import { placesFor, type Place } from './places';
import { profileFor, type Level } from './profile';

// SPEC-gym-hub G5–G9, G13–G15 and AC 5, 8–11, 14. jsdom has no canvas (tests/setup.ts makes
// getContext return null) and no ResizeObserver; the "with a canvas" tests stub both, plus a fake
// clock for requestAnimationFrame and timers, and count the frames put on the canvas.

const SAMPLES = [
  { id: 'routemake-g2-b1', name: 'Wall 1' },
  { id: 't-up-d2', name: 'Wall 2' },
];
const GYM = placesFor('gym', SAMPLES);
const X = Object.fromEntries(GYM.map((p) => [p.id, p.x]));

const strip = () => screen.getByRole('navigation', { name: 'Gym' });
const stripButton = (name: string) =>
  [...strip().querySelectorAll('button')].find((b) => b.textContent === name)!;
const canvas = () => document.querySelector<HTMLCanvasElement>('canvas.hub-canvas')!;
const floor = () => screen.getByRole('application', { name: 'Gym floor' });
const prompt = () => document.querySelector<HTMLElement>('.hub-prompt')!;

function renderHub(
  over: {
    level?: Level | null;
    onUse?: (p: Place) => void;
    onAnswer?: (l: Level) => void;
    /** Turns the front desk's level question back on (off since W3; the code stays, W5). */
    ask?: boolean;
  } = {},
) {
  const level = over.level === undefined ? 'gym' : over.level;
  const props = {
    profile: level ? profileFor(level) : null,
    samples: SAMPLES,
    ...(over.ask
      ? { levelQuestion: { onAnswer: over.onAnswer ?? (() => {}), onDismiss: () => {} } }
      : {}),
    onUse: over.onUse ?? (() => {}),
  };
  const r = render(<HubScreen {...props} />);
  return { ...r, props };
}

describe('HubScreen without a canvas (the DOM path, G7)', () => {
  it('has an aria-hidden canvas in a labelled floor, a prompt and the strip (AC 1, 16)', () => {
    renderHub();
    expect(canvas()).toHaveAttribute('aria-hidden', 'true');
    expect(floor()).toContainElement(canvas());
    expect(floor()).toHaveAttribute('tabindex', '0');
    expect(prompt()).toHaveTextContent('Front desk'); // the place you start at (W4: name only)
    expect(screen.getByRole('button', { name: 'Sound' })).toBeVisible();
    expect(stripButton('Wall 1')).toBeEnabled();
  });

  it('uses a place from the strip at once when nothing can be drawn', () => {
    const onUse = vi.fn();
    renderHub({ onUse });
    fireEvent.click(stripButton('Wall 2'));
    expect(onUse).toHaveBeenCalledWith(GYM.find((p) => p.id === 'bay:t-up-d2'));
    expect(screen.getByRole('button', { name: 'Climb Wall 2' })).toBeVisible();
  });

  it('opens the level question at the lockers, and gives focus back to the strip (AC 8)', () => {
    renderHub({ level: 'pro', ask: true });
    fireEvent.click(stripButton('Lockers'));
    const pro = screen.getByRole('button', { name: 'I climb hard, set or coach' });
    expect(pro).toHaveAttribute('aria-pressed', 'true');
    expect(pro).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stripButton('Lockers')).toHaveFocus();
  });

  it('gives focus to the strip after the first-visit answer', () => {
    renderHub({ level: null, ask: true });
    fireEvent.click(screen.getByRole('button', { name: 'I climb in gyms' }));
    expect(strip()).toContainElement(document.activeElement as HTMLElement);
  });

  it('walks place to place with the arrow keys and uses the place with Enter (AC 10)', () => {
    const onUse = vi.fn();
    renderHub({ onUse });
    fireEvent.keyDown(floor(), { key: 'ArrowRight' });
    fireEvent.keyDown(floor(), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Climb Wall 1' })).toBeVisible();
    fireEvent.keyDown(floor(), { key: 'Enter' });
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'bay:routemake-g2-b1' }));
  });

  it('keeps the front desk and lockers as scenery: no strip button, a name-only prompt (W4)', () => {
    const onUse = vi.fn();
    renderHub({ onUse });
    expect([...strip().querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Wall 1',
      'Wall 2',
      'New wall',
      'Setting Room',
    ]);
    for (const name of ['Front desk', 'Lockers']) {
      expect(prompt()).toHaveTextContent(name);
      expect(prompt().querySelector('button')).toBeNull();
      fireEvent.keyDown(floor(), { key: 'Enter' }); // does nothing
      fireEvent.keyDown(floor(), { key: 'ArrowRight' });
    }
    expect(prompt()).toHaveTextContent('Climb Wall 1');
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives the front desk and lockers their buttons back with the level question (W5)', () => {
    renderHub({ ask: true });
    expect(screen.getByRole('button', { name: 'Talk to Mags' })).toBeVisible();
    expect(stripButton('Front desk')).toBeEnabled();
    expect(stripButton('Lockers')).toBeEnabled();
  });

  it('has no Setting Room for a beginner (AC 9)', () => {
    renderHub({ level: 'beginner' });
    expect(stripButton('Setting Room')).toBeUndefined();
  });
});

describe('HubScreen: ←/→ walk anywhere on the gym page (Amendment 2026-11-02 W1)', () => {
  const body = () => document.body;

  it('walks with ←/→ while nothing has focus, and Enter on the floor still uses the place', () => {
    const onUse = vi.fn();
    renderHub({ onUse });
    expect(document.activeElement).toBe(body());
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    expect(prompt()).toHaveTextContent('Climb Wall 1');
    fireEvent.keyDown(body(), { key: 'ArrowLeft' });
    expect(prompt()).toHaveTextContent('Lockers');
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    fireEvent.keyDown(floor(), { key: 'Enter' });
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'bay:routemake-g2-b1' }));
  });

  it('walks while a strip button has focus, without pressing it', () => {
    const onUse = vi.fn();
    renderHub({ onUse });
    stripButton('Wall 2').focus();
    fireEvent.keyDown(stripButton('Wall 2'), { key: 'ArrowRight' });
    expect(prompt()).toHaveTextContent('Lockers');
    expect(onUse).not.toHaveBeenCalled();
  });

  it('leaves ←/→ to a focused text field, select or dialog', () => {
    render(
      <>
        <HubScreen profile={profileFor('gym')} samples={SAMPLES} onUse={() => {}} />
        <input aria-label="Name" />
        <textarea aria-label="Notes" />
        <select aria-label="Grade">
          <option>V3</option>
        </select>
        <div role="dialog" aria-label="Sheet">
          <button>OK</button>
        </div>
        <div role="alertdialog" aria-label="Confirm">
          <button>Keep my route</button>
        </div>
      </>,
    );
    const owners = [
      screen.getByRole('textbox', { name: 'Name' }),
      screen.getByRole('textbox', { name: 'Notes' }),
      screen.getByRole('combobox', { name: 'Grade' }),
      screen.getByRole('button', { name: 'OK' }),
      screen.getByRole('button', { name: 'Keep my route' }),
    ];
    for (const el of owners) {
      el.focus();
      const e = createEvent.keyDown(el, { key: 'ArrowRight' });
      fireEvent(el, e);
      expect(e.defaultPrevented).toBe(false); // the caret (or the option) still moves
      expect(prompt()).toHaveTextContent('Front desk');
    }
  });

  it('ignores ←/→ with a modifier (Alt+← is the browser’s Back)', () => {
    renderHub();
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      fireEvent.keyDown(body(), { key: 'ArrowRight', [mod]: true });
    }
    expect(prompt()).toHaveTextContent('Front desk');
  });

  it('ignores ←/→ while the gym is hidden (another screen shows)', () => {
    render(
      <div hidden>
        <HubScreen profile={profileFor('gym')} samples={SAMPLES} onUse={() => {}} />
      </div>,
    );
    const e = createEvent.keyDown(body(), { key: 'ArrowRight' });
    fireEvent(body(), e);
    expect(e.defaultPrevented).toBe(false);
    expect(prompt()).toHaveTextContent('Front desk');
  });

  it('stops listening once unmounted', () => {
    // A leaked listener would return early anyway once the hub's ref is gone, so the check is
    // on the listener itself: the very keydown handler added is the one removed (review).
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHub();
    const added = add.mock.calls.filter(([type]) => String(type) === 'keydown').map(([, fn]) => fn);
    expect(added.length).toBeGreaterThan(0);
    unmount();
    const removed = remove.mock.calls
      .filter(([type]) => String(type) === 'keydown')
      .map(([, fn]) => fn);
    for (const fn of added) expect(removed).toContain(fn);
    add.mockRestore();
    remove.mockRestore();
  });
});

describe('HubScreen: the on-screen ◀ ▶ buttons (Amendment 2026-11-02 W2)', () => {
  const pad = (name: 'Walk left' | 'Walk right') => screen.getByRole('button', { name });

  it('sits right under the floor, one button per direction', () => {
    renderHub();
    const left = pad('Walk left');
    const right = pad('Walk right');
    expect(left.closest('.hub-pad')).toBe(right.closest('.hub-pad'));
    expect(floor().nextElementSibling).toBe(left.closest('.hub-pad'));
    expect(left).toHaveAttribute('type', 'button');
  });

  it('steps one place along when activated without a press (keyboard, screen reader)', () => {
    renderHub();
    fireEvent.click(pad('Walk right'), { detail: 0 });
    expect(prompt()).toHaveTextContent('Lockers');
    fireEvent.click(pad('Walk left'), { detail: 0 });
    expect(prompt()).toHaveTextContent('Front desk');
  });

  it('keeps the long-press menu away, so a held button keeps walking', () => {
    renderHub();
    const e = createEvent.contextMenu(pad('Walk right'));
    fireEvent(pad('Walk right'), e);
    expect(e.defaultPrevented).toBe(true);
  });
});

// ── With a canvas ──

let puts = 0;
let observe: ((w: number, h: number) => void) | null = null;
let reduce = false;
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  puts = 0;
  observe = null;
  reduce = false;
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function withCanvas() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  // Only the gym canvas's frames count (the sound toggle's icon is a canvas too).
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const hub = this.classList.contains('hub-canvas');
    return {
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(4 * w * h),
      }),
      putImageData: () => {
        if (hub) puts++;
      },
    };
  } as unknown as HTMLCanvasElement['getContext'];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        observe = (width, height) =>
          this.cb(
            [{ contentRect: { width, height } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      disconnect() {
        observe = null;
      }
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: reduce,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Shows the stage at a phone's size (Root un-hides the gym). */
const show = () => act(() => observe!(375, 324));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const climberX = () => Number(canvas().dataset.x);

describe('HubScreen with a canvas', () => {
  it('sizes the canvas per G2 and paints once shown', () => {
    withCanvas();
    renderHub();
    expect(puts).toBe(0);
    show();
    advance(16);
    expect([canvas().width, canvas().height]).toEqual([125, 108]); // dpr 1 in jsdom: P = 3
    expect(canvas().style.height).toBe('324px');
    expect(puts).toBe(1);
    expect(climberX()).toBe(X.desk);
  });

  it('walks to a strip place, then uses it on arrival, within the dash time (G7)', () => {
    withCanvas();
    const onUse = vi.fn();
    renderHub({ onUse });
    show();
    advance(16);
    fireEvent.click(stripButton('Setting Room'));
    advance(500);
    expect(onUse).not.toHaveBeenCalled();
    expect(climberX()).toBeGreaterThan(X.desk!);
    advance(600);
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'setting-room' }));
    expect(climberX()).toBe(X['setting-room']);
    expect(canvas().dataset.facing).toBe('1');
  });

  it('cuts to a strip place in one frame with reduced motion, then sleeps (AC 11, 14)', () => {
    reduce = true;
    withCanvas();
    renderHub();
    show();
    advance(16);
    const before = puts;
    fireEvent.click(stripButton('Wall 1'));
    advance(16);
    expect(climberX()).toBe(X['bay:routemake-g2-b1']);
    expect(puts).toBe(before + 1);
    advance(5000);
    expect(puts).toBe(before + 1);
  });

  it('breathes while idle without reduced motion, one frame per IDLE_MS', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    const before = puts;
    advance(1200);
    expect(puts - before).toBe(2);
  });

  it('walks while an arrow key is held, and turns (G5)', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    fireEvent.keyDown(floor(), { key: 'ArrowRight' });
    advance(1000);
    fireEvent.keyUp(floor(), { key: 'ArrowRight' });
    const x = climberX();
    expect(x).toBeGreaterThan(X.desk! + 60);
    advance(500);
    expect(climberX()).toBe(x);
    // Even a tap shorter than one frame turns the climber.
    fireEvent.keyDown(floor(), { key: 'ArrowLeft' });
    fireEvent.keyUp(floor(), { key: 'ArrowLeft' });
    advance(16);
    expect(canvas().dataset.facing).toBe('-1');
  });

  it('walks while → is held with no focus, and stops on release or when the window blurs (W1)', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    advance(500);
    fireEvent.keyUp(document.body, { key: 'ArrowRight' });
    const x = climberX();
    expect(x).toBeGreaterThan(X.desk! + 20);
    advance(500);
    expect(climberX()).toBe(x);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    advance(300);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    const y = climberX();
    expect(y).toBeGreaterThan(x);
    advance(500);
    expect(climberX()).toBe(y);
  });

  it('stops a held walk when the gym is hidden, and stays put when shown again (W1, G13)', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    advance(300);
    act(() => observe!(0, 0)); // Root hides the gym: the keyup never reaches it
    const x = climberX();
    show();
    advance(1000);
    expect(climberX()).toBe(x);
  });

  it('walks while ▶ is held down, and stops when it is let go or the press is lost (W2)', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    const right = screen.getByRole('button', { name: 'Walk right' });
    const left = screen.getByRole('button', { name: 'Walk left' });
    fireEvent.pointerDown(right, { button: 0, pointerId: 1 });
    advance(500);
    fireEvent.pointerUp(right, { button: 0, pointerId: 1 });
    fireEvent.click(right, { detail: 1 }); // the press's own click: no extra step
    const x = climberX();
    expect(x).toBeGreaterThan(X.desk! + 20);
    expect(canvas().dataset.facing).toBe('1');
    advance(500);
    expect(climberX()).toBe(x);
    fireEvent.pointerDown(left, { button: 0, pointerId: 2 });
    advance(200);
    fireEvent.pointerCancel(left, { pointerId: 2 }); // e.g. the browser took the touch over
    const y = climberX();
    expect(y).toBeLessThan(x);
    expect(canvas().dataset.facing).toBe('-1');
    advance(500);
    expect(climberX()).toBe(y);
  });

  it('ignores a right-button press on ▶ (W2)', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Walk right' }), { button: 2 });
    advance(500);
    expect(climberX()).toBe(X.desk);
  });

  it('walks to a tapped place and shows its prompt on arrival (G5, G6)', () => {
    withCanvas();
    const onUse = vi.fn();
    renderHub({ onUse, ask: true });
    show();
    advance(16);
    // The stage is 375 CSS px for 125 art px and the camera starts at 0: 3 CSS px per art px.
    vi.spyOn(canvas(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 375,
    } as DOMRect);
    fireEvent.click(floor(), { clientX: 95 * 3, clientY: 100 }); // on the lockers, right of centre
    advance(2000);
    expect(climberX()).toBe(X.lockers);
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Change your level' })).toBeVisible();
    // A tap on the place you stand at uses it.
    const cam = Number(canvas().dataset.cam);
    fireEvent.click(floor(), { clientX: (84 - cam) * 3 + 1, clientY: 100 });
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('names the lockers on arrival, and a tap there does nothing (W4)', () => {
    withCanvas();
    const onUse = vi.fn();
    renderHub({ onUse });
    show();
    advance(16);
    vi.spyOn(canvas(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 375,
    } as DOMRect);
    fireEvent.click(floor(), { clientX: 95 * 3, clientY: 100 }); // on the lockers
    advance(2000);
    expect(climberX()).toBe(X.lockers);
    expect(prompt()).toHaveTextContent('Lockers');
    expect(prompt().querySelector('button')).toBeNull();
    const cam = Number(canvas().dataset.cam);
    fireEvent.click(floor(), { clientX: (84 - cam) * 3 + 1, clientY: 100 });
    advance(100);
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('walks to a tapped spot on the floor between places, with no prompt', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    vi.spyOn(canvas(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 375,
    } as DOMRect);
    fireEvent.click(floor(), { clientX: 56 * 3 + 1, clientY: 100 }); // art x 56: between places
    advance(2000);
    expect(climberX()).toBe(56);
    expect(prompt()).toBeEmptyDOMElement();
  });

  it('walks a beginner to Wall 1 after the front desk’s question (G9)', () => {
    withCanvas();
    const { rerender, props } = renderHub({ level: null, ask: true });
    show();
    advance(16);
    fireEvent.click(screen.getByRole('button', { name: "I'm new to climbing" }));
    rerender(<HubScreen {...props} profile={profileFor('beginner')} />);
    advance(2000);
    expect(climberX()).toBe(X['bay:routemake-g2-b1']);
  });

  it('pauses while hidden and keeps the climber where it was (G13)', () => {
    withCanvas();
    renderHub();
    show();
    advance(16);
    fireEvent.click(stripButton('Wall 1'));
    advance(2000); // there (a strip dash takes up to DASH_MS)
    act(() => observe!(0, 0));
    const before = puts;
    advance(5000);
    expect(puts).toBe(before);
    show();
    advance(16);
    expect(puts).toBe(before + 1);
    expect(climberX()).toBe(X['bay:routemake-g2-b1']);
  });
});

describe('HubScreen: no level question (Amendment 2026-11-02 W3, W5)', () => {
  it('asks nothing on a first visit, and the page stays live', () => {
    renderHub({ level: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(floor().closest('[data-behind]')).not.toHaveAttribute('inert');
  });

  it('opens no question at the lockers or the front desk', () => {
    renderHub();
    fireEvent.keyDown(floor(), { key: 'Enter' }); // at the front desk
    fireEvent.keyDown(floor(), { key: 'ArrowRight' });
    fireEvent.keyDown(floor(), { key: 'Enter' }); // at the lockers
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// W5: the question's code stays, unreachable from the app (Root never passes `levelQuestion`).
describe('HubScreen: the level question is modal (review suggestion)', () => {
  it('makes the page behind it inert while it asks, and live again after', () => {
    renderHub({ level: null, ask: true });
    const behind = floor().closest('[data-behind]')!;
    expect(behind).toHaveAttribute('inert');
    expect(behind).toContainElement(strip());
    fireEvent.click(screen.getByRole('button', { name: 'I climb in gyms' }));
    expect(behind).not.toHaveAttribute('inert');
  });
});
