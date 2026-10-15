/* Trendli9 — Smart Halftone & Background Remover (page controller).
   Everything runs locally in the browser; artwork never leaves the device. */
(function () {
  "use strict";
  const T9 = window.T9 || {};
  const $ = (s, r = document) => r.querySelector(s);
  const toast = T9.toast || ((m) => alert(m));

  const PREVIEW_MAX = 1600, FULL_MAX = 4000;
  const WORKER_URL = "assets/js/halftone-worker.js?v=20261015a";
  const DEFAULTS = { mode: "auto", tol: 12, soft: 20, cell: 8, range: 85, angle: 22.5, choke: 1 };
  const BG_LABEL = { black: "Remove black", white: "Remove white", none: "Halftone only" };

  const els = {
    file: $("#htFile"), drop: $("#htDrop"), modes: $("#htMode"), autoNote: $("#htAutoNote"),
    canvas: $("#htCanvas"), stage: $("#htStage"), empty: $("#htEmpty"), status: $("#htStatus"),
    shirt: $("#htShirt"), zoom: $("#htZoom"), compare: $("#htCompare"),
    dl: $("#htDownload"), send: $("#htSend"), reset: $("#htReset"), fileName: $("#htFileName"),
  };
  const sliders = ["tol", "soft", "cell", "range", "angle", "choke"].map((k) => ({
    key: k, input: $("#ht-" + k), out: $("#ht-" + k + "-out"),
  }));
  const FMT = { tol: (v) => v + "%", soft: (v) => v + "%", cell: (v) => v + " px", range: (v) => v + "%", angle: (v) => v + "°", choke: (v) => v + " px" };

  const state = { ...DEFAULTS, img: null, name: "artwork", src: null, out: null, comparing: false, busy: false };
  const ctx = els.canvas.getContext("2d");

  /* ---------- processing engine: worker with main-thread fallback ---------- */
  let worker = null, jobSeq = 0;
  const pending = new Map();
  try {
    worker = new Worker(WORKER_URL);
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id); if (!job) return;
      pending.delete(e.data.id);
      e.data.error ? job.reject(new Error(e.data.error)) : job.resolve(e.data);
    };
    worker.onerror = () => { worker = null; pending.forEach((j) => j.reject(new Error("worker failed"))); pending.clear(); };
  } catch (_) { worker = null; }

  let fallbackLoaded = null;
  function loadFallback() {
    if (window.T9Halftone) return Promise.resolve();
    return fallbackLoaded || (fallbackLoaded = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = WORKER_URL; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }

  function run(imageData, params) {
    const copy = new Uint8ClampedArray(imageData.data); // keep the source intact
    const w = imageData.width, h = imageData.height;
    if (worker) {
      return new Promise((resolve, reject) => {
        const id = ++jobSeq; pending.set(id, { resolve, reject });
        worker.postMessage({ id, buffer: copy.buffer, w, h, params }, [copy.buffer]);
      }).then((r) => ({ image: new ImageData(new Uint8ClampedArray(r.buffer), r.w, r.h), meta: r.meta }))
        .catch(() => { worker = null; return run(imageData, params); });
    }
    // fallback: yield a frame so the status paints, then process on the main thread
    return loadFallback().then(() => new Promise((r) => setTimeout(r, 16))).then(() => {
      const meta = window.T9Halftone.process(copy, w, h, params);
      return { image: new ImageData(copy, w, h), meta };
    });
  }

  const params = (scale = 1) => ({
    mode: state.mode, tol: state.tol / 100, soft: state.soft / 100, range: state.range / 100,
    cell: state.cell * scale, angle: state.angle, choke: state.choke * scale,
  });

  /* ---------- preview loop (one job in flight, latest settings win) ---------- */
  let dirty = false, debounceT = 0;
  function schedule(delay = 120) {
    if (!state.src) return;
    clearTimeout(debounceT);
    debounceT = setTimeout(() => { dirty = true; pump(); }, delay);
  }
  async function pump() {
    if (state.busy || !dirty) return;
    dirty = false; state.busy = true;
    setStatus("Processing…", true);
    try {
      const { image, meta } = await run(state.src, params());
      state.out = image; state.picked = meta.bg; state.lastMs = meta.ms;
      if (!state.comparing) draw(image);
      showPicked();
      setStatus(`Preview ready · ${meta.ms} ms · ${BG_LABEL[meta.bg]}`);
    } catch (err) {
      setStatus("Couldn't process this image. Try a smaller file.");
      console.warn(err);
    } finally {
      state.busy = false;
      if (dirty) pump();
    }
  }

  function draw(image) {
    if (els.canvas.width !== image.width || els.canvas.height !== image.height) {
      els.canvas.width = image.width; els.canvas.height = image.height;
    }
    ctx.putImageData(image, 0, 0);
  }
  function setStatus(msg, busy) { els.status.textContent = msg; els.stage.classList.toggle("is-busy", !!busy); }
  function showPicked() {
    els.autoNote.textContent = state.mode === "auto" && state.picked
      ? `Auto detected: ${state.picked === "black" ? "dark background → removing black" : state.picked === "white" ? "light background → removing white" : "already transparent → halftone only"}`
      : "";
  }

  /* ---------- loading artwork ---------- */
  function imageDataFrom(img, max) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }

  function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Please choose a PNG, JPG or WEBP image"); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.name = (file.name || "artwork").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "artwork";
      state.src = imageDataFrom(img, PREVIEW_MAX);
      els.fileName.textContent = `${file.name} · ${img.naturalWidth}×${img.naturalHeight}px`;
      els.empty.hidden = true; els.canvas.hidden = false;
      els.dl.disabled = els.send.disabled = els.compare.disabled = false;
      draw(state.src);
      schedule(0);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("That image couldn't be opened"); };
    img.src = url;
  }

  els.file.addEventListener("change", () => { loadFile(els.file.files[0]); els.file.value = ""; });
  ["dragenter", "dragover"].forEach((t) => els.drop.addEventListener(t, (e) => { e.preventDefault(); els.drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => els.drop.addEventListener(t, (e) => { e.preventDefault(); els.drop.classList.remove("is-over"); }));
  els.drop.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));
  els.drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.file.click(); } });

  /* ---------- controls ---------- */
  function segment(group, attr, onPick) {
    group.addEventListener("click", (e) => {
      const b = e.target.closest("button[" + attr + "]"); if (!b) return;
      group.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onPick(b.getAttribute(attr));
    });
  }
  segment(els.modes, "data-mode", (m) => { state.mode = m; showPicked(); schedule(0); });
  segment(els.shirt, "data-shirt", (s) => { els.stage.dataset.shirt = s; });
  segment(els.zoom, "data-zoom", (z) => { els.stage.dataset.zoom = z; });

  function syncSliders() {
    sliders.forEach(({ key, input, out }) => { input.value = state[key]; out.textContent = FMT[key](state[key]); });
  }
  sliders.forEach(({ key, input, out }) => {
    input.addEventListener("input", () => { state[key] = parseFloat(input.value); out.textContent = FMT[key](state[key]); schedule(); });
  });
  els.reset.addEventListener("click", () => {
    Object.assign(state, DEFAULTS); syncSliders();
    els.modes.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === "auto")));
    showPicked(); schedule(0);
  });
  syncSliders();

  /* hold to compare (pointer + Space/Enter) */
  const showOriginal = (on) => {
    if (!state.src || state.comparing === on) return;
    state.comparing = on; els.compare.setAttribute("aria-pressed", String(on));
    draw(on ? state.src : state.out || state.src);
  };
  els.compare.addEventListener("pointerdown", (e) => { e.preventDefault(); els.compare.setPointerCapture?.(e.pointerId); showOriginal(true); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => els.compare.addEventListener(t, () => showOriginal(false)));
  els.compare.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); showOriginal(true); } });
  els.compare.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); showOriginal(false); } });
  els.compare.addEventListener("blur", () => showOriginal(false));

  /* ---------- export at full resolution ---------- */
  async function renderFull() {
    const full = imageDataFrom(state.img, FULL_MAX);
    const scale = Math.max(full.width, full.height) / Math.max(state.src.width, state.src.height);
    const { image } = await run(full, params(scale));
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    c.getContext("2d").putImageData(image, 0, 0);
    return c;
  }
  async function withBusy(btn, label, fn) {
    if (!state.img) return;
    btn.disabled = true; setStatus(label, true);
    try { await fn(); } catch (err) { console.warn(err); setStatus("Export failed — try a smaller image."); toast("Export failed — try a smaller image"); }
    finally { btn.disabled = false; els.stage.classList.remove("is-busy"); }
  }

  els.dl.addEventListener("click", () => withBusy(els.dl, "Rendering full-resolution PNG…", async () => {
    const c = await renderFull();
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob failed");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${state.name}-halftone.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    window.__t9LastExport = { size: blob.size, type: blob.type, w: c.width, h: c.height }; // used by QA
    setStatus(`Downloaded ${c.width}×${c.height}px transparent PNG`);
  }));

  els.send.addEventListener("click", () => withBusy(els.send, "Preparing for the gang sheet…", async () => {
    const c = await renderFull();
    const url = c.toDataURL("image/png");
    try { sessionStorage.setItem("t9_gangsheet_import", url); }
    catch (_) { toast("Too large — download it instead"); setStatus("Too large to hand off — please download the PNG instead."); return; }
    location.href = "gang-sheet.html";
  }));
})();
