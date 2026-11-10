import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkBeta,
  checkStart,
  createStanceCache,
  decodeBeta,
  makeContext,
} from '../modules/beta-moves';
import { wallFromLevel } from './playWall';

// SPEC-launch-wall-2: Wall 2's shipped level starts on the setter's start and can be topped.

const file = join(import.meta.dirname, '..', '..', 'public', 'levels', 'wall-b.json');
const wall = wallFromLevel(JSON.parse(readFileSync(file, 'utf8')));
const ctx = makeContext(wall);
const id = (label: string) => wall.holds.find((h) => h.label === label)!.id;

/** A 12-move top the referee accepts, found by search over checkMove; labels as encodeBeta writes them. */
const WALL2_TOP =
  '3S,4S,2,1;3S,5,2,1;3S,5,wf:289:705,1;6,5,wf:289:705,1;6,5,wf:289:705,wf:259:753;' +
  '6,9,wf:289:705,wf:259:753;6,9,2,wf:259:753;6,7,2,wf:259:753;6,7,9,wf:259:753;' +
  '6,7,9,wf:201:667;10,7,9,wf:201:667;10,11F,9,wf:201:667;11F,11F,9,wf:201:667';

describe("Wall 2's level", () => {
  it('opens on the setter’s start: both hands on the start holds, both feet on holds 1 and 2', () => {
    expect(wall.start).toEqual({ lh: id('3S'), rh: id('4S'), lf: id('2'), rf: id('1') });
    // play.test covers startPlan taking a start that holds; this one must hold.
    expect(checkStart(wall.start!, ctx).verdict).toBe('hold');
  });

  it('can be climbed from that start to the top', () => {
    const beta = decodeBeta(WALL2_TOP, ctx);
    if (!beta) throw new Error('WALL2_TOP does not decode');
    expect(beta.steps[0]).toEqual(wall.start);
    const result = checkBeta(beta, ctx, createStanceCache());
    expect(result.steps.map((s) => s.verdict)).toEqual([...Array(12).fill('hold'), 'top']);
  });
});
