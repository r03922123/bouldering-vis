import { expect, test } from '@playwright/test';

test('the Wall 2 sample, the only one, is preselected, has no credit or link, and loads (R1)', async ({
  page,
}) => {
  // AC S2 (amended): no video file is fetched, from the first page load to the loaded sample.
  const media: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'media' || /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(r.url())) {
      media.push(r.url());
    }
  });
  await page.goto('/#/studio');
  await expect(page.getByRole('combobox', { name: 'Sample wall' })).toHaveValue('wall-b');
  // AC S5: the picker shows no credit line and no link.
  await expect(page.locator('.sample-credit')).toHaveCount(0);
  await expect(page.getByTestId('drop-zone').getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Watch/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load sample' }).click();
  // AC S4 and S6: the owner's photo, portrait, at its working size.
  const photo = page.getByRole('img', { name: 'Wall photo' });
  await expect(photo).toHaveAttribute('data-image-width', '816');
  await expect(photo).toHaveAttribute('data-image-height', '1536');
  await expect(page.locator('.selection-status')).toHaveText('Tap a hold to add it to your route.');
  // No credit line once the sample is on screen either.
  await expect(page.locator('.sample-credit')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(media).toEqual([]);
});
