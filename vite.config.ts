import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Cross-origin isolation lets onnxruntime-web use multithreaded WASM (SharedArrayBuffer).
// `credentialless` keeps cross-origin model downloads from the HF Hub working.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

/**
 * transformers.js loads the onnxruntime WASM from jsDelivr (pinned to the installed version),
 * but onnxruntime-web still references a local copy, so Vite would emit a dead 26.9 MB asset —
 * over the 25 MiB Cloudflare Pages per-file limit. Drop it from the bundle.
 */
const dropOrtWasm: Plugin = {
  name: 'drop-onnxruntime-wasm',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
  },
};

export default defineConfig({
  plugins: [react(), dropOrtWasm],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    coverage: { include: ['src/modules/**'] },
  },
});
