import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { bufferFromText, bufferToText, type PixelBuffer } from '../src/modules/pixel-kit';

// SPEC-pixel-kit › Testing › Golden policy. `npm test` only compares, and a missing golden fails.
// Goldens are written only by `UPDATE_PIXEL_GOLDENS=1 npx vitest run src/modules/<module>`.
// gym-hub follows the same policy for its sprites and scenes (SPEC-gym-hub AC 12).

export const GOLDEN_DIR = join(import.meta.dirname, 'fixtures', 'pixel-kit', 'goldens');
export const HUB_GOLDEN_DIR = join(import.meta.dirname, 'fixtures', 'gym-hub', 'goldens');

const header = (name: string, buf: PixelBuffer, px: number) =>
  `# ${name} ${buf.width}x${buf.height} P=${px}`;

/** Compares `buf` with `<dir>/<name>.txt` (line 1 `# <name> <w>x<h> P=<px>`, then the pixels). */
export function expectGolden(name: string, buf: PixelBuffer, px = 1, dir = GOLDEN_DIR): void {
  const path = join(dir, `${name}.txt`);
  const text = `${header(name, buf, px)}\n${bufferToText(buf)}\n`;
  if (process.env.UPDATE_PIXEL_GOLDENS === '1') {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, text);
    return;
  }
  if (!existsSync(path)) {
    throw new Error(
      `Missing golden ${name}.txt. Write it with UPDATE_PIXEL_GOLDENS=1 npx vitest run src/modules/${basename(dirname(dir))}, then review it.`,
    );
  }
  const golden = readFileSync(path, 'utf8');
  expect(golden.split('\n')[0]).toBe(header(name, buf, px));
  expect(bufferToText(buf)).toBe(bufferToText(bufferFromText(golden)));
}
