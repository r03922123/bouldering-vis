# bouldering_vis
- Public repo (docs/adr/0003-public-repo.md, docs/adr/0004-hand-cut-release.md). Every photo and video shipped is the owner's own, with metadata removed (ADR-0003 (c)); never commit tests/fixtures/real/, tests/fixtures/hold-data/ or anything else ADR-0003 (d) keeps private.
- Commands: `npm test` (unit), `npm run lint`, `npm run build`, `npm run e2e` (Playwright). One file: `npm test -- src/path/x.test.ts`, `npx playwright test e2e/x.spec.ts --project=desktop`.
- Done = `npm test && npm run lint && npm run build` exit 0 (SPEC.md › Boundaries). See the UI with `VITE_FAKE_ML=1 npm run dev` (http://localhost:5173, no model download).
- ML models run in the browser; real models never run in CI (see docs/ml-runtime.md).
- Trap: e2e `phone` is Chromium at desktop CPU speed; only `iphone` (WebKit) runs slow. A SPEC time "on a laptop" gets 3× on `iphone` alone, via `budgetMs` (e2e/helpers.ts); CI's `retries: 1` hides a timing fail.
- Trap: local E2E reuses any server already on port 5174, even another worktree's: run one tree's E2E at a time. A new spec runs on `iphone` only once it is listed in `IPHONE_SPECS` (playwright.config.ts).
- main is protected, admins included: every change is a PR that passes the four CI checks. Merge with a merge commit (`gh pr merge N --merge --delete-branch`); commit as the GitHub noreply address.
- Trap: the Play E2E specs import `e2e/testLevel.ts`, which serves the synthetic route (`tests/fixtures/synthetic-route.level.json`) and the synthetic wall photo in place of Wall 2's (`page.route`); only `e2e/wall2-top.spec.ts` plays the shipped level. A spec on plain `@playwright/test` sees the real Wall 2.
