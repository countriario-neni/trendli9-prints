/* Trendli9 Prints — order uploads (Cloudflare Worker + Workers KV)

   POST /orders        multipart form from the website: text, card (PNG order image),
                       preview (small JPEG for link previews), files[] (print files, originals)
                       -> { id, url }
   GET  /o/:id         order page: the order image, the order text and every file to download.
                       Its og:image is the order image, so WhatsApp shows it as a preview
                       right under the order text.
   GET  /o/:id/:name   one stored file

   Order ids are random and unguessable; pages are not indexed. Only the website's
   origins may upload, uploads are size- and rate-limited. Everything expires after
   60 days; files over KV's 25 MB value limit are listed but not stored. */

const MAX_FILES = 30, MAX_TOTAL = 95 * 1024 * 1024, MAX_TEXT = 8000;
const MAX_VALUE = 25 * 1024 * 1024 - 1024, TTL = 60 * 24 * 3600; // KV value limit · keep orders 60 days
const IMAGE = /^image\/(png|jpeg|webp|svg\+xml)$/;
const INLINE = /^image\/(png|jpeg|webp)$/; // SVG is only ever served as a download

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const safeName = n => String(n || "file").replace(/[^\w.-]+/g, "-").replace(/^[.-]+/, "").slice(0, 100) || "file";
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};

    if (url.pathname === "/orders") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
      if (req.method === "POST") return createOrder(req, env, url, cors, okOrigin);
    }
    const m = url.pathname.match(/^\/o\/([a-f0-9]{32})(?:\/([^/]+))?$/);
    if (m && (req.method === "GET" || req.method === "HEAD")) return m[2] ? serveFile(env, m[1], decodeURIComponent(m[2]), url) : orderPage(env, url, m[1]);
    if (url.pathname === "/") return new Response(`${env.BRAND || "Trendli9 Prints"} order service`, { headers: { "Content-Type": "text/plain" } });
    return new Response("Not found", { status: 404 });
  }
};

async function createOrder(req, env, url, cors, okOrigin) {
  if (!okOrigin) return json({ error: "origin not allowed" }, 403, cors);
  if (env.UPLOAD_LIMIT) {
    const { success } = await env.UPLOAD_LIMIT.limit({ key: req.headers.get("CF-Connecting-IP") || "anon" });
    if (!success) return json({ error: "too many orders, try again in a minute" }, 429, cors);
  }
  if (+(req.headers.get("Content-Length") || 0) > MAX_TOTAL + 1024 * 1024) return json({ error: "files too large" }, 413, cors);
  let fd;
  try { fd = await req.formData(); } catch { return json({ error: "bad form" }, 400, cors); }

  const text = String(fd.get("text") || "").replace(/\r\n?/g, "\n").slice(0, MAX_TEXT); // form fields arrive with CRLF
  const card = fd.get("card"), preview = fd.get("preview"), files = fd.getAll("files");
  const isFile = f => f && typeof f === "object" && typeof f.arrayBuffer === "function";
  if (!text.trim() || !isFile(card) || card.type !== "image/png") return json({ error: "order text and order image are required" }, 400, cors);
  if (files.length > MAX_FILES) return json({ error: "too many files" }, 400, cors);
  const all = [card, ...(isFile(preview) ? [preview] : []), ...files];
  if (all.some(f => !isFile(f) || !IMAGE.test(f.type))) return json({ error: "only images can be attached" }, 400, cors);
  if (all.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return json({ error: "files too large" }, 413, cors);

  const id = crypto.randomUUID().replace(/-/g, "");
  const base = `orders/${id}/`;
  const put = async (name, f) => env.ORDERS.put(base + name, await f.arrayBuffer(), { expirationTtl: TTL, metadata: { type: f.type } });
  if (card.size > MAX_VALUE) return json({ error: "order image too large" }, 413, cors);
  const used = new Set(), stored = [], skipped = [];
  await put("card.png", card);
  const hasPreview = isFile(preview) && preview.type === "image/jpeg" && preview.size <= MAX_VALUE;
  if (hasPreview) await put("preview.jpg", preview);
  for (const f of files) {
    if (f.size > MAX_VALUE) { skipped.push({ label: f.name, size: f.size }); continue; }
    let name = "f-" + safeName(f.name), k = 1;
    while (used.has(name)) name = "f-" + safeName(f.name).replace(/(\.[^.]+)?$/, `-${++k}$1`);
    used.add(name);
    await put(name, f);
    stored.push({ name, label: f.name, size: f.size, type: f.type });
  }
  await env.ORDERS.put(base + "meta.json", JSON.stringify({ text, created: new Date().toISOString(), preview: hasPreview, files: stored, skipped }), { expirationTtl: TTL });
  return json({ id, url: `${url.origin}/o/${id}` }, 201, cors);
}

const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

async function serveFile(env, id, name, url) {
  if (!/^(card\.png|preview\.jpg|f-[\w.-]+)$/.test(name)) return new Response("Not found", { status: 404 });
  const { value, metadata } = await env.ORDERS.getWithMetadata(`orders/${id}/${name}`, { type: "stream" });
  if (!value) return new Response("Not found", { status: 404 });
  const type = metadata?.type || "application/octet-stream";
  const download = url.searchParams.has("dl") || !INLINE.test(type);
  return new Response(value, { headers: {
    ...SECURITY, "Content-Type": type, "Cache-Control": "public, max-age=86400",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    ...(download ? { "Content-Disposition": `attachment; filename="${name.replace(/^f-/, "")}"` } : {})
  } });
}

async function orderPage(env, url, id) {
  const meta = await env.ORDERS.get(`orders/${id}/meta.json`, { type: "json" });
  if (!meta) return new Response("Order not found (orders are kept for 60 days)", { status: 404, headers: SECURITY });
  const brand = env.BRAND || "Trendli9 Prints";
  const lines = meta.text.split("\n"), plain = lines.map(l => l.replace(/\*/g, ""));
  const title = plain[0] || `${brand} order`;
  const desc = plain.slice(1).filter(l => l.trim()).slice(0, 4).join(" · ").slice(0, 280);
  const img = `${url.origin}/o/${id}/${meta.preview ? "preview.jpg" : "card.png"}`;
  const body = lines.map(l => {
    const bold = /^\s*\*/.test(l), t = esc(l.replace(/\*/g, ""));
    return bold ? `<b>${t}</b>` : t;
  }).join("\n");
  const files = meta.files.map(f => `<li><a href="/o/${id}/${encodeURIComponent(f.name)}?dl">${esc(f.label)}</a><span>${kb(f.size)}</span></li>`).join("")
    + (meta.skipped || []).map(f => `<li>${esc(f.label)}<span>${kb(f.size)} · too large to store, ask the customer for it</span></li>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(brand)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url.origin + url.pathname)}">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{color-scheme:light}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#F3F4F6;color:#0D0E12}
header{background:#0A0A0A;color:#fff;padding:16px 20px;font-weight:800;letter-spacing:.02em}main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
.card{display:block;background:#fff;border:1px solid #E2E4EA;border-radius:10px;overflow:hidden;margin-bottom:20px}.card img{display:block;width:100%;height:auto}
.box{background:#fff;border:1px solid #E2E4EA;border-radius:10px;padding:16px 20px;margin-bottom:20px}h2{font-size:1rem;margin:0 0 10px}
pre{white-space:pre-wrap;font:inherit;margin:0}ul{list-style:none;margin:0;padding:0}li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #E2E4EA}
li:first-child{border-top:0}a{color:#1F5BFF;font-weight:600;overflow-wrap:anywhere}li span{color:#5A5F6E;white-space:nowrap}.wa{display:inline-block;background:#25D366;color:#062E16;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:800}
</style></head><body><header>${esc(brand.toUpperCase())} · ORDER</header><main>
<a class="card" href="/o/${id}/card.png"><img src="/o/${id}/card.png" alt="Order image: design preview and order details"></a>
<div class="box"><h2>Order details</h2><pre>${body}</pre></div>
${files ? `<div class="box"><h2>Files (${meta.files.length + (meta.skipped || []).length})</h2><ul>${files}</ul></div>` : ""}
<p style="color:#5A5F6E;font-size:.9rem">Created ${esc(new Date(meta.created).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p>
${env.WHATSAPP ? `<a class="wa" href="https://api.whatsapp.com/send?phone=${esc(env.WHATSAPP)}">Chat with ${esc(brand)} on WhatsApp</a>` : ""}
</main></body></html>`;
  return new Response(html, { headers: { ...SECURITY, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
}
