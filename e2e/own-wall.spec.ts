import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openOwnTag, tapFixture } from './helpers';

// SPEC-play-shell S14, AC 9 and AC 10 (amendment (b) SC 5): your own photo, from the gym's New
// wall door to the first verdict, and across to the Setting Room and back. Nothing is uploaded.

const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const PHOTO = join(fixtures, 'wall-landscape.jpg');
const holds = JSON.parse(readFileSync(join(fixtures, 'wall-landscape.holds.json'), 'utf8')) as {
  x: number;
  y: number;
}[];

const wall = (page: Page) => page.getByRole('img', { name: 'Wall photo' });

/**
 * Counts the player's real taps: a capture-phase pointerdown listener in the page sorts every
 * press into hold taps (the wall photo), role taps (the Start / Finish radios) and the other
 * in-app taps. The OS photo picker is outside the page and isn't a tap here.
 */
async function countTaps(page: Page) {
  await page.addInitScript(() => {
    const taps: string[] = [];
    (window as unknown as { __taps: string[] }).__taps = taps;
    window.addEventListener(
      'pointerdown',
      (e) => {
        const el = e.target as HTMLElement;
        if (el.closest('canvas[aria-label="Wall photo"]')) taps.push('hold');
        else if (el.closest('.role-picker, input[type="radio"]')) taps.push('role');
        else
          taps.push(
            `tap: ${el.closest('button, a, label, input')?.textContent?.trim() ?? el.tagName}`,
          );
      },
      true,
    );
  });
  return async () => {
    const taps = await page.evaluate(() => (window as unknown as { __taps: string[] }).__taps);
    return {
      holds: taps.filter((t) => t === 'hold').length,
      roles: taps.filter((t) => t === 'role').length,
      inApp: taps.filter((t) => t.startsWith('tap: ')),
    };
  };
}

/** Uploads stay off: any request that sends a body (a photo) fails the test. */
function noUploads(page: Page) {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD') sent.push(`${r.method()} ${r.url()}`);
  });
  return sent;
}

/** From `/`: New wall → pick the photo → tag 3 holds with a start and a finish. */
async function ownWall(page: Page) {
  await page.goto('/#/gym');
  await openOwnTag(page, PHOTO);
  await expect(page.getByRole('heading', { level: 1, name: 'My wall' })).toBeVisible();
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  for (const [i, h] of holds.slice(0, 3).entries()) {
    await tapFixture(page, h.x, h.y);
    await expect(wall(page)).toHaveAttribute('data-hold-count', String(i + 1));
  }
  // Marking the start and the finish is part of tagging the holds.
  await page.getByRole('group', { name: 'Hold 1' }).getByRole('radio', { name: 'Start' }).check();
  await page.getByRole('group', { name: 'Hold 3' }).getByRole('radio', { name: 'Finish' }).check();
}

test('AC 9 (SC 5): a climber reaches the first verdict on their own photo: 2 in-app taps, the OS photo picker, then tagging', async ({
  page,
}) => {
  const uploads = noUploads(page);
  const taps = await countTaps(page);
  await ownWall(page);
  await page.getByRole('button', { name: 'Plan this route' }).click();
  await expect(page.locator('.play-verdict')).toHaveText(/^Start: /);
  const t = await taps();
  console.log(
    `in-app taps: ${t.inApp.join(' → ')} (${t.inApp.length}) + the OS photo picker + ${t.holds} hold taps + ${t.roles} role taps`,
  );
  // No level question since SPEC-gym-hub Amendment 2026-11-02 W3, so one tap fewer.
  expect(t.inApp).toEqual(['tap: New wall', 'tap: Plan this route']);
  expect(t.holds).toBe(3);
  expect(t.roles).toBe(2);
  expect(uploads).toEqual([]);
});

test('AC 10: a photo and its route round-trip Play → Setting Room → Play unchanged', async ({
  page,
}) => {
  const uploads = noUploads(page);
  await ownWall(page);
  await page.getByRole('button', { name: 'Plan this route' }).click();
  await expect(page.locator('.play-verdict')).toHaveText(/^Start: /);
  const stage = page.getByRole('region', { name: 'Wall' });
  const inPlay = {
    badges: await wall(page).getAttribute('data-badges'),
    size: await wall(page).getAttribute('data-image-width'),
    assignment: await stage.getAttribute('data-assignment'),
  };
  expect(inPlay.badges).toBe('1S,2,3F');

  // Amendment (b) U3: on a phone the route's tools are in the ☰ drawer over the bottom bar.
  const drawer = page.getByRole('button', { name: 'Hints and tools' });
  if (await drawer.count()) await drawer.click();
  await page.getByRole('button', { name: 'Open in Setting Room' }).click();
  await expect(page).toHaveURL(/#\/studio$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bouldering Vis' })).toBeVisible();
  await expect(wall(page)).toHaveAttribute('data-badges', inPlay.badges!);
  await expect(wall(page)).toHaveAttribute('data-image-width', inPlay.size!);

  await page
    .getByRole('navigation', { name: 'Setting Room' })
    .getByRole('link', { name: 'Play this wall' })
    .click();
  await expect(page).toHaveURL(/#\/wall\/mine$/);
  await expect(wall(page)).toHaveAttribute('data-badges', inPlay.badges!);
  await expect(wall(page)).toHaveAttribute('data-image-width', inPlay.size!);
  await page.getByRole('button', { name: 'Plan this route' }).click();
  await expect(stage).toHaveAttribute('data-assignment', inPlay.assignment!);
  expect(uploads).toEqual([]);
});
