import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');

// Regression (CI run 40924616582): the hidden radio was a 1×1 px box, so whether a click hit it or
// its label depended on sub-pixel layout (fonts). The input must cover its whole segment.
test('every segmented radio covers its whole label, so any tap on the segment hits the radio', async ({
  page,
}) => {
  await page.goto('/#/studio');
  await page.getByLabel('Choose file').setInputFiles(join(fixtures, 'wall-landscape.jpg'));
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: '3D' }).check();
  await expect(page.getByRole('radio', { name: 'Surface' })).toBeAttached();
  const misses = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('.segmented input')].flatMap((input) => {
      const label = input.closest('label')!;
      label.scrollIntoView({ block: 'center' }); // elementFromPoint only sees the viewport
      const b = label.getBoundingClientRect();
      const points = [
        [0.5, 0.5],
        [0.1, 0.2],
        [0.9, 0.8],
      ].map(([fx, fy]) => document.elementFromPoint(b.x + b.width * fx!, b.y + b.height * fy!));
      return points.every((hit) => hit === input)
        ? []
        : [
            `${label.textContent!.trim()} → ${points.map((h) => (h === input ? 'self' : (h?.closest('label')?.textContent?.trim() ?? h?.tagName))).join(',')}`,
          ];
    }),
  );
  expect(misses).toEqual([]);
});
