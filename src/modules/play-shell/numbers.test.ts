import {
  checkBeta,
  createStanceCache,
  decodeBeta,
  type MoveCheck,
  type MoveContext,
} from '../beta-moves';
import { LIMBS } from '../climber-stance';
import { SYNTHETIC, SYNTHETIC_BETAS } from './synthetic.fixture';
import { BODY_SHARE, numbersFor } from './numbers';
import { contextFor } from './play';

// SPEC-play-shell S10 and AC 7: every Numbers value is the referee's own field, rounded as shown.

vi.setConfig({ testTimeout: 120_000 });

const ctx = (contextFor(SYNTHETIC) as { value: MoveContext }).value;

/** Every check of every synthetic-route beta, up to its first fall, top or rejection. */
const checks: MoveCheck[] = SYNTHETIC_BETAS.flatMap((b) => {
  const beta = decodeBeta(b.text, ctx);
  return beta ? checkBeta(beta, ctx, createStanceCache()).steps : [];
});

const num = (s: string) => Number(/^-?\d+(\.\d+)?|∞/.exec(s)![0].replace('∞', 'Infinity'));

describe('numbersFor (AC 7)', () => {
  it('covers holds, tops and falls from the fixtures', () => {
    const verdicts = new Set(checks.map((c) => c.verdict));
    expect(verdicts).toEqual(new Set(['hold', 'top', 'fall']));
    expect(checks.some((c) => c.style === 'static')).toBe(true);
  });

  it('gives every value equal to the matching MoveCheck field, rounded as shown', () => {
    for (const c of checks) {
      const rows = numbersFor(c);
      for (const r of rows) {
        if (r.label === BODY_SHARE) {
          expect(r.value).toMatch(/^-?\d+\.\d %$/);
          expect(num(r.value)).toBe(c.bodyLoad);
        } else if (r.label.endsWith(' share')) {
          expect(r.value).toMatch(/^-?\d+\.\d %$/);
          expect(num(r.value)).toBe(Math.round(c.loads[r.limb!]! * 10) / 10);
          expect(num(r.value)).toBe(c.loads[r.limb!]);
        } else if (r.label.endsWith(' reach')) {
          const ratio = c.reach[r.limb!]!;
          expect(num(r.value)).toBe(
            Number.isFinite(ratio) ? Math.round(ratio * 1000) / 1000 : Infinity,
          );
          expect(num(r.value)).toBe(ratio);
        } else if (r.label === 'Effort') {
          expect(num(r.value)).toBe(c.effort);
        } else if (r.label === 'Style') {
          expect(r.value.toLowerCase()).toBe(c.style);
        } else if (r.label === 'Contacts kept') {
          expect(Number(r.value)).toBe(c.contactsKept);
        } else {
          throw new Error(`unexpected row ${r.label}`);
        }
      }
      // One row per field the referee returned, and none for a field it didn't.
      const shares = LIMBS.filter((l) => c.loads[l] !== undefined).length;
      const reaches = LIMBS.filter((l) => c.reach[l] !== undefined).length;
      const body = c.bodyLoad === null ? 0 : 1;
      expect(rows).toHaveLength(
        shares + reaches + body + (c.effort === null ? 0 : 1) + (c.style === null ? 0 : 1) + 1,
      );
    }
  });

  // SPEC-climber-stance Amendment 2026-11-04, M1: the cut-feet hang rests the hips on the wall,
  // so the body's share is a row too and the shares still add up to 100.
  it('shows the body on the wall as a share when the hips carry part of the weight', () => {
    const hang = checks.filter((c) => c.bodyLoad !== null);
    expect(hang.length).toBeGreaterThan(0);
    for (const c of hang) {
      const shares = numbersFor(c)
        .filter((r) => r.label.endsWith(' share'))
        .map((r) => num(r.value));
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    }
  });

  it('labels a reach against the limit used: static, deadpoint, or both for an undecided hand', () => {
    const base = checks.find((c) => c.move && c.verdict === 'hold')!;
    const row = (c: MoveCheck) => numbersFor(c).find((r) => r.label === 'Left hand reach')!.value;
    expect(row({ ...base, style: 'static', reach: { lh: 0.912 } })).toBe('0.912 of 1.000 (static)');
    expect(row({ ...base, style: 'deadpoint', reach: { lh: 1.043 } })).toBe(
      '1.043 of 1.100 (deadpoint)',
    );
    expect(row({ ...base, style: null, reach: { lh: 3.162 } })).toBe(
      '3.162 of 1.000 (static) · 1.100 (deadpoint)',
    );
    expect(row({ ...base, style: null, reach: { lh: Infinity } })).toMatch(/^∞ of/);
    const foot = numbersFor({ ...base, style: 'deadpoint', reach: { lf: 0.5 } });
    expect(foot.find((r) => r.label === 'Left foot reach')!.value).toBe('0.500 of 1.000 (static)');
  });

  it('shows a fall’s numbers without shares or effort (the referee returns none)', () => {
    const fall = checks.find((c) => c.verdict === 'fall')!;
    const labels = numbersFor(fall).map((r) => r.label);
    expect(labels.some((l) => l.endsWith(' share'))).toBe(false);
    expect(labels).not.toContain('Effort');
    expect(labels).toContain('Contacts kept');
  });

  it('keeps an undercling’s negative share', () => {
    const base = checks[0]!;
    const rows = numbersFor({ ...base, loads: { lh: -3.2, rh: 60, lf: 21.6, rf: 21.6 } });
    expect(rows[0]).toEqual({ limb: 'lh', label: 'Left hand share', value: '-3.2 %' });
  });
});
