# Trendli9 Prints website: project handoff

Read this first. It records everything built so far, how it is deployed, and what is still open.
Everything described here is committed on `main` and live.

## What this is

Static website (HTML/CSS/vanilla JS, **no build step**) for **Trendli9 Prints**, a DTF printing studio in Visakhapatnam (a unit of Colorflu). It sells B2B (job work for printers, brands, garment makers, boutiques, bulk buyers) **and** B2C. All copy must address both.

- **Live:** https://portfolio.hirerockysolutions.com/trendli9-prints/ (GitHub Pages, repo `countriario-neni/trendli9-prints`, branch `main`; this folder is the repo root)
- **Deploy:** commit and `git push origin main`. Pages updates in about 1 minute.
- **Order service:** https://trendli9-orders.trendli9-orders.workers.dev (Cloudflare Worker in `worker/`)
- **Business WhatsApp:** +91 99326 27413 (`919932627413`). Instagram `trend.li9`.

## Rules (learned from the client; do not break)

- **Inches only.** Never show centimetres anywhere on the site.
- **Ordering happens only on WhatsApp.** There are no payments and no accounts. Every ordering section opens WhatsApp **directly on the business number** with the order text filled in **plus a link whose preview image shows the design**. The customer only taps Send.
  - No share sheet, no downloads, no copy/paste, no picking a contact. The client explicitly rejected each of these.
- Use `https://api.whatsapp.com/send?phone=…&text=…`, **never `wa.me`**. wa.me's redirect corrupts emoji and ⚠ into "�".
- **Bump the cache version after any CSS/JS edit:** replace `?v=20261016s` in **all** HTML files with a new value. Assets are served immutable.
- Keep the Trendli9 identity: Bricolage Grotesque + Inter, CMYK logo dots, white paper background. The client likes demaprints.com, but never copy its headings or copy.
- Prefer free / open-source assets. Photo credits go in `THIRD_PARTY_NOTICES.txt`.
- The apron is an **enquiry-only** printing service (`enquiry: true`, `price: null` in the catalog), not a product for sale.
- **No prices anywhere on the site** (client request, 2026-10-16). Every product, service and tool says "Get a quote" / "Quote on WhatsApp"; the team quotes in the chat. Don't add prices, totals, discounts or ₹ figures back.
- Design Studio print sizes are fixed at **2×2, 3×3 and 4×4 in** (the design's longer side). Each mockup print area has `inW` (real width in inches) in `assets/js/mockups.js`, which sets the scale.

## Key files

| File | Role |
|---|---|
| `assets/js/config.js` | Business details: `whatsapp`, `phoneDisplay`, `instagram`, `address`, `orderApi` (Worker URL) |
| `assets/js/catalog.js` | Products (no prices), AUDIENCES/SERVICES, gallery captions |
| `assets/js/app.js` | Shared core: header/footer, cart (IndexedDB `t9_files` stores item files), checkout, `orderCard()`, `previewJPEG()`, `uploadOrder()`, `sendViaLink()`, `orderWithFiles()`, `waLink()`. Exposes `window.T9` |
| `assets/js/gangsheet.js` + `gang-sheet.html` | Gang sheet builder: fixed 22×39 in portrait sheets, overflow onto more sheets, sheet count (no price), repeat mode, 300 DPI PNG export (streamed PNG encoder, pHYs chunk, 6600×11700 px) |
| `assets/js/nest-worker.js` | True-shape nesting (bitset masks) in a Web Worker |
| `assets/js/halftone.js` + `halftone.html` | Halftone / background remover. Has "Send to Gang Sheet" and "Order prints on WhatsApp" buttons |
| `assets/js/studio.js` + `studio.html` | Design Studio (mockups on garments, front/back, 2×2 / 3×3 / 4×4 in print sizes) |
| `assets/js/shop.js` + `shop.html` | Shop, quick view (`?p=<id>`), apron enquiry |
| `contact.html`, `services.html` | Text-only enquiry / quote forms (WhatsApp text, no picture) |
| `tools/build-services.js` | Regenerates the static blocks in `services.html` from the catalog: `node tools/build-services.js` |
| `tools/seo.py` | Writes each page's SEO head (title, description, canonical, Open Graph, JSON-LD incl. LocalBusiness, FAQPage, Services, breadcrumbs) between `<!-- SEO -->` markers, plus `sitemap.xml` and `robots.txt`. Edit titles/descriptions there, not in the HTML: `python3 tools/seo.py` |
| `tools/optimize_images.py` | Converts photos in `assets/img` to resized WebP |
| `worker/` | Order service (see below) |

## How a WhatsApp order works

1. The section builds an **order card** PNG with `T9.orderCard(lines, pictures)`: the design pictures plus the order text. The pictures are kept on `card.pictures`.
2. `T9.orderWithFiles({ text, files | getFiles })` calls `sendViaLink`.
   - A blank tab opens inside the tap, so the browser doesn't block it.
   - The order uploads to the Worker: text, card, preview and print files.
   - The tab is then pointed at `api.whatsapp.com/send?phone=919932627413&text=<order>\n\n📎 Order image & files: <worker>/o/<id>`.
3. The preview image comes from `previewJPEG()`. It is a separate **1200×630 JPEG under 280 KB** showing the design pictures large. WhatsApp shrinks tall images to a tiny thumbnail, so do not go back to using the tall card as the preview.
4. If the upload fails, the code falls back to `showSteps` (manual attach). If the files can't be prepared, WhatsApp opens with the text only.

## Order service (`worker/`)

- Cloudflare Worker + **Workers KV**. R2 isn't enabled on the account because it needs a card.
  - KV binding `ORDERS`. Orders expire after 60 days.
  - Rate limit `UPLOAD_LIMIT`: 10 per 60 s per IP. Files over 25 MB are listed but not stored.
- `POST /orders` accepts uploads only from `ALLOWED_ORIGINS` (in `wrangler.jsonc`). These already include `https://trendli9.com` and `https://www.trendli9.com`.
- `GET /o/:id` is the order page: og:image is the preview, plus the order text and file downloads. `GET /o/:id/:name` serves one file.
- **Deploy:** `cd worker && npm install && npx wrangler deploy`. This needs `npx wrangler login` with the owner's Cloudflare account, which is interactive and has to be done by the owner. Never paste API tokens into chat or commit them.

## Testing that has been done

- Automated Playwright run on the live site across all 10 ordering flows:
  - gang sheet and repeat mode
  - halftone order, and halftone → gang sheet
  - Design Studio
  - shop product, apron enquiry
  - cart with mixed items
  - contact, services quote

  Every flow opened the business number. The 8 flows with pictures each produced an order link whose preview image loads (200).
- Real TEST sends from the owner's WhatsApp to the business number on 2026-10-15. The large preview picture appeared above the order text in the chat.
- How to rerun the test:
  - Generate orders on the live site in a separate browser context that intercepts `whatsapp.com`, and capture `phone`/`text` from the opened tab.
  - Open `web.whatsapp.com/send?phone=…&text=…` in a logged-in WhatsApp Web tab.
  - Wait until `footer img` has `naturalWidth > 60` (the preview has loaded), then click `footer button[aria-label="Send"]`.
  - Only send when the phone is `919932627413` and the text contains "TEST".

## Open tasks

1. **Move to the custom domain trendli9.com.** As of 2026-10-16 the domain is **not registered** (registry RDAP returns 404). The owner must buy it first. Then:
   - DNS: four apex `A` records to 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153, plus `CNAME www` → `countriario-neni.github.io`.
   - Add a file `CNAME` containing `trendli9.com` at the repo root, push, and turn on "Enforce HTTPS" in the repo's Pages settings.
   - `404.html` uses absolute `/trendli9-prints/` paths. Change them to `/` when moving to the root domain. Set `BASE` in `tools/seo.py` to `https://trendli9.com/` and run it (updates canonicals, Open Graph, JSON-LD, sitemap and robots).
   - **Do not add `CNAME` before DNS resolves.** It would redirect the live site to a dead domain.
   - Then re-test every ordering flow on https://trendli9.com.
2. **Client confirmations still pending:** turnaround wording, and real job photos for the gallery (the current ones are placeholders).
3. After any test sends: the owner should delete the TEST messages and remove the test browser under WhatsApp → Linked devices.

## Local development

```
python -m http.server 8765 --bind 127.0.0.1     # site at http://127.0.0.1:8765
cd worker && npx wrangler dev --port 8787 --local # optional local order service
```
`ALLOWED_ORIGINS` already allows `http://127.0.0.1:8765` and `http://localhost:8765`. `config.js` points `orderApi` at the live Worker.
