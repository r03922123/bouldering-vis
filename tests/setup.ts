import '@testing-library/jest-dom/vitest';

// jsdom has no canvas; components treat a null context as "nothing to draw".
// Real canvas output is covered by the Playwright E2E tests.
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement['getContext'];
