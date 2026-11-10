// Dev-only (T38): the private held-out set, one real photo from a gym the probe never saw, with its
// holds labelled by hand. Its files stay out of git, so a fresh clone doesn't have them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The held-out set's embed job, or none when its photo or labels are missing. */
export function heldoutJobs(dir = 'tests/fixtures/real') {
  const labels = join(dir, 'heldout.labels.json');
  if (!existsSync(labels) || !existsSync(join(dir, 'heldout.jpg'))) return [];
  const { taps } = JSON.parse(readFileSync(labels, 'utf8'));
  return [{ photo: '../real/heldout.jpg', group: 'heldout', split: 'test', taps }];
}
