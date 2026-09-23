# EverQR

**One-liner:** Static QR codes that can never expire, styled and exportable, plus a checker that tells you whether a QR code you already printed depends on someone's subscription.

**Live (once deployed):** `https://rouraroble.github.io/everqr/`

## What it is

A free, no-account QR code toolkit built around one honest claim: the codes it makes cannot expire, because the data
you enter is encoded directly in the pattern — there is no server, redirect or subscription in the loop. It ships
four tools:

1. **Generator (`/`)** — 10 content types (URL, plain text, Wi-Fi, vCard, email, SMS, phone, WhatsApp, geo, calendar
   event), live styled SVG preview, colour/module/eye-style customisation, contrast warning, optional logo overlay
   (auto-forces ECC H), SVG/PNG export, copy-to-clipboard, and a "copy link to this design" feature that encodes the
   whole design (and, opt-in, the content) into the URL hash via `lz-string`.
2. **Bulk generator (`/bulk/`)** — paste lines or upload a `content,label` CSV (up to 500 rows), preview grid, ZIP
   export (PNG or SVG, named by label) via `jszip`, and a printable label sheet.
3. **QR expiry checker (`/check/`)** — upload/drag/paste an image or use the camera; decodes locally with `jsQR`
   (nothing uploaded) and classifies the payload as static ("cannot expire"), a known dynamic-QR/shortener domain
   ("depends on that service"), or a direct link — plus phishing-pattern flags (http, IP host, punycode, brand in
   subdomain).
4. **Programmatic use-case pages (`/qr-code-for/<slug>/`, 16 pages)** and **guides (`/guide/<slug>/`, 3 pages)** for
   SEO/AEO: each preselects the right content type and explains best practice for that use case.

## Data sources & licences

| Source | Used for | Licence |
| --- | --- | --- |
| [`qrcode`](https://github.com/soldair/node-qrcode) (only `QRCode.create()`) | QR matrix generation | MIT |
| [`jsQR`](https://github.com/cozmo/jsQR) | Client-side decoding in the checker | Apache-2.0 |
| [`jszip`](https://github.com/Stuk/jszip) | Bulk ZIP export | MIT |
| [`lz-string`](https://github.com/pieroxy/lz-string) | Design-link compression | MIT/WTFPL |
| `src/data/redirect-domains.json` (61 entries) | Dynamic-QR/shortener classification in the checker | Compiled by us from each provider's own public description of its service |
| Manrope font | Typeface | SIL Open Font License, via Fontsource (self-hosted) |
| `satori` + `sharp` | Build-time OG image generation | MIT / Apache-2.0 |

No network access happens at build time or runtime; everything above is bundled or generated statically.

## Formulas / logic of note

- **Payload builders** (`src/lib/qr/payloads.ts`): Wi-Fi (`WIFI:T:…;S:…;P:…;H:…;;` with `\;,:"` escaping per the
  ZXing/Android/iOS convention), vCard 3.0 (RFC 2426), bare `VEVENT` (RFC 5545 syntax), `mailto:`/`sms:`/`tel:`/`geo:`
  URIs (RFC 6068/5724/3966/5870), WhatsApp click-to-chat (`wa.me`).
- **Contrast** (`src/lib/qr/contrast.ts`): WCAG relative-luminance formula; warns under a 3:1 ratio (scanners need
  more separation than the 4.5:1 text threshold).
- **Classifier** (`src/lib/qr/classify.ts`): domain match (exact or subdomain) against the redirect-domain list;
  separately flags `http:`, raw IP hosts, punycode, brand-in-subdomain and userinfo tricks regardless of the
  static/dynamic verdict.
- **Design links** (`src/lib/qr/state.ts`): versioned JSON `{v,t,e,d,c?}`, `lz-string`-compressed into `#d=…`;
  decoding sanitises/clamps every field (content type allow-list, ECC allow-list, numeric clamps, hex validation,
  field-count/length caps) so a malicious link cannot hang the page or inject markup.

## Known limits

- The redirect-domain list (61 domains) is a maintained snapshot, not exhaustive.
- A logo overlay hides real data modules; very small prints with a logo may not scan on all readers even at ECC H.
- Camera scanning needs `getUserMedia` over HTTPS; falls back to upload/drag-and-drop when unavailable.
- Long payloads (long URLs, full vCards) need a denser code, which scans less reliably printed small — see
  `/guide/qr-code-size-and-print-dpi/`.

## Monetization hooks (not active)

- `<AdSlot>` placeholders below the generator/bulk/checker tools and on every use-case page (render nothing until
  `PUBLIC_ADSENSE_CLIENT` is set).
- `site.config.ts` → `affiliate` block: three placeholder items (thermal label printer, weatherproof sticker paper,
  table-tent holders) with `rel="sponsored noopener"`, disclosed, URLs left as `#` (no partner signed).
- Documented "Pro" ideas for later: brand kits/saved presets (needs an account, out of scope for this static MVP),
  bulk >500 rows, print-ready PDF sheet export.

## Future ideas

1. Saved brand/style presets (would need a lightweight account or an export/import of a JSON preset file).
2. Print-ready PDF export for the bulk sheet (currently HTML print via a popup window).
3. A larger, community-sourced redirect-domain list with a public correction form.
4. SVG logo pass-through (currently every logo is rasterised to PNG for safety/consistency).
5. Batch vCard import (CSV of contacts → one code per person) as a bulk sub-mode.
