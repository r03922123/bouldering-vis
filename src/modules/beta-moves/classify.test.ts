import { classifyMove } from './classify';
import { ladder, ladderStart, moveTo, step } from './fixtures';

const ctx = ladder({ ids: () => crypto.randomUUID() });
const start = ladderStart(ctx);
const id = (label: string) => step(ctx, { lh: label }).lh;

describe('classifyMove (AC 1)', () => {
  it('a single hand', () => {
    expect(classifyMove(start, moveTo(start, { rh: id('4') }))).toEqual({
      kind: 'hand',
      limbs: ['rh'],
      from: { rh: start.rh },
      to: { rh: id('4') },
    });
  });

  it('a match: lh onto the hold rh is on, rh staying', () => {
    expect(classifyMove(start, moveTo(start, { lh: start.rh }))?.kind).toBe('match');
  });

  it('a let-go: a hand to off', () => {
    expect(classifyMove(start, moveTo(start, { lh: null }))).toMatchObject({
      kind: 'let-go',
      limbs: ['lh'],
    });
  });

  it('a cut: both feet to off', () => {
    expect(classifyMove(start, moveTo(start, { lf: null, rf: null }))).toMatchObject({
      kind: 'cut',
      limbs: ['lf', 'rf'],
    });
  });

  it('a cut: one foot to off', () => {
    expect(classifyMove(start, moveTo(start, { rf: null }))?.kind).toBe('cut');
  });

  it('hand and foot together, limbs in LIMBS order', () => {
    expect(classifyMove(start, moveTo(start, { rf: id('11'), lh: id('3') }))).toMatchObject({
      kind: 'hand-foot',
      limbs: ['lh', 'rf'],
    });
  });

  it('two hands, two feet, one foot', () => {
    expect(classifyMove(start, moveTo(start, { lh: id('3'), rh: id('4') }))?.kind).toBe('hands');
    expect(classifyMove(start, moveTo(start, { lf: id('10'), rf: id('11') }))?.kind).toBe('feet');
    expect(classifyMove(start, moveTo(start, { lf: id('10') }))?.kind).toBe('foot');
  });

  it('a hand going off with a foot is not a let-go', () => {
    expect(classifyMove(start, moveTo(start, { lh: null, lf: null }))?.kind).toBe('hand-foot');
  });

  it('no change gives null', () => {
    expect(classifyMove(start, { ...start })).toBeNull();
  });
});
