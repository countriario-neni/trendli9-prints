/* Trendli9 — Smart Halftone processing core.
   Runs inside a Web Worker (assets/js/halftone.js spawns it). If workers are
   unavailable the same file is loaded as a normal script and exposes
   self.T9Halftone.process for main-thread use. Pure image processing, no network. */
(function (root) {
  "use strict";

  /* Look at a band of pixels around the border and decide whether the
     background is mostly dark or mostly light. Returns "black" | "white" | "none". */
  function detectBackground(d, w, h) {
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
    let dark = 0, light = 0, transparent = 0, n = 0;
    const step = Math.max(1, Math.round(Math.max(w, h) / 600)); // sample sparsely on big images
    for (let y = 0; y < h; y += step) {
      const edgeRow = y < band || y >= h - band;
      for (let x = 0; x < w; x += edgeRow ? step : 1) {
        if (!edgeRow && x >= band && x < w - band) { x = w - band - 1; continue; }
        const i = (y * w + x) * 4;
        n++;
        if (d[i + 3] < 128) { transparent++; continue; }
        const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        if (lum < 0.3) dark++; else if (lum > 0.7) light++;
      }
    }
    if (transparent > n * 0.5) return "none";
    return dark >= light ? "black" : "white";
  }

  /* Separable box blur of a Float32 plane (radius r) using running sums. */
  function boxBlur(src, w, h, r) {
    if (r < 1) return src.slice();
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let x = -r; x <= r; x++) s += src[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s;
        s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    const k = 1 / ((2 * r + 1) * (2 * r + 1));
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s * k;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  /* Separable min filter (square erosion) — the "choke". */
  function minFilter(a, w, h, r) {
    if (r < 1) return a;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) {
        let m = 1;
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
        for (let k = x0; k <= x1; k++) { const v = a[o + k]; if (v < m) m = v; }
        tmp[o + x] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        let m = 1;
        for (let k = y0; k <= y1; k++) { const v = tmp[k * w + x]; if (v < m) m = v; }
        out[y * w + x] = m;
      }
    }
    return out;
  }

  /* p: { mode: auto|black|white|none, tol, soft, range (0–1), cell (px), angle (deg), choke (px) } */
  function process(data, w, h, p) {
    const t0 = Date.now();
    const d = data;                       // Uint8ClampedArray, modified in place
    const n = w * h;
    let bg = p.mode === "auto" ? detectBackground(d, w, h) : p.mode;
    const alpha = new Float32Array(n);

    /* 1 — key out the background and un-premultiply colours */
    const lo = p.tol, hi = p.tol + Math.max(0.001, p.soft);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = d[j], g = d[j + 1], b = d[j + 2], a0 = d[j + 3] / 255;
      if (bg === "black" || bg === "white") {
        const dist = bg === "black"
          ? Math.max(r, g, b) / 255            // how far from black
          : 1 - Math.min(r, g, b) / 255;       // how far from white
        let t = (dist - lo) / (hi - lo);
        t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); // smoothstep
        const a = t * a0;
        alpha[i] = a;
        if (t > 0.01 && t < 1) {
          const inv = 1 / t, B = bg === "black" ? 0 : 255, kb = (1 - t) * B;
          d[j] = (r - kb) * inv; d[j + 1] = (g - kb) * inv; d[j + 2] = (b - kb) * inv; // clamped by the array type
        }
      } else {
        alpha[i] = a0;
      }
    }

    /* 2 — optional choke (edge erosion) */
    const chokeR = Math.round(p.choke);
    const A = chokeR > 0 ? minFilter(alpha, w, h, chokeR) : alpha;

    /* 3 — AM halftone on a rotated grid for the semi-transparent zone */
    const s = Math.max(2, p.cell);
    const avg = boxBlur(A, w, h, Math.max(1, Math.round(s / 2)));
    const th = (p.angle * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
    const range = p.range, floor = 0.02, invPi = 1 / Math.PI;
    for (let y = 0; y < h; y++) {
      let u = y * sn - c, v = y * c + sn;   // rotated coords of x = -1, advanced each step
      for (let x = 0; x < w; x++) {
        u += c; v -= sn;
        const i = y * w + x, j = i * 4;
        const a = A[i];
        let out;
        if (a >= range) out = 1;
        else if (a < floor) out = 0;
        else {
          const ci = (Math.floor(u / s) + 0.5) * s, cj = (Math.floor(v / s) + 0.5) * s;
          // cell centre back in image space; sample local mean alpha there
          let cx = Math.round(ci * c - cj * sn), cy = Math.round(ci * sn + cj * c);
          cx = cx < 0 ? 0 : cx >= w ? w - 1 : cx; cy = cy < 0 ? 0 : cy >= h ? h - 1 : cy;
          const m = avg[cy * w + cx];
          const r2 = s * s * m * invPi;     // area of dot = cell area * mean coverage
          const du = u - ci, dv = v - cj;
          out = du * du + dv * dv <= r2 ? 1 : 0;
        }
        if (out) d[j + 3] = 255;
        else { d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 0; }
      }
    }
    return { bg, ms: Date.now() - t0 };
  }

  root.T9Halftone = { process, detectBackground };

  if (typeof WorkerGlobalScope !== "undefined" && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const { id, buffer, w, h, params } = e.data;
      try {
        const data = new Uint8ClampedArray(buffer);
        const meta = process(data, w, h, params);
        root.postMessage({ id, buffer: data.buffer, w, h, meta }, [data.buffer]);
      } catch (err) {
        root.postMessage({ id, error: String(err && err.message || err) });
      }
    };
  }
})(self);
