import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// SPEC-climber-stance › Amendment 2026-10-31 (b), AC 33: the start-position rules are pure.
const FILES = [
  'wallFootholds.ts',
  'anyFeet.ts',
  'cones.ts',
  'diagnose.ts',
  'assign.ts',
  'reach.ts',
];

describe('purity', () => {
  it.each(FILES)('%s uses no randomness, timers or clock', (file) => {
    const src = readFileSync(join(import.meta.dirname, file), 'utf8');
    expect(src).not.toMatch(/Math\.random|setTimeout|setInterval|Date\.now/);
  });
});
