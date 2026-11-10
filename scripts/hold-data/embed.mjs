// Dev-only (T38). Embeds labeled holds through the app's own pipeline (spike/probe-data.ts) and appends
// one JSON line per hold to tests/fixtures/hold-data/<set>.jsonl (gitignored). Resumable: photos already
// in the output are skipped. Needs `npx vite --port 5175` running.
// Usage: node scripts/hold-data/embed.mjs <clinb|kaggle|heldout|beta-guide|capstone> [maxPerClass]
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { cocoJobs } from './coco.mjs';
import { heldoutJobs } from './heldout.mjs';

const [set, maxArg, pilotArg] = process.argv.slice(2);
const pilot = Number(pilotArg ?? 0); // > 0: embed that many photos with crops, into <set>.pilot.jsonl
const ROOT = 'tests/fixtures/hold-data';
const out = join(ROOT, pilot ? `${set}.pilot.jsonl` : `${set}.jsonl`);
const done = new Set(
  existsSync(out)
    ? readFileSync(out, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l).photo)
    : [],
);

/** Each job: one photo with its taps (fractions of the photo) and labels. */
function jobs() {
  if (set === 'clinb') {
    // Roboflow multiclass CSV; one copy per source photo (copies are augmentations), grouped by source.
    const list = [];
    for (const split of ['train', 'valid', 'test']) {
      const rows = readFileSync(join(ROOT, 'clinb', split, '_classes.csv'), 'utf8')
        .trim()
        .split('\n');
      const head = rows[0]
        .split(',')
        .slice(1)
        .map((s) => s.trim());
      const seen = new Set();
      for (const r of rows.slice(1)) {
        const [file, ...v] = r.split(',').map((s) => s.trim());
        const group = file.match(/instance_(\d+)_png/)[1];
        if (seen.has(group)) continue;
        seen.add(group);
        const label = head[v.findIndex((x) => x === '1')];
        list.push({
          photo: `clinb/${split}/${file}`,
          group,
          split,
          taps: [{ fx: 0.5, fy: 0.5, label }],
        });
      }
    }
    return list;
  }
  if (set === 'kaggle') {
    // Real gym phone photos only (YYYYMMDD_hhmmss names); class ids are alphabetical (checked by eye).
    const NAMES = ['crimp', 'jug', 'pinch', 'pocket', 'sloper', 'volume'];
    const max = Number(maxArg ?? 250);
    const per = Object.fromEntries(NAMES.map((n) => [n, 0]));
    const list = [];
    for (const split of ['train', 'valid', 'test']) {
      const dir = join(ROOT, 'kaggle/Final_Dataset', split);
      for (const f of readdirSync(join(dir, 'images')).sort()) {
        if (!/^20\d{6}_\d{6}/.test(f)) continue;
        const lab = readFileSync(join(dir, 'labels', f.replace(/\.[^.]+$/, '.txt')), 'utf8')
          .trim()
          .split('\n');
        const taps = [];
        const here = Object.fromEntries(NAMES.map((n) => [n, 0]));
        for (const line of lab) {
          const [k, x, y] = line.split(' ').map(Number);
          const label = NAMES[k];
          // Spread each class over many photos (and so many walls and lights): ≤ 6 per photo.
          if (per[label] >= max || here[label] >= 6) continue;
          per[label]++;
          here[label]++;
          taps.push({ fx: x, fy: y, label });
        }
        if (taps.length)
          list.push({
            photo: `kaggle/Final_Dataset/${split}/images/${f}`,
            group: f.slice(0, 15),
            split: 'test',
            taps,
          });
      }
    }
    return list;
  }
  if (set === 'heldout') return heldoutJobs();
  if (set === 'beta-guide' || set === 'capstone') {
    // Roboflow COCO JSON export: <set>/<split>/_annotations.coco.json next to the photos.
    return ['train', 'valid', 'test'].flatMap((split) => {
      const f = join(ROOT, set, split, '_annotations.coco.json');
      if (!existsSync(f)) return [];
      return cocoJobs(
        JSON.parse(readFileSync(f, 'utf8')),
        `${set}/${split}`,
        split,
        Number(maxArg ?? 6),
      );
    });
  }
  throw new Error(`unknown set ${set}`);
}

const all = jobs();
if (set === 'heldout' && !all.length) {
  // A public clone has no private held-out files: nothing to embed, so no browser either.
  console.log('heldout: the private files are not in tests/fixtures/real/, skipped');
  process.exit(0);
}
const todo = (
  pilot ? all.filter((_, i) => i % Math.floor(all.length / pilot) === 0).slice(0, pilot) : all
).filter((j) => !done.has(j.photo));
console.log(`${set}: ${todo.length} photos to embed (${done.size} done)`);
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const open = async () => {
  // The dev server may be reloading the page at the same moment: let that navigation win.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto('http://localhost:5175/spike/probe-data.html');
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await page.waitForTimeout(1000);
    }
  }
  await page.waitForFunction(() => document.getElementById('out')?.textContent === 'READY');
};
await open();
const t0 = Date.now();
let n = 0;
for (const j of todo) {
  // The dev server reloads the page when app sources change: reopen it and retry this photo.
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await page.evaluate(
        ({ url, taps, debug }) => window.embedPhoto(url, taps, 512, debug),
        { url: `/${ROOT}/${j.photo}`, taps: pilot ? j.taps.slice(0, 4) : j.taps, debug: pilot > 0 },
      );
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`retry ${j.photo}: ${String(e).split('\n')[0]}`);
      await open();
    }
  }
  for (const r of res)
    appendFileSync(
      out,
      JSON.stringify({ photo: j.photo, group: j.group, split: j.split, ...r }) + '\n',
    );
  if (++n % 50 === 0)
    console.log(`${n}/${todo.length} photos, ${((Date.now() - t0) / n / 1000).toFixed(2)} s/photo`);
}
console.log(`done ${n} photos in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
