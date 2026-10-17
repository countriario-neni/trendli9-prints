/* TRENDLI9 — Design Studio
   SVG mockup + draggable artwork/text layers per side, fixed print sizes
   (2×2 / 3×3 / 4×4 in) in a chosen shape, PNG mockup + 300 DPI print files, add to WhatsApp order (quoted there, no prices). */
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
    // re-fit every design to the new product's print area (sizes that no longer fit step down)
    ["front", "back"].forEach(side => S.layers[side].forEach(L => setup(L, side)));
    S.selected = null; S.sizes = {}; S.extra.clear();
    history.replaceState(null, "", `studio.html?p=${S.product.id}`);
    renderColors(); renderSizes(); renderSideBtns(); draw(); summary();
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
  $$("[data-side]").forEach(b => b.addEventListener("click", () => { S.side = b.dataset.side; S.selected = null; renderSideBtns(); draw(); }));
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

  /* ---------- layers ----------
     Every design is a print "box" with a real size in inches (L.wIn × L.hIn) and a shape:
     image: original | square | circle | rect (photo cropped to fill the shape)
     text:  none | square | circle | rect (text on a coloured badge)
     Position is the box centre in mockup units; it always stays inside the print area. */
  const area = () => MK.areaFor(S.product.mockup, S.side);
  const cur = () => S.layers[S.side];
  const sel = () => cur().find(l => l.id === S.selected);
  const sideOf = L => S.layers.front.includes(L) ? "front" : "back";
  const f1 = n => (Math.round(n * 10) / 10).toString();

  const SHAPES = {
    image: [["original", "As uploaded"], ["square", "Square"], ["circle", "Circle"], ["rect", "Rectangle"]],
    text: [["none", "Just text"], ["square", "Square"], ["circle", "Circle"], ["rect", "Rectangle"]]
  };
  const SHAPE_NAME = { original: "as uploaded", none: "text only", square: "square", circle: "circle", rect: "rectangle" };
  const SHAPE_ICON = {
    original: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15l4-5 3 3 3-4 4 6H3z" fill="currentColor"/></svg>',
    none: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h10M10 4v12" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>',
    square: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    circle: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    rect: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="6" width="16" height="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
  };
  // the three print sizes per shape (inches); "as uploaded" and plain text use the longer side
  const SIZES = { square: [[2, 2], [3, 3], [4, 4]], circle: [[2, 2], [3, 3], [4, 4]], rect: [[3, 2], [4, 3], [6, 4]], original: [[2, 2], [3, 3], [4, 4]], none: [[2, 2], [3, 3], [4, 4]] };
  const DEF_SIZE = 1; // 3×3 in
  const sizeLabel = (shape, i) => { const [w, h] = SIZES[shape][i]; return `${w}×${h} in`; };
  // Spots. On garments, left/right are AS WORN (the wearer's left chest is the usual logo spot,
  // which shows on the right of the screen when you face the shirt); caps, totes and cushions
  // use left/right as you look at them. Keys: tl = left, tc = centre top, tr = right, c = middle.
  const WORN = ["tee", "polo", "hoodie", "sweatshirt"];
  const worn = () => WORN.includes(S.product.mockup);
  function placeItems(side) {
    if (!worn()) return [["tl", "Top left"], ["tc", "Top centre"], ["tr", "Top right"], ["c", "Centre"]];
    return side === "front"
      ? [["tl", "Left chest"], ["tc", "Centre chest"], ["tr", "Right chest"], ["c", "Centre"]]
      : [["tl", "Upper left"], ["tc", "Upper centre"], ["tr", "Upper right"], ["c", "Centre"]];
  }
  // does "left" sit on the left of the screen? Not on the front of a worn garment (mirror image)
  const leftOnScreenLeft = side => !(worn() && side === "front");
  const defPlace = side => side === "back" ? "tc" : "tl";

  // text metrics at a 100-unit font size, from an off-screen canvas (same engine that draws the files)
  const mctx = document.createElement("canvas").getContext("2d");
  function measure(L) {
    mctx.font = `700 100px '${L.font}'`;
    const m = mctx.measureText(L.text || " ");
    return { w: Math.max(m.width, 1), asc: m.actualBoundingBoxAscent || 72, desc: m.actualBoundingBoxDescent || 0 };
  }
  // set the box size (and text size) from shape + size choice
  function recompute(L) {
    const [W, H] = SIZES[L.shape][L.si], N = W;
    if (L.type === "image") {
      if (L.shape === "original") { const ar = L.ih / L.iw; [L.wIn, L.hIn] = ar >= 1 ? [N / ar, N] : [N, N * ar]; }
      else [L.wIn, L.hIn] = [W, H];
      return;
    }
    const m = L.m = measure(L), th = m.asc + m.desc;
    if (L.shape === "none") { L.fs = 100 * N / Math.max(m.w, th); L.wIn = m.w * L.fs / 100; L.hIn = th * L.fs / 100; }
    else {
      const iw = (L.shape === "circle" ? .68 : .84) * W, ih = (L.shape === "circle" ? .4 : .5) * H;
      L.fs = Math.min(100 * iw / m.w, 100 * ih / th); L.wIn = W; L.hIn = H;
    }
  }
  const areaIn = side => { const a = MK.areaFor(S.product.mockup, side), k = ppi(side); return [a.w / k, a.h / k]; };
  function fits(L, shape, si, side) {
    const t = { ...L, shape, si }; recompute(t); const [aw, ah] = areaIn(side);
    return t.wIn <= aw + .01 && t.hIn <= ah + .01;
  }
  // biggest size that fits this product, never bigger than asked
  function fitSize(L, side) { while (L.si > 0 && !fits(L, L.shape, L.si, side)) L.si--; recompute(L); }
  function clamp(L, side) {
    const a = MK.areaFor(S.product.mockup, side), k = ppi(side), hw = L.wIn * k / 2, hh = L.hIn * k / 2;
    L.x = hw * 2 >= a.w ? a.x + a.w / 2 : Math.max(a.x + hw, Math.min(a.x + a.w - hw, L.x));
    L.y = hh * 2 >= a.h ? a.y + a.h / 2 : Math.max(a.y + hh, Math.min(a.y + a.h - hh, L.y));
  }
  function place(L, side) {
    const a = MK.areaFor(S.product.mockup, side), k = ppi(side), W = L.wIn * k, H = L.hIn * k, m = .5 * k;
    const pl = L.place === "custom" ? "c" : L.place;
    const atLeft = a.x + m + W / 2, atRight = a.x + a.w - m - W / 2, flip = !leftOnScreenLeft(side);
    L.x = pl === "tl" ? (flip ? atRight : atLeft) : pl === "tr" ? (flip ? atLeft : atRight) : a.x + a.w / 2;
    L.y = pl === "c" ? a.y + a.h / 2 : a.y + m + H / 2;
    clamp(L, side);
  }
  function setup(L, side) { fitSize(L, side); place(L, side); }

  function addLayer(L, side = S.side) {
    setup(L, side); S.layers[side].push(L); S.selected = L.id; S.dirty = true; draw(); summary();
  }

  /* ---------- drawing ---------- */
  // SVG for one layer; k = mockup units per inch. Box centred at (x, y).
  function layerSVG(L, k, x = L.x, y = L.y, rot = L.rot, selected = false) {
    const W = L.wIn * k, H = L.hIn * k, cid = `cp-${L.id}-${Math.round(k)}`;
    const shapeEl = (attrs) => L.shape === "circle" ? `<ellipse cx="0" cy="0" rx="${W / 2}" ry="${H / 2}" ${attrs}/>` : `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" ${attrs}/>`;
    let body = `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="transparent"/>`; // grab area
    if (L.type === "image") {
      body += L.shape === "original"
        ? `<image href="${L.src}" x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`
        : `<clipPath id="${cid}">${shapeEl("")}</clipPath><image href="${L.src}" x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
    } else {
      if (L.shape !== "none") body += shapeEl(`fill="${L.fill}"`);
      // L.fs is the font size in inches; metrics were taken at a 100-unit font
      const base = (L.m.asc - L.m.desc) / 2 * L.fs / 100 * k;
      body += `<text x="0" y="${base}" text-anchor="middle" font-family="'${L.font}'" font-size="${L.fs * k}" font-weight="700" fill="${L.color}">${esc(L.text)}</text>`;
    }
    return `<g class="layer${selected ? " is-selected" : ""}" data-id="${L.id}" transform="translate(${x} ${y}) rotate(${rot})">${body}</g>`;
  }
  // canvas drawing of one layer centred at the origin; k = pixels per inch
  const imgCache = new Map();
  const loadImg = src => { if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; })); return imgCache.get(src); };
  async function paintLayer(ctx, L, k) {
    const W = L.wIn * k, H = L.hIn * k;
    const shapePath = () => { ctx.beginPath(); if (L.shape === "circle") ctx.ellipse(0, 0, W / 2, H / 2, 0, 0, Math.PI * 2); else ctx.rect(-W / 2, -H / 2, W, H); };
    if (L.type === "image") {
      const im = await loadImg(L.src);
      if (L.shape === "original") { ctx.drawImage(im, -W / 2, -H / 2, W, H); return; }
      const sc = Math.max(W / im.naturalWidth, H / im.naturalHeight), dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
      ctx.save(); shapePath(); ctx.clip(); ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh); ctx.restore();
      return;
    }
    await document.fonts?.load(`700 100px '${L.font}'`).catch(() => { });
    if (L.shape !== "none") { ctx.fillStyle = L.fill; shapePath(); ctx.fill(); }
    const px = L.fs * k;
    ctx.font = `700 ${px}px '${L.font}'`; ctx.fillStyle = L.color; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(L.text, 0, (L.m.asc - L.m.desc) / 2 * px / 100);
  }

  function draw() {
    const p = S.product, color = p.colors[S.colorIdx].hex, k = ppi(S.side);
    canvas.innerHTML = MK.svg(p.mockup, { color, uid: "stg", guides: S.guides, side: S.side, inner: cur().map(L => layerSVG(L, k, L.x, L.y, L.rot, L.id === S.selected)).join(""), label: `${p.name} ${S.side} preview` });
    // selection outline drawn outside the clip
    const svg = canvas.querySelector("svg"), L = sel();
    if (L) {
      const W = L.wIn * k, H = L.hIn * k;
      svg.insertAdjacentHTML("beforeend", `<g class="sel-outline" transform="translate(${L.x} ${L.y}) rotate(${L.rot})" pointer-events="none"><rect x="${-W / 2 - 4}" y="${-H / 2 - 4}" width="${W + 8}" height="${H + 8}" fill="none" stroke="#E5007E" stroke-width="1.5" stroke-dasharray="5 4" rx="3"/><circle cx="${-W / 2 - 4}" cy="${-H / 2 - 4}" r="4" fill="#E5007E"/><circle cx="${W / 2 + 4}" cy="${H / 2 + 4}" r="4" fill="#E5007E"/></g>`);
    }
    renderLayerList(); renderCtrl();
    $("#hint").textContent = cur().length ? "Drag the design to any spot inside the dashed area · arrow keys nudge" : `Upload artwork or add text for the ${S.side} — you'll pick the shape, size and spot next.`;
  }

  const layerLabel = L => `${SHAPE_NAME[L.shape][0].toUpperCase() + SHAPE_NAME[L.shape].slice(1)} · ${L.shape === "original" || L.shape === "none" ? `${f1(L.wIn)}×${f1(L.hIn)}` : sizeLabel(L.shape, L.si).replace(" in", "")} in`;
  function renderLayerList() {
    const other = S.layers[S.side === "front" ? "back" : "front"].length;
    $("#layerList").innerHTML = cur().map(L => `<button type="button" class="layer-item" data-lid="${L.id}" aria-pressed="${L.id === S.selected}">${L.type === "image" ? `<img src="${L.src}" alt="">` : `<span style="width:30px;text-align:center">${I("type")}</span>`}<span class="t"><span class="t1">${esc(L.type === "image" ? L.name : `"${L.text}"`)}</span><small>${esc(layerLabel(L))}</small></span></button>`).join("")
      + (other ? `<p class="note" style="margin:4px 0 0">${S.side === "front" ? "Back" : "Front"} also has ${other} design${other > 1 ? "s" : ""}.</p>` : "");
  }
  $("#layerList").addEventListener("click", e => { const b = e.target.closest("[data-lid]"); if (b) { S.selected = b.dataset.lid; draw(); } });

  // option chips shared by the layer panel and the "how should we print it" dialog
  function chips(el, items, current, disabled = () => false) {
    el.innerHTML = items.map(([v, label, icon]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${v === current}" ${disabled(v) ? 'disabled title="Too big for this product\'s print area"' : ""}>${icon || ""}${esc(label)}</button>`).join("");
  }
  function shapeItems(L) { return SHAPES[L.type].map(([v, l]) => [v, l, SHAPE_ICON[v]]); }
  function sizeItems(L) { return SIZES[L.shape].map((_, i) => [String(i), sizeLabel(L.shape, i)]); }

  function renderCtrl() {
    const L = sel(); $("#layerCtrl").hidden = !L; if (!L) return;
    chips($("#cShape"), shapeItems(L), L.shape);
    chips($("#cSize"), sizeItems(L), String(L.si), v => !fits(L, L.shape, +v, S.side));
    chips($("#cPlace"), placeItems(S.side), L.place);
    $("#cRot").value = L.rot; $("#oRot").textContent = L.rot + "°";
    $("#textCtrl").hidden = L.type !== "text";
    if (L.type === "text") { $("#cText").value = L.text; $("#cFont").value = L.font; $("#cColor").value = L.color; $("#cFill").value = L.fill; $("#cFillWrap").hidden = L.shape === "none"; }
  }
  const patch = (fn, redraw = true) => { const L = sel(); if (!L) return; fn(L); S.dirty = true; if (redraw) { draw(); summary(); } };
  // shape / size change keeps the chosen spot (or the dragged spot, kept inside the area)
  const reshape = L => { fitSize(L, S.side); if (L.place === "custom") clamp(L, S.side); else place(L, S.side); };
  $("#cShape").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) patch(L => { L.shape = b.dataset.v; reshape(L); }); });
  $("#cSize").addEventListener("click", e => { const b = e.target.closest("[data-v]:not(:disabled)"); if (b) patch(L => { L.si = +b.dataset.v; reshape(L); }); });
  $("#cPlace").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) patch(L => { L.place = b.dataset.v; place(L, S.side); }); });
  $("#cRot").addEventListener("input", e => patch(L => { L.rot = +e.target.value; }));
  $("#cText").addEventListener("input", e => patch(L => { L.text = e.target.value || " "; reshape(L); }));
  $("#cFont").addEventListener("change", e => {
    patch(L => { L.font = e.target.value; reshape(L); });
    document.fonts?.load(`700 100px '${e.target.value}'`).then(() => patch(L => reshape(L)));
  });
  $("#cColor").addEventListener("input", e => patch(L => { L.color = e.target.value; }));
  $("#cFill").addEventListener("input", e => patch(L => { L.fill = e.target.value; }));
  $("#bDup").addEventListener("click", () => { const L = sel(); if (!L) return; const c = { ...L, id: "L" + (++uid), x: L.x + 12, y: L.y + 12, place: "custom" }; clamp(c, S.side); cur().push(c); S.selected = c.id; draw(); summary(); });
  $("#bDel").addEventListener("click", () => { const L = sel(); if (!L) return; S.layers[S.side] = cur().filter(x => x !== L); S.selected = null; draw(); summary(); });

  /* ---------- drag (pointer events, works with touch) ---------- */
  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    const g = e.target.closest(".layer"), svg = canvas.querySelector("svg");
    if (!g) { if (S.selected) { S.selected = null; draw(); } return; }
    const L = cur().find(l => l.id === g.dataset.id); if (!L) return;
    if (S.selected !== L.id) { S.selected = L.id; draw(); }
    const pt = toSVG(canvas.querySelector("svg"), e); drag = { L, dx: pt.x - L.x, dy: pt.y - L.y, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch { } e.preventDefault();
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return; const svg = canvas.querySelector("svg"), pt = toSVG(svg, e);
    drag.L.x = pt.x - drag.dx; drag.L.y = pt.y - drag.dy; clamp(drag.L, S.side); drag.moved = true;
    const t = `translate(${drag.L.x} ${drag.L.y}) rotate(${drag.L.rot})`;
    svg.querySelector(`[data-id="${drag.L.id}"]`).setAttribute("transform", t);
    svg.querySelector(".sel-outline")?.setAttribute("transform", t);
  });
  const endDrag = () => { if (drag) { if (drag.moved) { drag.L.place = "custom"; S.dirty = true; renderCtrl(); summary(); } drag = null; } };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
  function toSVG(svg, e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  canvas.addEventListener("keydown", e => {
    const L = sel(); if (!L) return; const st = e.shiftKey ? 10 : 2;
    const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (mv) { e.preventDefault(); L.x += mv[0]; L.y += mv[1]; L.place = "custom"; clamp(L, S.side); draw(); summary(); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); $("#bDel").click(); }
  });

  /* ---------- "How should we print it?" dialog ---------- */
  const shModal = $("#shapeModal");
  let ask = null; // { L, side, resolve }
  function renderAsk() {
    const { L, side } = ask;
    chips($("#shShape"), shapeItems(L), L.shape);
    chips($("#shSize"), sizeItems(L), String(L.si), v => !fits(L, L.shape, +v, side));
    chips($("#shPlace"), placeItems(side), L.place);
    $("#shPlaceLbl").textContent = `Where on the ${side}${worn() ? " (left and right as worn)" : ""}`;
    // preview: the print on a swatch of the garment colour, drawn at a fixed scale (inches visible)
    const k = 34, pad = 14, W = L.wIn * k, H = L.hIn * k, bw = Math.max(W, 6 * k) + pad * 2, bh = Math.max(H, 3 * k) + pad * 2;
    $("#shPreview").innerHTML = `<svg viewBox="${-bw / 2} ${-bh / 2} ${bw} ${bh}" role="img" aria-label="Preview of your print"><rect x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" fill="${S.product.colors[S.colorIdx].hex}"/>${layerSVG(L, k, 0, 0, 0)}</svg>`;
    $("#shDims").textContent = `${SHAPE_NAME[L.shape][0].toUpperCase() + SHAPE_NAME[L.shape].slice(1)} · ${f1(L.wIn)} × ${f1(L.hIn)} in printed`;
  }
  function askShape(L, side) {
    return new Promise(resolve => {
      ask = { L, side, resolve }; setup(L, side); renderAsk();
      $("#shTitle").textContent = L.type === "image" ? "How should we print your design?" : "How should your text look?";
      window.T9.openLayer(shModal);
    });
  }
  const finishAsk = ok => { if (!ask) return; const a = ask; ask = null; a.resolve(ok ? a.L : null); };
  // closed with ✕, the overlay or Escape → nothing is added
  new MutationObserver(() => { if (!shModal.classList.contains("is-open")) finishAsk(false); }).observe(shModal, { attributes: true, attributeFilter: ["class"] });
  const askPatch = fn => { fn(ask.L); setup(ask.L, ask.side); renderAsk(); };
  $("#shShape").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) askPatch(L => { L.shape = b.dataset.v; }); });
  $("#shSize").addEventListener("click", e => { const b = e.target.closest("[data-v]:not(:disabled)"); if (b) askPatch(L => { L.si = +b.dataset.v; }); });
  $("#shPlace").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) askPatch(L => { L.place = b.dataset.v; }); });
  $("#shOk").addEventListener("click", () => { const a = ask; finishAsk(true); window.T9.closeLayers(); if (a) addLayer(a.L, a.side); });

  /* ---------- upload ---------- */
  const originals = new Map(); // file name -> original File, sent with WhatsApp orders
  const readImage = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        // downscale for preview performance; originals are sent on WhatsApp
        const max = 1400, sc = Math.min(1, max / Math.max(img.naturalWidth || 600, img.naturalHeight || 600));
        const w = Math.round((img.naturalWidth || 600) * sc), h = Math.round((img.naturalHeight || 600) * sc);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
        res({ src: cv.toDataURL("image/png"), w, h });
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(f);
  });
  // one file at a time: each upload asks for its shape, size and spot before it lands on the garment
  async function readFiles(files) {
    for (const f of [...files]) {
      if (!/^image\//.test(f.type)) { toast("Please upload an image file"); continue; }
      if (f.size > 25 * 1024 * 1024) { toast("File is over 25 MB — send it on WhatsApp instead"); continue; }
      let im; try { im = await readImage(f); } catch { toast("Couldn't read that image"); continue; }
      originals.set(f.name, f);
      const side = S.side;
      await askShape({ id: "L" + (++uid), type: "image", src: im.src, name: f.name, iw: im.w, ih: im.h, shape: "square", si: DEF_SIZE, place: defPlace(side), x: 0, y: 0, rot: 0 }, side);
    }
  }
  $("#file").addEventListener("change", e => { readFiles(e.target.files); e.target.value = ""; });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", e => readFiles(e.dataTransfer.files));
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
  drop.tabIndex = 0;
  $("#addTxt").addEventListener("click", async () => {
    const v = $("#txt").value.trim(); if (!v) { $("#txt").focus(); return; }
    const dark = MK.isDark(S.product.colors[S.colorIdx].hex), side = S.side;
    await document.fonts?.load("700 100px 'Unbounded'").catch(() => { });
    const L = await askShape({ id: "L" + (++uid), type: "text", text: v, font: "Unbounded", color: dark ? "#FFC400" : "#E5007E", fill: dark ? "#FFFFFF" : "#16161A", shape: "none", si: DEF_SIZE, place: defPlace(side), x: 0, y: 0, rot: 0 }, side);
    if (L) $("#txt").value = "";
  });
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
      ${["front", "back"].flatMap(side => S.layers[side].map((L, n) => `<div class="summary-line"><span>${side === "front" ? "Front" : "Back"} ${n + 1}</span><span>${esc(layerLabel(L))}</span></div>`)).join("")}
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
    const base = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(MK.svg(p.mockup, { color, uid: "ex", side })); });
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
    const a = MK.areaFor(p.mockup, side);
    ctx.save(); ctx.scale(sc, sc); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    for (const L of S.layers[side]) {
      ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot * Math.PI / 180);
      await paintLayer(ctx, L, ppi(side));
      ctx.restore();
    }
    ctx.restore();
    ctx.font = `800 ${14 * sc / 2}px 'Nunito Sans'`; ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.textAlign = "right";
    ctx.fillText(`Trendli9 Prints · ${p.name} · ${p.colors[S.colorIdx].name} · ${side}`, cv.width - 16, cv.height - 14);
    return cv.toDataURL(type, q);
  }
  // one download per click (mobile browsers block back-to-back downloads) — downloads the side being viewed
  $("#dlBtn").addEventListener("click", async () => {
    try {
      const url = await renderPNG(S.side, 1400);
      const a = document.createElement("a"); a.href = url; a.download = `trendli9-${S.product.id}-${S.side}.png`; document.body.appendChild(a); a.click(); a.remove();
      toast(`${S.side === "front" ? "Front" : "Back"} mockup downloaded — attach it in WhatsApp`);
    } catch { toast("Couldn't create the mockup image — please try again"); }
  });

  /* ---------- add to order / WhatsApp ---------- */
  // where the print sits, measured the way a presser lines it up: from the centre line and the top of the print area
  function spot(L, side) {
    const a = MK.areaFor(S.product.mockup, side), k = ppi(side);
    const dx = (L.x - (a.x + a.w / 2)) / k, top = (L.y - L.hIn * k / 2 - a.y) / k;
    const pl = placeItems(side).find(([v]) => v === L.place);
    // screen-left is the wearer's right on the front of a garment
    const toLeft = leftOnScreenLeft(side) ? dx < 0 : dx > 0, who = worn() ? "wearer's " : "";
    return `${pl ? pl[1].toLowerCase() : "custom spot"}: ${Math.abs(dx) < .1 ? "centred" : `${f1(Math.abs(dx))} in to the ${who}${toLeft ? "left" : "right"} of centre`}, ${f1(Math.max(0, top))} in below the top of the print area`;
  }
  function describe(L, side) {
    const what = L.type === "image" ? `artwork "${L.name}"` : `text "${L.text}" (${L.font}, ${L.color}${L.shape !== "none" ? `, on a ${L.fill} badge` : ""})`;
    return `${what} — ${SHAPE_NAME[L.shape]}, ${f1(L.wIn)} × ${f1(L.hIn)} in — ${spot(L, side)}${L.rot ? `, rotated ${L.rot}°` : ""}`;
  }
  function designSummary() {
    const lines = [];
    ["front", "back"].forEach(side => S.layers[side].forEach((L, n) => lines.push(`${side === "front" ? "Front" : "Back"} ${n + 1}: ${describe(L, side)}`)));
    return lines.length ? lines.join("\n") : "Artwork to be shared";
  }
  // print-ready PNG of one design at its exact size, 300 DPI, transparent around the shape
  async function printFile(L, side, n) {
    const cv = document.createElement("canvas"); cv.width = Math.round(L.wIn * 300); cv.height = Math.round(L.hIn * 300);
    const ctx = cv.getContext("2d"); ctx.translate(cv.width / 2, cv.height / 2);
    await paintLayer(ctx, L, 300);
    const blob = await new Promise(r => cv.toBlob(r, "image/png"));
    return new File([blob], `trendli9-${side}-${n}-${L.shape}-${f1(L.wIn)}x${f1(L.hIn)}in-300dpi.png`, { type: "image/png" });
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
  // mockup PNG of each printed side, a print-ready file per design, then the original artwork files
  async function orderFiles() {
    const p = S.product, out = [];
    for (const side of ["front", "back"]) {
      if (!S.layers[side].length) continue;
      const blob = await (await fetch(await renderPNG(side, 1400))).blob();
      out.push(new File([blob], `trendli9-${p.id}-${side}-mockup.png`, { type: "image/png" }));
    }
    for (const side of ["front", "back"]) for (const [n, L] of S.layers[side].entries()) out.push(await printFile(L, side, n + 1));
    const names = new Set(S.layers.front.concat(S.layers.back).filter(L => L.type === "image").map(L => L.name));
    names.forEach(n => { if (originals.has(n)) out.push(originals.get(n)); });
    return out;
  }
  $("#waNow").addEventListener("click", () => {
    if (needQty()) return;
    const i = buildItem(); S.dirty = false;
    const text = [`Hi Trendli9! I designed this in your Design Studio:`, ``, `*${i.name}* — ${i.color}`, `Sizes: ${Object.entries(i.sizes).map(([s, q]) => `${s}×${q}`).join(", ")} (${i.qty} pcs)`,
      `Print: ${i.areas.join(", ")}`, `Designs (${worn() ? "left/right as worn" : "left/right as you look at it"}; see the mockup):`, i.design, i.notes ? `Notes: ${i.notes}` : null, ``, `Mockup, print-ready files (300 DPI) and my original artwork are attached. Please share a quote.`].filter(x => x !== null).join("\n");
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
  // once web fonts arrive, re-measure text so its print size stays exact
  document.fonts?.ready.then(() => { ["front", "back"].forEach(side => S.layers[side].forEach(L => { if (L.type === "text") { recompute(L); clamp(L, side); } })); draw(); });
})();
