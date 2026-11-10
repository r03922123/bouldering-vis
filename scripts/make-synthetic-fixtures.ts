// Generates the committed synthetic fixtures used by unit/E2E tests and CI.
// Usage: node scripts/make-synthetic-fixtures.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = join(import.meta.dirname, '..', 'tests', 'fixtures');

/** Inserts an APP1/Exif segment with only the Orientation tag right after the JPEG SOI marker. */
export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // big-endian TIFF header, IFD0 at offset 8
    0x00,
    0x01, // 1 entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00, // Orientation, SHORT
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

async function render() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = await page.evaluate(async () => {
    const toB64 = async (c: OffscreenCanvas, type: string) => {
      const bytes = new Uint8Array(
        await (await c.convertToBlob({ type, quality: 0.92 })).arrayBuffer(),
      );
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    };
    let seed = 20261028;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;

    // A light grey wall with 40 colored elliptical holds; the mask marks every hold pixel.
    const W = 1600;
    const H = 1200;
    const wall = new OffscreenCanvas(W, H);
    const mask = new OffscreenCanvas(W, H);
    const g = wall.getContext('2d')!;
    const m = mask.getContext('2d')!;
    g.fillStyle = '#cfd2cc';
    g.fillRect(0, 0, W, H);
    m.fillStyle = '#000';
    m.fillRect(0, 0, W, H);
    const palette = ['#d62828', '#f4c430', '#1d4ed8', '#16a34a', '#7c3aed', '#111111', '#f97316'];
    const holds: { x: number; y: number; rx: number; ry: number; color: string }[] = [];
    while (holds.length < 40) {
      const h = {
        x: Math.round(80 + rnd() * (W - 160)),
        y: Math.round(80 + rnd() * (H - 160)),
        rx: Math.round(14 + rnd() * 36),
        ry: Math.round(12 + rnd() * 26),
        color: palette[holds.length % palette.length]!,
      };
      // Keep holds apart so each one is a separate, unambiguous object.
      if (holds.some((o) => Math.hypot(o.x - h.x, o.y - h.y) < o.rx + h.rx + 20)) continue;
      holds.push(h);
      for (const [ctx, fill] of [
        [g, h.color],
        [m, '#fff'],
      ] as const) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4032×3024 landscape (stored); EXIF orientation 6 is added in Node.
    const big = new OffscreenCanvas(4032, 3024);
    const bg = big.getContext('2d')!;
    bg.fillStyle = '#cfd2cc';
    bg.fillRect(0, 0, 4032, 3024);
    bg.fillStyle = '#d62828';
    bg.fillRect(0, 0, 400, 300); // marks the stored top-left corner

    const tiny = new OffscreenCanvas(200, 200);
    tiny.getContext('2d')!.fillRect(0, 0, 200, 200);

    return {
      wall: await toB64(wall, 'image/jpeg'),
      mask: await toB64(mask, 'image/png'),
      big: await toB64(big, 'image/jpeg'),
      tiny: await toB64(tiny, 'image/png'),
      holds,
    };
  });
  await browser.close();
  return out;
}

const r = await render();
const b = (s: string) => Buffer.from(s, 'base64');
writeFileSync(join(OUT, 'wall-landscape.jpg'), b(r.wall));
writeFileSync(join(OUT, 'wall-landscape.all-holds.png'), b(r.mask));
writeFileSync(join(OUT, 'wall-landscape.holds.json'), JSON.stringify(r.holds, null, 2) + '\n');
writeFileSync(join(OUT, 'wall-exif6.jpg'), withExifOrientation(b(r.big), 6));
writeFileSync(join(OUT, 'tiny-200.png'), b(r.tiny));
writeFileSync(join(OUT, 'corrupt.jpg'), b(r.wall).subarray(0, 600)); // valid header, truncated body
// 1×1 GIF89a
writeFileSync(
  join(OUT, 'sample.gif'),
  Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),
);
console.log(`wrote fixtures to ${OUT} (${r.holds.length} synthetic holds)`);
