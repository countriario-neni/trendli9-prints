/* =========================================================
   TRENDLI9 PRINTS — Auto Gang Sheet studio
   Local-only: files are read in the browser, never uploaded.
   Packing: MaxRects (free-rectangle list) into a fixed-width,
   unbounded-length strip, with optional 90° rotation.
   ========================================================= */
(function () {
  "use strict";
  const T9 = window.T9, C = window.T9_CONFIG;
  if (!T9) return;
  const { $, esc, money, toast } = T9;
  const I = window.T9_ICON;

  const PRICE_M = C.dtfPricePerMeter || 250;
  const IMPORT_KEY = "t9_gangsheet_import";
  const TYPES = /^image\/(png|jpeg|webp|svg\+xml)$/;
  const EXT = /\.(png|jpe?g|webp|svg)$/i;
  const EPS = 1e-6;
  const inch = cm => (cm / 2.54).toFixed(cm / 2.54 >= 10 ? 1 : 2);
  const r1 = n => Math.round(n * 10) / 10;
  const fmt = n => (Math.round(n * 10) / 10).toString();

  const state = {
    designs: [],          // { id, name, img, url, pw, ph, widthCm, qty, opaque }
    sheet: "58", customW: 45,
    margin: 0.5, gap: 0.5, rotate: true,
    bg: "checker",
    activeId: null,
    layout: null          // last packing result
  };
  let uid = 0;

  /* ======================================================
     MaxRects strip packer
     items: [{ w, h, ref }]  (sizes already include the gap)
     Returns { placed: [{x,y,w,h,rot,ref}], height }
     ====================================================== */
  function runMaxRects(items, binW, allowRot, rule) {
    let free = [{ x: 0, y: 0, w: binW, h: 1e9 }];
    const placed = [];
    let height = 0;
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
          // "bottom": lowest bottom edge first (keeps the strip short), ties -> BSSF
          const s1 = rule === "bssf" ? short : bottom, s2 = rule === "bssf" ? bottom : short, s3 = f.x;
          if (s1 < b1 - EPS || (Math.abs(s1 - b1) <= EPS && (s2 < b2 - EPS || (Math.abs(s2 - b2) <= EPS && s3 < b3)))) {
            b1 = s1; b2 = s2; b3 = s3; best = { x: f.x, y: f.y, w, h, rot: !!o, ref: it.ref };
          }
        }
      }
      if (!best) continue; // cannot happen: oversize items are filtered out before packing
      placed.push(best);
      if (best.y + best.h > height) height = best.y + best.h;

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
    return { placed, height };
  }

  const ORDERS = [
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h
  ];
  function packStrip(items, binW, allowRot) {
    if (!items.length) return { placed: [], height: 0 };
    let best = null;
    for (const ord of ORDERS) {
      const sorted = items.slice().sort(ord);
      for (const rule of ["bottom", "bssf"]) {
        const r = runMaxRects(sorted, binW, allowRot, rule);
        if (!best || r.height < best.height - EPS) best = r;
      }
    }
    return best;
  }
  window.T9_GANG = { packStrip }; // exposed for testing

  /* ======================================================
     Model helpers
     ====================================================== */
  const sheetW = () => state.sheet === "custom" ? Math.min(58, Math.max(10, +state.customW || 10)) : +state.sheet;
  const heightOf = d => d.widthCm * d.ph / d.pw;

  function compute() {
    const W = sheetW(), m = state.margin, g = state.gap;
    const usable = W - 2 * m;
    const items = [], oversize = [];
    for (const d of state.designs) {
      const w = d.widthCm, h = heightOf(d);
      const fits = w <= usable + EPS || (state.rotate && h <= usable + EPS);
      if (!fits) { oversize.push(d); continue; }
      for (let q = 0; q < d.qty; q++) items.push({ w: w + g, h: h + g, ref: d });
    }
    const t0 = performance.now();
    const res = packStrip(items, usable + g, state.rotate);
    const ms = performance.now() - t0;
    const content = res.placed.length ? res.height - g : 0;
    const L = res.placed.length ? content + 2 * m : 0;
    const area = res.placed.reduce((s, p) => s + (p.w - g) * (p.h - g), 0);
    const billCm = res.placed.length ? Math.max(100, Math.ceil((L - EPS) / 10) * 10) : 0;
    return {
      W, L: Math.ceil(L * 10 - EPS) / 10, m, g, placed: res.placed, oversize, ms,
      prints: res.placed.length, eff: L ? area / (W * L) * 100 : 0,
      billCm, metres: billCm / 100, price: billCm / 100 * PRICE_M
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
  async function addFile(file, name, widthCm) {
    const type = file.type || "";
    if (!TYPES.test(type) && !EXT.test(name || "")) { toast(`${name || "File"} skipped — use PNG, JPG, WEBP or SVG`); return false; }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      let pw = img.naturalWidth, ph = img.naturalHeight;
      if (!pw || !ph) { pw = 1000; ph = 1000; } // SVG without intrinsic size
      const d = {
        id: "d" + (++uid), name: name || "design", img, url, pw, ph,
        widthCm: widthCm || Math.min(25, Math.max(1, sheetW() - 2 * state.margin)),
        qty: 1, opaque: !hasTransparency(img, /jpe?g$/i.test(type) || /\.jpe?g$/i.test(name || ""))
      };
      state.designs.push(d);
      state.activeId = d.id;
      return true;
    } catch {
      URL.revokeObjectURL(url);
      toast(`Couldn't read ${name || "that file"}`);
      return false;
    }
  }
  async function addFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    let n = 0;
    for (const f of files) if (await addFile(f, f.name)) n++;
    if (n) { renderList(); schedule(0); }
  }

  /* ======================================================
     UI: design list
     ====================================================== */
  const listEl = $("#gsList");
  function rowHTML(d) {
    const h = heightOf(d);
    return `<li class="gs-row${d.id === state.activeId ? " is-active" : ""}" data-id="${d.id}">
      <img class="gs-row__thumb" src="${d.url}" alt="">
      <span class="gs-row__name" title="${esc(d.name)}">${esc(d.name)}</span>
      <span class="gs-row__acts">
        <button type="button" data-act="dup" aria-label="Duplicate ${esc(d.name)}" title="Duplicate">${I("copy")}</button>
        <button type="button" class="rm" data-act="rm" aria-label="Remove ${esc(d.name)}" title="Remove">${I("trash")}</button>
      </span>
      <div class="gs-row__ctrls">
        <label class="gs-w">W <input type="number" data-f="w" min="1" max="200" step="0.5" value="${fmt(d.widthCm)}" inputmode="decimal" aria-label="Print width in cm for ${esc(d.name)}"> cm</label>
        <span class="gs-dim" data-dim>× ${fmt(h)} cm H</span>
        <div class="qty" role="group" aria-label="Quantity for ${esc(d.name)}">
          <button type="button" data-act="minus" aria-label="Decrease quantity">−</button>
          <input type="number" data-f="q" min="1" max="500" value="${d.qty}" inputmode="numeric" aria-label="Quantity">
          <button type="button" data-act="plus" aria-label="Increase quantity">+</button>
        </div>
      </div>
      ${d.opaque ? `<p class="gs-row__warn">No transparent background — DTF prints every non-transparent pixel</p>` : ""}
      <p class="gs-row__warn gs-row__warn--bad" data-over hidden></p>
    </li>`;
  }
  function renderList() {
    listEl.innerHTML = state.designs.map(rowHTML).join("");
    $("#gsListEmpty").hidden = state.designs.length > 0;
  }
  const findD = el => { const li = el.closest(".gs-row"); return li && state.designs.find(d => d.id === li.dataset.id); };
  function setActive(id) {
    state.activeId = id;
    listEl.querySelectorAll(".gs-row").forEach(li => li.classList.toggle("is-active", li.dataset.id === id));
  }
  function updateRowDim(d) {
    const li = listEl.querySelector(`.gs-row[data-id="${d.id}"]`);
    if (li) li.querySelector("[data-dim]").textContent = `× ${fmt(heightOf(d))} cm H`;
  }

  listEl.addEventListener("focusin", e => { const d = findD(e.target); if (d) setActive(d.id); });
  listEl.addEventListener("pointerdown", e => { const d = findD(e.target); if (d) setActive(d.id); });
  listEl.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const d = findD(b); if (!d) return;
    const act = b.dataset.act;
    if (act === "minus" || act === "plus") {
      d.qty = Math.min(500, Math.max(1, d.qty + (act === "plus" ? 1 : -1)));
      b.parentElement.querySelector("input").value = d.qty;
      schedule();
    } else if (act === "dup") {
      const c = { ...d, id: "d" + (++uid) };
      state.designs.splice(state.designs.indexOf(d) + 1, 0, c);
      state.activeId = c.id; renderList(); schedule(0);
      listEl.querySelector(`.gs-row[data-id="${c.id}"] [data-act="dup"]`)?.focus();
    } else if (act === "rm") {
      const i = state.designs.indexOf(d);
      state.designs.splice(i, 1);
      if (!state.designs.some(x => x.url === d.url)) URL.revokeObjectURL(d.url);
      const next = state.designs[Math.min(i, state.designs.length - 1)];
      state.activeId = next ? next.id : null;
      renderList(); schedule(0);
      (next ? listEl.querySelector(`.gs-row[data-id="${next.id}"] [data-act="rm"]`) : $("#gsDrop"))?.focus();
    }
  });
  listEl.addEventListener("input", e => {
    const inp = e.target.closest("[data-f]"); if (!inp) return;
    const d = findD(inp); if (!d) return;
    const v = parseFloat(inp.value);
    if (!(v > 0)) return;
    if (inp.dataset.f === "w") { d.widthCm = Math.min(200, Math.max(1, v)); updateRowDim(d); }
    else d.qty = Math.min(500, Math.max(1, Math.round(v)));
    schedule();
  });
  listEl.addEventListener("change", e => { // normalise displayed value on blur/enter
    const inp = e.target.closest("[data-f]"); if (!inp) return;
    const d = findD(inp); if (!d) return;
    inp.value = inp.dataset.f === "w" ? fmt(d.widthCm) : d.qty;
  });

  /* Size guide */
  const guideBtn = $("#gsGuideBtn"), guide = $("#gsGuide");
  guideBtn.addEventListener("click", () => {
    const open = guide.hidden;
    guide.hidden = !open; guideBtn.setAttribute("aria-expanded", String(open));
  });
  guide.addEventListener("click", e => {
    const c = e.target.closest("[data-size]"); if (!c) return;
    const d = state.designs.find(x => x.id === state.activeId) || state.designs[0];
    if (!d) { toast("Upload a design first"); return; }
    d.widthCm = +c.dataset.size;
    const inp = listEl.querySelector(`.gs-row[data-id="${d.id}"] [data-f="w"]`);
    if (inp) inp.value = fmt(d.widthCm);
    updateRowDim(d); schedule(0);
    toast(`${d.name} set to ${d.widthCm} cm wide`);
  });

  /* ======================================================
     UI: upload, sheet, layout
     ====================================================== */
  const fileInp = $("#gsFile"), drop = $("#gsDrop");
  fileInp.addEventListener("change", () => { addFiles(fileInp.files).then(() => { fileInp.value = ""; }); });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", e => addFiles(e.dataTransfer?.files));
  drop.tabIndex = 0;
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInp.click(); } });

  function widthNote() {
    const W = sheetW();
    $("#gsWidthNote").textContent = `${fmt(W)} cm = ${inch(W)} in` + (state.sheet === "58" ? " · Trendli9's standard DTF roll" : "");
  }
  $("#gsWidthSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-w]"); if (!b) return;
    state.sheet = b.dataset.w;
    $("#gsWidthSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#gsCustomWrap").hidden = state.sheet !== "custom";
    if (state.sheet === "custom") $("#gsCustomW").focus();
    widthNote(); schedule(0);
  });
  $("#gsCustomW").addEventListener("input", e => { const v = parseFloat(e.target.value); if (v > 0) { state.customW = v; widthNote(); schedule(); } });
  $("#gsCustomW").addEventListener("change", e => { e.target.value = fmt(sheetW()); state.customW = sheetW(); });
  const numIn = (id, key, max) => {
    const el = $(id);
    el.addEventListener("input", () => { const v = parseFloat(el.value); if (v >= 0) { state[key] = Math.min(max, v); schedule(); } });
    el.addEventListener("change", () => { el.value = fmt(state[key]); });
  };
  numIn("#gsMargin", "margin", 5);
  numIn("#gsGap", "gap", 5);
  $("#gsRotate").addEventListener("change", e => { state.rotate = e.target.checked; schedule(0); });
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
    const L = state.layout = state.designs.length ? compute() : null;
    renderSummary(L); draw(); renderOverflow(L); renderSteps(L);
    const ok = !!(L && L.prints);
    ["#gsAdd", "#gsWA", "#gsDL"].forEach(s => { $(s).disabled = !ok; });
  }

  function renderSummary(L) {
    const row = (k, v, cls = "") => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
    if (!L || !L.prints) {
      $("#gsSummary").innerHTML = row("Sheet size", "—") + row("Prints", "0") + row("Fill efficiency", "—") + row("Billable length", "—") + row("Estimated price", money(0), "gs-price");
      $("#gsMeta").textContent = "";
      return;
    }
    $("#gsSummary").innerHTML =
      row("Sheet size", `${fmt(L.W)} × ${fmt(L.L)} cm <span class="muted" style="font-weight:500">(${inch(L.W)} × ${inch(L.L)} in)</span>`) +
      row("Prints", L.prints) +
      row("Fill efficiency", `${Math.round(L.eff)}%`) +
      row("Billable length", `${L.metres.toFixed(1)} m`) +
      row("Estimated price", money(L.price), "gs-price");
    $("#gsMeta").textContent = `${fmt(L.W)} × ${fmt(L.L)} cm · ${L.prints} prints · ${money(PRICE_M)}/m · min 1 m, rounded up to 10 cm`;
  }
  function renderOverflow(L) {
    const box = $("#gsOverflow");
    listEl.querySelectorAll("[data-over]").forEach(p => { p.hidden = true; });
    if (!L || !L.oversize.length) { box.hidden = true; return; }
    const usable = fmt(L.W - 2 * L.m);
    box.hidden = false;
    box.textContent = `${L.oversize.length === 1 ? "1 design is" : L.oversize.length + " designs are"} too wide for a ${fmt(L.W)} cm sheet (max print ${usable} cm${state.rotate ? " even when rotated" : ""}) and ${L.oversize.length === 1 ? "isn't" : "aren't"} on the sheet.`;
    L.oversize.forEach(d => {
      const p = listEl.querySelector(`.gs-row[data-id="${d.id}"] [data-over]`);
      if (p) { p.hidden = false; p.textContent = `Too wide for this sheet — reduce to ${usable} cm or less${state.rotate ? "" : ", or allow rotation"}.`; }
    });
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
     Preview canvas
     ====================================================== */
  const wrap = $("#gsWrap"), cv = $("#gsCanvas");
  const GUT = 34, PAD = 6; // ruler gutter + top/bottom padding (CSS px)
  let checker = null;
  function checkerPattern(ctx, size) {
    const c = document.createElement("canvas"); c.width = c.height = size * 2;
    const x = c.getContext("2d");
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, size * 2, size * 2);
    x.fillStyle = "#E4E1DA"; x.fillRect(0, 0, size, size); x.fillRect(size, size, size, size);
    return ctx.createPattern(c, "repeat");
  }
  function paintDesigns(ctx, L, s, ox, oy) {
    for (const p of L.placed) {
      const d = p.ref, x = ox + (L.m + p.x) * s, y = oy + (L.m + p.y) * s;
      const w = (p.w - L.g) * s, h = (p.h - L.g) * s;
      if (!p.rot) ctx.drawImage(d.img, x, y, w, h);
      else {
        ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(Math.PI / 2);
        ctx.drawImage(d.img, -h / 2, -w / 2, h, w); // un-rotated size is (h × w)
        ctx.restore();
      }
    }
  }
  function draw() {
    const L = state.layout;
    const empty = !L || !L.prints;
    wrap.classList.toggle("is-empty", empty);
    if (empty) { cv.width = cv.height = 0; cv.style.width = cv.style.height = "0px"; return; }
    const avail = Math.max(200, wrap.clientWidth - 24);
    let s = Math.min(14, (avail - GUT) / L.W); // CSS px per cm
    let cssW = GUT + L.W * s, cssH = L.L * s + PAD * 2;
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    // stay inside browser canvas limits for very long sheets
    dpr = Math.max(0.25, Math.min(dpr, 30000 / cssH, Math.sqrt(48e6 / (cssW * cssH))));
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const ox = GUT, oy = PAD, sw = L.W * s, sh = L.L * s;

    // sheet background
    if (state.bg === "checker") { checker = checker || checkerPattern(ctx, 8); ctx.fillStyle = checker; }
    else ctx.fillStyle = state.bg === "black" ? "#0A0A0A" : "#FFFFFF";
    ctx.fillRect(ox, oy, sw, sh);

    // margin guide
    const dark = state.bg === "black";
    if (L.m > 0) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = dark ? "rgba(255,255,255,.25)" : "rgba(10,10,10,.18)"; ctx.lineWidth = 1;
      ctx.strokeRect(ox + L.m * s + .5, oy + L.m * s + .5, sw - 2 * L.m * s - 1, sh - 2 * L.m * s - 1); ctx.restore();
    }
    paintDesigns(ctx, L, s, ox, oy);

    // sheet border
    ctx.strokeStyle = dark ? "#0A0A0A" : "rgba(10,10,10,.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(ox + .5, oy + .5, sw - 1, sh - 1);

    // ruler along the length: tick every 5 cm, label every 10 cm (or 50 cm when zoomed out)
    const labelEvery = s * 10 < 18 ? 50 : 10;
    ctx.fillStyle = "#5E594F"; ctx.strokeStyle = "#5E594F";
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.beginPath();
    for (let cm = 0; cm <= L.L + EPS; cm += 5) {
      const y = Math.round(oy + cm * s) + .5, major = cm % 10 === 0;
      ctx.moveTo(GUT - (major ? 10 : 5), y); ctx.lineTo(GUT - 1, y);
      if (cm % labelEvery === 0) ctx.fillText(String(cm), GUT - 12, Math.min(Math.max(y, 6), cssH - 6));
    }
    ctx.stroke();
  }
  if ("ResizeObserver" in window) {
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }).observe(wrap);
  }

  /* ======================================================
     Actions
     ====================================================== */
  const summaryLines = L => {
    const per = new Map();
    L.placed.forEach(p => per.set(p.ref, (per.get(p.ref) || 0) + 1));
    return Array.from(per, ([d, n]) => `${d.name} × ${n} @ ${fmt(d.widthCm)} cm`);
  };
  function thumbDataURL(L) {
    const s = 220 / Math.max(L.W, L.L);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(L.W * s)); c.height = Math.max(1, Math.round(L.L * s));
    const x = c.getContext("2d");
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, c.width, c.height);
    paintDesigns(x, L, s, 0, 0);
    try { return c.toDataURL("image/jpeg", 0.8); } catch { return null; }
  }

  $("#gsAdd").addEventListener("click", () => {
    const L = state.layout; if (!L || !L.prints) return;
    T9.cart.add({
      productId: "dtf-meter", name: "DTF Gang Sheet", img: "svc-dtf",
      qty: r1(L.metres), unit: "m",
      variant: `${fmt(L.W)} cm × ${fmt(L.L)} cm · ${L.prints} prints`,
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
      `*Sheet:* ${fmt(L.W)} cm × ${fmt(L.L)} cm (billable ${L.metres.toFixed(1)} m)`,
      `*Prints (${L.prints}):*`,
      ...summaryLines(L).map(s => `• ${s}`),
      `*Estimated price:* ${money(L.price)}`,
      "",
      "I'll attach the print file here."
    ].join("\n");
    T9.openWA(msg);
  });

  const dlBtn = $("#gsDL");
  dlBtn.addEventListener("click", async () => {
    const L = state.layout; if (!L || !L.prints || dlBtn.classList.contains("is-busy")) return;
    const label = dlBtn.querySelector("span"), orig = label.textContent;
    const px = dpi => [Math.round(L.W / 2.54 * dpi), Math.round(L.L / 2.54 * dpi)];
    let dpi = 300, [w, h] = px(dpi);
    if (w * h > 100e6) { dpi = 150; [w, h] = px(dpi); }
    // hard browser limits: ~32k px per side, ~250 MP area
    if (h > 32000 || w * h > 250e6) {
      dpi = Math.floor(Math.min(32000 / (L.L / 2.54), Math.sqrt(250e6 / ((L.W / 2.54) * (L.L / 2.54)))));
      [w, h] = px(dpi);
    }
    dlBtn.classList.add("is-busy"); dlBtn.setAttribute("aria-busy", "true");
    label.textContent = `Rendering ${dpi} DPI…`;
    toast(`Rendering your print file at ${dpi} DPI${dpi < 300 ? " (large sheet)" : ""}…`);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))); // let the busy state paint
    try {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      if (!x) throw new Error("ctx");
      x.imageSmoothingQuality = "high";
      paintDesigns(x, L, dpi / 2.54, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      c.width = c.height = 0;
      if (!blob) throw new Error("blob");
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `trendli9-gang-sheet-${fmt(L.W)}x${fmt(L.L)}cm-${dpi}dpi.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast(`Print file ready — ${w} × ${h} px at ${dpi} DPI`);
    } catch {
      toast("Couldn't render the file on this device — try fewer or smaller prints, or send your art on WhatsApp");
    } finally {
      dlBtn.classList.remove("is-busy"); dlBtn.removeAttribute("aria-busy"); label.textContent = orig;
    }
  });

  /* ======================================================
     Init (+ hand-off from the Smart Halftone tool)
     ====================================================== */
  widthNote(); renderList(); update();
  (async () => {
    let data = null;
    try { data = sessionStorage.getItem(IMPORT_KEY); } catch { data = null; }
    if (!data) return;
    try { sessionStorage.removeItem(IMPORT_KEY); } catch { /* ignore */ }
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data)) return;
    try {
      const blob = await (await fetch(data)).blob();
      if (await addFile(blob, "halftone-design.png", 25)) { renderList(); schedule(0); toast("Added your halftone design"); }
    } catch { /* ignore broken hand-off */ }
  })();
})();
