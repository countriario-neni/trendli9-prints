# Trendli9 order service (Cloudflare Worker + Workers KV)

Lets a WhatsApp order carry its image on browsers that can't share files.
The website uploads the order image ("order card": design preview + order details)
and the print files here, then opens WhatsApp with the order text plus a link
(`https://…/o/<id>`). WhatsApp shows the link's preview — the order image — inside
the same message, and the page lists every file for download.

Phones, Chrome/Edge on Windows with WhatsApp Desktop, and Safari still share the
image + text directly; this service is only their fallback.

## Deploy (free Cloudflare plan, no card needed)

Live: https://trendli9-orders.trendli9-orders.workers.dev (set as `orderApi` in `assets/js/config.js`).
Storage is Workers KV namespace `trendli9-orders` (id in wrangler.jsonc).

```sh
cd worker
npm install
npx wrangler login                                   # opens the browser once
npx wrangler deploy
```

A new account would first need `npx wrangler kv namespace create trendli9-orders` and that id in wrangler.jsonc.

## Local test

```sh
npx wrangler dev --port 8787 --local                 # KV is simulated on disk
```

and temporarily set `orderApi: "http://127.0.0.1:8787"`.

## Limits and safety

- Only origins in `ALLOWED_ORIGINS` (wrangler.jsonc) may upload; add the live domain if it changes.
- 10 uploads per minute per IP, up to 30 image files per order.
- The site uploads the order image, the original designs and print sheets up to 10 MB each;
  larger sheets stay on the customer's device (KV values max 25 MB, 1 GB free storage).
- Order ids are random; pages send `noindex`; SVGs are served only as downloads.
- Every order expires automatically after 60 days.
- To keep big print files too, enable R2 in the dashboard and move storage there.
