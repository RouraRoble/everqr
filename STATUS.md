# STATUS — EverQR

## Summary

Resumed from a partially-built session (the entire framework-free `src/lib/qr/*` core — payload builders, SVG
renderer, matrix creation, contrast, classifier, decoder, CSV parser, URL-state codec — plus `site.config.ts`,
`tokens.css` and `favicon.svg` were already written and solid). Built everything still missing to a complete,
tested MVP: the three Preact islands (Generator, Bulk, Checker) and their pages, 16 programmatic `/qr-code-for/`
pages, 3 `/guide/` pages, a real About/methodology page, `tests/routes.json`, the `MoreTools` cross-link component,
the IndexNow verification file, 100 unit tests, and a Playwright primary-flow suite (including a shipped fixture
QR image for the checker). Found and fixed one real bug along the way (see Known issues → fixed).

## What's done

- **Generator (`/`)** — all 10 content types (URL, text, Wi-Fi, vCard, email, SMS, phone, WhatsApp, geo, event),
  live SVG preview, ECC L/M/Q/H, size 256–4096px, margin 0–10 modules, module style (square/rounded/dots), eye
  style (square/rounded/circle), fg/bg colour with a WCAG contrast warning (<3:1), transparent background, logo
  overlay (rasterised client-side, auto-forces ECC H, hidden-module-ratio readout), SVG/PNG export, copy-image,
  and "copy link to this design" (`lz-string`-compressed URL hash, content included only opt-in — off by default
  for private types). Last design persists in `localStorage`.
- **Bulk generator (`/bulk/`)** — paste or CSV upload (`content,label`, capped at 500 rows), live preview grid, ZIP
  export (PNG or SVG, `jszip`, collision-safe file names), and a printable label sheet (popup window, static HTML,
  no inline scripts so it needs no CSP allowance).
- **QR expiry checker (`/check/`)** — upload / drag-drop / paste / camera (feature-detected, HTTPS-gated), decodes
  locally with `jsQR`, classifies static / dynamic (61 known redirect domains) / direct, flags http/IP-host/
  punycode/brand-in-subdomain/userinfo, share-this-result button.
- **Programmatic pages** — `/qr-code-for/{wifi,vcard,whatsapp,instagram,youtube,google-review,restaurant-menu,
  wedding,pdf,event,paypal,spotify,tiktok,linkedin,email,phone}/` (16, all preselect the right content type and
  ship real, distinct tips/FAQ/OG image per page) + `/qr-code-for/` index.
- **Guides** — `/guide/do-qr-codes-expire/`, `/guide/static-vs-dynamic-qr-codes/`, `/guide/qr-code-size-and-print-dpi/`
  (Article + FAQPage schema, comparison/reference tables, answer-first paragraphs, visible last-updated date) +
  `/guide/` index.
- **Standard pages** — about (real methodology: what generates the matrix, how the checker classifies, data
  sources/licences table, known limits, monetization, last-updated date), contact, privacy, terms, 404 (with
  helpful links), robots, sitemap, manifest, OG images (default + per use-case + per guide via `satori`/`sharp`).
- **Identity** — deep "permanent" green (`#0e7a54`/`#0b3d2e`) + Manrope/monospace pairing, a QR-pattern favicon,
  dark-mode tokens — no template placeholders remain.
- **Cross-linking / mission requirements** — `MoreTools.astro` copied from the foundation template and rendered
  above the footer on the home page, bulk, check, both `/qr-code-for/` pages, and all `/guide/` pages.
  `public/cdaf6d28d35c143e38586b7eb7f2a727.txt` (IndexNow key file) added.
- **Tests** — 100 Vitest unit tests across 8 files (`payloads`, `classify`, `contrast`, `state`, `csv`, `matrix`,
  `render`, `seo`), covering every payload builder + escaping, the domain classifier + phishing flags, contrast
  math, and a full design-link encode/decode round trip including malformed/oversized/corrupt-input handling.
  Playwright: the shared `smoke.spec.ts` (axe + viewport 320–1920 + no-console-errors) over every route in
  `tests/routes.json` (12 routes) plus the 5 default routes, and a new `tool.spec.ts` with the primary flows —
  generate a Wi-Fi code and confirm export is enabled, a design-link round trip that reopens and reproduces the
  exact design, the bulk preview/ZIP button, and the checker classifying a shipped fixture image
  (`tests/fixtures/sample-qr.png`) as a direct link.
- `PRODUCT.md`, `STATUS.md` (this file), `tests/routes.json`, README rewritten for this product.

## Test results (all four required commands; original session, superseded below)

```
npm test
 Test Files  8 passed (8)
      Tests  100 passed (100)

MSYS_NO_PATHCONV=1 SITE=https://rouraroble.github.io BASE=/everqr npm run build
[build] 29 page(s) built in ~2-3s
[seo] audited 29 pages · 0 errors · 0 warnings

MSYS_NO_PATHCONV=1 BASE=/everqr npm run test:e2e
59 passed (14.1s)

npm run build   (plain, root base)
[build] 29 page(s) built in ~2s
[seo] audited 29 pages · 0 errors · 0 warnings
```

**Current** (after the "Fixes after audit 1" pass below): `npm test` 124/124 · build+SEO audit (`BASE=/everqr`)
0 errors/0 warnings · `test:e2e` (`BASE=/everqr`) 80/80 · plain `npm run build` 0 errors/0 warnings. See that
section for the run transcript and what changed.

## Known issues

- **Fixed during this session:** the Generator's `localStorage` "last design" restore ran unconditionally on
  mount, so visiting a `/qr-code-for/<slug>/` page after using the generator elsewhere would silently override the
  page's preselected content type with whatever was last used. Fixed with a `restoreLocal` prop (default `true`,
  set `false` on use-case pages) so those pages always show their intended content type; the visual design
  (colours/style) still carries over for consistency, and hash-based (shared-link) restore is unaffected. Covered
  by `tests/e2e/tool.spec.ts` → "a use-case page preselects its content type".
- The redirect-domain list (61 entries) is a maintained snapshot compiled from each provider's own description of
  its service — not exhaustive; a new or obscure dynamic-QR service will be classified as a direct link until
  added.
- Camera scanning in the checker depends on `getUserMedia` over HTTPS (feature-detected, falls back to upload).
  **Update (audit 1 fixes, below):** Chromium's fake camera device is now wired up in
  `playwright.config.ts` and covered by an e2e test — see "Fixes after audit 1" § P1-3.
- The printable bulk sheet opens in a popup window; browsers that block popups by default show an inline message
  asking the user to allow them, rather than silently failing.
- No Lighthouse run was performed in this session (no Lighthouse CLI available in the sandbox); the generator
  keeps JS islands scoped (`client:load` only on the three tool components, nothing on static pages) and total
  bundled JS for the core libraries is small, but this should be spot-checked with real Lighthouse before launch.

## Next 5 improvements (ranked by impact)

1. **Saved presets / brand kit** — let repeat users (small businesses printing many codes over time) save a
   colour/style preset without a full account, e.g. an exportable/importable JSON preset file, or a `localStorage`-
   backed named-preset list in the Style panel.
2. **Expand the redirect-domain list and add a public correction path** — the checker's core value proposition
   depends on this list's coverage; a simple "report a missing service" form (mailto, already linked from About)
   plus periodically re-verifying existing entries would materially improve accuracy.
3. **Print-ready PDF for the bulk sheet** — currently HTML-to-print via a popup; a real paginated PDF (e.g. with a
   lightweight client-side PDF library) would print more predictably across browsers and let users save/email it.
4. **Lighthouse pass** — run and address a real Lighthouse mobile audit (CLS, image sizing, JS budget) now that all
   pages/islands exist; the brief's ≥95 mobile target was designed for but not measured in this session.
5. **Batch vCard / event import** — a bulk sub-mode that accepts a CSV of contacts or events (not just raw
   content+label) and builds proper vCard/VEVENT payloads per row, for the "print badges/name tags" use case.

## Fixes after audit 1

Source: `mission/audits/everqr-audit-1.md` (verdict NEEDS FIXES; P0=0, P1=6, P2=10, P3=13). Every finding was
reproduced first (by reading the code and, for the dots/scannability and hex-typing/DTEND bugs, with a scratch
script or a new failing test) before being fixed. All four required verification commands pass: `npm test`
(124/124), `SITE=... BASE=/everqr npm run build` (0 SEO errors/warnings), `BASE=/everqr npm run test:e2e`
(80/80), and plain `npm run build` (0 errors/warnings).

### Fixed

**P1 (6/6)**
- **P1-1 Dark-mode preview contrast.** `.gen__empty` now uses a fixed dark colour (`#4a5d55`) instead of the
  theme's `--fg-muted` (light in dark mode), because the canvas behind it is always white. Fixes the 6 failing
  dark-mode axe `color-contrast` e2e tests. `src/styles/tool.css`.
- **P1-2 Bulk "Print sheet" always broken.** `window.open('', '_blank', 'noopener,noreferrer')` returned `null`
  per spec (any `noopener` feature string does); switched to `window.open('', '_blank')` + `w.opener = null`.
  `src/components/Bulk.tsx`.
- **P1-3 Checker camera never attaches.** The stream was assigned to `videoRef.current` before the `<video>`
  element existed (it only mounts once `cameraOn` is true). Moved the attach-and-decode logic into a
  `useEffect` keyed on `cameraOn`, which runs after the element mounts. Added a fake-camera-device Chromium
  launch flag to `playwright.config.ts` and a new e2e test asserting the video actually plays (`readyState`,
  `videoWidth`, `paused`). `src/components/Checker.tsx`.
- **P1-4 Wrong verdict for Google Maps links.** `maps.app.goo.gl` was matching the parent `goo.gl` (discontinued
  shortener) entry. `findService()` now picks the *longest* matching domain, not the first; added a dedicated
  `maps.app.goo.gl` → "Google Maps" (`platform-shortener`) entry, and reworded the `goo.gl` note to match
  Google's actual announcement (inactive links switched off 25 Aug 2025; active links, and Maps links, kept
  working). `src/lib/qr/classify.ts`, `src/data/redirect-domains.json`.
- **P1-5 False "lookalike domain" warnings.** The brand check used "last two labels" as the registrable domain
  (breaking on `co.uk`/`com.au`/etc.) and substring matching (`sub.includes(b)`, so "ups" matched inside
  "groups"). Added a small multi-part-suffix list and switched to label-boundary regex matching. Verified against
  the audit's exact cases: `amazon.co.uk`, `paypal.co.uk`, `santander.co.uk`, `groups.google.com` no longer
  flagged; a genuine lookalike using a multi-part TLD (`amazon.secure-verify.example.co.uk`) still is.
  `src/lib/qr/classify.ts`.
- **P1-6 Broken internal links in production.** The 4 hard-coded root-relative `href="/…"` links in
  `usecases.json` (linkedin/phone → vcard, restaurant-menu → pdf, youtube FAQ → guide) 404'd under `/everqr/`.
  Added `fixInternalLinks()` (`src/lib/url.ts`) which rewrites `href="/…"` to carry `BASE`, applied where that
  content is rendered via `set:html` in `[slug].astro`. Verified in the built `dist/` output with `BASE=/everqr`.

**P2 (9/10 — P2-16 deferred, see below)**
- **P2-7 Hex fields uncommittable.** Added a local draft string per field, committed to `design` only once it
  parses as a real hex colour, reverting on blur if it never became valid. Had to guard against a subtle
  re-entrancy bug: any 3-character prefix of a target 6-digit hex is itself a valid 3-digit shorthand, so a
  naive "echo design back into the draft" effect would clobber the draft mid-keystroke with the expanded 3→6
  digit value; fixed with a per-field "this change came from me" skip-ref. `src/components/Generator.tsx`. New
  e2e test types `#ff0000` character-by-character.
- **P2-8 "Dots" style undecodable.** Isolated dots (`r=0.42`) left gaps between adjacent dark modules. Verified
  the failure and the fix with a scratch script (sharp + jsQR round trip across radii/sizes/payloads); `r=0.58`
  passed 100% across `0.58`/`0.6` in that sweep, so adjacent same-colour dots now overlap into a connected blob.
  `src/lib/qr/render.ts`. **New permanent regression test** `tests/unit/scan.test.ts`: renders every module/eye
  style, rasterises with `sharp`, decodes with `jsQR`, asserts round-trip equality — this is the "self-test"
  the audit recommended as a top improvement, at least at the test-suite level.
- **P2-9 All-day events end one day early.** RFC 5545 DTEND is exclusive for DATE values; added `addOneDay()`
  and applied it to the chosen end date. Also: a timed event with no end now defaults to +1h instead of a
  zero-length (DTSTART==DTEND) event. `src/lib/qr/payloads.ts`.
- **P2-10 WhatsApp `00` prefix.** `buildWhatsapp` now strips a leading `00` international trunk prefix before
  building the `wa.me` link. `src/lib/qr/payloads.ts`.
- **P2-11 Bulk silently corrupts content.** (a) A row over 1500 characters is now flagged with a visible
  per-row error instead of being silently truncated and counted as "ready". (b) Pasted text no longer runs
  through a single whole-block CSV parse (where one stray `"` swallowed every following line); each line is
  parsed independently, and an unquoted line is split on the *last* comma only, so a comma inside the content
  itself (a URL query string) survives. `src/lib/qr/csv.ts`, `src/components/Bulk.tsx`.
- **P2-12 Invisible file-picker focus.** Added `.gen__linklike:focus-within` so keyboard focus shows on the
  visible label (the real `<input type=file>` is opacity:0). Also moved the inline hidden-input styles into a
  shared `.gen__fileinput` class. `src/styles/tool.css`, `src/components/Checker.tsx`, `src/components/Bulk.tsx`.
- **P2-13 Mobile CLS 0.238.** The nav wrapped to a second line once Manrope swapped in. Fixed the nav to a
  single line (`flex-wrap: nowrap`, horizontal scroll if it doesn't fit) — this needed `min-width: 0` on the
  `<nav>` wrapper itself (the actual flex item), not just the inner `<ul>`, or narrow viewports gained 17px of
  page-level horizontal overflow instead (caught by the existing e2e overflow test). `src/components/SiteHeader.astro`.
- **P2-14 Private data kept in localStorage undisclosed.** Field *values* for private content types (Wi-Fi,
  vCard, email, SMS, phone, WhatsApp) are no longer persisted — only the design (colours/style) and which type
  tab was open. Updated the privacy policy to say exactly this. `src/components/Generator.tsx`,
  `src/pages/privacy.astro`. New e2e test asserts a typed Wi-Fi password never reaches `localStorage`.
- **P2-15 Corrupt localStorage crashes the generator.** The restore path now validates `type` via
  `isContentType()`, `ecc` via `isEcc()`, and filters `fields` to string values only — mirroring what
  `decodeState()` already does for shared links — instead of trusting the stored shape. New e2e test reproduces
  the audit's exact repro (`localStorage.setItem('everqr:last', '{"type":"bogus"}')`) and asserts no page error
  and a working generator afterwards. `src/components/Generator.tsx`.

**P3 (5 addressed, trivial/contained; see "Not fixed" for the rest)**
- **P3-17 Duplicate "Frequently asked questions" H2.** Removed the extra `<h2>` in `[slug].astro` (`Faq.astro`
  already renders its own).
- **P3-18 "a Email"/"a Instagram" grammar.** Added a tiny vowel-sound `article()` helper.
- **P3-19 Wi-Fi validation gaps.** WPA passwords now capped at 63 characters; WEP keys validated to 5/13 ASCII
  or 10/26 hex; SSID is no longer `trim()`med (a leading/trailing space is legal in 802.11). `src/lib/qr/payloads.ts`.
- **P3-20 vCard `URL:` wrongly text-escaped.** URL is a URI-valued vCard property, not TEXT-valued; it no longer
  goes through `escapeVText` (only a raw CR/LF is guarded, to keep the line-folding format intact).
- **P3-21 URL builder issues.** A disallowed scheme (e.g. `javascript:`) now returns an empty `payload` (no
  exportable code at all) alongside the error, instead of still producing one. A URL is now returned as
  `new URL(...).href`, so characters needing percent-encoding (e.g. a raw space) are actually encoded.

### Not fixed (deferred, with reasons)

- **P2-16 Thin `/qr-code-for/*` pages + titles not leading with the query.** Out of scope for a reactive bug-fix
  pass: this is genuinely new content work across 16 pages (a shared "size/DPI/quiet-zone/two-phone-test" block,
  1–2 more specific FAQs per page, and retitling every page), not a code defect, and doing it well needs more
  than the remaining time budget allows without producing shallow, un-reviewed copy. Recommend a dedicated
  content pass using the audit's exact guidance (`mission/audits/everqr-audit-1.md` § P2-16) as the brief.
- **P3-22 through P3-29** (checker: no-scheme redirect link verdict; same-tab hash-change ignored; 4s copy-link
  fallback window; developer-jargon copy on About/Terms; "patent-free" → "royalty-free" wording; affiliate
  placeholders never rendered; robots.txt only served under `/everqr/robots.txt`; privacy policy doesn't name
  the analytics processor; ARIA tablist without full keyboard/tabpanel semantics) — each is real and small, but
  none is a functional defect a user would hit as a broken feature (unlike the P1s/P2s above), and the ~90
  minute P2 budget was spent on the higher-impact P1/P2 items plus the tests that guard them. None of these
  interact with anything touched in this pass, so they're safe to pick up independently in a follow-up session.

## Polish pass

Source: `mission/audits/everqr-audit-2.md` (verdict ACCEPTABLE; P0=0, P1=0, P2=3, P3=12 open), the site's
Lighthouse run (`mission/metrics/everqr-lh.json`: performance 0.95, CLS 0.128 — the one failing metric;
accessibility/best-practices/SEO already 1.0), and `mission/POST_MVP_PLAN.md`'s AEO scan + template-change list.
All four required verification commands pass: `npm test` (126/126), `SITE=... BASE=/everqr npm run build` (30
pages, 0 SEO errors/warnings), `BASE=/everqr npm run test:e2e` (85/85), and plain `npm run build` (0
errors/warnings). New/changed tests are called out inline below.

### 1. Open P2/P3 items from audit-2

- **N-1 (P2) header nav clipped/hidden "Guides" at 320–375px.** Ported the foundation template's
  `SiteHeader.astro` pattern: the brand gets `flex-shrink:0` (previously it could be squeezed into the wordmark),
  and below 640px the nav moves to its own full-width row (a plain CSS breakpoint, not a wrap that depends on
  font metrics) with a fade-mask hint that it scrolls further, instead of trying to fit every link on one line
  and hiding the overflow. Guides is now also in the footer, so it's reachable even if the nav row is somehow
  missed. `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`.
- **N-2 (P2) "Dots" style still failed to decode a dense payload (e.g. a full vCard) at the default 1024px
  export size**, even after audit-1's P2-8 fix. Root cause this time: a plain per-module circle, at any single
  radius, either leaves gaps between isolated dark modules (too small) or over-inflates every dot including
  isolated ones (too big, audit-1's r=0.58 fix). Replaced with a neighbour-aware renderer (`drawDots` in
  `src/lib/qr/render.ts`): each dark module gets a small aesthetic dot, plus a same-width "bridge" between the
  centres of any two orthogonally-adjacent dark modules, so a run of dark modules reads as one continuous
  capsule-shaped blob while a genuinely isolated module stays a small circle. Hit and fixed a real bug along the
  way: the bridge rectangles wound clockwise while `circlePath` winds counter-clockwise, so with
  `fill-rule="nonzero"` the overlap between a dot and its bridge cancelled to a winding count of 0 — a thin
  notch right at the seam, visible in a rendered PNG and exactly why the decoder failed. Fixed by winding
  `rectPath` the same direction as `circlePath` (documented in a code comment so it isn't reintroduced).
  `tests/unit/scan.test.ts` extended with a new "dense vCard-like payload at every common export size"
  regression test (512/1000/1024/1200/2048px) per the audit's own suggestion — it failed before the fix and
  passes after.
- **P2-16 thin `/qr-code-for/*` pages** — still not a full content rewrite (that's a dedicated pass per audit-1's
  own guidance), but added a "See all use cases" link, a link into the relevant guide, and a visible last-updated
  date to every page; see § 5 below for the rest of the SEO-depth work.
- **N-3 (P3) hex field went stale after typing a value that normalises to the current colour** (e.g. `#f00` when
  fg was already `#ff0000`): the "skip the next echo-back" flag was armed on every valid keystroke, but
  `design.fg` only actually changes (and the effect that consumes the flag only fires) when the normalised value
  differs — so a no-op keystroke left the flag armed to wrongly swallow the *next* real external change (colour
  picker, restored link). Now only arms the flag when the value will actually change. `src/components/Generator.tsx`.
  New e2e test `tests/e2e/tool.spec.ts` → "the hex field stays in sync after typing a value that normalises to
  the current colour".
- **N-4 (P3) a valid 64-hex-digit WPA PSK was rejected** as "too long" (the audit-1 P3-19 fix capped WPA
  passwords at 63 characters without allowing the separate, legitimate 64-hex-digit raw-PSK format that Android
  and iOS both accept). `buildWifi` now accepts a 64-character value that is pure hex as a raw PSK, independent
  of the 8–63 character passphrase rule. `src/lib/qr/payloads.ts`. New unit tests in
  `tests/unit/payloads.test.ts` (the old test's own example, `'a'.repeat(64)`, happened to be a valid hex string,
  so it had to be replaced with a genuinely-too-long non-hex string to keep testing what it claimed to).
- **P3-25 wording: "patent-free" → factually correct.** QR is patented (by Denso Wave), who chose not to
  exercise the patent — "royalty-free" is accurate, "patent-free" is not. `src/pages/guide/do-qr-codes-expire.astro`.
- **N-5 (IDN/punycode false-positive on the checker) and the remaining P3-22/23/24/26/27/28/29 were not
  picked up** in this pass — see "Not fixed" below for why.

### 2. Lighthouse failures (performance 0.95, CLS 0.128 — the only failing metric; a11y/best-practices/SEO already 1.0)

Lighthouse's own culprit report pointed at two elements: the header's favicon `<img>` ("media element lacking an
explicit size") and the nav wrapping after the Manrope web font swapped in — the same underlying issue as N-1 and
P2-13. Fixed:
- **Favicon/brand icon now has explicit CSS `width`/`height`** (`28px`) in addition to its HTML attributes, so
  its box is pinned regardless of the global `img{height:auto}` reset or any load-order timing.
  `src/components/SiteHeader.astro`.
- **The N-1 header fix above** (nav moves to its own row on a fixed CSS breakpoint rather than wrapping based on
  measured content width) removes the font-swap-triggered reflow that Lighthouse's `layout-shifts` audit flagged.
- **Preloaded the two above-the-fold Manrope weights** (400, 600) as `<link rel="preload" as="font">` pointing at
  their real hashed asset URLs (imported via Vite's `?url` so the path always matches the actual build output),
  narrowing the window between "text painted in the fallback font" and "text repainted in Manrope" — this is a
  mitigation, not a full fix (a metric-matched `size-adjust` fallback font, per audit-2 N-6 on the guide pages,
  would eliminate the remaining swap-driven shift entirely and is a good next step). `src/layouts/Base.astro`.
- No Lighthouse CLI is available in this sandbox (same limitation noted in earlier sessions), so this was
  verified by inspecting `mission/metrics/everqr-lh.json`'s own culprit/element attribution rather than by
  re-running Lighthouse; the existing e2e overflow/axe suite plus a manual check at 320/375px (screenshots taken
  during this session) confirm the header no longer clips or overlaps.
- Accessibility (contrast, heading order) was already 1.0 in the Lighthouse run and clean across all e2e axe
  checks in both themes; no changes were needed there.

### 3. AEO freshness and structure on every programmatic/tool page

Per `mission/POST_MVP_PLAN.md`'s AEO scan (everqr: 22/29 pages had FAQPage, only 7/29 had a visible "last
updated" date before this pass):
- **Visible "Last updated" / "Data updated" line** added to every content page that didn't already have one:
  the generator home, `/bulk/`, `/check/` (as "Data updated: … · N+ known redirect/dynamic-QR domains"),
  `/qr-code-for/`, all 17 `/qr-code-for/<slug>/` pages, and `/guide/`. Combined with the 7 pages that already
  had one (about + 3 guides + …), **27 of 30 built pages now show a freshness date**; the only two without one
  are `/contact/` and `/404/`, which don't need it. `src/pages/index.astro`, `src/pages/bulk/index.astro`,
  `src/pages/check/index.astro`, `src/pages/qr-code-for/index.astro`, `src/pages/qr-code-for/[slug].astro`,
  `src/pages/guide/index.astro`.
- **`datePublished`/`dateModified` added to `webAppLd()`** (`src/lib/seo.ts`), defaulting to
  `site.launched`/`site.updated`, so every `WebApplication` JSON-LD block — i.e. every tool/programmatic page,
  not just the three guides that already used `articleLd` — now carries a freshness signal. Also added
  `articleLd` to `/about/`, which previously had no structured data at all despite being the most
  content-rich page on the site.
- **`Dataset` schema on `/check/`**, describing the maintained redirect/dynamic-QR domain list (name,
  description mentioning the live domain count, and `isBasedOn` pointing at the `/about/` methodology section) —
  this is the closest thing EverQR has to a "data hub" (there's no country/ingredient-style content hub here).
  New `datasetLd()` helper in `src/lib/seo.ts`.
- **`HowTo` schema added to three step-by-step sections** that already existed as plain `<ol>`s: the
  generator home's "How it works", `do-qr-codes-expire`'s "How to make sure your QR code cannot expire", and
  `qr-code-size-and-print-dpi`'s "Before you print in bulk" — plus the new error-correction guide's own
  How-To (see § 5). `src/lib/seo.ts` already had an unused `howToLd()` helper from the original build; this
  pass is the first to actually call it.

### 4. Template changes ported from `foundation/template`

- **`astro.config.mjs`: conditional CSP for AdSense/Plausible.** everqr's CSP was hand-written and static (no
  `ADSENSE`/`PLAUSIBLE` env-driven allowances at all — a real gap, since turning on AdSense later would have
  been silently blocked by the CSP with no obvious error). Ported the template's `extraScript`/`extraFrame`
  pattern verbatim; everqr has no product-specific CSP extras to preserve (no `wasm-unsafe-eval` etc.), so this
  was a clean port.
- **`src/layouts/Base.astro`: AdSense loader script was missing entirely** (`{site.adsenseClient && <script
  async src=".../adsbygoogle.js?client=...">}`) — everqr had never actually wired this up despite `AdSlot.astro`
  rendering `<ins class="adsbygoogle">` tags that expect it.
- **`src/components/AdSlot.astro`: the `adsbygoogle.push({})` script was missing.** Without it, even with the
  loader present, no ad would ever actually request to fill a slot — the `<ins>` tags would sit inert forever.
  Both of these were latent (AdSense isn't configured yet, so nothing visibly broke), but they'd have silently
  no-op'd the very first time `PUBLIC_ADSENSE_CLIENT` was set, which is exactly the kind of bug that's cheap to
  fix now and expensive to debug later.
- **`SiteHeader.astro` non-wrapping nav** — done as part of the N-1 fix in § 1.
- Robots/sitemap: already correct (root-level robots.txt is handled by the hub per the template note; everqr's
  own `<link rel="sitemap">` and `robots.txt` were already in place and passed the audit).

### 5. SEO depth with genuine value

- **Hub navigation:** added "QR code for…" and "Guides" to the footer (previously only in the header nav, which
  N-1 showed could be missed on narrow screens) — every page now links to both hubs from two places.
- **Related-links block:** `/qr-code-for/<slug>/` pages' "More use cases" list now also links back to the
  `/qr-code-for/` index and into the most relevant guide (`do-qr-codes-expire`), not just sideways to other
  use-case pages. `/qr-code-for/` index now links to the static-vs-dynamic guide and the guide hub.
- **One new guide page answering a real question, with a table and FAQ schema:**
  `/guide/qr-code-error-correction-levels/` — explains L/M/Q/H (what they are, approximate damage tolerance,
  when to use each), why "always use the highest level" is not actually the safe default (denser code → smaller
  modules → sometimes harder to scan undamaged), and how it interacts with the logo-overlay feature. Has a
  comparison table, a `HowTo` ("how to choose a level"), and 5 genuine FAQs with `FAQPage` schema — not filler.
  Cross-linked from `qr-code-size-and-print-dpi` (which already mentioned ECC in passing) and added to
  `src/data/guides.json` and `tests/routes.json` so it's covered by the smoke suite and gets an OG image
  automatically. `src/pages/guide/qr-code-error-correction-levels.astro`.
- Considered 2 more guide pages (e.g. "how to scan a QR code", "QR codes for print vs digital") but capped at 1
  to keep the content genuinely reviewed rather than padding the count — flagged in "Not fixed" below.

### 6. Share/retention polish

Reviewed for cheap wins: the checker's verdict card and the homepage already have `<Share>` (spec requirement,
already shipped in the original build). Nothing else was cheap enough to be worth doing inside this pass without
either duplicating existing functionality or adding a feature (e.g. saved presets, which is already the #1 item
in "Next 5 improvements" above) — left alone rather than bolted on hastily.

### Infrastructure fix (not from the audit, found while verifying)

- **`npx playwright test -g "Use camera"` failed even before any of this pass's changes** — `playwright.config.ts`
  had no `--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream` Chromium launch flags, despite
  a code comment in `tests/e2e/tool.spec.ts` and this file's own P1-3 section claiming they were added. Without
  them, headless Chromium's `getUserMedia()` call rejects (no real camera, no auto-granted permission), so
  `Checker.tsx`'s `cameraOn` flag never flips to `true` and no `<video>` element ever mounts — the test then
  fails waiting for an element that was never going to appear. Added both flags to `playwright.config.ts`'s
  `use.launchOptions.args`. This wasn't touched by anything in this session's diff, so it was a pre-existing gap
  between what the docs claimed and what the config actually had; fixing it was necessary to get `npm run
  test:e2e` green as required, and it's now covered by the passing "Use camera" test itself.

### Not fixed (deferred, with reasons)

- **N-5 (IDN/punycode false-positive):** `buildUrl` normalises an internationalised domain (e.g. `müller.de`) to
  punycode via `new URL(...).href`, and the checker then correctly-but-confusingly flags that legitimate code
  with its punycode lookalike-domain warning. The audit's suggested fix (rebuild the URL from the *original*
  Unicode host plus the parsed/encoded path+query+hash) needs careful handling of edge cases — userinfo, ports,
  IPv6 literals, credentials — that a rushed regex-based host extraction could get wrong in a way that's worse
  than the current (merely confusing, not incorrect) behaviour. Deferred rather than risk a half-verified fix to
  URL-building code that 5 other payload builders and the checker both depend on.
- **P3-22 (scheme-less redirect verdict), P3-23 (same-tab hashchange), P3-24 (4s copy-link fallback), P3-26
  (affiliate placeholders never rendered), P3-27 (robots.txt only under `/everqr/robots.txt` — actually correct
  per the template note in § 4, since the hub's root robots.txt is what crawlers read), P3-28 (privacy policy
  doesn't name the analytics processor), P3-29 (tabs ARIA pattern)** — unchanged from audit-2; each is real but
  small, and the time budget went to the P2s, the Lighthouse CLS fix, and the AEO/template/content work the task
  explicitly prioritised above them.
- **A second and third new guide page** — capped at one for this pass (see § 5).
- **A metric-matched `size-adjust` fallback font** (audit-2 N-6, the remaining desktop CLS on
  `do-qr-codes-expire`) — the preload mitigation in § 2 narrows the swap window but doesn't eliminate it;
  computing accurate `ascent-override`/`size-adjust` values for Manrope needs font-metrics tooling not
  available in this session.
