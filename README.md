# Bouldering Vis

Live: https://bouldering-vis.pages.dev

Pick the holds of a bouldering problem on a photo of a gym wall, then see the route on its own,
a depth map, hold types with grip hints, normal arrows and an orbitable 3D point cloud.
Everything runs in the browser: SlimSAM, Depth Anything V2 Small and CLIP ViT-B/32 through
transformers.js. Photos never leave the device.

Specs: [SPEC.md](SPEC.md) (capability map, decisions, success criteria) and one `SPEC-<module>.md`
per module. Open work: the follow-ups in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Commands

```
npm install
npm run dev       # http://localhost:5173 (real models, downloaded on first use)
npm test          # Vitest unit + component tests
npm run e2e       # Playwright, desktop + 375 px phone, fake ML worker
npm run lint
npm run build     # type-check + production build into dist/
```

Dev-only tools:

- `node scripts/make-synthetic-fixtures.ts` regenerates the committed synthetic fixtures.
- `node scripts/build-clip-text-embeddings.ts` rebuilds `src/data/clip-text-embeddings.json`.
- Most real-model check pages and their runner stay private; the level recorder and the
  hold-embedding page move to `scripts/` ([ADR-0003](docs/adr/0003-public-repo.md) (h), follow-up 25).

## Deploying

The build is a static site. `public/_headers` sets COOP/COEP for Cloudflare Pages.
Deploy: `npm run build && npx wrangler@4.40.0 pages deploy dist --project-name bouldering-vis --branch main`.
`.github/workflows/ci.yml` runs lint, unit, build and E2E on every PR.
