import { statSync } from 'node:fs';
import { join } from 'node:path';
import { LEARN_PHOTOS } from '../modules/hold-classification';
import catalog from './hold-catalog.json';

const IDS = [
  'jug',
  'crimp',
  'edge',
  'sloper',
  'pinch',
  'pocket',
  'volume',
  'foot-chip',
  'standard',
  'sidepull',
  'undercling',
];

describe('hold-catalog.json', () => {
  it('has exactly the 8 shape types and 3 orientations', () => {
    expect(catalog.map((e) => e.id).sort()).toEqual([...IDS].sort());
  });

  it.each(catalog.map((e) => [e.id, e] as const))(
    '%s has a name and a short explanation',
    (_id, e) => {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.grip.length).toBeGreaterThan(10);
      expect(e.grip.length).toBeLessThanOrEqual(200);
    },
  );

  const shapes = catalog.filter((e) => !['standard', 'sidepull', 'undercling'].includes(e.id));
  it.each(shapes.map((e) => [e.id, e] as const))(
    '%s has Learn text: one common mistake and how it works as a foothold',
    (_id, e) => {
      const learn = (e as { learn?: { mistake: string; footUse: string } }).learn;
      expect(learn).toBeDefined();
      for (const t of [learn!.mistake, learn!.footUse]) {
        expect(t.length).toBeGreaterThan(10);
        expect(t.length).toBeLessThanOrEqual(160);
      }
    },
  );

  // SPEC amendment A13: real example photos, small, each credited. The file check waits while
  // Learn photos are off: the old crops are gone and the owner's are not in yet
  // (SPEC-hold-classification › Amendment 2026-11-06). The other checks still run.
  const LICENSES = ['CC BY 4.0', 'project'];
  it.each(shapes.map((e) => [e.id, e] as const))(
    '%s has 3 example photos, each credited, with an allowed license (≤ 20 KB if shown)',
    (_id, e) => {
      const ex = (
        e as {
          learn?: {
            examples?: { src: string; credit: string; license: string; sourceUrl: string }[];
          };
        }
      ).learn?.examples;
      expect(ex).toHaveLength(3);
      for (const x of ex!) {
        expect(x.src).toMatch(/^\/learn\/[a-z0-9-]+\.webp$/);
        if (LEARN_PHOTOS) {
          expect(
            statSync(join(import.meta.dirname, '..', '..', 'public', x.src)).size,
          ).toBeLessThanOrEqual(20 * 1024);
        }
        expect(x.credit.length).toBeGreaterThan(2);
        expect(LICENSES).toContain(x.license);
        expect(x.sourceUrl).toMatch(/^https?:\/\//);
      }
    },
  );
});
