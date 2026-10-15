/* =========================================================
   TRENDLI9 PRINTS — Shared app core
   Header/footer, cart, WhatsApp checkout, orders, chatbot,
   floating WhatsApp widget, reveal animations, lightbox.
   ========================================================= */
(function () {
  "use strict";
  const C = window.T9_CONFIG, CAT = window.T9_CATALOG, I = window.T9_ICON, MK = window.T9_MOCKUPS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeThumb = s => typeof s === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
  const safeHex = h => /^#[0-9a-f]{6}$/i.test(h || "") ? h : "#F7F7F5";
  const money = n => C.currency + Math.round(n).toLocaleString("en-IN");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- storage (safe) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  };

  /* ---------- order files (IndexedDB) ----------
     Print files, mockups and artwork added with a cart item are kept in the
     browser until checkout, so the cart order can send them to WhatsApp too. */
  const fileStore = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("t9_files", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const run = (mode, fn) => db().then(d => new Promise((res, rej) => {
      const t = d.transaction("files", mode), req = fn(t.objectStore("files"));
      t.oncomplete = () => res(req.result); t.onerror = t.onabort = () => rej(t.error);
    }));
    return {
      put: (key, files) => run("readwrite", st => st.put(files, key)),
      get: key => run("readonly", st => st.get(key)).then(v => v || []),
      del: key => run("readwrite", st => st.delete(key)).catch(() => {}),
      clear: () => run("readwrite", st => st.clear()).catch(() => {})
    };
  })();

  /* ---------- WhatsApp ---------- */
  // api.whatsapp.com directly: wa.me's redirect mangles some characters (⚠, ❗, 🔴 arrive as "�") on desktop
  const waLink = text => `https://api.whatsapp.com/send?phone=${C.whatsapp}&text=${encodeURIComponent(text)}`;
  const openWA = text => { const url = waLink(text), w = window.open(url, "_blank"); if (w) w.opener = null; else location.href = url; };

  /* ---------- pricing ---------- */
  function tierFor(qty) { let t = CAT.TIERS[0]; CAT.TIERS.forEach(x => { if (qty >= x.min) t = x; }); return t; }
  function priceLine({ product, qty, areas = ["front"], sizeLabel }) {
    if (product.price == null) return { unit: null, total: null, off: 0 };
    let unit = product.price;
    if (product.sizePrice && sizeLabel && product.sizePrice[sizeLabel] != null) unit = product.sizePrice[sizeLabel];
    if (product.areas) unit += areas.reduce((s, id) => s + ((product.areas.find(a => a.id === id) || {}).add || 0), 0);
    const tier = product.meter ? { off: 0 } : tierFor(qty);
    const total = unit * qty * (1 - tier.off);
    return { unit, total, off: tier.off };
  }

  /* ---------- cart ---------- */
  const cart = {
    items() { return store.get("t9_cart", []); },
    save(items) { store.set("t9_cart", items); updateCartCount(); renderCart(); },
    // files (optional File[]) are kept in IndexedDB and sent with the cart order
    async add(item, files) {
      const items = this.items();
      item.key = item.key || ("c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
      if (files && files.length) {
        try { await fileStore.put(item.key, files); item.files = files.length; }
        catch { toast("Couldn't keep your files on this device - attach them in WhatsApp after checkout"); }
      }
      items.push(item);
      if (!store.set("t9_cart", items)) { item.thumb = null; items[items.length - 1] = item; store.set("t9_cart", items); }
      updateCartCount(true); renderCart();
      toast(`${item.name} added to your order`);
    },
    remove(key) { fileStore.del(key); this.save(this.items().filter(i => i.key !== key)); },
    clear() { fileStore.clear(); this.save([]); },
    total() { return this.items().reduce((s, i) => s + (i.total || 0), 0); },
    hasQuote() { return this.items().some(i => i.total == null); }
  };

  /* ---------- orders ---------- */
  const orders = {
    all() { return store.get("t9_orders", []); },
    add(o) {
      const a = this.all(); a.unshift(o);
      if (store.set("t9_orders", a.slice(0, 50))) return true;
      // storage full: drop thumbnails and keep fewer orders
      return store.set("t9_orders", a.slice(0, 20).map(x => ({ ...x, thumbs: [] })));
    },
    remove(id) { store.set("t9_orders", this.all().filter(o => o.id !== id)); }
  };
  function newOrderId() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `T9-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  function itemText(i, n) {
    const lines = [`${n}. *${i.name}*${i.color ? " — " + i.color : ""}`];
    if (i.sizes && Object.keys(i.sizes).length) lines.push(`   Sizes: ${Object.entries(i.sizes).map(([s, q]) => `${s}×${q}`).join(", ")}`);
    else if (i.variant) lines.push(`   Option: ${i.variant}`);
    lines.push(`   Qty: ${i.qty} ${i.unit || "pcs"}`);
    if (i.areas && i.areas.length) lines.push(`   Print: ${i.areas.join(", ")}`);
    if (i.design) lines.push(`   Design: ${i.design}`);
    if (i.notes) lines.push(`   Notes: ${i.notes}`);
    if (i.files) lines.push(`   Files: ${i.files} attached`);
    lines.push(`   Est.: ${i.total != null ? money(i.total) : "Quote required"}`);
    return lines.join("\n");
  }
  function orderMessage(o) {
    const L = [
      `*NEW ORDER — ${o.id}*`, `via trendli9 website`, ``,
      `*Customer:* ${o.customer.name}`, o.customer.ctype ? `*Customer type:* ${o.customer.ctype}` : null, `*Phone:* ${o.customer.phone}`,
      o.customer.email ? `*Email:* ${o.customer.email}` : null,
      `*City:* ${o.customer.city}`, `*Delivery:* ${o.customer.delivery}`,
      o.customer.address ? `*Address:* ${o.customer.address}` : null,
      o.customer.needBy ? `*Needed by:* ${o.customer.needBy}` : null, ``,
      `*Items*`, ...o.items.map((i, n) => itemText(i, n + 1)), ``,
      `*Estimated total:* ${o.total ? money(o.total) : "—"}${o.hasQuote ? " + quote items" : ""}`,
      o.customer.notes ? `*Notes:* ${o.customer.notes}` : null, ``,
      o.items.some(i => i.files) ? `My artwork / print files are attached.` : o.items.some(i => i.hasArtwork) ? `I will attach my artwork / mockup files in this chat.` : `Please share artwork guidance.`,
      `Please confirm the final price & timeline.`
    ];
    return L.filter(l => l !== null).join("\n");
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    let wrap = $(".toasts");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toasts"; wrap.setAttribute("role", "status"); wrap.setAttribute("aria-live", "polite"); document.body.appendChild(wrap); }
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = I("check") + `<span>${esc(msg)}</span>`;
    wrap.appendChild(t); setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 2800);
  }

  /* ---------- header & footer ---------- */
  const NAV = [
    ["gang-sheet.html", "Gang Sheet"], ["shop.html", "Shop"], ["studio.html", "Design Studio"], ["halftone.html", "Halftone"],
    ["services.html", "Services"], ["gallery.html", "Our Work"], ["about.html", "About"]
  ];
  const page = (location.pathname.split("/").pop() || "index.html").replace(/\?.*$/, "") || "index.html";

  function renderHeader() {
    const host = $("#site-header"); if (!host) return;
    const igUrl = `https://instagram.com/${C.instagram}`;
    host.outerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="announce" aria-label="Announcements"><div class="announce__track">
      ${[0, 1].map(() => `<span><i></i>DTF transfers from ${money(C.dtfPricePerMeter)} / metre</span><span><i></i>No minimum order on custom apparel</span><span><i></i>Bulk & corporate pricing up to 20% off</span><span><i></i>Order on WhatsApp: ${C.phoneDisplay}</span><span><i></i>${esc(C.address.city)} · Shipping across India</span>`).join("")}
    </div></div>
    <header class="site-header" id="top">
      <div class="container site-header__inner">
        <a class="brand" href="index.html" aria-label="${esc(C.brand)} home">
          <img class="brand__mark" src="assets/img/logo-mark-sm.webp" alt="" width="66" height="46">
          <img class="brand__word" src="assets/img/logo-word.webp" alt="${esc(C.brand)}" width="168" height="40">
        </a>
        <nav class="nav" id="nav" aria-label="Main">
          <button class="icon-btn nav__close" type="button" aria-label="Close menu" data-close-nav>${I("close")}</button>
          <ul>${NAV.map(([h, l]) => `<li><a href="${h}"${h === page ? ' aria-current="page"' : ""}>${l}</a></li>`).join("")}
            <li class="nav__extra"><a href="orders.html"${page === "orders.html" ? ' aria-current="page"' : ""}>My Orders</a></li></ul>
          <div class="nav__extra nav__cta">
            <a class="btn btn--wa" href="${waLink("Hi Trendli9! I'd like a quote.")}" target="_blank" rel="noopener">${I("whatsapp")} Chat on WhatsApp</a>
            <a class="btn btn--ghost-light" href="tel:${C.phoneTel}">${I("phone")} ${C.phoneDisplay}</a>
          </div>
        </nav>
        <div class="header-actions">
          <a class="icon-btn icon-btn--ig" href="${igUrl}" target="_blank" rel="noopener" aria-label="Instagram">${I("instagram")}</a>
          <a class="icon-btn icon-btn--orders" href="orders.html" aria-label="My orders" title="My orders">${I("receipt")}</a>
          <button class="icon-btn" type="button" id="cartBtn" aria-label="Open order cart" aria-controls="cartDrawer" aria-expanded="false">${I("cart")}<span class="count" data-n="0">0</span></button>
          <a class="btn btn--wa header-quote" href="${waLink("Hi Trendli9! I'd like a quote.")}" target="_blank" rel="noopener">${I("whatsapp")} Get a Quote</a>
          <button class="icon-btn menu-toggle" type="button" aria-label="Open menu" aria-controls="nav" aria-expanded="false" data-open-nav>${I("menu")}</button>
        </div>
      </div>
    </header>`;
  }

  function renderFooter() {
    const host = $("#site-footer"); if (!host) return;
    const a = C.address;
    host.outerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <img src="assets/img/logo-word.webp" alt="${esc(C.brand)}" width="252" height="60" loading="lazy">
            <p>${esc(C.tagline)} Premium DTF transfers, custom apparel, saree & blouse prints, hotel branding and DTF consumables — from ${esc(a.city)} to all of India.</p>
            <span class="unit-pill">${I("sparkle")} ${esc(C.parent)}</span>
            <div class="socials">
              <a href="https://instagram.com/${C.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${I("instagram")}</a>
              <a href="${waLink("Hi Trendli9!")}" target="_blank" rel="noopener" aria-label="WhatsApp">${I("whatsapp")}</a>
              <a href="mailto:${C.email}" aria-label="Email">${I("mail")}</a>
            </div>
          </div>
          <div><h3>Services</h3><ul>${CAT.SERVICES.map(s => `<li><a href="services.html#${s.id}">${esc(s.name)}</a></li>`).join("")}</ul></div>
          <div><h3>Free tools</h3><ul>
            <li><a href="gang-sheet.html">Auto Gang Sheet</a></li><li><a href="halftone.html">Smart Halftone</a></li>
            <li><a href="studio.html">Design Studio</a></li></ul>
            <h3 style="margin-top:28px">Studio</h3><ul>
            <li><a href="shop.html">Shop all products</a></li><li><a href="gallery.html">Our work</a></li>
            <li><a href="orders.html">My orders</a></li><li><a href="about.html">About us</a></li><li><a href="contact.html">Contact</a></li></ul></div>
          <div><h3>Visit / Contact</h3><ul>
            <li><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.mapsQuery)}" target="_blank" rel="noopener">${esc(a.line1)},<br>${esc(a.line2)},<br>${esc(a.city)}, ${esc(a.state)}</a></li>
            <li><a href="tel:${C.phoneTel}">${C.phoneDisplay}</a></li>
            <li><a href="mailto:${C.email}">${esc(C.email)}</a></li>
            <li style="color:var(--muted-on-dark)">${esc(C.hours)}</li></ul></div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} ${esc(C.brand)}. All rights reserved.</span>
          <span>Unmatched Quality · Flawless Prints · Made in Vizag</span>
        </div>
      </div>
    </footer>`;
  }

  /* ---------- overlays: cart drawer + checkout modal ---------- */
  function renderOverlays() {
    document.body.insertAdjacentHTML("beforeend", `
    <div class="overlay" id="overlay" hidden></div>
    <aside class="drawer" id="cartDrawer" aria-label="Your order" aria-hidden="true" tabindex="-1">
      <div class="drawer__head"><h2>Your order</h2><button class="icon-btn" type="button" data-close-cart aria-label="Close cart">${I("close")}</button></div>
      <div class="drawer__body" id="cartBody"></div>
      <div class="drawer__foot" id="cartFoot"></div>
    </aside>
    <div class="modal" id="checkoutModal" role="dialog" aria-modal="true" aria-labelledby="coTitle" aria-hidden="true">
      <div class="modal__dialog modal__dialog--sm">
        <button class="icon-btn modal__close" type="button" data-close-modal aria-label="Close">${I("close")}</button>
        <form class="modal__body" id="checkoutForm" novalidate>
          <p class="eyebrow">Checkout via WhatsApp</p>
          <h2 id="coTitle" style="font-size:1.5rem">Confirm your details</h2>
          <p class="muted" style="font-size:.95rem">We'll open WhatsApp with your full order pre-filled. Tap <b>Send</b> and our team confirms price, artwork & timeline in the same chat.</p>
          <div class="form-grid">
            <div class="field full" id="coTypeField"><span class="label">Ordering as <span class="req">*</span></span><div class="opt-group" role="radiogroup" aria-label="Customer type">
              <label class="opt"><input type="radio" name="ctype" value="Business"><span>${I("building")} Business</span></label>
              <label class="opt"><input type="radio" name="ctype" value="Individual"><span>${I("users")} Individual</span></label></div><span class="err">Choose Business or Individual</span></div>
            <div class="field"><label for="coName">Full name <span class="req">*</span></label><input class="input" id="coName" name="name" autocomplete="name" required><span class="err">Please enter your name</span></div>
            <div class="field"><label for="coPhone">WhatsApp number <span class="req">*</span></label><input class="input" id="coPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="^[+0-9 ()-]{10,16}$"><span class="err">Enter a valid 10-digit number</span></div>
            <div class="field"><label for="coCity">City <span class="req">*</span></label><input class="input" id="coCity" name="city" autocomplete="address-level2" required><span class="err">Please enter your city</span></div>
            <div class="field"><label for="coNeed">Needed by</label><input class="input" id="coNeed" name="needBy" type="date"></div>
            <div class="field full"><span class="label">Delivery</span><div class="opt-group" role="radiogroup" aria-label="Delivery">
              <label class="opt"><input type="radio" name="delivery" value="Pickup from studio (Vizag)" checked><span>${I("store")} Pickup</span></label>
              <label class="opt"><input type="radio" name="delivery" value="Courier / Delivery"><span>${I("truck")} Courier</span></label></div></div>
            <div class="field full" id="coAddrWrap" hidden><label for="coAddr">Delivery address <span class="req">*</span></label><textarea class="textarea" id="coAddr" name="address" rows="2" autocomplete="street-address"></textarea><span class="err">Please enter delivery address</span></div>
            <div class="field full"><label for="coNotes">Notes for our team</label><textarea class="textarea" id="coNotes" name="notes" rows="2" placeholder="Fabric details, deadline, design changes…"></textarea></div>
          </div>
          <div class="card" style="padding:16px;background:var(--bg);box-shadow:none;margin-bottom:16px">
            <div class="total-row"><span>Items</span><span id="coCount"></span></div>
            <div class="total-row big" style="margin-top:6px"><span>Est. total</span><span id="coTotal"></span></div>
            <p class="note" id="coFiles" style="margin:6px 0 0" hidden></p>
            <p class="note" style="margin:6px 0 0">Indicative price. Final quote confirmed on WhatsApp. No payment is taken on this website.</p>
          </div>
          <button class="btn btn--wa btn--block" type="submit">${I("whatsapp")} Send order on WhatsApp</button>
        </form>
      </div>
    </div>
    <div class="modal" id="filesModal" role="dialog" aria-modal="true" aria-labelledby="fmTitle" aria-hidden="true">
      <div class="modal__dialog modal__dialog--sm">
        <button class="icon-btn modal__close" type="button" data-close-modal aria-label="Close">${I("close")}</button>
        <div class="modal__body">
          <div id="fmReady">
            <p class="eyebrow">Order on WhatsApp</p>
            <h2 id="fmTitle" style="font-size:1.5rem">Your order is ready</h2>
            <p class="muted" id="fmReadyTxt">Preparing your order image…</p>
            <div style="display:grid;gap:8px">
              <button class="btn btn--wa btn--block" type="button" id="fmShare" disabled>${I("whatsapp")} Share to WhatsApp</button>
            </div>
          </div>
          <div id="fmSteps" hidden>
            <p class="eyebrow">Almost done</p>
            <h2 style="font-size:1.5rem">Send your order in WhatsApp</h2>
            <p class="muted" id="fmLead"></p>
            <img class="fm-card" id="fmCard" alt="Your order image: design preview and order details">
            <ol class="fm-steps">
              <li><b>1</b><span id="fmS1"></span></li>
              <li><b>2</b><span>Open the WhatsApp chat — your order text is already in the message box.</span></li>
              <li><b>3</b><span id="fmS3"></span></li>
            </ol>
            <div style="display:grid;gap:8px">
              <button class="btn btn--accent btn--block" type="button" id="fmCopy">${I("copy")} <span>Copy order image</span></button>
              <a class="btn btn--wa btn--block" id="fmWA" href="#" target="_blank" rel="noopener">${I("whatsapp")} Open the WhatsApp chat</a>
              <button class="btn btn--ghost btn--block" type="button" id="fmDlCard">${I("download")} Download order image</button>
              <button class="btn btn--ghost btn--block" type="button" id="fmDlAll">${I("download")} <span>Download print files</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
      <button class="lightbox__btn lightbox__close" type="button" aria-label="Close">${I("close")}</button>
      <button class="lightbox__btn lightbox__prev" type="button" aria-label="Previous">${I("arrowL")}</button>
      <figure style="margin:0"><img alt=""><figcaption class="lightbox__cap"></figcaption></figure>
      <button class="lightbox__btn lightbox__next" type="button" aria-label="Next">${I("arrow")}</button>
    </div>`);
  }

  let lastFocus = null;
  const PAGE = () => [$("main"), $(".site-header"), $(".site-footer"), $(".dock")].filter(Boolean);
  function openLayer(el) {
    if (!$(".drawer.is-open,.modal.is-open")) lastFocus = document.activeElement;
    PAGE().forEach(n => n.inert = true);
    const ov = $("#overlay"); ov.hidden = false; requestAnimationFrame(() => ov.classList.add("is-open"));
    el.classList.add("is-open"); el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => { const f = el.querySelector("input,button,[tabindex]"); (f || el).focus(); }, 60);
  }
  function closeLayers() {
    $$(".drawer.is-open,.modal.is-open").forEach(el => { el.classList.remove("is-open"); el.setAttribute("aria-hidden", "true"); });
    const ov = $("#overlay"); ov.classList.remove("is-open"); setTimeout(() => { if (!ov.classList.contains("is-open")) ov.hidden = true; }, 300);
    document.body.style.overflow = "";
    PAGE().forEach(n => n.inert = false);
    $("#cartBtn")?.setAttribute("aria-expanded", "false");
    if (lastFocus) lastFocus.focus?.();
  }

  function thumbHTML(i) {
    if (safeThumb(i.thumb)) return `<img src="${i.thumb}" alt="">`;
    if (i.mockup) return MK.svg(i.mockup, { color: safeHex(i.colorHex) });
    if (i.img) return `<img src="assets/img/${i.img}.webp" alt="">`;
    return I("package");
  }
  function updateCartCount(bump) {
    const n = cart.items().length, el = $("#cartBtn .count");
    if (el) { el.textContent = n; el.dataset.n = n; }
    if (bump) { const b = $("#cartBtn"); b?.classList.remove("bump"); void b?.offsetWidth; b?.classList.add("bump"); }
  }
  function renderCart() {
    const body = $("#cartBody"), foot = $("#cartFoot"); if (!body) return;
    const items = cart.items();
    if (!items.length) {
      body.innerHTML = `<div class="empty">${I("cart")}<p style="margin-top:12px"><b>Your order is empty.</b><br>Pick a product or design your own.</p>
        <div style="display:grid;gap:8px;max-width:260px;margin:0 auto"><a class="btn" href="shop.html">Browse products</a><a class="btn btn--ghost" href="studio.html">Open Design Studio</a></div></div>`;
      foot.innerHTML = ""; return;
    }
    body.innerHTML = items.map(i => `
      <div class="cart-line">
        <div class="cart-line__img">${thumbHTML(i)}</div>
        <div><h4>${esc(i.name)}</h4><div class="meta">${[i.color, i.variant, i.sizes ? Object.entries(i.sizes).map(([s, q]) => `${s}×${q}`).join(", ") : null, `${i.qty} ${i.unit || "pcs"}`, i.areas?.length ? "Print: " + i.areas.join(", ") : null, i.files ? `${i.files} file${i.files > 1 ? "s" : ""} attached` : null].filter(Boolean).map(esc).join(" · ")}</div>
          <div style="font-weight:900;margin-top:4px">${i.total != null ? money(i.total) : '<span class="badge">Quote</span>'}</div></div>
        <button class="rm" type="button" data-remove="${esc(i.key)}" aria-label="Remove ${esc(i.name)}">${I("trash")}</button>
      </div>`).join("");
    foot.innerHTML = `
      <div class="total-row big"><span>Est. total</span><span>${money(cart.total())}${cart.hasQuote() ? " +" : ""}</span></div>
      ${cart.hasQuote() ? '<p class="note" style="margin:0">"+" Quote items are priced by our team on WhatsApp.</p>' : ""}
      <button class="btn btn--wa btn--block" type="button" data-checkout>${I("whatsapp")} Checkout on WhatsApp</button>
      <button class="btn btn--ghost btn--sm" type="button" data-clear-cart>Clear order</button>`;
  }

  function openCheckout() {
    const items = cart.items(); if (!items.length) return;
    $("#coCount").textContent = items.length + (items.length > 1 ? " products" : " product");
    $("#coTotal").textContent = money(cart.total()) + (cart.hasQuote() ? " +" : "");
    const saved = store.get("t9_customer", {});
    ["name", "phone", "city"].forEach(k => { const el = $(`#checkoutForm [name=${k}]`); if (el && saved[k] && !el.value) el.value = saved[k]; });
    $$(".drawer.is-open").forEach(d => { d.classList.remove("is-open"); d.setAttribute("aria-hidden", "true"); });
    openLayer($("#checkoutModal"));
    loadCheckoutFiles(items);
  }
  // read the cart's files before Send, so sharing can happen inside that tap
  // each item's first file is its preview picture (sheet layout / mockup) for the order card
  let coFiles = [], coPictures = [];
  function loadCheckoutFiles(items) {
    const note = $("#coFiles"), send = $("#checkoutForm [type=submit]"), withFiles = items.filter(i => i.files);
    coFiles = []; coPictures = [];
    note.hidden = !withFiles.length; send.disabled = false;
    if (!withFiles.length) return;
    note.textContent = "Attaching your files…"; send.disabled = true;
    Promise.all(withFiles.map(i => fileStore.get(i.key).catch(() => []))).then(async lists => {
      coPictures = (await Promise.all(lists.map(l => l[0] && /^image\//.test(l[0].type) ? createImageBitmap(l[0]).catch(() => null) : null))).filter(Boolean);
      const seen = new Set();
      coFiles = lists.flatMap(l => l.slice(1)).map(f => { // the same name twice (two gang sheets) gets a number
        let name = f.name, k = 1;
        while (seen.has(name)) name = f.name.replace(/(\.[^.]+)?$/, `-${++k}$1`);
        seen.add(name);
        return name === f.name ? f : new File([f], name, { type: f.type });
      });
      note.textContent = coPictures.length || coFiles.length ? "Your designs go with the order as one order image (preview + details), plus your files where WhatsApp allows." : "Your files couldn't be loaded - attach them in WhatsApp after sending.";
      send.disabled = false;
    });
  }

  function validate(form) {
    let ok = true;
    $$("[required]", form).forEach(el => {
      const f = el.closest(".field"); if (!f || f.hidden || f.closest("[hidden]")) return;
      let valid = el.value.trim() !== "";
      if (valid && el.type === "tel") valid = el.value.replace(/\D/g, "").length >= 10;
      if (valid && el.type === "email") valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value);
      f.classList.toggle("has-error", !valid); el.setAttribute("aria-invalid", String(!valid));
      if (!valid && ok) { el.focus(); ok = false; }
    });
    return ok;
  }

  function bindCheckout() {
    const form = $("#checkoutForm");
    form.addEventListener("change", e => {
      if (e.target.name === "delivery") {
        const courier = e.target.value.startsWith("Courier");
        $("#coAddrWrap").hidden = !courier; $("#coAddr").required = courier;
      }
    });
    form.addEventListener("input", e => { const f = e.target.closest(".field.has-error"); if (f) f.classList.remove("has-error"); });
    form.addEventListener("submit", e => {
      e.preventDefault(); if (!validate(form)) return;
      if (!form.elements.ctype.value) { $("#coTypeField").classList.add("has-error"); form.querySelector("[name=ctype]").focus(); return; }
      const fd = Object.fromEntries(new FormData(form));
      const items = cart.items();
      const o = { id: newOrderId(), date: new Date().toISOString(), customer: fd, items: items.map(({ thumb, ...rest }) => rest), thumbs: items.map(i => i.thumb || null), total: cart.total(), hasQuote: cart.hasQuote() };
      store.set("t9_customer", { name: fd.name, phone: fd.phone, city: fd.city });
      const msg = orderMessage(o);
      o.message = msg; const saved = orders.add(o);
      // one order card (design previews + this order text) leads the files, built inside this tap
      const files = coPictures.length || coFiles.length ? [orderCard(msg.split("\n"), coPictures, `trendli9-order-${o.id}.png`), ...coFiles] : [];
      coFiles = [];
      form.reset(); $("#coAddrWrap").hidden = true; $("#coAddr").required = false;
      if (files.length) { // the order card + files go with the order: share sheet, or copy/paste steps
        orderWithFiles({ text: msg, files }).then(res => {
          if (res !== "shared") { toast(`Order ${o.id} created - send the order image in WhatsApp`); return; }
          closeLayers(); toast(`Order ${o.id} shared - tap Send in WhatsApp`);
          if (saved) setTimeout(() => { location.href = "orders.html?new=" + encodeURIComponent(o.id); }, 1200);
        });
        cart.clear();
        return;
      }
      openWA(msg);
      closeLayers();
      if (!saved) { toast("Order sent to WhatsApp (couldn't save history on this device)"); cart.clear(); return; }
      cart.clear();
      toast(`Order ${o.id} created — send it in WhatsApp`);
      setTimeout(() => { location.href = "orders.html?new=" + encodeURIComponent(o.id); }, 1200);
    });
  }

  /* ---------- WhatsApp orders with images ----------
     wa.me / api.whatsapp.com links carry text only, so every order with files
     gets an "order card": ONE image holding the design preview and the full
     order details. Where the browser can share files (phones, Chrome/Edge on
     Windows, Safari) the card and the text go to WhatsApp together. Elsewhere
     the card is copied to the clipboard and pasted into the chat, where the
     order text is already filled in. Nothing downloads unless asked. */
  function saveFile(file) {
    const url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function downloadAll(files) {
    for (const f of files) { saveFile(f); await new Promise(r => setTimeout(r, 400)); } // one after another
  }
  function dataURLFile(url, name) {
    const i = url.indexOf(","), bin = atob(url.slice(i + 1)), u = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return new File([u], name, { type: url.slice(5, url.indexOf(";")) });
  }
  /* The order card. Synchronous on purpose (toDataURL): it is built inside the
     Send tap, and sharing must still happen within that tap. Landscape and at
     most ~1600 px tall so WhatsApp's photo compression keeps the text readable.
     lines: the WhatsApp order text, line by line · pictures: canvases / images */
  function orderCard(lines, pictures, name = "trendli9-order.png") {
    const W = 1600, P = 56, GAP = 48, TW = 720, PW = W - 2 * P - GAP - TW, HEAD = 112, LH = 38, FOOT = 64;
    const c = document.createElement("canvas"), x = c.getContext("2d");
    const font = (w, s) => `${w} ${s}px Inter, "Segoe UI", system-ui, sans-serif`;
    // wrap the order text (WhatsApp *bold* markers become bold lines)
    const rows = [];
    lines.forEach(raw => {
      const bold = /^\s*\*/.test(raw), t = raw.replace(/\*/g, "");
      if (!t.trim()) { rows.push({ t: "", bold }); return; }
      x.font = font(bold ? 700 : 500, 27);
      const indent = (t.match(/^\s*/) || [""])[0].length ? 28 : 0;
      let line = "";
      t.trim().split(/\s+/).forEach(word => {
        const next = line ? line + " " + word : word;
        if (x.measureText(next).width > TW - indent && line) { rows.push({ t: line, bold, indent }); line = word; }
        else line = next;
      });
      rows.push({ t: line, bold, indent });
    });
    const textH = rows.length * LH;
    // pictures stacked in the right column, scaled to fit
    const pics = pictures.filter(p => p && p.width && p.height);
    let picH = pics.reduce((s, p) => s + PW * p.height / p.width, 0) + 20 * Math.max(0, pics.length - 1);
    const maxPicH = Math.max(textH, 1100), k = picH > maxPicH ? maxPicH / picH : 1;
    picH *= k;
    c.width = W; c.height = Math.round(HEAD + P + Math.max(textH, picH) + P + FOOT);
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, c.width, c.height);
    // header band
    x.fillStyle = "#0A0A0A"; x.fillRect(0, 0, W, HEAD);
    ["#00A8F0", "#E5007E", "#FFC400", "#FFFFFF"].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(P + 9 + i * 26, HEAD / 2, 8, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = "#FFFFFF"; x.textBaseline = "middle"; x.font = font(800, 38); x.fillText(C.brand.toUpperCase(), P + 120, HEAD / 2);
    x.textAlign = "right"; x.font = font(600, 22); x.fillStyle = "#A6AAB8"; x.fillText("ORDER SUMMARY", W - P, HEAD / 2); x.textAlign = "left";
    // text column
    x.textBaseline = "top";
    rows.forEach((r, i) => { x.font = font(r.bold ? 700 : 500, 27); x.fillStyle = r.bold ? "#0A0A0A" : "#262626"; x.fillText(r.t, P + (r.indent || 0), HEAD + P + i * LH); });
    // picture column
    let y = HEAD + P;
    const px = P + TW + GAP;
    pics.forEach(p => {
      const w = PW * k, h = w * p.height / p.width, ox = px + (PW - w) / 2;
      x.drawImage(p, ox, y, w, h);
      x.strokeStyle = "#E2E4EA"; x.lineWidth = 2; x.strokeRect(ox, y, w, h);
      y += h + 20 * k;
    });
    // footer
    x.fillStyle = "#F3F4F6"; x.fillRect(0, c.height - FOOT, W, FOOT);
    x.fillStyle = "#5A5F6E"; x.font = font(500, 22); x.textBaseline = "middle";
    x.fillText(`${C.brand} · WhatsApp ${C.phoneDisplay} · ${C.address.city}`, P, c.height - FOOT / 2);
    return dataURLFile(c.toDataURL("image/png"), name);
  }

  // what the share sheet gets: the card first, then other files while they fit WhatsApp / browser limits
  const SHARE_MAX_FILES = 10, SHARE_MAX_BYTES = 20 * 1024 * 1024, SHARE_MAX_EACH = 15 * 1024 * 1024;
  function shareSet(files) {
    const out = [files[0]];
    let total = files[0].size;
    for (const f of files.slice(1)) {
      if (out.length >= SHARE_MAX_FILES || f.size > SHARE_MAX_EACH || total + f.size > SHARE_MAX_BYTES) continue;
      out.push(f); total += f.size;
    }
    return out;
  }
  const canShareFiles = files => { try { return !!(navigator.canShare && navigator.canShare({ files })); } catch { return false; } };
  // copy/paste is the desktop route; on phones attaching from the gallery is more reliable
  const canCopyImage = () => !!(navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") && matchMedia("(pointer: fine)").matches;
  function copyImage(file) {
    try { return navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]).then(() => true, () => false); }
    catch { return Promise.resolve(false); }
  }

  let cardURL = null;
  function showSteps(text, files, { copied = false, cancelled = false } = {}) {
    const card = files[0], extras = files.slice(1), canCopy = canCopyImage();
    $("#fmReady").hidden = true; $("#fmSteps").hidden = false;
    if (cardURL) URL.revokeObjectURL(cardURL);
    $("#fmCard").src = cardURL = URL.createObjectURL(card);
    $("#fmLead").textContent = cancelled ? "Didn't see WhatsApp in the share list? Send it this way — one image holds your design and all the order details."
      : "One image holds your design and all the order details, so the studio sees everything together.";
    const s1 = $("#fmS1"), copyBtn = $("#fmCopy");
    const setCopied = ok => {
      s1.textContent = ok ? "Order image copied ✓" : canCopy ? "Tap Copy order image." : "Tap Download order image (below).";
      copyBtn.querySelector("span").textContent = ok ? "Copy order image again" : "Copy order image";
    };
    setCopied(copied);
    $("#fmS3").textContent = canCopy ? "In the chat, paste the image (Ctrl+V, or right-click → Paste) and tap Send." : "In the chat, tap 📎, attach the order image and tap Send.";
    copyBtn.hidden = !canCopy;
    copyBtn.onclick = () => copyImage(card).then(ok => { setCopied(ok); toast(ok ? "Order image copied — paste it into the WhatsApp chat" : "Couldn't copy — download the order image instead"); });
    $("#fmWA").href = waLink(text);
    $("#fmDlCard").onclick = () => saveFile(card);
    const dlAll = $("#fmDlAll");
    dlAll.hidden = !extras.length;
    dlAll.querySelector("span").textContent = `Download print files (${extras.length})`;
    dlAll.onclick = () => downloadAll(extras);
    closeLayers(); openLayer($("#filesModal"));
  }
  /* ---------- order link (site/worker) ----------
     For browsers that can't share files: the order image and files are uploaded
     and WhatsApp opens with the order text plus a link to them. WhatsApp shows
     the link's preview (the order image) inside the same message. */
  // the free order store keeps files up to 10 MB each; bigger print sheets stay on the device
  const UPLOAD_MAX_FILES = 29, UPLOAD_MAX_BYTES = 60 * 1024 * 1024, UPLOAD_MAX_EACH = 10 * 1024 * 1024;
  async function previewJPEG(card) { // small image for link previews
    const bm = await createImageBitmap(card), w = Math.min(1200, bm.width), h = Math.round(bm.height * w / bm.width);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, w, h); x.drawImage(bm, 0, 0, w, h);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
    return new File([b], "preview.jpg", { type: "image/jpeg" });
  }
  async function uploadOrder(text, files, onProgress) {
    const fd = new FormData();
    fd.append("text", text);
    fd.append("card", files[0], files[0].name);
    try { const p = await previewJPEG(files[0]); fd.append("preview", p, p.name); } catch { }
    let total = files[0].size, n = 0;
    for (const f of files.slice(1)) {
      if (n >= UPLOAD_MAX_FILES || f.size > UPLOAD_MAX_EACH || total + f.size > UPLOAD_MAX_BYTES) continue;
      fd.append("files", f, f.name); total += f.size; n++;
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", C.orderApi.replace(/\/+$/, "") + "/orders");
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let r = {}; try { r = JSON.parse(xhr.responseText); } catch { }
        xhr.status === 201 && r.url ? resolve(r) : reject(new Error(r.error || "upload failed (" + xhr.status + ")"));
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(fd);
    });
  }
  const withLink = (text, url) => `${text}\n\n📎 Order image & files: ${url}`;
  /* Opens the WhatsApp tab inside this click (so it isn't blocked), uploads, then
     points the tab at the chat. `files` may be a promise (files still preparing). */
  function sendViaLink(text, files) {
    let tab = null;
    try { tab = window.open("", "_blank"); } catch { tab = null; }
    if (tab) { try { tab.opener = null; tab.document.title = "Opening WhatsApp…"; tab.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">Attaching your order image… WhatsApp opens in a moment.</p>'; } catch { } }
    $("#fmReady").hidden = false; $("#fmSteps").hidden = true;
    const btn = $("#fmShare"), txt = $("#fmReadyTxt");
    $("#fmTitle").textContent = "Sending your order…";
    btn.hidden = true; txt.textContent = "Attaching your order image…";
    closeLayers(); openLayer($("#filesModal"));
    return Promise.resolve(files).then(f => uploadOrder(text, f, p => { txt.textContent = `Attaching your order image and files… ${Math.round(p * 100)}%`; })
      .then(({ url }) => {
        const wa = waLink(withLink(text, url));
        if (tab && !tab.closed) { tab.location.replace(wa); closeLayers(); toast("WhatsApp is open with your order and its image — tap Send"); return "shared"; }
        // the browser blocked the tab: one tap opens it
        $("#fmTitle").textContent = "Your order is ready";
        txt.textContent = "Tap the button to open WhatsApp — your order text and its image link are filled in. Then tap Send.";
        btn.hidden = false; btn.disabled = false; btn.focus();
        return new Promise(resolve => { btn.onclick = () => { openWA(withLink(text, url)); closeLayers(); resolve("shared"); }; });
      }, err => {
        console.warn("order upload failed", err);
        if (tab && !tab.closed) tab.close();
        showSteps(text, f, {}); // couldn't upload: fall back to sending the image by hand
        return "fallback";
      }))
      .catch(() => { // the files themselves couldn't be prepared: send the text at least
        if (tab && !tab.closed) tab.location.replace(waLink(text)); else openWA(text);
        closeLayers(); return "fallback";
      });
  }
  // after a share sheet was closed or failed there is no tap left to open a tab: ask for one
  function offerLink(text, files, cancelled) {
    if (!C.orderApi) { showSteps(text, files, { cancelled }); return Promise.resolve("fallback"); }
    $("#fmReady").hidden = false; $("#fmSteps").hidden = true;
    const btn = $("#fmShare"), txt = $("#fmReadyTxt");
    $("#fmTitle").textContent = cancelled ? "WhatsApp not in the list?" : "Send it another way";
    txt.textContent = "Send the order with a link instead — WhatsApp shows your order image right under the order text.";
    btn.hidden = false; btn.disabled = false;
    closeLayers(); openLayer($("#filesModal"));
    return new Promise(resolve => { btn.onclick = () => sendViaLink(text, files).then(resolve); });
  }

  // files[0] is the order card; must run inside the click that sends the order
  function sendNow(text, files) {
    const set = shareSet(files);
    if (canShareFiles(set)) {
      return navigator.share({ files: set, text }).then(() => {
        if (set.length < files.length) toast("Large print files stayed on this device — the studio can ask for them");
        return "shared";
      }, err => offerLink(text, files, !!err && err.name === "AbortError"));
    }
    if (C.orderApi) return sendViaLink(text, files);
    const copying = canCopyImage() ? copyImage(files[0]) : Promise.resolve(false); // still inside the tap
    return copying.then(copied => { showSteps(text, files, { copied }); return "fallback"; });
  }
  /* Send an order with its images. Pass `files` (File[], card first) when they
     are ready in the click; or `getFiles` (async) and the customer gets one
     more tap once they're prepared, because sharing needs a fresh tap. */
  async function orderWithFiles({ text, files, getFiles }) {
    // Preferred everywhere: open the studio's own chat with the order text and the order image
    // (as the link preview) already in place. A share sheet can't pick the chat for the customer.
    if (C.orderApi) return sendViaLink(text, files || getFiles());
    if (files) return sendNow(text, files);
    const probe = [new File([new Uint8Array(8)], "probe.png", { type: "image/png" })];
    if (!canShareFiles(probe)) {
      if (C.orderApi) return sendViaLink(text, getFiles()); // tab opens in this click, upload follows
      const f = await getFiles(); showSteps(text, f, {}); return "fallback";
    }
    $("#fmReady").hidden = false; $("#fmSteps").hidden = true;
    const share = $("#fmShare"), txt = $("#fmReadyTxt");
    $("#fmTitle").textContent = "Your order is ready";
    share.hidden = false; share.disabled = true; txt.textContent = "Preparing your order image…";
    openLayer($("#filesModal"));
    const f = await getFiles();
    txt.textContent = `Tap Share, pick WhatsApp and choose the ${C.brand} chat (${C.phoneDisplay}). Your order image (design + details) and the order text go together.`;
    share.disabled = false; share.focus();
    return new Promise(resolve => {
      share.onclick = () => { closeLayers(); sendNow(text, f).then(resolve); };
    });
  }

  /* ---------- Floating dock: WhatsApp + Chatbot ---------- */
  function renderDock() {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="dock">
        <div style="position:relative">
          <div class="wa-bubble" id="waBubble" role="status"><button class="x" type="button" aria-label="Dismiss">${I("close")}</button>
            <b>Hi there! 👋</b>Need a quote for DTF prints or custom apparel? Chat with us on WhatsApp.</div>
          <a class="fab fab--wa" href="${waLink("Hi Trendli9! I came from your website and need help with an order.")}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${I("whatsapp")}</a>
        </div>
        <button class="fab fab--bot" type="button" id="botBtn" aria-label="Open Trendli9 assistant" aria-controls="chat" aria-expanded="false">${I("bot")}<span class="dot"></span></button>
      </div>
      <section class="chat" id="chat" aria-label="Trendli9 assistant" aria-hidden="true">
        <div class="chat__head"><div class="chat__avatar"><img src="assets/img/logo-mark-sm.webp" alt=""></div>
          <div><b>Trendli9 Assistant</b><small>Typically replies instantly</small></div>
          <button class="icon-btn" type="button" id="chatClose" aria-label="Close assistant">${I("close")}</button></div>
        <div class="chat__body" id="chatBody" aria-live="polite"></div>
        <form class="chat__form" id="chatForm"><label class="sr-only" for="chatInput">Type your question</label>
          <input id="chatInput" autocomplete="off" placeholder="Ask about prices, DTF, orders…">
          <button type="submit" aria-label="Send">${I("send")}</button></form>
      </section>`);
    const bubble = $("#waBubble");
    bubble.querySelector(".x").addEventListener("click", () => { bubble.classList.remove("is-show"); sessionStorage.setItem("t9_bub", "1"); });
    // on phones the dock steps aside while the 3D story fills the screen; the greeting waits until it's done
    const xp = $("#xp"), phone = matchMedia("(max-width: 760px)");
    let bubbleDue = false;
    const showBubble = () => { if (document.body.classList.contains("in-xp") && phone.matches) bubbleDue = true; else bubble.classList.add("is-show"); };
    if (xp) new IntersectionObserver(([en]) => {
      document.body.classList.toggle("in-xp", en.isIntersecting);
      if (en.isIntersecting && phone.matches) bubble.classList.remove("is-show");
      else if (bubbleDue) { bubbleDue = false; bubble.classList.add("is-show"); }
    }, { rootMargin: "0px 0px -60% 0px" }).observe(xp);
    try { if (!sessionStorage.getItem("t9_bub")) setTimeout(showBubble, 7000); } catch { }
    initBot();
  }

  /* ---------- Chatbot (rule-based, runs fully in browser) ---------- */
  function initBot() {
    const chat = $("#chat"), body = $("#chatBody"), btn = $("#botBtn"), form = $("#chatForm"), input = $("#chatInput");
    let started = false;
    const open = () => {
      chat.classList.add("is-open"); chat.setAttribute("aria-hidden", "false"); btn.setAttribute("aria-expanded", "true"); btn.querySelector(".dot")?.remove();
      $("#waBubble").classList.remove("is-show");
      if (!started) { started = true; botSay(R.greet()); }
      setTimeout(() => input.focus(), 200);
    };
    const close = () => { chat.classList.remove("is-open"); chat.setAttribute("aria-hidden", "true"); btn.setAttribute("aria-expanded", "false"); btn.focus(); };
    btn.addEventListener("click", () => chat.classList.contains("is-open") ? close() : open());
    $("#chatClose").addEventListener("click", close);
    chat.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    document.addEventListener("click", e => { const t = e.target.closest("[data-open-bot]"); if (t) { e.preventDefault(); open(); } });

    function userSay(t) { const m = document.createElement("div"); m.className = "msg msg--user"; m.textContent = t; body.appendChild(m); body.scrollTop = body.scrollHeight; }
    function botSay(r) {
      const typing = document.createElement("div"); typing.className = "msg msg--bot typing"; typing.innerHTML = "<i></i><i></i><i></i>"; body.appendChild(typing); body.scrollTop = body.scrollHeight;
      setTimeout(() => {
        typing.remove();
        const m = document.createElement("div"); m.className = "msg msg--bot"; m.innerHTML = r.html; body.appendChild(m);
        if (r.quick?.length) {
          const q = document.createElement("div"); q.className = "quick";
          r.quick.forEach(label => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { q.remove(); handle(label); }); q.appendChild(b); });
          body.appendChild(q);
        }
        body.scrollTop = body.scrollHeight;
      }, reduceMotion ? 50 : 550);
    }
    function handle(text) { userSay(text); botSay(answer(text)); }
    form.addEventListener("submit", e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ""; handle(t); });

    const wa = (t, label = "Continue on WhatsApp") => `<a href="${waLink(t)}" target="_blank" rel="noopener">${label}</a>`;
    const MAIN = ["Services", "Prices", "Design my own", "Track my order", "Talk to a human"];
    const R = {
      greet: () => ({ html: `Hi! I'm the Trendli9 assistant. I can help with <b>DTF prints, custom apparel, saree & blouse prints, hotel branding, bulk orders</b> and <b>DTF consumables</b>. What do you need today?`, quick: MAIN })
    };
    const rules = [
      { k: /^(hi|hello|hey|namaste|hai|good (morning|evening|afternoon))\b/, r: () => R.greet() },
      { k: /track|status|my order|order id|where.*order|t9-/, r: () => {
          const o = orders.all();
          if (!o.length) return { html: `I can't find any orders placed from this device yet. Once you check out, your order ID and summary appear on <a href="orders.html">My Orders</a>, and live updates come from our team in WhatsApp.`, quick: ["Place an order", "Talk to a human"] };
          const top = o.slice(0, 3).map(x => `• <b>${esc(x.id)}</b> — ${new Date(x.date).toLocaleDateString("en-IN")} · ${x.items.length} item(s)`).join("<br>");
          return { html: `Your recent orders on this device:<br>${top}<br><br>See details on <a href="orders.html">My Orders</a>, or ${wa(`Hi Trendli9, please share the status of my order ${o[0].id}.`, "ask for a status update on WhatsApp")}.`, quick: ["Talk to a human"] };
        } },
      { k: /price|cost|rate|charge|how much|quote|₹|rs\b|rupee|per met|pricing/, r: () => ({ html: `Popular starting prices:<br>• <b>DTF gang sheet:</b> ${money(C.dtfPricePerMeter)} / metre (22 × 39 in sheets)<br>• <b>Custom T-shirt:</b> from ${money(349)} incl. front print<br>• <b>Hoodie:</b> from ${money(899)}<br>• <b>Bulk:</b> 5–20% off from 10 pcs<br><br>Try the <a href="gang-sheet.html">Gang Sheet Builder</a> for an instant estimate, or browse the <a href="shop.html">shop</a>. Final quotes are confirmed on WhatsApp.`, quick: ["Bulk order", "Design my own", "Talk to a human"] }) },
      { k: /service|what do you (do|offer)|offer/, r: () => ({ html: `We offer:<br>${CAT.SERVICES.map(s => `• <a href="services.html#${s.id}">${esc(s.name)}</a>`).join("<br>")}`, quick: ["DTF printing", "Saree & blouse", "Hotel branding", "Spare parts"] }) },
      { k: /dtf|transfer|gang ?sheet|film print/, r: () => ({ html: `<b>DTF (Direct-to-Film)</b> prints your design on film with white ink + adhesive powder. You press it on any fabric — cotton, polyester, blends, denim, nylon. Results are vibrant, stretchable and wash-durable.<br><br>Gang sheets start at <b>${money(C.dtfPricePerMeter)}/metre</b>. Ready-to-press single transfers are also available.`, quick: ["Prices", "Press instructions", "Order DTF"] }) },
      { k: /press|temperature|how to apply|heat|peel/, r: () => ({ html: `Heat-press guide:<br>• <b>Temp:</b> 150–160 °C<br>• <b>Time:</b> 12–15 seconds, medium-firm pressure<br>• <b>Peel:</b> hot or cold, as marked on the film<br>• Re-press 5 s with parchment for extra durability<br><br>Wash inside-out in cold water and avoid ironing directly on the print.` , quick: ["Order DTF", "Talk to a human"] }) },
      { k: /saree|sari|blouse|ethnic|kurti|lehenga|dupatta|boutique/, r: () => ({ html: `We print motifs, borders and pallu art on <b>sarees</b>, plus neckline & back designs on <b>blouses</b> — silk, georgette, chiffon and cotton. Boutiques get exclusive, repeatable designs without embroidery lead-times.<br><br>Share your fabric & design on WhatsApp for a quote: ${wa("Hi Trendli9, I'd like a quote for saree / blouse printing.")}`, quick: ["See gallery", "Talk to a human"] }) },
      { k: /hotel|uniform|chef|apron|staff|school|hospital|linen/, r: () => ({ html: `For <b>hotels, restaurants, schools and offices</b> we print crests and logos on chef coats, aprons, staff uniforms, linens and pillow covers — built for commercial laundering. Your logo stays on file for repeat orders.`, quick: ["Bulk order", "Talk to a human"] }) },
      { k: /bulk|corporate|wholesale|event|company|team|reseller|brand|job work|large/, r: () => ({ html: `Bulk & corporate pricing (on garments):<br>• 10+ pcs — <b>5% off</b><br>• 25+ pcs — <b>10% off</b><br>• 50+ pcs — <b>15% off</b><br>• 100+ pcs — <b>20% off</b><br><br>We handle size sheets, names & numbers and size-wise packing. Clothing brands & resellers get dedicated job-work rates.`, quick: ["Design my own", "Talk to a human"] }) },
      { k: /spare|consumable|ink|powder|printhead|head|damper|capping|wiper|pet film|film roll|cleaning/, r: () => ({ html: `We supply tested <b>DTF consumables & spares</b>: C/M/Y/K/W inks, PET film (sheets & rolls), hot-melt powder, printheads (XP600, i3200, L1800), dampers, capping & wiper kits and cleaning solution.<br><br>See the <a href="shop.html?cat=consumables">spares catalogue</a> or ${wa("Hi Trendli9, I need DTF spare parts / consumables. Please share prices.", "get prices on WhatsApp")}.`, quick: ["Talk to a human"] }) },
      { k: /design|customi[sz]e|upload|artwork|logo|my own|mockup|studio/, r: () => ({ html: `Open the <a href="studio.html">Design Studio</a> — pick a product & colour, upload your artwork or add text, drag to position, and see the live price. Then add it to your order and check out on WhatsApp. 🎨`, quick: ["Prices", "Track my order"] }) },
      { k: /time|turnaround|how long|fast|urgent|deliver|days|when/, r: () => ({ html: `${esc(C.turnaround)}<br><br>Need it urgently? ${wa("Hi Trendli9, I have an urgent order. Can you help?", "Message us on WhatsApp")} with your deadline.`, quick: ["Prices", "Talk to a human"] }) },
      { k: /minimum|moq|single|one piece|1 piece|min order/, r: () => ({ html: `No minimum for custom apparel — you can order a <b>single piece</b>. DTF gang sheets start from 1 sheet (22 × 39 in). Bulk discounts begin at 10 pieces.`, quick: ["Design my own", "Prices"] }) },
      { k: /fabric|material|polyester|cotton|nylon|denim|leather|work on/, r: () => ({ html: `DTF works on almost any fabric: <b>cotton, polyester, poly-cotton blends, rayon, silk, denim, nylon, fleece and even leather</b> — light or dark colours.` , quick: ["DTF printing", "Prices"] }) },
      { k: /wash|durab|last|fade|crack/, r: () => ({ html: `Our DTF prints are stretchable and wash-durable. For best life: wash inside-out in cold water, mild detergent, no bleach, and don't iron directly on the print.` , quick: ["Prices"] }) },
      { k: /where|address|location|visit|shop|studio location|map|vizag|visakhapatnam/, r: () => ({ html: `📍 <b>${esc(C.address.line1)}</b>, ${esc(C.address.line2)}, ${esc(C.address.city)}<br>🕒 ${esc(C.hours)}<br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(C.address.mapsQuery)}" target="_blank" rel="noopener">Open in Google Maps</a>`, quick: ["Talk to a human"] }) },
      { k: /pay|payment|upi|gpay|cash|advance/, r: () => ({ html: `No payment is taken on the website. After you send your order on WhatsApp, our team confirms the final quote and shares payment details there.`, quick: ["Talk to a human"] }) },
      { k: /contact|call|phone|number|email|mail|whatsapp|human|agent|person|talk/, r: () => ({ html: `You can reach the team directly:<br>📱 <a href="tel:${C.phoneTel}">${C.phoneDisplay}</a><br>✉️ <a href="mailto:${C.email}">${esc(C.email)}</a><br><br>${wa("Hi Trendli9! I have a question.", "💬 Open WhatsApp chat")}` }) },
      { k: /instagram|insta|social/, r: () => ({ html: `Follow our latest prints on Instagram: <a href="https://instagram.com/${C.instagram}" target="_blank" rel="noopener">@${esc(C.instagram)}</a>` }) },
      { k: /gallery|sample|work|portfolio|see/, r: () => ({ html: `Browse recent prints in our <a href="gallery.html">gallery</a> and on <a href="https://instagram.com/${C.instagram}" target="_blank" rel="noopener">Instagram</a>.` }) },
      { k: /order|buy|place/, r: () => ({ html: `Three easy ways to order:<br>1. <a href="shop.html">Shop</a> a product & add to cart<br>2. <a href="studio.html">Design your own</a> in the studio<br>3. Send your requirement straight to ${wa("Hi Trendli9, I'd like to place an order.", "WhatsApp")}<br><br>Checkout opens WhatsApp with your complete order and an order ID.`, quick: ["Prices", "Design my own"] }) },
      { k: /thank|thanks|ok|great|cool|super/, r: () => ({ html: `Happy to help! Anything else?`, quick: MAIN }) }
    ];
    const alias = { "Talk to a human": "talk to human", "Place an order": "order", "Order DTF": "dtf order buy", "See gallery": "gallery", "Spare parts": "spare" };
    function answer(text) {
      const t = (alias[text] || text).toLowerCase();
      for (const rule of rules) if (rule.k.test(t)) return rule.r();
      return { html: `I'm not sure about that one — our team can answer it right away. ${wa(`Hi Trendli9! Question from your website: ${text}`, "Send this question on WhatsApp")}`, quick: MAIN };
    }
  }

  /* ---------- Lightbox ---------- */
  function initLightbox() {
    const lb = $("#lightbox"), img = lb.querySelector("img"), cap = lb.querySelector(".lightbox__cap");
    let group = [], idx = 0, opener = null;
    const show = i => { idx = (i + group.length) % group.length; const el = group[idx]; img.src = el.dataset.full || el.querySelector("img").src; img.alt = el.querySelector("img").alt; cap.textContent = el.dataset.caption || el.querySelector("img").alt; };
    document.addEventListener("click", e => {
      const f = e.target.closest("[data-lightbox]"); if (!f) return;
      e.preventDefault(); opener = f; group = $$(`[data-lightbox="${f.dataset.lightbox}"]`).filter(x => x.offsetParent !== null); show(group.indexOf(f));
      lb.classList.add("is-open"); document.body.style.overflow = "hidden"; lb.querySelector(".lightbox__close").focus();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches?.("[data-lightbox]")) e.target.click();
    });
    const close = () => { lb.classList.remove("is-open"); document.body.style.overflow = ""; opener?.focus(); };
    lb.querySelector(".lightbox__close").addEventListener("click", close);
    lb.querySelector(".lightbox__prev").addEventListener("click", () => show(idx - 1));
    lb.querySelector(".lightbox__next").addEventListener("click", () => show(idx + 1));
    lb.addEventListener("click", e => { if (e.target === lb) close(); });
    lb.addEventListener("keydown", e => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") show(idx + 1); if (e.key === "ArrowLeft") show(idx - 1); });
  }

  /* ---------- Motion: reveal, counters, tilt, header, ink trail ---------- */
  function initMotion() {
    const header = $(".site-header");
    const onScroll = () => header?.classList.toggle("is-scrolled", scrollY > 10);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return; en.target.classList.add("is-in"); io.unobserve(en.target);
      if (en.target.matches("[data-count]")) countUp(en.target);
    }), { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal,[data-count]").forEach(el => io.observe(el));
    // fallback driven by scroll position: observers can skip beats while the 3D canvas is busy
    let ticking = false;
    const sweep = () => {
      ticking = false;
      const vh = innerHeight;
      $$(".reveal:not(.is-in)").forEach(el => { const r = el.getBoundingClientRect(); if (r.top < vh * .95 && r.bottom > 0) el.classList.add("is-in"); });
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }, { passive: true });
    setTimeout(sweep, 400);

    function countUp(el) {
      const end = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "", dur = reduceMotion ? 0 : 1600, t0 = performance.now();
      const step = t => { const p = dur ? Math.min(1, (t - t0) / dur) : 1; el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString("en-IN") + suffix; if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }

    if (!reduceMotion && matchMedia("(hover:hover) and (pointer:fine)").matches) {
      $$("[data-tilt]").forEach(card => {
        card.addEventListener("pointermove", e => { const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; card.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-4px)`; });
        card.addEventListener("pointerleave", () => { card.style.transform = ""; });
      });
      const hero = $(".hero");
      if (hero) {
        const inks = ["#00A8F0", "#E5007E", "#FFC400", "#7B2FF7", "#FF6B00"]; let last = 0, n = 0;
        hero.addEventListener("pointermove", e => {
          const now = performance.now(); if (now - last < 40) return; last = now;
          const d = document.createElement("span"); d.className = "ink-dot"; d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px";
          d.style.background = inks[n++ % inks.length]; d.style.mixBlendMode = "screen"; document.body.appendChild(d); setTimeout(() => d.remove(), 900);
        });
      }
    }
  }

  /* ---------- global events ---------- */
  function bindGlobal() {
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-open-nav],[data-close-nav],#cartBtn,[data-close-cart],[data-remove],[data-checkout],[data-clear-cart],[data-close-modal],#overlay,[data-wa]");
      if (!t) return;
      if (t.matches("[data-open-nav]")) { $("#nav").classList.add("is-open"); document.body.classList.add("nav-open"); t.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; $("#nav a")?.focus(); }
      else if (t.matches("[data-close-nav]")) closeNav();
      else if (t.id === "cartBtn") { renderCart(); openLayer($("#cartDrawer")); t.setAttribute("aria-expanded", "true"); }
      else if (t.matches("[data-close-cart],[data-close-modal]") || t.id === "overlay") closeLayers();
      else if (t.matches("[data-remove]")) cart.remove(t.dataset.remove);
      else if (t.matches("[data-checkout]")) openCheckout();
      else if (t.matches("[data-clear-cart]")) cart.clear();
      else if (t.matches("[data-wa]")) { e.preventDefault(); openWA(t.dataset.wa); }
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if ($("#nav.is-open")) closeNav();
      if ($(".drawer.is-open,.modal.is-open")) closeLayers();
    });
    function closeNav() { $("#nav").classList.remove("is-open"); document.body.classList.remove("nav-open"); $("[data-open-nav]")?.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; $("[data-open-nav]")?.focus(); }
    $$("#nav a").forEach(a => a.addEventListener("click", () => { $("#nav").classList.remove("is-open"); document.body.classList.remove("nav-open"); document.body.style.overflow = ""; }));
  }

  /* ---------- hydrate static markup: icons + business details ---------- */
  function hydrate(root = document) {
    $$("i[data-icon]", root).forEach(el => { el.outerHTML = I(el.dataset.icon); });
    $$(".ig-handle", root).forEach(el => { el.textContent = C.instagram; });
    $$(".ig-link", root).forEach(el => { el.href = `https://instagram.com/${C.instagram}`; });
    // structured data points at the same Instagram profile
    $$('script[type="application/ld+json"]', root).forEach(el => {
      try { const d = JSON.parse(el.textContent); d.sameAs = [`https://www.instagram.com/${C.instagram}/`]; el.textContent = JSON.stringify(d); } catch { }
    });
  }

  /* ---------- boot ---------- */
  hydrate(); renderHeader(); renderFooter(); renderOverlays(); renderDock();
  bindGlobal(); bindCheckout(); initLightbox(); updateCartCount(); renderCart();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMotion); else initMotion();

  window.T9 = { safeThumb, safeHex, hydrate, $, $$, esc, money, waLink, openWA, orderWithFiles, orderCard, cart, orders, priceLine, tierFor, toast, store, orderMessage, openLayer, closeLayers, validate, reduceMotion };
})();
