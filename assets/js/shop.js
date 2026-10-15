/* TRENDLI9 — Shop: filter, search, quick view, add to order */
(function () {
  const { $, $$, esc, money, cart, priceLine, tierFor, openLayer, openWA } = window.T9;
  const CAT = window.T9_CATALOG, MK = window.T9_MOCKUPS, I = window.T9_ICON;
  const params = new URLSearchParams(location.search);
  let cat = params.get("cat") || "all", q = "", sort = "featured";

  $("#chips").innerHTML = [{ id: "all", name: "All" }, ...CAT.CATEGORIES].map(c =>
    `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === cat}">${esc(c.name)}</button>`).join("");

  // showcase colour per product for the catalogue grid
  const SHOW = { "classic-tee": "Black", "oversized-tee": "Lavender", polo: "Navy", hoodie: "Black", sweatshirt: "Maroon", "kids-tee": "Sky Blue", cap: "Black", tote: "Natural", cushion: "White", apron: "Black" };
  const showIdx = p => Math.max(0, (p.colors || []).findIndex(c => c.name === SHOW[p.id]));
  // real product photo first; the recolourable mockup is shown once a colour is chosen
  const photo = p => `<img src="assets/img/${p.photo}.webp" alt="${esc(p.name)}" loading="lazy" width="960" height="1200">`;
  const media = (p, color) => (p.photo && !color) ? photo(p) : p.mockup ? MK.svg(p.mockup, { color: color || p.colors[showIdx(p)].hex, label: p.name, inner: MK.sampleArt(p.mockup) })
    : p.icon ? `<div class="icon-tile" style="--tile:${p.tile}" role="img" aria-label="${esc(p.name)}">${I(p.icon)}</div>`
    : `<img src="assets/img/${p.img}.webp" alt="${esc(p.name)}" loading="lazy" width="800" height="600">`;
  const priceTxt = p => p.price == null ? `<span class="price">Get price</span>` :
    `<span class="price"><small>from</small> ${money(p.sizePrice ? Math.min(...Object.values(p.sizePrice)) : p.price)}<small> / ${p.unit}</small></span>`;

  function render() {
    let list = CAT.PRODUCTS.filter(p => (cat === "all" || p.cat === cat) &&
      (!q || (p.name + " " + p.desc + " " + p.cat).toLowerCase().includes(q)));
    const pv = p => p.price ?? 1e9;
    if (sort === "low") list.sort((a, b) => pv(a) - pv(b));
    if (sort === "high") list.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    if (sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    $("#resultCount").textContent = `${list.length} product${list.length !== 1 ? "s" : ""}`;
    $("#grid").innerHTML = list.length ? list.map(p => `
      <article class="prod-card">
        <div class="prod-card__media">${media(p)}${p.badge ? `<span class="badge badge--grad">${esc(p.badge)}</span>` : ""}</div>
        <div class="prod-card__body">
          <h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>
          ${p.colors ? `<div class="swatches" aria-label="${p.colors.length} colours">${p.colors.slice(0, 8).map(c => `<span class="swatch" style="background:${c.hex}" title="${c.name}"></span>`).join("")}${p.colors.length > 8 ? `<small class="muted">+${p.colors.length - 8}</small>` : ""}</div>` : ""}
          <div class="prod-card__foot">${priceTxt(p)}
            <div style="display:flex;gap:6px">
              ${p.custom ? `<a class="icon-btn" href="studio.html?p=${p.id}" aria-label="Customise ${esc(p.name)} in Design Studio" title="Customise">${I("wand")}</a>` : ""}
              <button class="btn btn--sm" type="button" data-qv="${p.id}">${p.quote ? "Get quote" : "Choose"}</button>
            </div></div>
        </div>
      </article>`).join("") : `<div class="empty" style="grid-column:1/-1">${I("search")}<p><b>No products match.</b><br>Try another search or <a class="link-arrow" href="#" data-wa="Hi Trendli9! I'm looking for: ${esc(q)}">ask us on WhatsApp</a>.</p></div>`;
  }

  $("#chips").addEventListener("click", e => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    cat = b.dataset.cat; $$("#chips .chip").forEach(c => c.setAttribute("aria-pressed", c === b));
    history.replaceState(null, "", cat === "all" ? "shop.html" : `shop.html?cat=${cat}`); render();
  });
  let t; $("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim().toLowerCase(); render(); }, 150); });
  $("#sort").addEventListener("change", e => { sort = e.target.value; render(); });

  /* ---------- Quick view ---------- */
  document.addEventListener("click", e => { const b = e.target.closest("[data-qv]"); if (b) quickView(b.dataset.qv); });

  function quickView(id) {
    const p = CAT.PRODUCTS.find(x => x.id === id); if (!p) return;
    const hasSizes = p.sizes && p.colors; // garments: size breakdown
    const body = $("#qvBody");
    body.innerHTML = `
      <div class="qv__media" id="qvMedia">${media(p)}</div>
      <form class="modal__body" id="qvForm" novalidate>
        <p class="eyebrow">${esc(CAT.CATEGORIES.find(c => c.id === p.cat).name)}</p>
        <h2 id="qvTitle" style="font-size:1.5rem">${esc(p.name)}</h2>
        <p class="muted">${esc(p.desc)}</p>
        ${p.colors ? `<div class="field"><span class="label">Colour: <span id="qvColorName">${p.colors[showIdx(p)].name}</span></span><div class="color-opts">${p.colors.map((c, i) => `<label class="color-opt" title="${c.name}"><input type="radio" name="color" value="${i}" ${i === showIdx(p) ? "checked" : ""} aria-label="${c.name}"><span style="background:${c.hex}"></span></label>`).join("")}</div></div>` : ""}
        ${p.areas && p.areas.length > 1 ? `<div class="field"><span class="label">Print locations</span><div class="opt-group">${p.areas.map(a => `<label class="opt"><input type="checkbox" name="area" value="${a.id}" ${a.id === "front" ? "checked" : ""}><span>${a.name}${a.add ? ` +${money(a.add)}` : ""}</span></label>`).join("")}</div></div>` : ""}
        ${hasSizes ? `<div class="field"><span class="label">Sizes & quantity</span><div class="size-grid">${p.sizes.map(s => `<label class="size-cell">${s}<input type="number" min="0" inputmode="numeric" name="size_${s}" value="0" aria-label="Quantity size ${s}"></label>`).join("")}</div></div>`
          : `${p.sizes ? `<div class="field"><span class="label">Option</span><div class="opt-group">${p.sizes.map((s, i) => `<label class="opt"><input type="radio" name="variant" value="${s}" ${i ? "" : "checked"}><span>${s}${p.sizePrice ? " · " + money(p.sizePrice[s]) : ""}</span></label>`).join("")}</div></div>` : ""}
             <div class="field"><label for="qvQty">Quantity (${p.unit}${p.minQty > 1 ? `, min ${p.minQty}` : ""})</label><div class="qty"><button type="button" data-q="-1" aria-label="Decrease">−</button><input type="number" id="qvQty" name="qty" min="${p.minQty || 1}" value="${p.minQty || 1}"><button type="button" data-q="1" aria-label="Increase">+</button></div></div>`}
        <div class="field"><label for="qvNotes">Notes / design details</label><textarea class="textarea" id="qvNotes" name="notes" rows="2" placeholder="${p.quote ? "Fabric, quantity, design idea, deadline…" : "Artwork placement, names & numbers…"}"></textarea></div>
        <div class="card" style="padding:14px 16px;background:var(--bg);box-shadow:none;margin-bottom:14px">
          <div class="total-row"><span>Estimated</span><span id="qvPrice" style="font-family:var(--font-display)"></span></div>
          <div class="tier-bar" id="qvTier" ${hasSizes ? "" : "hidden"}>${CAT.TIERS.slice(1).map(() => "<span></span>").join("")}</div>
          <p class="note" id="qvNote" style="margin:4px 0 0"></p>
        </div>
        <div style="display:grid;gap:8px">
          <button class="btn btn--block" type="submit">${I("cart")} Add to order</button>
          ${p.custom ? `<a class="btn btn--ghost btn--block" href="studio.html?p=${p.id}">${I("wand")} Customise in Design Studio</a>` : ""}
          <button class="btn btn--wa btn--block" type="button" id="qvWA">${I("whatsapp")} Ask about this on WhatsApp</button>
        </div>
      </form>`;
    const form = $("#qvForm");
    const read = () => {
      const fd = new FormData(form);
      const color = p.colors ? p.colors[+fd.get("color")] : null;
      const areaIds = fd.getAll("area").length ? fd.getAll("area") : (p.areas ? ["front"] : []);
      let sizes = null, qty;
      if (hasSizes) { sizes = {}; p.sizes.forEach(s => { const n = parseInt(fd.get("size_" + s)) || 0; if (n > 0) sizes[s] = n; }); qty = Object.values(sizes).reduce((a, b) => a + b, 0); }
      else qty = Math.max(p.minQty || 1, parseInt(fd.get("qty")) || 1);
      const variant = fd.get("variant") || null;
      const pl = priceLine({ product: p, qty: Math.max(qty, 1), areas: areaIds, sizeLabel: variant });
      return { color, areaIds, sizes, qty, variant, pl, notes: fd.get("notes").trim() };
    };
    const update = () => {
      const r = read();
      if (r.color) { $("#qvColorName").textContent = r.color.name; if (colourTouched || !p.photo) $("#qvMedia").innerHTML = media(p, r.color.hex) + (p.photo ? `<span class="qv__tag">Colour preview</span>` : ""); }
      $("#qvPrice").textContent = r.pl.total == null ? "Quote on WhatsApp" : (hasSizes && !r.qty ? `${money(r.pl.unit)} / pc` : money(r.pl.total));
      const tierIdx = CAT.TIERS.indexOf(tierFor(r.qty));
      $$("#qvTier span").forEach((s, i) => s.classList.toggle("on", i < tierIdx));
      const next = CAT.TIERS.find(t => t.min > r.qty);
      $("#qvNote").textContent = r.pl.total == null ? "Our team will price this based on your requirement." :
        hasSizes ? (r.qty ? `${r.qty} pcs${r.pl.off ? ` · ${r.pl.off * 100}% bulk discount applied` : ""}${next ? ` · add ${next.min - r.qty} more for ${next.off * 100}% off` : ""}` : "Enter quantities per size") : `${r.qty} ${p.unit} × ${money(r.pl.unit)}`;
    };
    let colourTouched = false;
    form.addEventListener("change", e => { if (e.target.name === "color") colourTouched = true; });
    form.addEventListener("input", update); form.addEventListener("change", update);
    form.addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (!b) return; const inp = $("#qvQty"); inp.value = Math.max(+inp.min, (parseInt(inp.value) || 0) + +b.dataset.q); update(); });
    form.addEventListener("submit", e => {
      e.preventDefault(); const r = read();
      if (hasSizes && !r.qty) { window.T9.toast("Add a quantity for at least one size"); form.querySelector(".size-cell input").focus(); return; }
      cart.add({ productId: p.id, name: p.name, mockup: p.mockup, img: p.img, color: r.color?.name, colorHex: r.color?.hex, sizes: r.sizes, variant: r.variant, qty: r.qty, unit: hasSizes ? "pcs" : p.unit,
        areas: r.areaIds.map(id => p.areas.find(a => a.id === id).name), total: r.pl.total, notes: r.notes, hasArtwork: p.cat !== "consumables" });
      window.T9.closeLayers();
    });
    $("#qvWA").addEventListener("click", () => { const r = read(); openWA(`Hi Trendli9! I'm interested in *${p.name}*${r.color ? ` (${r.color.name})` : ""}${r.variant ? ` — ${r.variant}` : ""}${r.qty ? `, qty ${r.qty}` : ""}.${r.notes ? `\nNotes: ${r.notes}` : ""}\nPlease share price & details.`); });
    update();
    openLayer($("#qvModal"));
  }

  render();
  if (params.get("p")) quickView(params.get("p"));
})();
