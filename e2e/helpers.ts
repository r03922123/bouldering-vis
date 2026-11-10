import { join } from 'node:path';
import type { Page } from '@playwright/test';

/** The synthetic fixture is 1600 px wide; the working image is 1536. */
export const WORKING_SCALE = 1536 / 1600;

/**
 * A wall-clock budget for a SPEC number set "on a laptop": 3× on the `iphone` project (WebKit on a
 * 2-vCPU CI VM, measured 2–5× slower than desktop, yet well inside 3× the SPEC numbers: worst
 * 124 of 300 ms and 1073 of 3000 ms), which only catches big regressions.
 * Every other project gets the exact number: `phone` is Chromium at desktop CPU speed (emulation
 * changes the screen, not the CPU), and a new or misspelled project fails loudly instead of
 * loosening quietly. Write the measured CI range next to each use so the 3× stays justified.
 */
export const budgetMs = (project: string, laptopMs: number) =>
  project === 'iphone' ? 3 * laptopMs : laptopMs;

export const canvas = (page: Page) => page.getByRole('img', { name: 'Wall photo' });

/**
 * The canvas transform, read once it has stopped changing. Layout can shift right after a hold
 * is added (the hold list grows and a desktop scrollbar appears), which refits the viewport.
 */
export async function stableViewport(
  page: Page,
): Promise<{ scale: number; tx: number; ty: number }> {
  const read = () =>
    canvas(page).evaluate(
      (el) => `${el.dataset.scale}|${el.dataset.tx}|${el.dataset.ty}|${el.clientWidth}`,
    );
  let prev = await read();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(50);
    const cur = await read();
    if (cur === prev) break;
    prev = cur;
  }
  const [scale, tx, ty] = prev.split('|').map(Number);
  return { scale: scale!, tx: tx!, ty: ty! };
}

/** Screen position (relative to the canvas) of a fixture pixel. */
export async function toScreen(page: Page, x: number, y: number) {
  const vp = await stableViewport(page);
  return { x: x * WORKING_SCALE * vp.scale + vp.tx, y: y * WORKING_SCALE * vp.scale + vp.ty };
}

/** Taps the canvas at a fixture pixel. */
export async function tapFixture(page: Page, x: number, y: number) {
  await canvas(page).click({ position: await toScreen(page, x, y) });
}

/** A layer switch, with the Layers menu opened first (the switches live inside it). */
export async function layerSwitch(page: Page, name: string) {
  const menu = page.locator('details.layers');
  if (!(await menu.evaluate((d: HTMLDetailsElement) => d.open)))
    await menu.locator('summary').click();
  return page.getByRole('switch', { name });
}

/**
 * From the gym: New wall → pick `photo` → Play's Tag step on "My wall". Wall 2 ships a level
 * (SPEC-launch-wall-2), so Tag is reached through New wall; the default photo is Wall 2's own
 * (the same picture the Tag specs were written on). No navigation here, so a caller can arrive
 * in-app (the Gym link) and keep the page's state.
 */
export async function openOwnTag(
  page: Page,
  photo = join(import.meta.dirname, '..', 'public', 'samples', 'wall-b.jpg'),
) {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('navigation', { name: 'Gym' })
    .getByRole('button', { name: 'New wall' })
    .click();
  await (await chooser).setFiles(photo);
  await page.waitForURL(/#\/wall\/mine$/);
}
