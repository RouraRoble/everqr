# EverQR

Free QR code generator, bulk generator and expiry checker. Astro 7 static site, Preact islands, no server, no
accounts. See `PRODUCT.md` for data sources/licences and `STATUS.md` for build status.

## Structure

- `src/lib/qr/` — framework-free core logic (payload builders, matrix creation, SVG renderer, contrast, classifier,
  decoder, CSV parser, URL-state encode/decode). Fully unit-tested; safe to import from Node (unit tests) or the
  browser (islands).
- `src/components/Generator.tsx`, `Bulk.tsx`, `Checker.tsx` — the three interactive Preact islands (`client:load`).
- `src/pages/` — `/` (generator), `/bulk/`, `/check/`, `/qr-code-for/<slug>/` (16 programmatic use-case pages),
  `/guide/<slug>/` (3 guides), plus the standard about/contact/privacy/terms/404 pages.
- `src/data/usecases.json`, `src/data/guides.json`, `src/data/redirect-domains.json` — content/config data.
- `tests/unit/` — Vitest unit tests for every `src/lib/qr/*` module plus SEO helpers.
- `tests/e2e/` — Playwright smoke+axe+viewport tests (`smoke.spec.ts`, routes from `tests/routes.json`) and the
  primary-flow tests (`tool.spec.ts`): generate a Wi-Fi code, a design-link round trip, bulk preview, and the
  checker classifying a shipped fixture QR image (`tests/fixtures/sample-qr.png`).

## Commands

- `npm run dev` · `npm run build` (runs icon generation + the SEO audit) · `npm test` (unit) · `npm run test:e2e`
  (Playwright + axe, viewports 320→1920)
- Build for the real deployment path: `SITE=https://rouraroble.github.io BASE=/everqr npm run build` (on Git Bash,
  `export MSYS_NO_PATHCONV=1` first so `/everqr` isn't rewritten to a Windows path).

## Deploy

Push to `main`; `.github/workflows/deploy.yml` builds and publishes to GitHub Pages at
`https://rouraroble.github.io/everqr/`.
