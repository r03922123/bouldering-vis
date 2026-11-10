import { ESLint } from 'eslint';
import { join } from 'node:path';

// ESLint's first lint loads the TypeScript parser, slow on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

// SPEC-beta-moves AC 35: the lint guard bites. The module's sources may not reach for randomness,
// clocks, timers, the DOM, storage, the network, React, the store or any module but climber-stance.
const root = join(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd: root });
const source = join(root, 'src/modules/beta-moves/probe.ts');

async function errors(code: string, filePath = source) {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe('the beta-moves lint guard (AC 35)', () => {
  it.each([
    ['Math.random', 'export const x = Math.random();'],
    ['Date', 'export const x = Date.now();'],
    ['new Date', 'export const x = new Date();'],
    ['performance', 'export const x = performance.now();'],
    ['setTimeout', 'setTimeout(() => {}, 1);'],
    ['setInterval', 'setInterval(() => {}, 1);'],
    ['requestAnimationFrame', 'requestAnimationFrame(() => {});'],
    ['crypto', 'export const x = crypto.randomUUID();'],
    ['window', 'export const x = window.innerWidth;'],
    ['document', 'export const x = document.title;'],
    ['localStorage', "export const x = localStorage.getItem('a');"],
    ['sessionStorage', "export const x = sessionStorage.getItem('a');"],
    ['indexedDB', "export const x = indexedDB.open('a');"],
    ['fetch', "export const x = fetch('/a');"],
    ['XMLHttpRequest', 'export const x = new XMLHttpRequest();'],
    ['WebSocket', "export const x = new WebSocket('ws://a');"],
    ['navigator', 'export const x = navigator.userAgent;'],
    ['react', "import { useState } from 'react';\nexport const x = useState;"],
    ['react-dom', "import { createRoot } from 'react-dom/client';\nexport const x = createRoot;"],
    ['the store', "import { useAppStore } from '../../store/app';\nexport const x = useAppStore;"],
    [
      'another module',
      "import { badgeLabels } from '../hold-segmentation';\nexport const x = badgeLabels;",
    ],
    ['pixel-kit', "import * as p from '../pixel-kit';\nexport const x = p;"],
    [
      'a deep climber-stance import',
      "import { solveStance } from '../climber-stance/stance';\nexport const x = solveStance;",
    ],
  ])('rejects %s', async (_, code) => {
    expect((await errors(code)).length).toBeGreaterThan(0);
  });

  it('accepts climber-stance through its index and its own files', async () => {
    expect(
      await errors(
        "import { solveStance } from '../climber-stance';\nimport { HIP_SHIFT } from './types';\nexport const x = [solveStance, HIP_SHIFT];",
      ),
    ).toEqual([]);
  });

  it('leaves the module’s tests alone', async () => {
    expect(
      await errors(
        'export const x = crypto.randomUUID();',
        join(root, 'src/modules/beta-moves/probe.test.ts'),
      ),
    ).toEqual([]);
  });

  it('keeps the repo’s import rules for the other modules', async () => {
    expect(
      await errors(
        "import { x } from '../hold-segmentation/roles';\nexport const y = x;",
        join(root, 'src/modules/climber-stance/probe.ts'),
      ),
    ).toEqual(['no-restricted-imports']);
  });
});
