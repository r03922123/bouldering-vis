import type { Page } from '@playwright/test';
import { expect, openTestWallMap, test } from './testLevel';

// Private PR #17 reviews 2 and 9: on a phone the COACH's fold control never covers its words. Measured in
// the browser: the fold button's box against the boxes of the text's own letters.

const coach = (page: Page) => page.getByRole('region', { name: 'Coach' });

/**
 * The visible letters of the COACH text that the fold button covers (by box), and whether the
 * text is cut short (an ellipsis or overflow).
 */
const covered = (page: Page) =>
  coach(page).evaluate((box) => {
    const fold = box.querySelector('.play-coach-fold')!.getBoundingClientRect();
    const text = box.querySelector<HTMLElement>('.play-coach-text')!;
    const hit: string[] = [];
    for (const s of text.querySelectorAll('span:not(.play-coach-hidden)')) {
      for (const r of s.getClientRects()) {
        const overlaps =
          r.right > fold.left && r.left < fold.right && r.bottom > fold.top && r.top < fold.bottom;
        if (overlaps && s.textContent!.trim()) hit.push(s.textContent!);
      }
    }
    const t = text.getBoundingClientRect();
    const last = [...text.querySelectorAll('span')].at(-1)!.getBoundingClientRect();
    return {
      hit: hit.join(''),
      cut:
        text.scrollWidth > text.clientWidth + 1 ||
        text.scrollHeight > text.clientHeight + 1 ||
        last.right > t.right + 1,
    };
  });

test.describe('the phone COACH strip', () => {
  test.skip(({ isMobile }) => !isMobile, 'the strip is the phone layout (U3)');

  for (const width of [320, 360, 375]) {
    test(`review 9: folded on the direction check at ${width} px, the goal line is whole`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 740 });
      await openTestWallMap(page);
      await expect(coach(page)).toHaveAttribute('data-strip', 'true');
      await expect(coach(page)).toHaveAttribute('data-revealed', 'all');
      await expect(coach(page).locator('.play-coach-text')).toHaveText('Goal: both hands on 7F');
      expect(await covered(page)).toEqual({ hit: '', cut: false });
    });
  }

  // The researcher's phone cut the goal's last letter ("…on 7"): a phone with larger text (the
  // system's text size, 125 % and 150 %), on the narrowest widths.
  for (const [width, scale] of [
    [320, 125],
    [360, 125],
    [375, 150],
  ] as const) {
    test(`review 9: with ${scale} % text at ${width} px, the folded goal line is still whole`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 740 });
      await openTestWallMap(page);
      await page.addStyleTag({ content: `html { font-size: ${scale}%; }` });
      await expect(coach(page)).toHaveAttribute('data-strip', 'true');
      await expect(coach(page)).toHaveAttribute('data-revealed', 'all');
      expect(await covered(page)).toEqual({ hit: '', cut: false });
    });
  }

  test('review 2: expanded on a fall, the fold control covers no word, and says it folds', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await openTestWallMap(page);
    await page.getByRole('button', { name: 'Start planning' }).click();
    await page.keyboard.press('q');
    const taps = page.locator('.play-taps');
    const d = await taps.evaluate((el: HTMLElement) => ({ ...el.dataset }));
    const [s, tx, ty] = [Number(d.scale), Number(d.tx), Number(d.ty)];
    await taps.click({ position: { x: 806.4 * s + tx, y: 143 * s + ty } }); // 7F, a fall
    await expect(coach(page)).not.toHaveAttribute('data-strip');
    await expect(coach(page)).toHaveAttribute('data-revealed', 'all');
    expect((await covered(page)).hit).toBe('');
    const fold = coach(page).locator('.play-coach-fold');
    await expect(fold).toHaveAccessibleName('Fold the coach to one line');
    await expect(fold).toContainText('Fold');
  });
});
