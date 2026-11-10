import { defineConfig, devices } from '@playwright/test';

const port = 5174;

const IPHONE_SPECS = [
  'classification',
  'depth',
  'feedback',
  'full-flow',
  'image-input',
  'layout',
  'linking',
  'load-image',
  'ml-worker',
  'own-wall',
  'pointcloud',
  'pointcloud-aspect',
  'progress',
  'route-view',
  'samples',
  'stable-canvas',
  'wall2-top',
];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 375px = smallest supported phone width (SPEC.md success criterion 9).
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 740 } } },
    // Safari's engine on an iPhone 15 (Amendment 2026-11-04, the iPhone check): the specs that don't
    // need Chromium-only tooling (CDP throttling, the mouse wheel) or Tab walks through buttons
    // (WebKit's Tab skips them, as Safari does by default).
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'] },
      testMatch: IPHONE_SPECS.map((s) => `**/${s}.spec.ts`),
    },
  ],
  // E2E always runs against the fake ML worker; real models never run in CI (SPEC.md › Testing).
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_FAKE_ML: '1' },
  },
});
