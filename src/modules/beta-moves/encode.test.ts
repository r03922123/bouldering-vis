import { checkBeta } from './beta';
import { decodeBeta, encodeBeta } from './encode';
import {
  betaOf,
  ladder,
  ladderHolds,
  ladderStart,
  LADDER_TOP,
  LADDER_TOP_FEET,
  moveTo,
} from './fixtures';
import type { MoveCheck } from './types';

vi.setConfig({ testTimeout: 60_000 });

const ids = () => crypto.randomUUID();

describe('the label codec (AC 34)', () => {
  const ctx = ladder({ ids, wallFeet: LADDER_TOP_FEET });
  const beta = betaOf(ctx, ladderStart(ctx), [
    ...LADDER_TOP.slice(0, 3),
    ['lf', 'smear:300:1500'],
    ['rf', null],
  ]);

  it('writes steps by label', () => {
    expect(encodeBeta(beta, ctx)).toBe(
      [
        '1S,2S,8,9',
        '1S,2S,wf:420:1250,9',
        '1S,2S,wf:420:1250,wf:580:1250',
        '1S,4,wf:420:1250,wf:580:1250',
        '1S,4,smear:300:1500,wf:580:1250',
        '1S,4,smear:300:1500,-',
      ].join(';'),
    );
  });

  it('round-trips', () => {
    expect(decodeBeta(encodeBeta(beta, ctx), ctx)).toEqual(beta);
  });

  it.each([
    ['an unknown label', '1S,2S,8,99'],
    ['an unknown wall foothold', '1S,2S,wf:1:1,9'],
    ['an off-photo smear', '1S,2S,smear:400:2000,9'],
    ['a malformed smear', '1S,2S,smear:4.5:20,9'],
    ['three fields', '1S,2S,8'],
    ['five fields', '1S,2S,8,9,-'],
    ['an empty text', ''],
    ['an empty step', '1S,2S,8,9;'],
  ])('gives null for %s', (_, text) => {
    expect(decodeBeta(text, ctx)).toBeNull();
  });

  it('refuses to encode a hold the route doesn’t have', () => {
    expect(() => encodeBeta({ steps: [moveTo(ladderStart(ctx), { rh: 'gone' })] }, ctx)).toThrow(
      RangeError,
    );
  });

  // Review fix: encode only writes what decode reads back, so decode(encode(b)) = b wherever
  // encode returns.
  it('refuses to encode an off-photo smear (decode would give null)', () => {
    expect(() =>
      encodeBeta({ steps: [moveTo(ladderStart(ctx), { lf: 'smear:400:2000' })] }, ctx),
    ).toThrow(RangeError);
  });

  it('refuses to encode a beta with no start', () => {
    expect(() => encodeBeta({ steps: [] }, ctx)).toThrow(RangeError);
  });

  it.each(['3,x', '3;x', '-', 'wf:420:1250', 'smear:1:1'])(
    'refuses to encode a hold labelled %j, which would not read back',
    (label) => {
      const odd = ladder({
        ids,
        wallFeet: LADDER_TOP_FEET,
        holds: ladderHolds(ids).map((h) => (h.label === '3' ? { ...h, label } : h)),
      });
      const start = ladderStart(odd);
      const three = odd.holds.find((h) => h.order === 2)!.id;
      expect(encodeBeta({ steps: [start] }, odd)).toBe('1S,2S,8,9');
      expect(() => encodeBeta({ steps: [start, moveTo(start, { lh: three })] }, odd)).toThrow(
        RangeError,
      );
    },
  );
});

describe('renaming hold ids (AC 32)', () => {
  it('changes no verdict, ratio, load or effort, nor the code or the key', () => {
    const a = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    const b = ladder({ ids, wallFeet: LADDER_TOP_FEET });
    expect(a.holds.map((h) => h.label)).toEqual(ladderHolds().map((h) => h.label));
    expect(b.key).toBe(a.key);
    const betaA = betaOf(a, ladderStart(a), LADDER_TOP);
    const text = encodeBeta(betaA, a);
    const betaB = decodeBeta(text, b)!;
    expect(encodeBeta(betaB, b)).toBe(text);
    const summary = (s: MoveCheck) => ({
      verdict: s.verdict,
      style: s.style,
      reach: s.reach,
      loads: s.loads,
      effort: s.effort,
      kept: s.contactsKept,
      fail: s.fail,
      stance: s.stance,
      pivot: s.pivot,
    });
    const ra = checkBeta(betaA, a);
    const rb = checkBeta(betaB, b);
    expect(rb.steps.map(summary)).toEqual(ra.steps.map(summary));
    expect([rb.fallAt, rb.toppedAt, rb.rejectedAt]).toEqual([
      ra.fallAt,
      ra.toppedAt,
      ra.rejectedAt,
    ]);
  });
});
