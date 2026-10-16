/* TRENDLI9 — Design Studio
   SVG mockup + draggable artwork/text layers per side, fixed print sizes
   (2×2 / 3×3 / 4×4 in), PNG mockup export, add to WhatsApp order (quoted there, no prices). */
(function () {
  const { $, $$, esc, cart, openWA, toast } = window.T9;
  const CAT = window.T9_CATALOG, MK = window.T9_MOCKUPS, I = window.T9_ICON, C = window.T9_CONFIG;
  const products = CAT.PRODUCTS.filter(p => p.custom);
  const params = new URLSearchParams(location.search);

  const S = {
    product: products.find(p => p.id === params.get("p")) || products[0],
    colorIdx: 0, side: "front", guides: true, selected: null,
    layers: { front: [], back: [] }, sizes: {}, extra: new Set(), dirty: false
  };
  let uid = 0;
  const canvas = $("#canvas");
  // print sizes offered (inches, square box: the design's longer side matches it)
  const INCHES = [2, 3, 4], DEF_IN = 4;
  const ppi = side => { const a = MK.areaFor(S.product.mockup, side); return a.w / a.inW; };

  /* ---------- product + colour pickers ---------- */
  $("#prodPick").innerHTML = products.map(p => `<button type="button" data-pid="${p.id}" aria-pressed="${p === S.product}">${MK.svg(p.mockup, { color: "#16161A", label: "" })}<span>${esc(p.name.replace(/(Premium |Classic |Pullover |Crew Neck |Printed |Canvas |Baseball |& Service )/g, ""))}</span></button>`).join("");
  $("#prodPick").addEventListener("click", e => {
    const b = e.target.closest("[data-pid]"); if (!b) return;
    S.product = products.find(p => p.id === b.dataset.pid);
    $$("#prodPick button").forEach(x => x.setAttribute("aria-pressed", x === b));
    S.colorIdx = Math.min(S.colorIdx, S.product.colors.length - 1);
    if (!S.product.areas.find(a => a.id === "back")) { S.side = "front"; }
    // keep designs valid for the new product: drop back layers if unsupported, re-centre into the new print area
    if (!S.product.areas.find(a => a.id === "back") && S.layers.back.length) { S.layers.back = []; toast("Back design removed — this product prints on the front only"); }
    ["front", "back"].forEach(side => S.layers[side].forEach(L => { const a = MK.areaFor(S.product.mockup, side); L.x = a.x + a.w / 2; L.y = a.y + a.h / 2;
      if (L.type === "image") sizeImage(L, side); }));
    S.selected = null; S.sizes = {}; S.extra.clear();
    history.replaceState(null, "", `studio.html?p=${S.product.id}`);
    renderColors(); renderSizes(); renderSideBtns(); draw(); fitTexts(); summary();
  });
  function renderColors() {
    const p = S.product;
    $("#colorOpts").innerHTML = p.colors.map((c, i) => `<label class="color-opt" title="${c.name}"><input type="radio" name="gcolor" value="${i}" ${i === S.colorIdx ? "checked" : ""} aria-label="${c.name}"><span style="background:${c.hex}"></span></label>`).join("");
    $("#colorName").textContent = p.colors[S.colorIdx].name;
  }
  $("#colorOpts").addEventListener("change", e => { S.colorIdx = +e.target.value; $("#colorName").textContent = S.product.colors[S.colorIdx].name; draw(); });

  function renderSideBtns() {
    const hasBack = !!S.product.areas.find(a => a.id === "back");
    $$("[data-side]").forEach(b => { b.hidden = b.dataset.side === "back" && !hasBack; b.setAttribute("aria-pressed", b.dataset.side === S.side); });
  }
  $$("[data-side]").forEach(b => b.addEventListener("click", () => { S.side = b.dataset.side; S.selected = null; renderSideBtns(); draw(); fitTexts(); }));
  $("#guideBtn").addEventListener("click", e => { S.guides = !S.guides; e.currentTarget.setAttribute("aria-pressed", S.guides); draw(); });

  /* ---------- sizes / extra areas ---------- */
  function renderSizes() {
    const p = S.product;
    $("#sizeGrid").innerHTML = p.sizes.map(s => `<label class="size-cell">${s}<input type="number" min="0" inputmode="numeric" data-size="${s}" value="${S.sizes[s] || 0}" aria-label="Quantity for size ${s}"></label>`).join("");
    const extras = p.areas.filter(a => !["front", "back"].includes(a.id));
    $("#extraAreas").innerHTML = extras.length ? extras.map(a => `<label class="opt"><input type="checkbox" value="${a.id}" ${S.extra.has(a.id) ? "checked" : ""}><span>${a.name}</span></label>`).join("") : `<span class="help">Not available for this product.</span>`;
    $("#extraAreas").closest(".field").hidden = !extras.length;
  }
  $("#sizeGrid").addEventListener("input", e => { const n = Math.max(0, parseInt(e.target.value) || 0); if (n) S.sizes[e.target.dataset.size] = n; else delete S.sizes[e.target.dataset.size]; summary(); });
  $("#extraAreas").addEventListener("change", e => { e.target.checked ? S.extra.add(e.target.value) : S.extra.delete(e.target.value); summary(); });

  /* ---------- layers ---------- */
  const area = () => MK.areaFor(S.product.mockup, S.side);
  const cur = () => S.layers[S.side];
  const sel = () => cur().find(l => l.id === S.selected);

  // scale a layer so its longer side is L.inch inches on this product
  function sizeImage(L, side = S.side) { L.w = L.inch * ppi(side) / Math.max(1, L.ar); }
  function sizeText(L, side = S.side) {
    const g = canvas.querySelector(`[data-id="${L.id}"]`); if (!g) return;
    const bb = g.getBBox(), long = Math.max(bb.width, bb.height); if (long) L.size *= L.inch * ppi(side) / long;
  }
  // text on the side being viewed is measured from the live SVG; redraw once it is resized
  function fitTexts() { const ts = cur().filter(L => L.type === "text"); if (!ts.length) return; ts.forEach(L => sizeText(L)); draw(); }
  function addImage(src, natW, natH, name) {
    const a = area();
    const L = { id: "L" + (++uid), type: "image", src, name, ar: natH / natW, inch: DEF_IN, x: a.x + a.w / 2, y: a.y + a.h / 2, rot: 0 };
    sizeImage(L); cur().push(L); S.selected = L.id; S.dirty = true; draw(); summary();
  }
  function addText(text) {
    const a = area();
    const L = { id: "L" + (++uid), type: "text", text, font: "Unbounded", color: MK.isDark(S.product.colors[S.colorIdx].hex) ? "#FFC400" : "#E5007E", size: 20, inch: DEF_IN, x: a.x + a.w / 2, y: a.y + a.h * .3, rot: 0 };
    cur().push(L); S.selected = L.id; S.dirty = true; draw();
    sizeText(L); draw(); summary();
    // measure again once the font has loaded (the fallback font has different widths)
    document.fonts?.load(`700 20px '${L.font}'`).then(() => { if (cur().includes(L)) { sizeText(L); draw(); } });
  }

  function layerSVG(L) {
    const t = `translate(${L.x} ${L.y}) rotate(${L.rot})`;
    if (L.type === "image") { const h = L.w * L.ar; return `<g class="layer${L.id === S.selected ? " is-selected" : ""}" data-id="${L.id}" transform="${t}"><image href="${L.src}" x="${-L.w / 2}" y="${-h / 2}" width="${L.w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></g>`; }
    return `<g class="layer${L.id === S.selected ? " is-selected" : ""}" data-id="${L.id}" transform="${t}"><text text-anchor="middle" dominant-baseline="central" font-family="'${L.font}'" font-size="${L.size}" font-weight="700" fill="${L.color}">${esc(L.text)}</text></g>`;
  }

  function draw() {
    const p = S.product, color = p.colors[S.colorIdx].hex;
    canvas.innerHTML = MK.svg(p.mockup, { color, uid: "stg", guides: S.guides, side: S.side, inner: cur().map(layerSVG).join(""), label: `${p.name} ${S.side} preview` });
    // selection outline drawn outside the clip
    const svg = canvas.querySelector("svg"), L = sel();
    if (L) {
      const g = svg.querySelector(`[data-id="${L.id}"]`), bb = g.getBBox();
      svg.insertAdjacentHTML("beforeend", `<g transform="translate(${L.x} ${L.y}) rotate(${L.rot})" pointer-events="none"><rect x="${bb.x - 4}" y="${bb.y - 4}" width="${bb.width + 8}" height="${bb.height + 8}" fill="none" stroke="#E5007E" stroke-width="1.5" stroke-dasharray="5 4" rx="3"/><circle cx="${bb.x - 4}" cy="${bb.y - 4}" r="4" fill="#E5007E"/><circle cx="${bb.x + bb.width + 4}" cy="${bb.y + bb.height + 4}" r="4" fill="#E5007E"/></g>`);
    }
    renderLayerList(); renderCtrl();
    $("#hint").textContent = cur().length ? "Drag to move · pick a print size · arrow keys nudge" : `Upload artwork or add text for the ${S.side} — then drag to position inside the dashed area.`;
  }

  function renderLayerList() {
    $("#layerList").innerHTML = cur().map(L => `<button type="button" class="layer-item" data-lid="${L.id}" aria-pressed="${L.id === S.selected}">${L.type === "image" ? `<img src="${L.src}" alt="">` : `<span style="width:30px;text-align:center">${I("type")}</span>`}<span class="t">${esc(L.type === "image" ? L.name : `"${L.text}"`)} · ${L.inch}×${L.inch} in</span></button>`).join("")
      + (S.layers[S.side === "front" ? "back" : "front"].length ? `<p class="note" style="margin:4px 0 0">${S.side === "front" ? "Back" : "Front"} also has ${S.layers[S.side === "front" ? "back" : "front"].length} layer(s).</p>` : "");
  }
  $("#layerList").addEventListener("click", e => { const b = e.target.closest("[data-lid]"); if (b) { S.selected = b.dataset.lid; draw(); } });

  function renderCtrl() {
    const L = sel(); $("#layerCtrl").hidden = !L; if (!L) return;
    $$("#cSize [data-in]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.in === L.inch));
    $("#cRot").value = L.rot; $("#oRot").textContent = L.rot + "°";
    $("#textCtrl").hidden = L.type !== "text";
    if (L.type === "text") { $("#cText").value = L.text; $("#cFont").value = L.font; $("#cColor").value = L.color; }
  }
  const patch = (fn, redraw = true) => { const L = sel(); if (!L) return; fn(L); S.dirty = true; if (redraw) draw(); };
  $("#cSize").innerHTML = INCHES.map(n => `<button type="button" data-in="${n}" aria-pressed="false">${n}×${n} in</button>`).join("");
  $("#cSize").addEventListener("click", e => {
    const b = e.target.closest("[data-in]"); if (!b) return;
    patch(L => { L.inch = +b.dataset.in; if (L.type === "image") sizeImage(L); else sizeText(L); });
    summary();
  });
  $("#cRot").addEventListener("input", e => patch(L => { L.rot = +e.target.value; }));
  // text edits keep the chosen print size
  const refit = () => { const L = sel(); if (L) { sizeText(L); draw(); } };
  $("#cText").addEventListener("input", e => { patch(L => { L.text = e.target.value || " "; }); refit(); });
  $("#cFont").addEventListener("change", e => { patch(L => { L.font = e.target.value; }); refit(); document.fonts?.load(`700 20px '${e.target.value}'`).then(refit); });
  $("#cColor").addEventListener("input", e => patch(L => { L.color = e.target.value; }));
  $("#bCenter").addEventListener("click", () => patch(L => { const a = area(); L.x = a.x + a.w / 2; L.y = a.y + a.h / 2; }));
  $("#bDup").addEventListener("click", () => { const L = sel(); if (!L) return; const c = { ...L, id: "L" + (++uid), x: L.x + 12, y: L.y + 12 }; cur().push(c); S.selected = c.id; draw(); summary(); });
  $("#bDel").addEventListener("click", () => { const L = sel(); if (!L) return; S.layers[S.side] = cur().filter(x => x !== L); S.selected = null; draw(); summary(); });

  /* ---------- drag (pointer events, works with touch) ---------- */
  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    const g = e.target.closest(".layer"), svg = canvas.querySelector("svg");
    if (!g) { if (S.selected) { S.selected = null; draw(); } return; }
    const L = cur().find(l => l.id === g.dataset.id); if (!L) return;
    if (S.selected !== L.id) { S.selected = L.id; draw(); }
    const pt = toSVG(svg, e); drag = { L, dx: pt.x - L.x, dy: pt.y - L.y };
    canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return; const svg = canvas.querySelector("svg"), pt = toSVG(svg, e), a = area();
    drag.L.x = Math.max(a.x, Math.min(a.x + a.w, pt.x - drag.dx));
    drag.L.y = Math.max(a.y, Math.min(a.y + a.h, pt.y - drag.dy));
    const g = svg.querySelector(`[data-id="${drag.L.id}"]`); g.setAttribute("transform", `translate(${drag.L.x} ${drag.L.y}) rotate(${drag.L.rot})`);
    const outline = svg.lastElementChild; if (outline && outline.getAttribute("pointer-events") === "none") outline.setAttribute("transform", `translate(${drag.L.x} ${drag.L.y}) rotate(${drag.L.rot})`);
  });
  const endDrag = () => { if (drag) { S.dirty = true; drag = null; } };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
  function toSVG(svg, e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  canvas.addEventListener("keydown", e => {
    const L = sel(); if (!L) return; const st = e.shiftKey ? 10 : 2, a = area();
    const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (mv) { e.preventDefault(); L.x = Math.max(a.x, Math.min(a.x + a.w, L.x + mv[0])); L.y = Math.max(a.y, Math.min(a.y + a.h, L.y + mv[1])); draw(); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); $("#bDel").click(); }
  });

  /* ---------- upload ---------- */
  const originals = new Map(); // file name -> original File, sent with WhatsApp orders
  function readFiles(files) {
    [...files].forEach(f => {
      if (!/^image\//.test(f.type)) return toast("Please upload an image file");
      if (f.size > 25 * 1024 * 1024) return toast("File is over 25 MB — send it on WhatsApp instead");
      originals.set(f.name, f);
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          // downscale for preview performance; originals are sent on WhatsApp
          const max = 1400, sc = Math.min(1, max / Math.max(img.naturalWidth || 600, img.naturalHeight || 600));
          const w = Math.round((img.naturalWidth || 600) * sc), h = Math.round((img.naturalHeight || 600) * sc);
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
          addImage(cv.toDataURL("image/png"), w, h, f.name);
        };
        img.onerror = () => toast("Couldn't read that image");
        img.src = r.result;
      };
      r.readAsDataURL(f);
    });
  }
  $("#file").addEventListener("change", e => { readFiles(e.target.files); e.target.value = ""; });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", e => readFiles(e.dataTransfer.files));
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
  drop.tabIndex = 0;
  $("#addTxt").addEventListener("click", () => { const v = $("#txt").value.trim(); if (!v) { $("#txt").focus(); return; } addText(v); $("#txt").value = ""; });
  $("#txt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#addTxt").click(); } });

  /* ---------- order summary (no prices: quoted on WhatsApp) ---------- */
  function areasUsed() {
    const ids = [], ok = id => S.product.areas.some(a => a.id === id);
    if (S.layers.front.length || !S.layers.back.length) ids.push("front");
    if (S.layers.back.length) ids.push("back");
    S.extra.forEach(id => ids.push(id));
    return ids.filter(ok);
  }
  function summary() {
    const p = S.product, qty = Object.values(S.sizes).reduce((a, b) => a + b, 0), ids = areasUsed();
    const names = ids.map(id => p.areas.find(a => a.id === id).name);
    $("#summary").innerHTML = `
      <div class="summary-line"><span>Product</span><span>${esc(p.name)}</span></div>
      <div class="summary-line"><span>Print</span><span>${esc(names.join(", "))}</span></div>
      <div class="summary-line"><span>Quantity</span><span>${qty || "—"}</span></div>
      <div class="summary-line total"><span>Price</span><span>Quote on WhatsApp</span></div>`;
    $("#tierNote").textContent = qty ? "Send your design and our team replies with a quote." : "Enter quantities per size, then send your design for a quote.";
    return { qty, names };
  }

  /* ---------- export mockup PNG (canvas) ---------- */
  async function renderPNG(side, size = 1000, type = "image/png", q) {
    const p = S.product, color = p.colors[S.colorIdx].hex, sc = size / 400;
    const cv = document.createElement("canvas"); cv.width = size; cv.height = Math.round(440 * sc);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#F2F3F8"; ctx.fillRect(0, 0, cv.width, cv.height);
    const base = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(MK.svg(p.mockup, { color, uid: "ex", side })));
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
    const a = MK.areaFor(p.mockup, side);
    ctx.save(); ctx.scale(sc, sc); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    for (const L of S.layers[side]) {
      ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot * Math.PI / 180);
      if (L.type === "image") { const im = await loadImg(L.src), h = L.w * L.ar; ctx.drawImage(im, -L.w / 2, -h / 2, L.w, h); }
      else { await document.fonts.load(`700 ${L.size}px '${L.font}'`).catch(() => { }); ctx.font = `700 ${L.size}px '${L.font}'`; ctx.fillStyle = L.color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(L.text, 0, 0); }
      ctx.restore();
    }
    ctx.restore();
    ctx.font = `800 ${14 * sc / 2}px 'Nunito Sans'`; ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.textAlign = "right";
    ctx.fillText(`Trendli9 Prints · ${p.name} · ${p.colors[S.colorIdx].name} · ${side}`, cv.width - 16, cv.height - 14);
    return cv.toDataURL(type, q);
  }
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  // one download per click (mobile browsers block back-to-back downloads) — downloads the side being viewed
  $("#dlBtn").addEventListener("click", async () => {
    try {
      const url = await renderPNG(S.side, 1400);
      const a = document.createElement("a"); a.href = url; a.download = `trendli9-${S.product.id}-${S.side}.png`; document.body.appendChild(a); a.click(); a.remove();
      toast(`${S.side === "front" ? "Front" : "Back"} mockup downloaded — attach it in WhatsApp`);
    } catch { toast("Couldn't create the mockup image — please try again"); }
  });

  /* ---------- add to order / WhatsApp ---------- */
  function designSummary() {
    const parts = [];
    ["front", "back"].forEach(s => {
      const ls = S.layers[s]; if (!ls.length) return;
      parts.push(`${s}: ` + ls.map(L => (L.type === "image" ? `artwork "${L.name}"` : `text "${L.text}" (${L.font}, ${L.color})`) + ` ${L.inch}×${L.inch} in`).join(" + "));
    });
    return parts.join(" | ") || "Artwork to be shared";
  }
  function buildItem() {
    const r = summary(), p = S.product, c = p.colors[S.colorIdx];
    return { productId: p.id, name: p.name, mockup: p.mockup, color: c.name, colorHex: c.hex, sizes: { ...S.sizes }, qty: r.qty, unit: "pcs",
      areas: r.names, total: null, design: designSummary(), notes: $("#notes").value.trim(),
      hasArtwork: S.layers.front.concat(S.layers.back).some(L => L.type === "image") };
  }
  function needQty() {
    if (summary().qty) return false;
    toast("Enter the quantity for at least one size"); $("#sizeGrid input").focus(); return true;
  }
  $("#addOrder").addEventListener("click", async () => {
    if (needQty()) return;
    const item = buildItem();
    try { item.thumb = await renderPNG(S.layers.front.length || !S.layers.back.length ? "front" : "back", 220, "image/jpeg", .82); } catch { }
    let files = [];
    try { files = await orderFiles(); } catch { } // mockups + original artwork travel with the cart order
    await cart.add(item, files); S.dirty = false;
    $("#cartBtn").click();
  });
  // mockup PNG of each printed side + the original artwork files
  async function orderFiles() {
    const p = S.product, out = [];
    for (const side of ["front", "back"]) {
      if (!S.layers[side].length) continue;
      const blob = await (await fetch(await renderPNG(side, 1400))).blob();
      out.push(new File([blob], `trendli9-${p.id}-${side}-mockup.png`, { type: "image/png" }));
    }
    const names = new Set(S.layers.front.concat(S.layers.back).filter(L => L.type === "image").map(L => L.name));
    names.forEach(n => { if (originals.has(n)) out.push(originals.get(n)); });
    return out;
  }
  $("#waNow").addEventListener("click", () => {
    if (needQty()) return;
    const i = buildItem(); S.dirty = false;
    const text = [`Hi Trendli9! I designed this in your Design Studio:`, ``, `*${i.name}* — ${i.color}`, `Sizes: ${Object.entries(i.sizes).map(([s, q]) => `${s}×${q}`).join(", ")} (${i.qty} pcs)`,
      `Print: ${i.areas.join(", ")}`, `Design: ${i.design}`, i.notes ? `Notes: ${i.notes}` : null, ``, `My mockup and artwork files are attached. Please share a quote.`].filter(x => x !== null).join("\n");
    // one order card (mockups + this text) leads the files, so the studio sees design and details together
    const getFiles = async () => {
      const files = await orderFiles();
      const pics = await Promise.all(files.filter(f => /-mockup\.png$/.test(f.name)).map(f => createImageBitmap(f).catch(() => null)));
      return [window.T9.orderCard(text.split("\n"), pics.filter(Boolean), `trendli9-${S.product.id}-order.png`), ...files];
    };
    window.T9.orderWithFiles({ text, getFiles }).catch(() => openWA(text));
  });
  addEventListener("beforeunload", e => { if (S.dirty && (S.layers.front.length || S.layers.back.length)) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- init ---------- */
  renderColors(); renderSizes(); renderSideBtns(); draw(); summary();
  document.fonts?.ready.then(() => { draw(); fitTexts(); });
})();
