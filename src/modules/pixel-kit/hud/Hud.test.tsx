import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bufferToText, createBuffer, type PixelBuffer } from '../buffer';
import { rasterText } from '../font';
import { COLOR } from '../palette';
import {
  GripMeter,
  meterArt,
  METER_SEGMENTS,
  MoveCounter,
  Stars,
  starsArt,
  TONE_COLOR,
} from './Hud';
import { HOLLOW_STAR, iconArt, ICONS, type PixelIcon } from './icons';
import { PixelButton } from './PixelButton';
import { PixelText, textArt } from './PixelText';

// SPEC-pixel-kit › Public Interface (HUD) and AC 36–39. jsdom has no canvas, so the art is
// checked through the pure builders (textArt, iconArt, meterArt, starsArt) and the DOM through
// roles, names and data attributes.

const realDpr = window.devicePixelRatio;
afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { value: realDpr, configurable: true });
});
const setDpr = (dpr: number) =>
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });

const at = (b: PixelBuffer, x: number, y: number) => b.data[y * b.width + x]!;

const canvases = (el: HTMLElement) => [...el.querySelectorAll('canvas')];

describe('PixelText', () => {
  it('draws the outlined pixel font into an aria-hidden canvas, with the real text hidden', () => {
    const { container } = render(<PixelText text="SEND" />);
    const [canvas] = canvases(container);
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveAttribute('data-text', 'SEND');
    expect(screen.getByText('SEND')).toHaveClass('visually-hidden');
  });

  it('builds its art with rasterText in the given colour and an ink outline', () => {
    const art = textArt('MOVES 07', COLOR.sun);
    expect([art.width, art.height]).toEqual([49, 9]);
    const expected = createBuffer(49, 9);
    rasterText(expected, 0, 0, 'MOVES 07', COLOR.sun, COLOR.ink);
    expect(bufferToText(art)).toBe(bufferToText(expected));
    expect(textArt('UNDO').data.includes(COLOR.chalk)).toBe(true); // default colour
  });

  it('makes one art px round(scale·dpr)/dpr CSS px', () => {
    setDpr(2.625);
    const { container } = render(<PixelText text="UNDO" scale={2} />);
    const [canvas] = canvases(container);
    const w = textArt('UNDO').width;
    // round(2 × 2.625) = 5 device px per art px.
    expect(canvas!.width).toBe(w);
    expect(parseFloat(canvas!.style.width)).toBeCloseTo((w * 5) / 2.625, 6);
    setDpr(1);
    const { container: c3 } = render(<PixelText text="UNDO" scale={3} />);
    expect(parseFloat(canvases(c3)[0]!.style.width)).toBeCloseTo(w * 3, 6);
  });
});

describe('PixelButton (AC 36)', () => {
  it('is a native button with the px-button class, named by its label', () => {
    render(<PixelButton label="Undo" icon="undo" />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveClass('px-button');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-pressed');
    for (const c of canvases(button)) expect(c).toHaveAttribute('aria-hidden', 'true');
    expect(canvases(button)).toHaveLength(2); // the icon and the label
  });

  it('passes disabled, onClick and className through, and shows pressed', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <PixelButton label="Send" icon="send" className="extra" onClick={onClick} pressed />,
    );
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveClass('px-button', 'extra');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<PixelButton label="Send" onClick={onClick} disabled pressed={false} />);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is at least 44 × 44 CSS px (app.css; the real box is checked in E2E, AC 42)', () => {
    const css = readFileSync(join(import.meta.dirname, '../../../app/app.css'), 'utf8');
    const rule = /\.px-button\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/min-width:\s*44px/);
    expect(rule).toMatch(/min-height:\s*44px/);
  });
});

describe('icons', () => {
  const NAMES: PixelIcon[] = [
    'undo',
    'send',
    'sound-on',
    'sound-off',
    'back',
    'star',
    'ok',
    'warn',
    'fail',
  ];

  it('has the 9 icons, all different, each outlined in ink', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...NAMES].sort());
    const texts = NAMES.map((n) => ICONS[n].join('\n'));
    expect(new Set(texts).size).toBe(NAMES.length);
    for (const n of NAMES) {
      const art = iconArt(n, COLOR.chalk);
      expect([art.width, art.height]).toEqual([ICONS[n][0]!.length + 2, ICONS[n].length + 2]);
      // No fill pixel touches a clear pixel: the outline closes every shape.
      for (let y = 0; y < art.height; y++) {
        for (let x = 0; x < art.width; x++) {
          if (at(art, x, y) !== COLOR.chalk) continue;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            expect(at(art, x + dx, y + dy)).not.toBe(COLOR.clear);
          }
        }
      }
    }
  });

  it('precedes every icon with the provenance comment', () => {
    const lines = readFileSync(join(import.meta.dirname, 'icons.ts'), 'utf8').split('\n');
    const defs = lines.flatMap((line, i) => (/^\s*'?[a-z-]+'?: '[.# ]+',$/.test(line) ? [i] : []));
    expect(defs).toHaveLength(9);
    for (const i of defs) {
      expect(lines[i - 1], lines[i]).toMatch(
        /^\s*\/\/ original, drawn for Bloc Hall, \d{4}-\d{2}-\d{2}$/,
      );
    }
  });
});

describe('Stars (AC 37)', () => {
  it('is an image named "2 of 3 stars"', () => {
    render(<Stars count={2} />);
    expect(screen.getByRole('img', { name: '2 of 3 stars' })).toBeInTheDocument();
  });

  it('draws a hollow star whose interior is clear', () => {
    const star = ICONS.star;
    let interior = 0;
    star.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        const filled = (cx: number, cy: number) => star[cy]?.[cx] === '#';
        const inside =
          filled(x, y) &&
          filled(x - 1, y) &&
          filled(x + 1, y) &&
          filled(x, y - 1) &&
          filled(x, y + 1);
        if (inside) {
          interior++;
          expect(HOLLOW_STAR[y]![x]).toBe('.');
        } else {
          expect(HOLLOW_STAR[y]![x]).toBe(cell);
        }
      }),
    );
    expect(interior).toBeGreaterThan(10);
  });

  it('fills `count` stars and leaves the rest hollow', () => {
    for (const count of [0, 1, 2, 3] as const) {
      const art = starsArt(count);
      const w = ICONS.star[0]!.length;
      const filledStars = [0, 1, 2].filter((k) => {
        // The star's centre cell, in art px (1 px outline pad, 2 px gap between stars).
        const cx = 1 + k * (w + 2) + Math.floor(w / 2);
        return at(art, cx, 1 + 4) === COLOR.sun;
      });
      expect(filledStars).toHaveLength(count);
    }
  });
});

describe('GripMeter (AC 38)', () => {
  const meter = () => screen.getByRole('meter');

  it('exposes 0–100 with aria-valuenow = round(clamp(value)·100) and the label', () => {
    const { rerender } = render(<GripMeter value={0.456} tone="ok" label="Grip" />);
    expect(meter()).toHaveAttribute('aria-valuemin', '0');
    expect(meter()).toHaveAttribute('aria-valuemax', '100');
    expect(meter()).toHaveAttribute('aria-valuenow', '46');
    expect(meter()).toHaveAccessibleName('Grip');
    expect(meter()).toHaveAttribute('data-filled', '5');
    for (const [value, now, filled] of [
      [1.7, '100', '10'],
      [-0.2, '0', '0'],
      [NaN, '0', '0'],
      [0.04, '4', '0'],
      [0.05, '5', '1'],
    ] as const) {
      rerender(<GripMeter value={value} tone="warn" label="Balance" />);
      expect(meter()).toHaveAttribute('aria-valuenow', now);
      expect(meter()).toHaveAttribute('data-filled', filled);
    }
  });

  it('fills round(clamp(value)·10) of 10 segments in the tone colour', () => {
    expect(METER_SEGMENTS).toBe(10);
    for (const [value, n] of [
      [0, 0],
      [0.31, 3],
      [0.5, 5],
      [1, 10],
      [NaN, 0],
      [2, 10],
    ] as const) {
      const art = meterArt(value, 'ok');
      const lit = meterSegmentColours(art).filter((c) => c === TONE_COLOR.ok);
      expect(lit).toHaveLength(n);
      expect(meterSegmentColours(art)).toHaveLength(10);
    }
  });

  it('gives each tone its own icon, not only its own colour', () => {
    const icon = (tone: 'ok' | 'warn' | 'fail') => {
      const art = meterArt(1, tone);
      // The icon cells, as a shape mask (any non-clear, non-ink pixel).
      const rows: string[] = [];
      for (let y = 1; y < 8; y++) {
        let row = '';
        for (let x = 1; x < 8; x++) row += at(art, x, y) > COLOR.ink ? '#' : '.';
        rows.push(row);
      }
      return rows;
    };
    expect(icon('ok')).toEqual(ICONS.ok);
    expect(icon('warn')).toEqual(ICONS.warn);
    expect(icon('fail')).toEqual(ICONS.fail);
    expect(new Set([TONE_COLOR.ok, TONE_COLOR.warn, TONE_COLOR.fail]).size).toBe(3);
  });
});

/** The centre pixel colour of each meter segment. */
function meterSegmentColours(art: PixelBuffer): number[] {
  const out: number[] = [];
  for (let k = 0; k < METER_SEGMENTS; k++) out.push(at(art, 11 + 4 * k, 4));
  return out;
}

describe('MoveCounter (AC 39)', () => {
  const drawn = (c: HTMLElement) => c.querySelector('canvas')!.getAttribute('data-text');

  it('shows MOVES 07 for 7, with "7 moves" as its hidden text', () => {
    const { container } = render(<MoveCounter moves={7} />);
    expect(drawn(container)).toBe('MOVES 07');
    expect(screen.getByText('7 moves')).toHaveClass('visually-hidden');
  });

  it('draws 99 above 99 and 00 below 0, while the hidden text gives the real count', () => {
    const { container, rerender } = render(<MoveCounter moves={140} />);
    expect(drawn(container)).toBe('MOVES 99');
    expect(screen.getByText('140 moves')).toBeInTheDocument();
    rerender(<MoveCounter moves={-3} />);
    expect(drawn(container)).toBe('MOVES 00');
    expect(screen.getByText('0 moves')).toBeInTheDocument();
    rerender(<MoveCounter moves={1.8} />);
    expect(drawn(container)).toBe('MOVES 01');
    expect(screen.getByText('1 move')).toBeInTheDocument();
  });
});
