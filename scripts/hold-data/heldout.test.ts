import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { heldoutJobs } from './heldout.mjs';

describe('heldoutJobs', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'heldout-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('skips the set when its files are missing, as in a public clone', () => {
    expect(heldoutJobs(dir)).toEqual([]);
  });

  it('skips the set when the photo is there but its labels are not', () => {
    writeFileSync(join(dir, 'heldout.jpg'), '');
    expect(heldoutJobs(dir)).toEqual([]);
  });

  it('makes one test job from the hand labels', () => {
    const taps = [{ fx: 0.25, fy: 0.5, label: 'jug' }];
    writeFileSync(join(dir, 'heldout.jpg'), '');
    writeFileSync(join(dir, 'heldout.labels.json'), JSON.stringify({ taps }));
    expect(heldoutJobs(dir)).toEqual([
      { photo: '../real/heldout.jpg', group: 'heldout', split: 'test', taps },
    ]);
  });
});
