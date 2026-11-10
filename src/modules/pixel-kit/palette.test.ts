import {
  COLOR,
  contrastRatio,
  LIMB_COLOR,
  PALETTE,
  relativeLuminance,
  ROLE_COLOR,
  worstCaseContrast,
  type ColorName,
} from './palette';

// SPEC-pixel-kit › Palette, AC 1–3 (colour parts).

const hex = (name: ColorName) => PALETTE[COLOR[name]]!;

describe('PALETTE', () => {
  it('has 16 entries: clear first, then 15 distinct hex colours (AC 1)', () => {
    expect(PALETTE).toHaveLength(16);
    expect(PALETTE[0]).toBeNull();
    const rest = PALETTE.slice(1);
    expect(rest.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(new Set(rest).size).toBe(15);
  });

  it('numbers COLOR 0–15 in palette order', () => {
    expect(Object.values(COLOR)).toEqual([...Array(16).keys()]);
    expect(hex('ink')).toBe('#1b1325');
    expect(hex('bloom')).toBe('#ffa3d6');
  });
});

describe('contrast', () => {
  it('follows the WCAG 2.x luminance and ratio', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 9);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 9);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 9);
    expect(relativeLuminance(hex('chalk'))).toBeCloseTo(0.897, 3);
  });

  it('gives the worst case over all backgrounds for a fill with an outline', () => {
    // Brute force over a grey ramp agrees with the closed form.
    const fill = hex('tide');
    let worst = Infinity;
    for (let v = 0; v <= 255; v++) {
      const bg = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      worst = Math.min(worst, Math.max(contrastRatio(fill, bg), contrastRatio(hex('ink'), bg)));
    }
    expect(worstCaseContrast(fill)).toBeLessThanOrEqual(worst + 1e-9);
    expect(worstCaseContrast(fill)).toBeGreaterThan(worst - 0.02);
    expect(worstCaseContrast(hex('ink'), fill)).toBeCloseTo(worstCaseContrast(fill), 9);
  });

  it('keeps every role and limb colour at ≥ 3.0 worst case (AC 2)', () => {
    const expected: [ColorName, number][] = [
      ['lime', 3.44],
      ['sun', 3.62],
      ['chalk', 4.03],
      ['bloom', 3.13],
      ['tide', 3.19],
      ['ember', 3.1],
    ];
    for (const [name, value] of expected) {
      expect(worstCaseContrast(hex(name))).toBeGreaterThanOrEqual(3.0);
      expect(Math.abs(worstCaseContrast(hex(name)) - value)).toBeLessThanOrEqual(0.01);
    }
  });

  it('maps roles and limbs to the spec colours', () => {
    expect(ROLE_COLOR).toEqual({
      start: COLOR.lime,
      finish: COLOR.sun,
      planned: COLOR.chalk,
      target: COLOR.bloom,
    });
    expect(LIMB_COLOR).toEqual({
      lh: COLOR.tide,
      lf: COLOR.tide,
      rh: COLOR.ember,
      rf: COLOR.ember,
    });
  });
});

// AC 3: Machado, Oliveira & Fernandes 2009 ("A Physiologically-based Model for Simulation of Color
// Vision Deficiency", IEEE TVCG 15(6)), severity 1.0, applied to linear sRGB.
const MACHADO: Record<'protan' | 'deutan' | 'tritan', number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (h: string) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

/** Linear sRGB → CIELAB (D65). */
function lab([r, g, b]: number[]): [number, number, number] {
  const X = 0.4124564 * r! + 0.3575761 * g! + 0.1804375 * b!;
  const Y = 0.2126729 * r! + 0.7151522 * g! + 0.072175 * b!;
  const Z = 0.0193339 * r! + 0.119192 * g! + 0.9503041 * b!;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const simulate = (h: string, m: number[][]) => {
  const l = toLinear(h);
  return m.map((row) =>
    Math.min(1, Math.max(0, row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!)),
  );
};

const deltaE = (a: number[], b: number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('colour-blind safety (AC 3, colour parts)', () => {
  const roles = (['start', 'finish', 'planned', 'target'] as const).map(
    (r) => PALETTE[ROLE_COLOR[r]]!,
  );

  it.each(Object.entries(MACHADO))('%s keeps role colours ≥ 20 ΔE76 apart', (_name, m) => {
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        expect(
          deltaE(lab(simulate(roles[i]!, m)), lab(simulate(roles[j]!, m))),
        ).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('pins the review minima (protan 32.4, deutan 21.5, tritan 21.9)', () => {
    const min = (m: number[][]) => {
      let best = Infinity;
      for (let i = 0; i < roles.length; i++)
        for (let j = i + 1; j < roles.length; j++)
          best = Math.min(best, deltaE(lab(simulate(roles[i]!, m)), lab(simulate(roles[j]!, m))));
      return best;
    };
    expect(min(MACHADO.protan)).toBeCloseTo(32.4, 1);
    expect(min(MACHADO.deutan)).toBeCloseTo(21.5, 1);
    expect(min(MACHADO.tritan)).toBeCloseTo(21.9, 1);
  });

  it.each(Object.entries(MACHADO))('%s keeps the limb colours ≥ 60 ΔE76 apart', (_name, m) => {
    const d = deltaE(lab(simulate(hex('tide'), m)), lab(simulate(hex('ember'), m)));
    expect(d).toBeGreaterThanOrEqual(60);
  });

  it('records that lime and sun are near in lightness (achromatopsia relies on shape)', () => {
    const dL = Math.abs(lab(toLinear(hex('lime')))[0] - lab(toLinear(hex('sun')))[0]);
    expect(dL).toBeCloseTo(3.6, 1);
  });
});
