# bouldering_vis
Takeover phase: tidy (next when: follow-ups 1–19, 23, 25 and 26 in docs/ARCHITECTURE.md are done)
- Public repo since 2026-11-11, started as one exported commit (docs/adr/0003-public-repo.md); it was cut by hand (docs/adr/0004-hand-cut-release.md).
- Commands: `npm test` (unit), `npm run lint`, `npm run build`, `npm run e2e` (Playwright).
- ML models run in the browser; real models never run in CI (see docs/ml-runtime.md).
- Every photo shipped is the owner's own, with metadata removed (ADR-0003 (c)).
- Trap: e2e `phone` is Chromium at desktop CPU speed; only `iphone` (WebKit) runs slow. A SPEC time "on a laptop" gets 3× on `iphone` alone, via `budgetMs` (e2e/helpers.ts); CI's `retries: 1` hides a timing fail.
- main is protected, admins included: every change is a PR that passes the four CI checks.
- Known gap: the Play suites that ran on the earlier sample route stay private; they come back on the synthetic route (follow-up 23).
