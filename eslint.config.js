import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Modules are imported only through their index.ts (SPEC.md › Project Structure).
// A module may also expose `worker.ts`: pure, worker-safe functions (no React/store).
const deepModuleImport = {
  regex: '(^|/)modules/[^/]+/(?!worker$).+',
  message: 'Import a module through its index.ts (e.g. "../modules/hold-segmentation").',
};
const deepSiblingImport = {
  regex: '^\\.\\./[^./][^/]*/(?!worker$).+',
  message: 'Import a sibling module through its index.ts (e.g. "../hold-segmentation").',
};

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': ['error', { patterns: [deepModuleImport] }],
    },
  },
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [deepModuleImport, deepSiblingImport] }],
    },
  },
  {
    // SPEC-beta-moves B16 and AC 35: the rules engine is pure and deterministic. No randomness,
    // clocks, timers, DOM, storage or network, and it imports only climber-stance. A flat-config
    // override replaces the rule's options, so the repo's two import patterns are repeated here.
    files: ['src/modules/beta-moves/**/*.ts'],
    ignores: ['src/modules/beta-moves/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            deepModuleImport,
            deepSiblingImport,
            {
              regex: '^(react|react-dom|zustand)(/.*)?$',
              message: 'beta-moves is pure logic: no React or state libraries.',
            },
            {
              regex: '(^|/)store(/|$)',
              message: 'beta-moves never reads the store; play-shell passes data in.',
            },
            {
              regex: '^\\.\\./(?!climber-stance$)',
              message: 'beta-moves imports only climber-stance (SPEC-game › Capability Map).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'Date',
          'performance',
          'setTimeout',
          'setInterval',
          'requestAnimationFrame',
          'crypto',
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'navigator',
        ].map((name) => ({ name, message: 'beta-moves is pure and deterministic (B16).' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'beta-moves is deterministic (B16).' },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright runner: Node script whose page.evaluate callbacks run in the browser.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
