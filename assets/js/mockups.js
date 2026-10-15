/* =========================================================
   TRENDLI9 PRINTS — Recolourable SVG product mockups
   viewBox 0 0 400 440. `area` = printable rectangle (front).
   ========================================================= */
(function () {
  const TEE = "M138 42 Q200 78 262 42 L334 70 L392 142 L338 180 L312 154 L312 412 Q200 424 88 412 L88 154 L62 180 L8 142 L66 70 Z";
  const M = {
    tee: {
      body: TEE,
      details: [
        { d: "M138 42 Q200 92 262 42", w: 7 },
        { d: "M66 70 L88 154", w: 1.5, o: .25 }, { d: "M334 70 L312 154", w: 1.5, o: .25 }
      ],
      area: { x: 128, y: 112, w: 144, h: 196 }
    },
    polo: {
      body: TEE,
      extra: [
        { d: "M150 40 L200 78 L250 40 L240 30 Q200 44 160 30 Z", shade: .12 },
        { d: "M200 78 L200 142", w: 2, o: .35 }
      ],
      dots: [[206, 96], [206, 122]],
      details: [{ d: "M66 70 L88 154", w: 1.5, o: .25 }, { d: "M334 70 L312 154", w: 1.5, o: .25 }],
      area: { x: 210, y: 112, w: 72, h: 72 }, areaBack: { x: 128, y: 112, w: 144, h: 196 }
    },
    hoodie: {
      body: "M132 66 Q200 98 268 66 L324 86 Q356 104 362 160 L388 384 L344 394 L320 214 L316 414 Q200 426 84 414 L80 214 L56 394 L12 384 L38 160 Q44 104 76 86 Z",
      extra: [
        { d: "M132 70 Q140 10 200 8 Q260 10 268 70 Q200 104 132 70 Z", shade: .06 },
        { d: "M156 70 Q164 30 200 28 Q236 30 244 70 Q200 92 156 70 Z", shade: .32 },
        { d: "M136 304 L264 304 L284 372 L116 372 Z", shade: .08 }
      ],
      details: [{ d: "M186 90 L182 150", w: 3, o: .5 }, { d: "M214 90 L218 150", w: 3, o: .5 }, { d: "M84 400 Q200 412 316 400", w: 2, o: .3 }],
      area: { x: 136, y: 120, w: 128, h: 170 }
    },
    sweatshirt: {
      body: "M136 50 Q200 84 264 50 L324 76 Q356 96 362 156 L388 384 L344 394 L320 214 L316 414 Q200 426 84 414 L80 214 L56 394 L12 384 L38 156 Q44 96 76 76 Z",
      details: [{ d: "M136 50 Q200 100 264 50", w: 9, o: .25 }, { d: "M84 398 Q200 410 316 398", w: 3, o: .25 }],
      area: { x: 128, y: 112, w: 144, h: 196 }
    },
    cap: {
      body: "M78 262 Q74 96 200 84 Q326 96 322 262 Z",
      extra: [
        { d: "M52 262 Q200 226 348 262 Q342 312 200 312 Q58 312 52 262 Z", shade: .16 },
        { d: "M200 84 L200 262", shade: 0, w: 1.5, o: .25 }
      ],
      dots: [[200, 86]],
      details: [{ d: "M200 84 L200 250", w: 1.5, o: .25 }, { d: "M130 98 Q150 170 140 258", w: 1.5, o: .2 }, { d: "M270 98 Q250 170 260 258", w: 1.5, o: .2 }],
      area: { x: 140, y: 136, w: 120, h: 96 }
    },
    tote: {
      body: "M78 146 L322 146 L338 424 L62 424 Z",
      details: [{ d: "M134 150 Q132 40 200 40 Q268 40 266 150", w: 14, o: .85, color: true }, { d: "M78 160 L322 160", w: 1.5, o: .2 }],
      area: { x: 110, y: 196, w: 180, h: 196 }
    },
    apron: {
      body: "M142 50 L258 50 L264 150 Q328 160 334 206 L320 432 L80 432 L66 206 Q72 160 136 150 Z",
      details: [
        { d: "M142 52 Q200 -10 258 52", w: 8, o: .9, color: true },
        { d: "M70 214 L14 236", w: 7, o: .9, color: true }, { d: "M330 214 L386 236", w: 7, o: .9, color: true },
        { d: "M110 330 L290 330 L290 394 L110 394 Z", w: 1.5, o: .3 }
      ],
      area: { x: 136, y: 168, w: 128, h: 144 }
    },
    cushion: {
      body: "M58 70 Q200 50 342 70 Q362 220 342 380 Q200 402 58 380 Q38 220 58 70 Z",
      details: [{ d: "M58 70 Q200 50 342 70", w: 3, o: .25 }],
      area: { x: 82, y: 92, w: 236, h: 264 }
    }
  };

  function isDark(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 110;
  }

  /** Returns SVG markup for a mockup. opts: {color, uid, guides, side, inner (svg string placed in print area)} */
  function svg(type, opts = {}) {
    const m = M[type] || M.tee;
    const color = /^#[0-9a-f]{6}$/i.test(opts.color || "") ? opts.color : "#F7F7F5";
    const uid = opts.uid || ("m" + Math.random().toString(36).slice(2, 7));
    const stroke = isDark(color) ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.18)";
    const area = (opts.side === "back" && m.areaBack) ? m.areaBack : m.area;
    let s = `<svg viewBox="0 0 400 440" xmlns="http://www.w3.org/2000/svg" class="mockup-svg" role="img" aria-label="${String(opts.label || "product mockup").replace(/[<>"&]/g, "")}">`;
    s += `<defs>
      <linearGradient id="${uid}-sh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
      <linearGradient id="${uid}-hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="${uid}-clip"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}"/></clipPath>
      <filter id="${uid}-ds" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-opacity=".18"/></filter>
    </defs>`;
    s += `<g filter="url(#${uid}-ds)"><path d="${m.body}" fill="${color}" stroke="${stroke}" stroke-width="1.5"/></g>`;
    (m.extra || []).forEach(e => {
      s += `<path d="${e.d}" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
      if (e.shade) s += `<path d="${e.d}" fill="#000" fill-opacity="${e.shade}"/>`;
    });
    s += `<path d="${m.body}" fill="url(#${uid}-sh)" pointer-events="none"/><path d="${m.body}" fill="url(#${uid}-hl)" pointer-events="none"/>`;
    (m.details || []).forEach(d => {
      s += `<path d="${d.d}" fill="none" stroke="${d.color ? color : (isDark(color) ? "#fff" : "#000")}" stroke-opacity="${d.o ?? .3}" stroke-width="${d.w}" stroke-linecap="round" ${d.color ? `style="filter:brightness(.85)"` : ""}/>`;
    });
    (m.dots || []).forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="4" fill="${isDark(color) ? "#ddd" : "#555"}" fill-opacity=".6"/>`; });
    s += `<g class="print-layer" clip-path="url(#${uid}-clip)">${opts.inner || ""}</g>`;
    if (opts.guides) s += `<rect class="print-guide" x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="${isDark(color) ? "#7FDBFF" : "#0A84FF"}" stroke-width="1.5" stroke-dasharray="6 5" rx="4" pointer-events="none"/>`;
    s += `</svg>`;
    return s;
  }

  /** Sample print (brand splash) fitted into the print area — used for catalogue previews */
  function sampleArt(type, src = "assets/img/logo-mark.webp", ar = 365 / 520) {
    const a = (M[type] || M.tee).area, w = Math.min(a.w * .78, a.h * .78 / ar), h = w * ar;
    return `<image href="${src}" x="${a.x + (a.w - w) / 2}" y="${a.y + Math.min(a.h * .12, (a.h - h) / 2)}" width="${w}" height="${h}"/>`;
  }

  window.T9_MOCKUPS = { sampleArt, svg, types: M, isDark, areaFor: (t, side) => (side === "back" && M[t].areaBack) ? M[t].areaBack : M[t].area };
})();
