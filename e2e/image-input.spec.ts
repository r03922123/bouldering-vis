import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string) => join(import.meta.dirname, '..', 'tests', 'fixtures', name);
const photo = (page: Page) => page.getByRole('img', { name: 'Wall photo' });
/** The working image size (the canvas itself is sized to the screen). */
const size = async (page: Page) => [
  Number(await photo(page).getAttribute('data-image-width')),
  Number(await photo(page).getAttribute('data-image-height')),
];

/** Dispatches a real drop or paste event carrying the file, as the browser would. */
async function sendFile(page: Page, kind: 'drop' | 'paste', name: string, type: string) {
  const b64 = readFileSync(fixture(name)).toString('base64');
  // The paste listener is attached in an effect after the first render; wait for the UI first.
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  await page.evaluate(
    ({ b64, name, type, kind }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      if (kind === 'drop') {
        document
          .querySelector('[data-testid="drop-zone"]')!
          .dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
      } else {
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
      }
    },
    { b64, name, type, kind },
  );
}

test.beforeEach(async ({ page }) => page.goto('/#/studio'));

test('Choose file loads the wall photo at working size', async ({ page }) => {
  await page.getByLabel('Choose file').setInputFiles(fixture('wall-landscape.jpg'));
  await expect(photo(page)).toBeVisible();
  expect(await size(page)).toEqual([1536, 1152]);
});

test('a phone photo with EXIF orientation 6 loads upright at 1152×1536', async ({ page }) => {
  await page.getByLabel('Choose file').setInputFiles(fixture('wall-exif6.jpg'));
  await expect(photo(page)).toBeVisible();
  expect(await size(page)).toEqual([1152, 1536]);
});

test('dropping a file loads it', async ({ page }) => {
  await sendFile(page, 'drop', 'wall-landscape.jpg', 'image/jpeg');
  await expect(photo(page)).toBeVisible();
});

test('pasting an image loads it', async ({ page }) => {
  await sendFile(page, 'paste', 'wall-landscape.jpg', 'image/jpeg');
  await expect(photo(page)).toBeVisible();
});

for (const [file, type, message] of [
  ['sample.gif', 'image/gif', 'GIF files aren’t supported'],
  ['tiny-200.png', 'image/png', 'at least 256 px'],
  ['corrupt.jpg', 'image/jpeg', 'Couldn’t read that image'],
] as const) {
  test(`${file} shows an error and keeps the current photo`, async ({ page }) => {
    await page.getByLabel('Choose file').setInputFiles(fixture('wall-landscape.jpg'));
    await expect(photo(page)).toBeVisible();
    await sendFile(page, 'drop', file, type);
    await expect(page.getByRole('alert')).toContainText(message);
    expect(await size(page)).toEqual([1536, 1152]);
  });
}

test('the input controls fit a 375px screen without horizontal scroll', async ({ page }) => {
  await page.getByLabel('Choose file').setInputFiles(fixture('wall-landscape.jpg'));
  await expect(photo(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
