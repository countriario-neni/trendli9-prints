/* =========================================================
   TRENDLI9 PRINTS — Gang Sheet Builder
   Local-only: files are read in the browser, never uploaded.
   Every sheet is 22 × 39 in, portrait. Designs that don't fit on
   one sheet flow onto Sheet 2, Sheet 3… (never a longer sheet).
   All sizes are stored and shown in inches.
   Packing: MaxRects (free-rectangle list) into fixed bins, with
   optional 90° rotation.
   ========================================================= */
(function () {
  "use strict";
  const T9 = window.T9, C = window.T9_CONFIG;
  if (!T9) return;
  const { $, esc, money, toast } = T9;
  const I = window.T9_ICON;

  const SHEET_W = 22, SHEET_H = 39, DPI = 300;           // inches · print resolution
  const PRICE_M = C.dtfPricePerMeter || 250;             // each 39 in sheet is billed as 1 metre
  const SIZE_MIN = 0.25, W_MAX = 21.5, H_MAX = SHEET_H - 0.5;
  const GAP_MAX = 2, MARGIN_MAX = 1, COPIES_MAX = 2000, MAX_BYTES = 100 * 1024 * 1024;
  const IMPORT_KEY = "t9_gangsheet_import";
  const TYPES = /^image\/(png|jpeg|webp|svg\+xml)$/;
  const EXT = /\.(png|jpe?g|webp|svg)$/i;
  const EPS = 1e-6;
  const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
  const inch = n => f2(n) + " in";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

  const state = {
    mode: "multi",        // "multi" | "repeat"
    designs: [],          // see addFile()
    margin: 0.25, gap: 0.3, rotate: true, together: false,
    repeatId: null, repeatBy: "copies", repCopies: 10, repSheets: 1,
    bg: "checker",
    activeId: null,
    layout: null          // last packing result
  };
  let uid = 0;

  /* ======================================================
     MaxRects bin packer
     items: [{ w, h, ref }]  (sizes already include the gap)
     Places what fits into one binW × binH bin, returns the rest.
     ====================================================== */
  function runBin(items, binW, binH, allowRot, rule) {
    let free = [{ x: 0, y: 0, w: binW, h: binH }];
    const placed = [], rest = [];
    // smallest dimension still to be placed (suffix minimum) -> drop useless free slivers
    const minDim = new Array(items.length + 1).fill(Infinity);
    for (let i = items.length - 1; i >= 0; i--) minDim[i] = Math.min(minDim[i + 1], items[i].w, items[i].h);

    for (let n = 0; n < items.length; n++) {
      const it = items[n];
      let best = null, b1 = Infinity, b2 = Infinity, b3 = Infinity;
      for (let k = 0; k < free.length; k++) {
        const f = free[k];
        for (let o = 0; o < (allowRot && it.w !== it.h ? 2 : 1); o++) {
          const w = o ? it.h : it.w, h = o ? it.w : it.h;
          if (w > f.w + EPS || h > f.h + EPS) continue;
          const short = Math.min(f.w - w, f.h - h), bottom = f.y + h;
          // "bssf": best-short-side-fit, ties -> lowest bottom edge
          // "bottom": lowest bottom edge first (fills the sheet top-down), ties -> BSSF
          const s1 = rule === "bssf" ? short : bottom, s2 = rule === "bssf" ? bottom : short, s3 = f.x;
          if (s1 < b1 - EPS || (Math.abs(s1 - b1) <= EPS && (s2 < b2 - EPS || (Math.abs(s2 - b2) <= EPS && s3 < b3)))) {
            b1 = s1; b2 = s2; b3 = s3; best = { x: f.x, y: f.y, w, h, rot: !!o, ref: it.ref };
          }
        }
      }
      if (!best) { rest.push(it); continue; } // no room left on this sheet
      placed.push(best);

      // split every free rect that intersects the placed one
      const kept = [], added = [], md = minDim[n + 1];
      const R = best, rx2 = R.x + R.w, ry2 = R.y + R.h;
      for (let k = 0; k < free.length; k++) {
        const f = free[k], fx2 = f.x + f.w, fy2 = f.y + f.h;
        if (R.x >= fx2 - EPS || rx2 <= f.x + EPS || R.y >= fy2 - EPS || ry2 <= f.y + EPS) { kept.push(f); continue; }
        if (R.x > f.x + EPS) added.push({ x: f.x, y: f.y, w: R.x - f.x, h: f.h });
        if (rx2 < fx2 - EPS) added.push({ x: rx2, y: f.y, w: fx2 - rx2, h: f.h });
        if (R.y > f.y + EPS) added.push({ x: f.x, y: f.y, w: f.w, h: R.y - f.y });
        if (ry2 < fy2 - EPS) added.push({ x: f.x, y: ry2, w: f.w, h: fy2 - ry2 });
      }
      // prune: drop slivers nothing can use, then rects contained in others.
      // Old rects were already mutually maximal, so only pairs involving a new rect need checking.
      const useful = r => r.w + EPS >= md && r.h + EPS >= md;
      const inside = (a, b) => a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS;
      const add2 = added.filter(useful);
      const newOk = [];
      for (let i = 0; i < add2.length; i++) {
        const a = add2[i];
        let drop = false;
        for (let j = 0; j < kept.length && !drop; j++) if (inside(a, kept[j])) drop = true;
        for (let j = 0; j < add2.length && !drop; j++) if (j !== i && inside(a, add2[j]) && (!inside(add2[j], a) || j < i)) drop = true;
        if (!drop) newOk.push(a);
      }
      free = [];
      for (let j = 0; j < kept.length; j++) {
        const k = kept[j];
        if (!useful(k)) continue;
        let drop = false;
        for (let i = 0; i < newOk.length && !drop; i++) if (inside(k, newOk[i])) drop = true;
        if (!drop) free.push(k);
      }
      for (let i = 0; i < newOk.length; i++) free.push(newOk[i]);
    }
    return { placed, rest };
  }

  const ORDERS = [
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h
  ];
  // "together": order design by design, so every copy of a design is placed next to its siblings
  function ordered(items, ord, together) {
    if (!together) return items.slice().sort(ord);
    const groups = new Map();
    items.forEach(it => { if (!groups.has(it.ref)) groups.set(it.ref, []); groups.get(it.ref).push(it); });
    return Array.from(groups.values()).sort((a, b) => ord(a[0], b[0])).flat();
  }
  const usedH = placed => placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  // Fill sheet after sheet until everything is placed; keep the ordering/rule that needs fewest sheets.
  function packSheets(items, binW, binH, allowRot, together) {
    if (!items.length) return [];
    let best = null, bestTail = Infinity;
    for (const ord of ORDERS) {
      const sorted = ordered(items, ord, together);
      for (const rule of ["bottom", "bssf"]) {
        const sheets = [];
        let rest = sorted;
        while (rest.length) {
          const r = runBin(rest, binW, binH, allowRot, rule);
          if (!r.placed.length) break; // cannot happen: oversize items are filtered out before packing
          sheets.push(r.placed); rest = r.rest;
        }
        const tail = usedH(sheets[sheets.length - 1]);
        if (!best || sheets.length < best.length || (sheets.length === best.length && tail < bestTail - EPS)) { best = sheets; bestTail = tail; }
      }
    }
    return best;
  }

  /* ======================================================
     Model helpers (inches)
     ====================================================== */
  // art size in source pixels after trim + rotation
  const artPx = d => (d.rot % 2 ? [d.trim.h, d.trim.w] : [d.trim.w, d.trim.h]);
  const aspect = d => { const [w, h] = artPx(d); return h / w; };
  // rounded so float noise (299.9999) never downgrades a 300 DPI design
  const dpiOf = d => d.vector ? Infinity : Math.round(Math.min(artPx(d)[0] / d.wIn, artPx(d)[1] / d.hIn));
  const usable = () => [SHEET_W - 2 * state.margin, SHEET_H - 2 * state.margin];
  const stretched = d => !d.lock && Math.abs(d.hIn / d.wIn - aspect(d)) > 0.01 * aspect(d);

  // Does the design fit inside 22 × 39 in minus the margins (rotated if allowed)?
  function fitOf(d) {
    const [UW, UH] = usable(), w = d.wIn, h = d.hIn, rot = state.rotate;
    const inRange = w >= SIZE_MIN - EPS && h >= SIZE_MIN - EPS && w <= W_MAX + EPS && h <= H_MAX + EPS;
    const fits = inRange && ((w <= UW + EPS && h <= UH + EPS) || (rot && h <= UW + EPS && w <= UH + EPS));
    if (fits) return { fits };
    // largest size with the same proportions that would fit
    const lim = Math.min(W_MAX / w, H_MAX / h);
    const s1 = Math.min(UW / w, UH / h, lim), s2 = rot ? Math.min(UH / w, UW / h, lim) : 0;
    const s = Math.max(s1, s2);
    return { fits, maxW: Math.floor(w * s * 100) / 100, maxH: Math.floor(h * s * 100) / 100 };
  }
  // ok | review (150–299 DPI, no transparency, stretched) | bad (< 150 DPI or doesn't fit)
  function statusOf(d) {
    const dpi = dpiOf(d);
    if (!fitOf(d).fits || dpi < 150) return "bad";
    if (dpi < 300 || d.opaque || stretched(d)) return "review";
    return "ok";
  }
  const dpiLabel = d => {
    const dpi = dpiOf(d);
    if (!isFinite(dpi)) return { cls: "ok", txt: "Vector ✓" };
    const n = dpi;
    return n >= 300 ? { cls: "ok", txt: `${n} DPI ✓` } : n >= 150 ? { cls: "review", txt: `${n} DPI · review` } : { cls: "bad", txt: `${n} DPI · needs a fix` };
  };

  // how many copies of one design fit on a single sheet
  function perSheet(d) {
    const g = state.gap, [UW, UH] = usable(), bw = UW + g, bh = UH + g, w = d.wIn + g, h = d.hIn + g;
    const cap = Math.min(COPIES_MAX, Math.floor(bw * bh / (w * h)) + 1);
    const items = Array.from({ length: cap }, () => ({ w, h, ref: d }));
    return Math.max(...["bottom", "bssf"].map(rule => runBin(items, bw, bh, state.rotate, rule).placed.length));
  }
  const repeatDesign = () => state.designs.find(d => d.id === state.repeatId) || state.designs[0] || null;

  function compute() {
    const m = state.margin, g = state.gap, [UW, UH] = usable();
    const repeat = state.mode === "repeat", rd = repeat ? repeatDesign() : null;
    const list = repeat ? (rd ? [rd] : []) : state.designs;
    const items = [], oversize = [];
    let per = 0;
    for (const d of list) {
      if (!fitOf(d).fits) { oversize.push(d); continue; }
      let n = d.qty;
      if (repeat) {
        per = perSheet(d);
        n = state.repeatBy === "sheets" ? Math.min(COPIES_MAX, per * state.repSheets) : state.repCopies;
      }
      for (let q = 0; q < n; q++) items.push({ w: d.wIn + g, h: d.hIn + g, ref: d });
    }
    const t0 = performance.now();
    const sheets = packSheets(items, UW + g, UH + g, state.rotate, state.together && !repeat);
    const prints = sheets.reduce((s, p) => s + p.length, 0);
    const area = sheets.reduce((s, sh) => s + sh.reduce((a, p) => a + (p.w - g) * (p.h - g), 0), 0);
    return {
      m, g, sheets, oversize, prints, per, ms: performance.now() - t0,
      eff: sheets.length ? area / (sheets.length * SHEET_W * SHEET_H) * 100 : 0,
      price: sheets.length * PRICE_M
    };
  }

  /* ======================================================
     File loading
     ====================================================== */
  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("decode"));
      img.src = url;
    });
  }
  function hasTransparency(img, isJpeg) {
    if (isJpeg) return false;
    try {
      const s = Math.min(1, 160 / Math.max(img.naturalWidth || 160, img.naturalHeight || 160));
      const w = Math.max(1, Math.round((img.naturalWidth || 160) * s)), h = Math.max(1, Math.round((img.naturalHeight || 160) * s));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(img, 0, 0, w, h);
      const a = x.getImageData(0, 0, w, h).data;
      for (let i = 3; i < a.length; i += 4) if (a[i] < 250) return true;
      return false;
    } catch { return true; } // can't sample (e.g. tainted SVG) — don't warn
  }
  // default print width: 10 in or the art's 300-DPI width, whichever is smaller
  const defaultWidth = d => clamp(d.vector ? 10 : Math.min(10, artPx(d)[0] / DPI), SIZE_MIN, W_MAX);
  async function addFile(file, name, widthIn, url = URL.createObjectURL(file)) {
    const type = file.type || "";
    if (!TYPES.test(type) && !EXT.test(name || "")) { URL.revokeObjectURL(url); toast(`${name || "File"} skipped — use PNG, JPG, WEBP or SVG`); return false; }
    if (file.size > MAX_BYTES) { URL.revokeObjectURL(url); toast(`${name || "File"} skipped — files can be up to 100 MB`); return false; }
    try {
      const img = await loadImage(url);
      const vector = /svg/i.test(type) || /\.svg$/i.test(name || "");
      let pw = img.naturalWidth, ph = img.naturalHeight;
      if (!pw || !ph) { pw = 1000; ph = 1000; } // SVG without intrinsic size
      const d = {
        id: "d" + (++uid), name: name || "design", file, img, url, pw, ph, vector,
        trim: { x: 0, y: 0, w: pw, h: ph }, rot: 0, flipH: false, flipV: false,
        wIn: 0, hIn: 0, lock: true, qty: 1,
        opaque: !hasTransparency(img, /jpe?g$/i.test(type) || /\.jpe?g$/i.test(name || ""))
      };
      d.wIn = widthIn ? clamp(widthIn, SIZE_MIN, W_MAX) : defaultWidth(d);
      d.hIn = d.wIn * aspect(d);
      state.designs.push(d);
      state.activeId = d.id;
      if (!state.repeatId) state.repeatId = d.id;
      return true;
    } catch {
      URL.revokeObjectURL(url);
      toast(`Couldn't read ${name || "that file"}`);
      return false;
    }
  }
  const upEl = $("#gsUpload");
  async function addFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    let n = 0;
    upEl.hidden = false;
    for (let i = 0; i < files.length; i++) {
      const f = files[i], url = URL.createObjectURL(f);
      $("#gsUpThumb").src = url;
      $("#gsUpCount").textContent = `${i + 1} / ${files.length}`;
      $("#gsUpBar").style.width = `${(i + 1) / files.length * 100}%`;
      await new Promise(r => requestAnimationFrame(r)); // let the overlay paint
      if (await addFile(f, f.name, 0, url)) n++;
    }
    upEl.hidden = true; $("#gsUpThumb").removeAttribute("src");
    if (n) { renderList(); schedule(0); toast(`${plural(n, "image")} added to your sheet`); }
  }

  /* ======================================================
     UI: design cards
     ====================================================== */
  const listEl = $("#gsList");
  function cardHTML(d) {
    const nm = esc(d.name);
    return `<li class="gs-card${d.id === state.activeId ? " is-active" : ""}" data-id="${d.id}">
      <div class="gs-card__thumb"><canvas data-thumb aria-hidden="true"></canvas><span class="gs-card__x" data-x hidden></span></div>
      <div class="gs-card__body">
        <div class="gs-card__head">
          <span class="gs-card__name" title="${nm}">${nm}</span>
          <span class="gs-dpi" data-dpi></span>
          <details class="gs-menu">
            <summary class="gs-icon-btn gs-icon-btn--txt" aria-label="Edit ${nm}">Edit</summary>
            <div class="gs-menu__list">
              <button type="button" data-act="trim">Auto-trim transparent edges</button>
              <button type="button" data-act="flipH">Flip horizontal</button>
              <button type="button" data-act="flipV">Flip vertical</button>
              <button type="button" data-act="rot">Rotate 90°</button>
              <a href="halftone.html" target="_blank" rel="noopener">Halftone…</a>
            </div>
          </details>
          <button type="button" class="gs-icon-btn rm" data-act="rm" aria-label="Delete ${nm}" title="Delete">${I("trash")}</button>
        </div>
        <div class="gs-card__size">
          <label class="gs-w"><span>Width</span><input type="number" data-f="w" min="${SIZE_MIN}" max="${W_MAX}" step="0.01" inputmode="decimal"><span>in</span></label>
          <label class="gs-w"><span>Height</span><input type="number" data-f="h" min="${SIZE_MIN}" max="${H_MAX}" step="0.01" inputmode="decimal"><span>in</span></label>
        </div>
        <label class="gs-lock"><input type="checkbox" data-f="lock"${d.lock ? " checked" : ""}> Lock aspect ratio</label>
        <p class="gs-card__orig" data-orig></p>
        <div class="gs-card__copies">
          <span>Copies on sheet</span>
          <div class="qty" role="group" aria-label="Copies of ${nm}">
            <button type="button" data-act="minus" aria-label="Fewer copies">−</button>
            <input type="number" data-f="q" min="1" max="${COPIES_MAX}" inputmode="numeric" aria-label="Copies">
            <button type="button" data-act="plus" aria-label="More copies">+</button>
          </div>
        </div>
        <p class="gs-card__warn" data-stretch hidden>Aspect ratio unlocked — the art will stretch.</p>
        ${d.opaque ? `<p class="gs-card__warn">No transparent background — DTF prints every non-transparent pixel.</p>` : ""}
        <p class="gs-card__warn gs-card__warn--bad" data-lowres hidden>Low resolution for this size — print it smaller or upload a larger file.</p>
        <p class="gs-card__warn gs-card__warn--bad" data-over hidden><span></span> <button type="button" class="link-arrow" data-act="fit">Use max size</button></p>
      </div>
    </li>`;
  }
  function renderList() {
    listEl.innerHTML = state.designs.map(cardHTML).join("");
    $("#gsListEmpty").hidden = state.designs.length > 0;
    renderRepeatPick();
    refreshCards();
  }
  const cardOf = d => listEl.querySelector(`.gs-card[data-id="${d.id}"]`);
  function drawThumb(cv, d) {
    const S = 88, dpr = Math.min(window.devicePixelRatio || 1, 2), r = d.hIn / d.wIn;
    const w = r > 1 ? S / r : S, h = r > 1 ? S : S * r;
    cv.width = cv.height = Math.round(S * dpr);
    const x = cv.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, S, S); x.imageSmoothingQuality = "high";
    drawArt(x, d, (S - w) / 2, (S - h) / 2, w, h, false);
  }
  const setVal = (inp, v) => { if (document.activeElement !== inp) inp.value = v; };
  function refreshCard(d, counts) {
    const li = cardOf(d); if (!li) return;
    const st = statusOf(d), f = fitOf(d), dl = dpiLabel(d), n = counts.get(d) || 0;
    li.classList.toggle("is-bad", st === "bad");
    li.classList.toggle("is-review", st === "review");
    setVal(li.querySelector('[data-f="w"]'), f2(d.wIn));
    setVal(li.querySelector('[data-f="h"]'), f2(d.hIn));
    setVal(li.querySelector('[data-f="q"]'), d.qty);
    li.querySelector('[data-f="lock"]').checked = d.lock;
    const b = li.querySelector("[data-dpi]"); b.className = `gs-dpi gs-dpi--${dl.cls}`; b.textContent = dl.txt;
    li.querySelector("[data-orig]").textContent = d.vector ? "Original: vector (SVG)" : `Original: ${d.pw} × ${d.ph} px`;
    const x = li.querySelector("[data-x]"); x.hidden = n < 2; x.textContent = `×${n}`;
    li.querySelector("[data-stretch]").hidden = !stretched(d);
    li.querySelector("[data-lowres]").hidden = !(dpiOf(d) < 150);
    const over = li.querySelector("[data-over]");
    over.hidden = f.fits;
    if (!f.fits) over.querySelector("span").textContent = d.wIn < SIZE_MIN - EPS || d.hIn < SIZE_MIN - EPS
      ? `Too small — the minimum print size is ${inch(SIZE_MIN)}.`
      : `Too big for ${SHEET_W} × ${SHEET_H} in — the largest that fits is ${f2(f.maxW)} × ${f2(f.maxH)} in.`;
    over.querySelector("[data-act=fit]").hidden = d.wIn < SIZE_MIN - EPS || d.hIn < SIZE_MIN - EPS;
    drawThumb(li.querySelector("[data-thumb]"), d);
  }
  function refreshCards() {
    const L = state.layout, counts = new Map();
    if (L) L.sheets.forEach(sh => sh.forEach(p => counts.set(p.ref, (counts.get(p.ref) || 0) + 1)));
    state.designs.forEach(d => refreshCard(d, counts));
    listEl.dataset.mode = state.mode;
    listEl.querySelectorAll(".gs-card").forEach(li => li.classList.toggle("is-repeat", li.dataset.id === (repeatDesign() || {}).id));
    renderIssues();
  }
  function renderIssues() {
    const shown = state.mode === "repeat" ? [repeatDesign()].filter(Boolean) : state.designs;
    const st = shown.map(statusOf);
    const bad = st.filter(s => s === "bad").length, rev = st.filter(s => s === "review").length;
    $("#gsReady").textContent = `· ${shown.filter(d => fitOf(d).fits).length} ready for layout`;
    const cb = $('[data-jump="is-bad"]'), cr = $('[data-jump="is-review"]');
    cb.hidden = !bad; cb.textContent = `⚠ ${bad} need${bad === 1 ? "s" : ""} a fix`;
    cr.hidden = !rev; cr.textContent = `◉ ${rev} to review`;
  }
  $("#gsIssues").addEventListener("click", e => {
    const c = e.target.closest("[data-jump]"); if (!c) return;
    const li = Array.from(listEl.querySelectorAll(`.gs-card.${c.dataset.jump}`)).find(x => x.offsetParent); if (!li) return;
    li.scrollIntoView({ behavior: T9.reduceMotion ? "auto" : "smooth", block: "center" });
    li.classList.remove("is-flash"); void li.offsetWidth; li.classList.add("is-flash");
    li.querySelector("input")?.focus({ preventScroll: true });
  });

  const findD = el => { const li = el.closest(".gs-card"); return li && state.designs.find(d => d.id === li.dataset.id); };
  function setActive(id) {
    state.activeId = id;
    listEl.querySelectorAll(".gs-card").forEach(li => li.classList.toggle("is-active", li.dataset.id === id));
  }
  function setWidth(d, w) { d.wIn = w; if (d.lock) d.hIn = w * aspect(d); }
  function setHeight(d, h) { d.hIn = h; if (d.lock) d.wIn = h / aspect(d); }
  // keep the printed scale (DPI) when the art's pixel box changes
  function rescale(d, before) {
    const [w0, h0] = before, [w1, h1] = artPx(d);
    d.wIn *= w1 / w0; d.hIn = d.lock ? d.wIn * aspect(d) : d.hIn * h1 / h0;
  }
  function trimDesign(d) {
    if (d.vector && !d.img.naturalWidth) { toast("This SVG has no fixed size, so it can't be trimmed"); return false; }
    const k = Math.min(1, 2048 / Math.max(d.pw, d.ph));
    const w = Math.max(1, Math.round(d.pw * k)), h = Math.max(1, Math.round(d.ph * k));
    let a;
    try {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(d.img, 0, 0, w, h);
      a = x.getImageData(0, 0, w, h).data;
    } catch { toast("Couldn't read this image to trim it"); return false; }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { toast("This image is fully transparent"); return false; }
    // map back to full-size pixels, rounding outwards so no art is cut
    const t = { x: Math.max(0, Math.floor(x0 / k)), y: Math.max(0, Math.floor(y0 / k)) };
    t.w = Math.min(d.pw, Math.ceil((x1 + 1) / k)) - t.x; t.h = Math.min(d.ph, Math.ceil((y1 + 1) / k)) - t.y;
    if (t.w >= d.trim.w - 1 && t.h >= d.trim.h - 1 && t.x <= d.trim.x + 1 && t.y <= d.trim.y + 1) { toast("No transparent edges to trim"); return false; }
    const before = artPx(d);
    d.trim = t; rescale(d, before);
    toast(`Trimmed ${d.name} to ${f2(d.wIn)} × ${f2(d.hIn)} in`);
    return true;
  }

  listEl.addEventListener("focusin", e => {
    const d = findD(e.target); if (!d) return;
    setActive(d.id);
    if (e.target.dataset.f === "q") d._qBefore = d.qty;
  });
  listEl.addEventListener("pointerdown", e => { const d = findD(e.target); if (d) setActive(d.id); });
  listEl.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const d = findD(b); if (!d) return;
    const act = b.dataset.act;
    b.closest("details")?.removeAttribute("open");
    if (act === "minus" || act === "plus") {
      d.qty = clamp(d.qty + (act === "plus" ? 1 : -1), 1, COPIES_MAX);
      schedule();
    } else if (act === "rm") {
      const i = state.designs.indexOf(d);
      state.designs.splice(i, 1);
      if (!state.designs.some(x => x.url === d.url)) URL.revokeObjectURL(d.url);
      const next = state.designs[Math.min(i, state.designs.length - 1)];
      state.activeId = next ? next.id : null;
      if (state.repeatId === d.id) state.repeatId = next ? next.id : null;
      renderList(); schedule(0);
      (next ? cardOf(next)?.querySelector('[data-act="rm"]') : $("#gsDrop"))?.focus();
      return;
    } else if (act === "trim") { if (!trimDesign(d)) return; }
    else if (act === "flipH") d.flipH = !d.flipH;
    else if (act === "flipV") d.flipV = !d.flipV;
    else if (act === "rot") { d.rot = (d.rot + 1) % 4; [d.wIn, d.hIn] = [d.hIn, d.wIn]; }
    else if (act === "fit") { const f = fitOf(d); d.wIn = f.maxW; d.hIn = f.maxH; }
    refreshCards(); schedule(0);
  });
  listEl.addEventListener("input", e => {
    const inp = e.target.closest("[data-f]"); if (!inp) return;
    const d = findD(inp); if (!d) return;
    const f = inp.dataset.f;
    if (f === "lock") { d.lock = inp.checked; if (d.lock) d.hIn = d.wIn * aspect(d); refreshCards(); schedule(0); return; }
    const v = parseFloat(inp.value);
    if (!(v > 0)) return;
    // sizes are kept as typed so an out-of-range size can be flagged (not silently changed)
    if (f === "w") setWidth(d, v);
    else if (f === "h") setHeight(d, v);
    else d.qty = clamp(Math.round(v), 1, COPIES_MAX);
    refreshCards(); schedule();
  });
  listEl.addEventListener("change", e => { // normalise displayed value on blur/enter
    const inp = e.target.closest("[data-f]"); if (!inp) return;
    const d = findD(inp); if (!d) return;
    const f = inp.dataset.f;
    if (f === "w" && d.wIn < SIZE_MIN) setWidth(d, SIZE_MIN);
    if (f === "h" && d.hIn < SIZE_MIN) setHeight(d, SIZE_MIN);
    if (f === "q" && d.qty - (d._qBefore || d.qty) > 1) toast(`${d.qty - d._qBefore} copies added`);
    if (f === "q") d._qBefore = d.qty;
    if (f === "w" || f === "h") inp.value = f2(f === "w" ? d.wIn : d.hIn);
    refreshCards(); schedule(0);
  });
  // edit menus: one open at a time, close on outside click / Esc
  listEl.addEventListener("toggle", e => {
    if (e.target.matches?.("details[open]")) listEl.querySelectorAll("details[open]").forEach(x => { if (x !== e.target) x.removeAttribute("open"); });
  }, true);
  document.addEventListener("click", e => { if (!e.target.closest(".gs-menu")) listEl.querySelectorAll("details[open]").forEach(x => x.removeAttribute("open")); });
  listEl.addEventListener("keydown", e => {
    const m = e.target.closest("details[open]");
    if (e.key === "Escape" && m) { m.removeAttribute("open"); m.querySelector("summary").focus(); }
  });

  /* Size guide */
  const guideBtn = $("#gsGuideBtn"), guide = $("#gsGuide");
  guideBtn.addEventListener("click", () => {
    const open = guide.hidden;
    guide.hidden = !open; guideBtn.setAttribute("aria-expanded", String(open));
  });
  guide.addEventListener("click", e => {
    const c = e.target.closest("[data-size]"); if (!c) return;
    const d = state.mode === "repeat" ? repeatDesign() : (state.designs.find(x => x.id === state.activeId) || state.designs[0]);
    if (!d) { toast("Upload a design first"); return; }
    setWidth(d, +c.dataset.size);
    refreshCards(); schedule(0);
    toast(`${d.name} set to ${inch(d.wIn)} wide`);
  });

  /* ======================================================
     UI: mode, repeat, upload, layout
     ====================================================== */
  function setMode(mode) {
    state.mode = mode;
    $("#gsModeSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.mode === mode)));
    $("#gsTitle").textContent = mode === "repeat" ? "Create Your Repeat Print" : "Create Your Gang Sheet";
    $("#gsRepeatPanel").hidden = mode !== "repeat";
    $("#gsTogetherWrap").hidden = mode === "repeat";
    renderRepeatPick(); refreshCards(); schedule(0);
  }
  $("#gsModeSeg").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode); });

  function renderRepeatPick() {
    const sel = $("#gsRepeatPick"), rd = repeatDesign();
    $("#gsRepeatPickWrap").hidden = state.designs.length < 2;
    sel.innerHTML = state.designs.map(d => `<option value="${d.id}"${rd === d ? " selected" : ""}>${esc(d.name)}</option>`).join("");
  }
  $("#gsRepeatPick").addEventListener("change", e => { state.repeatId = e.target.value; refreshCards(); schedule(0); });
  const repN = $("#gsRepeatN");
  function syncRepeat() {
    const sheets = state.repeatBy === "sheets";
    $("#gsRepeatBy").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.by === state.repeatBy)));
    $("#gsRepeatNLabel").textContent = sheets ? "Sheets to fill" : "Copies";
    repN.max = sheets ? 50 : COPIES_MAX;
    setVal(repN, sheets ? state.repSheets : state.repCopies);
  }
  function setRepeatN(v, announce) {
    if (!(v >= 1)) return;
    if (state.repeatBy === "sheets") state.repSheets = clamp(Math.round(v), 1, 50); else state.repCopies = clamp(Math.round(v), 1, COPIES_MAX);
    syncRepeat(); schedule(announce ? 0 : 140);
    if (announce) announceRepeat = true;
  }
  let announceRepeat = false;
  $("#gsRepeatBy").addEventListener("click", e => { const b = e.target.closest("[data-by]"); if (!b) return; state.repeatBy = b.dataset.by; syncRepeat(); announceRepeat = true; schedule(0); });
  $("#gsRepeatPanel").addEventListener("click", e => { const b = e.target.closest("[data-rep]"); if (b) setRepeatN((+repN.value || 0) + +b.dataset.rep, true); });
  repN.addEventListener("input", () => setRepeatN(parseFloat(repN.value), false));
  repN.addEventListener("change", () => { setRepeatN(parseFloat(repN.value) || 1, true); repN.value = state.repeatBy === "sheets" ? state.repSheets : state.repCopies; });
  function renderRepeatNote(L) {
    const note = $("#gsRepeatNote"), rd = repeatDesign();
    if (state.mode !== "repeat") return;
    if (!rd) { note.textContent = "Upload the design you want to repeat."; return; }
    if (!L || !L.prints) { note.textContent = "This design doesn't fit on the sheet at its current size."; return; }
    const n = L.sheets.length;
    note.textContent = state.repeatBy === "sheets"
      ? `${L.per} copies fit per sheet at ${f2(rd.wIn)} × ${f2(rd.hIn)} in — ${plural(L.prints, "copy", "copies")} fill ${plural(n, "sheet")}.`
      : `${plural(L.prints, "copy", "copies")} on ${plural(n, "sheet")} · up to ${L.per} fit per sheet.`;
    if (announceRepeat && state.repeatBy === "sheets") toast(`${L.prints} copies added — fills ${plural(n, "sheet")}`);
    announceRepeat = false;
  }

  const fileInp = $("#gsFile"), drop = $("#gsDrop");
  fileInp.addEventListener("change", () => { addFiles(fileInp.files).then(() => { fileInp.value = ""; }); });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", e => addFiles(e.dataTransfer?.files));
  drop.tabIndex = 0;
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInp.click(); } });

  const numIn = (id, key, max) => {
    const el = $(id);
    el.addEventListener("input", () => { const v = parseFloat(el.value); if (v >= 0) { state[key] = clamp(v, 0, max); refreshCards(); schedule(); } });
    el.addEventListener("change", () => { el.value = f2(state[key]); });
  };
  numIn("#gsMargin", "margin", MARGIN_MAX);
  numIn("#gsGap", "gap", GAP_MAX);
  $("#gsRotate").addEventListener("change", e => { state.rotate = e.target.checked; refreshCards(); schedule(0); });
  $("#gsTogether").addEventListener("change", e => { state.together = e.target.checked; schedule(0); });
  $("#gsBgSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-bg]"); if (!b) return;
    state.bg = b.dataset.bg;
    $("#gsBgSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    draw();
  });

  /* ======================================================
     Recompute (debounced)
     ====================================================== */
  let timer = 0;
  function schedule(delay = 140) {
    clearTimeout(timer);
    timer = setTimeout(update, delay);
  }
  function update() {
    clearTimeout(timer);
    const L = state.layout = state.designs.length ? compute() : null;
    renderSummary(L); draw(); renderOverflow(L); renderSteps(L); refreshCards(); renderRepeatNote(L);
    const ok = !!(L && L.prints);
    ["#gsAdd", "#gsWA", "#gsDL", "#gsPrev"].forEach(s => { $(s).disabled = !ok; });
    $("#gsGen").disabled = !state.designs.length;
  }

  function renderSummary(L) {
    const row = (k, v, cls = "") => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
    const n = L ? L.sheets.length : 0, prints = L ? L.prints : 0;
    $("#gsSummary").innerHTML =
      row("Sheet size", `${SHEET_W} × ${SHEET_H} in <span class="muted" style="font-weight:500">(portrait)</span>`) +
      row("Sheets", n || "—") +
      row("Copies", prints) +
      row("Fill efficiency", n ? `${Math.round(L.eff)}%` : "—") +
      row("Estimated price", money(n * PRICE_M), "gs-price");
    $("#gsPriceNote").textContent = n
      ? `Estimated price ${money(L.price)} · ${plural(n, "sheet")} · from ${money(PRICE_M)} per metre — final price confirmed on WhatsApp.`
      : `From ${money(PRICE_M)} per metre — each 22 × 39 in sheet is billed as 1 metre. Final price confirmed on WhatsApp.`;
    $("#gsBig").textContent = `${plural(n, "sheet")} · ${SHEET_W} × ${SHEET_H} in`;
    $("#gsTotal").textContent = `${plural(prints, "copy", "copies")} · ${plural(n, "sheet")}`;
    $("#gsMeta").textContent = n ? `Tap a sheet to see it big · ${plural(prints, "print")} · ${Math.round(L.eff)}% of the film used` : "";
  }
  function renderOverflow(L) {
    const box = $("#gsOverflow");
    if (!L || !L.oversize.length) { box.hidden = true; return; }
    const n = L.oversize.length;
    box.hidden = false;
    box.textContent = `${n === 1 ? "1 design doesn't" : n + " designs don't"} fit on a ${SHEET_W} × ${SHEET_H} in sheet${state.rotate ? " even rotated" : ""} and ${n === 1 ? "isn't" : "aren't"} on the layout.`;
  }
  function renderSteps(L) {
    const s = !state.designs.length ? 1 : (L && L.prints ? 3 : 2);
    document.querySelectorAll("#gsSteps li").forEach(li => {
      const n = +li.dataset.step;
      li.classList.toggle("is-done", n < s);
      li.classList.toggle("is-current", n === s);
      if (n === s) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }

  /* ======================================================
     Painting (shared by preview, thumbnails and print file)
     ====================================================== */
  // Draws one placed print. (x, y, w, h) is its box on the sheet in px; packRot = turned 90° by the packer.
  function drawArt(ctx, d, x, y, w, h, packRot) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (packRot) ctx.rotate(Math.PI / 2);
    const bw = packRot ? h : w, bh = packRot ? w : h;        // the design's own box
    ctx.scale(d.flipH ? -1 : 1, d.flipV ? -1 : 1);
    ctx.rotate(d.rot * Math.PI / 2);
    const sw = d.rot % 2 ? bh : bw, sh = d.rot % 2 ? bw : bh; // un-rotated source box
    const t = d.trim;
    ctx.drawImage(d.img, t.x, t.y, t.w, t.h, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
  function paintSheet(ctx, L, sheet, s, ox, oy) {
    for (const p of sheet) drawArt(ctx, p.ref, ox + (L.m + p.x) * s, oy + (L.m + p.y) * s, (p.w - L.g) * s, (p.h - L.g) * s, p.rot);
  }

  /* ======================================================
     Preview: every sheet drawn to scale, side by side
     ====================================================== */
  const wrap = $("#gsWrap"), sheetsEl = $("#gsSheets");
  const GUT = 26; // ruler gutter (CSS px)
  const checkers = new WeakMap();
  function checkerPattern(ctx, size) {
    const c = document.createElement("canvas"); c.width = c.height = size * 2;
    const x = c.getContext("2d");
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, size * 2, size * 2);
    x.fillStyle = "#E4E1DA"; x.fillRect(0, 0, size, size); x.fillRect(size, size, size, size);
    return ctx.createPattern(c, "repeat");
  }
  // inch ruler down the left and across the top: tick every 1 in, label every 6 in
  function ruler(ctx, s, ox, oy) {
    ctx.save();
    ctx.fillStyle = "#5E594F"; ctx.strokeStyle = "#5E594F"; ctx.lineWidth = 1;
    ctx.font = '600 9px "Inter", ui-sans-serif, system-ui, sans-serif';
    ctx.beginPath();
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = 0; i <= SHEET_H; i++) {
      const y = Math.round(oy + i * s) + .5, major = i % 6 === 0;
      ctx.moveTo(ox - (major ? 8 : 4), y); ctx.lineTo(ox - 1, y);
      if (major) ctx.fillText(String(i), ox - 10, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (let i = 0; i <= SHEET_W; i++) {
      const x = Math.round(ox + i * s) + .5, major = i % 6 === 0;
      ctx.moveTo(x, oy - (major ? 8 : 4)); ctx.lineTo(x, oy - 1);
      if (major && i) ctx.fillText(String(i), x, oy - 9);
    }
    ctx.stroke(); ctx.restore();
  }
  function drawSheet(cv, L, sheet, cssW, maxDpr = 2) {
    const s = (cssW - GUT) / SHEET_W, cssH = GUT + SHEET_H * s;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const ox = GUT, oy = GUT, sw = SHEET_W * s, sh = SHEET_H * s;
    if (state.bg === "checker") { if (!checkers.has(ctx)) checkers.set(ctx, checkerPattern(ctx, 6)); ctx.fillStyle = checkers.get(ctx); }
    else ctx.fillStyle = state.bg === "black" ? "#0A0A0A" : "#FFFFFF";
    ctx.fillRect(ox, oy, sw, sh);
    const dark = state.bg === "black";
    if (L.m > 0) { // margin guide
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = dark ? "rgba(255,255,255,.25)" : "rgba(10,10,10,.18)"; ctx.lineWidth = 1;
      ctx.strokeRect(ox + L.m * s + .5, oy + L.m * s + .5, sw - 2 * L.m * s - 1, sh - 2 * L.m * s - 1); ctx.restore();
    }
    ctx.imageSmoothingQuality = "high";
    paintSheet(ctx, L, sheet, s, ox, oy);
    ctx.strokeStyle = dark ? "#0A0A0A" : "rgba(10,10,10,.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(ox + .5, oy + .5, sw - 1, sh - 1);
    ruler(ctx, s, ox, oy);
    return { cssW, cssH };
  }
  function draw() {
    const L = state.layout;
    const empty = !L || !L.prints;
    wrap.classList.toggle("is-empty", empty);
    if (empty) { sheetsEl.innerHTML = ""; return; }
    const n = L.sheets.length;
    if (sheetsEl.children.length !== n) {
      sheetsEl.innerHTML = L.sheets.map((_, i) => `<figure class="gs-sheet" data-sheet="${i}" tabindex="0" role="button" aria-label="Sheet ${i + 1} of ${n} — open large"><canvas aria-hidden="true"></canvas><figcaption>Sheet ${i + 1}</figcaption></figure>`).join("");
    }
    // side by side; each sheet keeps a readable size and the row wraps when space runs out
    const avail = Math.max(160, sheetsEl.clientWidth);
    const cols = Math.min(n, avail < 420 ? 2 : 3);
    const per = n === 1 ? Math.min(avail, 420) : Math.min(320, Math.max(110, (avail - 16 * (cols - 1)) / cols));
    sheetsEl.querySelectorAll("canvas").forEach((cv, i) => drawSheet(cv, L, L.sheets[i], Math.floor(per)));
    if (!lb.hidden) renderLb();
  }
  if ("ResizeObserver" in window) {
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }).observe(wrap);
  }
  sheetsEl.addEventListener("click", e => { const f = e.target.closest("[data-sheet]"); if (f) openLb(+f.dataset.sheet); });
  sheetsEl.addEventListener("keydown", e => {
    const f = e.target.closest("[data-sheet]");
    if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLb(+f.dataset.sheet); }
  });

  /* ======================================================
     Sheet lightbox: zoom (wheel / pinch / buttons) and pan (drag)
     ====================================================== */
  const lb = $("#gsLb"), lbStage = $("#gsLbStage"), lbCv = $("#gsLbCanvas");
  const view = { i: 0, z: 1, fit: 1, tx: 0, ty: 0, w: 0, h: 0, opener: null };
  const applyView = () => { lbCv.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`; };
  function fitView() {
    const r = lbStage.getBoundingClientRect();
    view.fit = view.z = Math.min((r.width - 24) / view.w, (r.height - 24) / view.h);
    view.tx = (r.width - view.w * view.z) / 2; view.ty = (r.height - view.h * view.z) / 2;
    applyView();
  }
  function zoomAt(f, cx, cy) {
    const nz = clamp(view.z * f, view.fit, Math.max(view.fit * 10, 4));
    view.tx = cx - (cx - view.tx) * nz / view.z; view.ty = cy - (cy - view.ty) * nz / view.z; view.z = nz;
    applyView();
  }
  function renderLb() {
    const L = state.layout;
    if (!L || !L.prints) { closeLb(); return; }
    view.i = clamp(view.i, 0, L.sheets.length - 1);
    const n = L.sheets.length, sz = drawSheet(lbCv, L, L.sheets[view.i], GUT + SHEET_W * 40, 3);
    view.w = sz.cssW; view.h = sz.cssH;
    $("#gsLbTitle").textContent = `Sheet ${view.i + 1} of ${n} · ${SHEET_W} × ${SHEET_H} in`;
    lb.querySelector('[data-lb="prev"]').disabled = view.i === 0;
    lb.querySelector('[data-lb="next"]').disabled = view.i === n - 1;
    fitView();
  }
  function openLb(i) {
    if (!state.layout || !state.layout.prints) return;
    view.i = i; view.opener = document.activeElement;
    lb.hidden = false; document.body.style.overflow = "hidden";
    renderLb();
    lb.querySelector('[data-lb="close"]').focus();
  }
  function closeLb() {
    if (lb.hidden) return;
    lb.hidden = true; document.body.style.overflow = "";
    view.opener?.focus?.();
  }
  lb.addEventListener("click", e => {
    const b = e.target.closest("[data-lb]"); if (!b) return;
    const r = lbStage.getBoundingClientRect(), act = b.dataset.lb;
    if (act === "close") closeLb();
    else if (act === "fit") fitView();
    else if (act === "in" || act === "out") zoomAt(act === "in" ? 1.4 : 1 / 1.4, r.width / 2, r.height / 2);
    else { view.i += act === "next" ? 1 : -1; renderLb(); }
  });
  lb.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); closeLb(); }
    else if (e.key === "+" || e.key === "=") zoomAt(1.4, lbStage.clientWidth / 2, lbStage.clientHeight / 2);
    else if (e.key === "-") zoomAt(1 / 1.4, lbStage.clientWidth / 2, lbStage.clientHeight / 2);
    else if (e.key === "ArrowRight" && view.i < state.layout.sheets.length - 1) { view.i++; renderLb(); }
    else if (e.key === "ArrowLeft" && view.i > 0) { view.i--; renderLb(); }
    else if (e.key === "Tab") { // keep focus inside the viewer
      const f = Array.from(lb.querySelectorAll("button:not([disabled])")), k = f.indexOf(document.activeElement);
      e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  lbStage.addEventListener("wheel", e => {
    e.preventDefault();
    const r = lbStage.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  const ptrs = new Map();
  let pinch = 0;
  lbStage.addEventListener("pointerdown", e => { lbStage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
  lbStage.addEventListener("pointermove", e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { view.tx += e.clientX - p.x; view.ty += e.clientY - p.y; applyView(); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values()), dist = Math.hypot(a.x - b.x, a.y - b.y), r = lbStage.getBoundingClientRect();
      if (pinch) zoomAt(dist / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch = dist;
    }
  });
  ["pointerup", "pointercancel"].forEach(t => lbStage.addEventListener(t, e => { ptrs.delete(e.pointerId); pinch = 0; }));
  addEventListener("resize", () => { if (!lb.hidden) fitView(); });

  /* ======================================================
     Print file: 22 × 39 in at 300 DPI = 6600 × 11700 px per sheet.
     Rendered in horizontal bands and streamed into a PNG encoder,
     so phones never need one 300 MB canvas. Writes a pHYs chunk so
     RIP software reads the file as 300 DPI.
     ====================================================== */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    let c = ~0;
    for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
    dv.setUint32(8 + data.length, ~c >>> 0);
    return out;
  }
  async function sheetPNG(L, sheet, onProgress) {
    const W = SHEET_W * DPI, H = SHEET_H * DPI, BAND = 256;
    const paintBand = (x, y0) => {
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, BAND);
      x.setTransform(1, 0, 0, 1, 0, -y0);
      const vis = sheet.filter(p => (L.m + p.y) * DPI < y0 + BAND && (L.m + p.y + p.h - L.g) * DPI > y0);
      paintSheet(x, L, vis, DPI, 0, 0);
    };
    if (!("CompressionStream" in window)) { // older browsers: one big canvas
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d"); if (!x) throw new Error("ctx");
      x.imageSmoothingQuality = "high"; paintSheet(x, L, sheet, DPI, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      c.width = c.height = 0;
      if (!blob) throw new Error("blob");
      return blob;
    }
    const cs = new CompressionStream("deflate"), wr = cs.writable.getWriter(), parts = [];
    const reading = (async () => { const r = cs.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) return; parts.push(value); } })();
    const c = document.createElement("canvas"); c.width = W; c.height = BAND;
    const x = c.getContext("2d", { willReadFrequently: true }); if (!x) throw new Error("ctx");
    x.imageSmoothingQuality = "high";
    const rowLen = W * 4, stride = rowLen + 1;
    for (let y0 = 0; y0 < H; y0 += BAND) {
      const bh = Math.min(BAND, H - y0);
      paintBand(x, y0);
      const px = x.getImageData(0, 0, W, bh).data, rows = new Uint8Array(stride * bh);
      for (let r = 0; r < bh; r++) { // PNG "Sub" filter: each byte minus the same channel one pixel left
        const o = r * stride, s = r * rowLen;
        rows[o] = 1;
        for (let i = 0; i < 4; i++) rows[o + 1 + i] = px[s + i];
        for (let i = 4; i < rowLen; i++) rows[o + 1 + i] = px[s + i] - px[s + i - 4];
      }
      await wr.write(rows);
      onProgress?.((y0 + bh) / H);
    }
    await wr.close(); await reading;
    c.width = c.height = 0;
    const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
    hv.setUint32(0, W); hv.setUint32(4, H); ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
    const phys = new Uint8Array(9), pv = new DataView(phys.buffer), ppm = Math.round(DPI / 0.0254);
    pv.setUint32(0, ppm); pv.setUint32(4, ppm); phys[8] = 1;               // pixels per metre
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("pHYs", phys),
      ...parts.map(p => pngChunk("IDAT", p)), pngChunk("IEND", new Uint8Array(0))], { type: "image/png" });
  }
  const sheetName = (i, n) => `trendli9-gang-sheet-${SHEET_W}x${SHEET_H}in-sheet-${i + 1}-of-${n}-${DPI}dpi.png`;
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ======================================================
     Actions
     ====================================================== */
  const perDesign = L => {
    const per = new Map();
    L.sheets.forEach(sh => sh.forEach(p => per.set(p.ref, (per.get(p.ref) || 0) + 1)));
    return per;
  };
  const summaryLines = L => Array.from(perDesign(L), ([d, n]) => `${d.name} — ${plural(n, "copy", "copies")} @ ${f2(d.wIn)} × ${f2(d.hIn)} in`);
  function thumbDataURL(L) {
    const s = 220 / SHEET_H, c = document.createElement("canvas");
    c.width = Math.round(SHEET_W * s); c.height = Math.round(SHEET_H * s);
    const x = c.getContext("2d");
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, c.width, c.height);
    paintSheet(x, L, L.sheets[0], s, 0, 0);
    try { return c.toDataURL("image/jpeg", 0.8); } catch { return null; }
  }

  $("#gsAdd").addEventListener("click", () => {
    const L = state.layout; if (!L || !L.prints) return;
    const n = L.sheets.length;
    T9.cart.add({
      productId: "dtf-gang-sheet", name: "DTF Gang Sheet", img: "svc-dtf",
      qty: n, unit: n === 1 ? "sheet" : "sheets",
      variant: `${SHEET_W} × ${SHEET_H} in · ${L.prints} prints`,
      total: L.price, hasArtwork: true,
      notes: summaryLines(L).join("; "),
      thumb: thumbDataURL(L)
    });
    document.getElementById("cartBtn")?.click();
  });

  $("#gsWA").addEventListener("click", () => {
    const L = state.layout; if (!L || !L.prints) return;
    const msg = [
      "Hi Trendli9! I'd like to order a DTF gang sheet:",
      "",
      `*Sheet size:* ${SHEET_W} × ${SHEET_H} in (vertical) · Sheets: ${L.sheets.length}`,
      `*Prints (${L.prints}):*`,
      ...summaryLines(L).map(s => `• ${s}`),
      `*Estimated price:* ${money(L.price)} (from ${money(PRICE_M)} per metre — to be confirmed)`,
      "",
      "I'll attach the print file here."
    ].join("\n");
    T9.openWA(msg);
  });

  const dlBtn = $("#gsDL");
  dlBtn.addEventListener("click", async () => {
    const L = state.layout; if (!L || !L.prints || dlBtn.classList.contains("is-busy")) return;
    const label = dlBtn.querySelector("span"), orig = label.textContent, n = L.sheets.length;
    dlBtn.classList.add("is-busy"); dlBtn.setAttribute("aria-busy", "true");
    toast(`Rendering ${n === 1 ? "your print file" : n + " print files"} at ${DPI} DPI…`);
    try {
      for (let i = 0; i < n; i++) {
        const blob = await sheetPNG(L, L.sheets[i], p => { label.textContent = `Sheet ${i + 1}/${n} · ${Math.round(p * 100)}%`; });
        saveBlob(blob, sheetName(i, n));
        await new Promise(r => setTimeout(r, 400)); // let the browser start each download
      }
      toast(`${n === 1 ? "Print file" : n + " print files"} ready — ${SHEET_W * DPI} × ${SHEET_H * DPI} px each at ${DPI} DPI`);
    } catch {
      toast("Couldn't render the file on this device — try fewer prints, or send your art on WhatsApp");
    } finally {
      dlBtn.classList.remove("is-busy"); dlBtn.removeAttribute("aria-busy"); label.textContent = orig;
    }
  });

  $("#gsPrev").addEventListener("click", () => openLb(0));
  $("#gsGen").addEventListener("click", () => {
    update();
    const L = state.layout, pv = $("#gsPreview");
    pv.scrollIntoView({ behavior: T9.reduceMotion ? "auto" : "smooth", block: "start" });
    pv.focus({ preventScroll: true });
    if (L && L.prints) toast(`Layout ready — ${plural(L.prints, "copy", "copies")} on ${plural(L.sheets.length, "sheet")}`);
  });

  window.T9_GANG = { packSheets, sheetPNG, state, update }; // exposed for testing

  /* ======================================================
     Init (+ hand-off from the Smart Halftone tool)
     ====================================================== */
  syncRepeat(); renderList(); update();
  (async () => {
    let data = null;
    try { data = sessionStorage.getItem(IMPORT_KEY); } catch { data = null; }
    if (!data) return;
    try { sessionStorage.removeItem(IMPORT_KEY); } catch { /* ignore */ }
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data)) return;
    try {
      const blob = await (await fetch(data)).blob();
      if (await addFile(blob, "halftone-design.png")) { renderList(); schedule(0); toast("Added your halftone design"); }
    } catch { /* ignore broken hand-off */ }
  })();
})();
