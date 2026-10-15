# Trendli9 order service (Cloudflare Worker + R2)

Lets a WhatsApp order carry its image on browsers that can't share files.
The website uploads the order image ("order card": design preview + order details)
and the print files here, then opens WhatsApp with the order text plus a link
(`https://…/o/<id>`). WhatsApp shows the link's preview — the order image — inside
the same message, and the page lists every file for download.

Phones, Chrome/Edge on Windows with WhatsApp Desktop, and Safari still share the
image + text directly; this service is only their fallback.

## Deploy (free Cloudflare plan)

```sh
cd worker
npm install
npx wrangler login                                   # opens the browser once
npx wrangler r2 bucket create trendli9-orders
npx wrangler r2 bucket lifecycle add trendli9-orders expire-orders orders/ --expire-days 90 --force
npx wrangler deploy                                  # prints https://trendli9-orders.<account>.workers.dev
```

Then set that URL as `orderApi` in `assets/js/config.js` and push the site.

## Local test

```sh
npx wrangler dev --port 8787 --local                 # R2 is simulated on disk
```

and temporarily set `orderApi: "http://127.0.0.1:8787"`.

## Limits and safety

- Only origins in `ALLOWED_ORIGINS` (wrangler.jsonc) may upload; add the live domain if it changes.
- 10 uploads per minute per IP, up to 30 image files / 95 MB per order.
- Order ids are random; pages send `noindex`; SVGs are served only as downloads.
- Orders are deleted automatically after 90 days (lifecycle rule above).
