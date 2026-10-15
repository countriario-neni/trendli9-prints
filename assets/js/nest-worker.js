/* Trendli9 — Gang sheet "true shape" nesting core.
   Runs inside a Web Worker (assets/js/gangsheet.js spawns it). If workers are
   unavailable the same file is loaded as a normal script and exposes
   self.T9Nest.pack for main-thread use. Pure geometry, no network.

   Every design arrives as a silhouette mask on a grid of square cells
   (1 = art). Prints are placed one by one, largest first, at the first
   free spot scanning top-to-bottom, left-to-right, on the first sheet
   with room. Occupancy is grown by the spacing, so shapes keep their gap. */
(function (root) {
  "use strict";

  // Uint8 mask -> rows of 32-bit words
  function toBits(mask, w, h) {
    const W = (w + 31) >> 5, rows = new Int32Array(W * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) rows[y * W + (x >> 5)] |= 1 << (x & 31);
    return { w, h, W, rows };
  }
  // 90° clockwise (matches the canvas rotate(+90°) the preview uses): new width = h
  function rotate(mask, w, h) {
    const o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[x * h + (h - 1 - y)] = mask[y * w + x];
    return o;
  }
  // square dilation by r cells; output is (w + 2r) × (h + 2r)
  function dilate(mask, w, h, r) {
    const W = w + 2 * r, H = h + 2 * r, tmp = new Uint8Array(W * h), out = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
      for (let k = 0; k <= 2 * r; k++) tmp[y * W + x + k] = 1;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) if (tmp[y * W + x]) {
      for (let k = 0; k <= 2 * r; k++) out[(y + k) * W + x] = 1;
    }
    return { mask: out, w: W, h: H };
  }

  function makeShape(mask, w, h, r) {
    const d = dilate(mask, w, h, r);
    return { bits: toBits(mask, w, h), grow: d, r };
  }

  function collides(occ, OW, m, px, py) {
    const off = px >> 5, b = px & 31, rows = m.rows, W = m.W;
    for (let r = 0; r < m.h; r++) {
      const ob = (py + r) * OW + off, mb = r * W;
      for (let k = 0; k < W; k++) {
        const w = rows[mb + k];
        if (!w) continue;
        if (occ[ob + k] & (w << b)) return true;
        if (b && (occ[ob + k + 1] & (w >>> (32 - b)))) return true;
      }
    }
    return false;
  }
  function mark(occ, OW, gw, gh, shape, px, py) {
    const g = shape.grow, r = shape.r;
    for (let y = 0; y < g.h; y++) {
      const gy = py - r + y; if (gy < 0 || gy >= gh) continue;
      for (let x = 0; x < g.w; x++) {
        if (!g.mask[y * g.w + x]) continue;
        const gx = px - r + x; if (gx < 0 || gx >= gw) continue;
        occ[gy * OW + (gx >> 5)] |= 1 << (gx & 31);
      }
    }
  }

  /* params: { gw, gh, r, rot, designs: [{ mask: Uint8Array, w, h }], items: [designIndex…] }
     returns { sheets: [[{ d, x, y, rot }…]…] } in grid cells */
  function pack(params, onProgress) {
    const { gw, gh, r, rot } = params, OW = ((gw + 31) >> 5) + 1;
    const shapes = params.designs.map(ds => {
      const up = makeShape(ds.mask, ds.w, ds.h, r);
      const turned = rot && ds.w !== ds.h ? makeShape(rotate(ds.mask, ds.w, ds.h), ds.h, ds.w, r) : null;
      return [up, turned];
    });
    const order = params.items.slice().sort((a, b) => params.designs[b].w * params.designs[b].h - params.designs[a].w * params.designs[a].h);
    const sheets = [], occs = [];
    // first free scan position per sheet/design/orientation: occupancy only grows, so later copies never fit earlier
    const hint = new Map();
    const t0 = Date.now();
    for (let n = 0; n < order.length; n++) {
      const di = order[n];
      let placed = false;
      for (let s = 0; s <= sheets.length && !placed; s++) {
        if (s === sheets.length) { sheets.push([]); occs.push(new Int32Array(OW * gh)); }
        const occ = occs[s];
        let best = null;
        for (let o = 0; o < 2; o++) {
          const sh = shapes[di][o]; if (!sh) continue;
          const m = sh.bits, key = s + ":" + di + ":" + o;
          if (m.w > gw || m.h > gh) continue;
          const cols = gw - m.w + 1, maxY = gh - m.h, start = hint.get(key) || 0;
          let found = null, early = false;
          search:
          for (let py = Math.floor(start / cols); py <= maxY; py++) {
            if (best && py > best.y) { early = true; break; } // can't beat the other orientation
            for (let px = py === Math.floor(start / cols) ? start % cols : 0; px < cols; px++) {
              if (!collides(occ, OW, m, px, py)) { found = { x: px, y: py }; break search; }
            }
          }
          if (found) {
            hint.set(key, found.y * cols + found.x);
            if (!best || found.y < best.y || (found.y === best.y && found.x < best.x)) best = { x: found.x, y: found.y, o, sh };
          } else if (!early) hint.set(key, (maxY + 1) * cols); // no room left for this orientation
        }
        if (best) {
          mark(occ, OW, gw, gh, best.sh, best.x, best.y);
          sheets[s].push({ d: di, x: best.x, y: best.y, rot: best.o === 1 });
          placed = true;
        } else if (!sheets[s].length) {
          sheets.pop(); occs.pop(); // too big for an empty sheet (filtered out upstream)
          break;
        }
      }
      if (onProgress && (n % 4 === 3 || n === order.length - 1)) onProgress((n + 1) / order.length);
    }
    return { sheets, ms: Date.now() - t0 };
  }

  root.T9Nest = { pack };

  if (typeof WorkerGlobalScope !== "undefined" && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const { id, params } = e.data;
      try {
        const res = pack(params, p => root.postMessage({ id, progress: p }));
        root.postMessage({ id, result: res });
      } catch (err) {
        root.postMessage({ id, error: String(err && err.message || err) });
      }
    };
  }
})(self);
