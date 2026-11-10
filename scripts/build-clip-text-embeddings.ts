// Builds src/data/clip-text-embeddings.json (dev time). The browser only downloads the CLIP
// vision encoder; the text side is fixed, so it's computed once here.
// Runs the text encoder in headless Chromium (onnxruntime-web), so no native Node runtime is needed.
// Usage: node scripts/build-clip-text-embeddings.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = join(import.meta.dirname, '..');
const server = await createServer({
  root,
  server: { port: 5176, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto('http://localhost:5176/scripts/clip-text.html');
  await page.waitForFunction(() => '__result' in window, null, { timeout: 600_000 });
  const result = await page.evaluate(() => (window as unknown as { __result: unknown }).__result);
  const out = join(root, 'src', 'data', 'clip-text-embeddings.json');
  writeFileSync(out, JSON.stringify(result) + '\n');
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
