/* =========================================================
   TRENDLI9 — Live 3D heat press (three.js, no video, no models)
   Built per the "Build 3D websites that run live" guide:
   01 one object + one verb (DTF heat press · HOLD TO PRESS)
   02 one fixed canvas behind the story
   03 every part built from code (extruded shapes, real-world scale, bevels)
   04 MeshPhysicalMaterial — satin faces, polished edges, brushed anisotropy
   05 PMREM studio lighting rotated by the cursor
   06 scroll cue list directs the camera (frame by size)
   07 staggered exploded view + two-column callouts + blueprint mode
   08 one clock, Web Audio synthesized sound, hold-to interaction
   09 bloom, ACES, grain, adaptive quality
   ========================================================= */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const root = document.getElementById("xp");
const canvas = root?.querySelector(".xp__canvas");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SNAP = REDUCED || /[?&]xpsnap/.test(location.search);   // debug: poses snap instantly (headless renders ~1 fps)

function fallback(reason) {
  root?.classList.add("xp--static");
  console.info("[press3d] static fallback:", reason);
}

/* ---------------- helpers ---------------- */
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const mix = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => mix(a, b, 1 - Math.exp(-k * dt));

function roundedRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Extruded slab lying flat: w (x) × d (z) × h (y), bottom at y=0. groups: 0 = faces, 1 = edges/bevel */
function slab(w, d, h, r = 8, bevel = 1.6) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, d - bevel * 2, Math.max(1, r - bevel)), {
    depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10
  });
  g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
  return g;
}

/* brushed-metal direction textures generated at boot (guide step 04) */
function brushedTexture(kind = "striped", size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d"), img = x.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let dx = 1, dy = 0;
    if (kind === "circular") { const u = i - size / 2, v = j - size / 2, l = Math.hypot(u, v) || 1; dx = -v / l; dy = u / l; }
    const n = .55 + .45 * Math.sin(j * 1.7 + Math.sin(i * .05) * 3) * Math.random();
    const k = (j * size + i) * 4;
    img.data[k] = (dx * .5 + .5) * 255; img.data[k + 1] = (dy * .5 + .5) * 255; img.data[k + 2] = n * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* ---------------- boot ---------------- */
/* fabric picker (beat 03): typical DTF press recipe per fabric; the 3D scene re-dresses the garment */
const FABRICS = {
  cotton:    { color: "#121214", rough: .95, sheen: 1,  temp: 160, secs: 15, pr: "medium pressure" },
  polyester: { color: "#1f47b8", rough: .55, sheen: .6, temp: 135, secs: 10, pr: "medium pressure" },
  blends:    { color: "#8b8e95", rough: .9,  sheen: 1,  temp: 150, secs: 12, pr: "medium pressure" },
  silk:      { color: "#9c0f5a", rough: .3,  sheen: 1,  temp: 130, secs: 8,  pr: "light pressure, cover sheet" },
  denim:     { color: "#2b3d63", rough: .95, sheen: .5, temp: 165, secs: 15, pr: "firm pressure" },
  fleece:    { color: "#c98d1c", rough: 1,   sheen: 1,  temp: 155, secs: 12, pr: "medium pressure" },
  nylon:     { color: "#3f4b30", rough: .4,  sheen: .4, temp: 130, secs: 8,  pr: "light pressure, cover sheet" },
  canvas:    { color: "#d9ceb2", rough: .95, sheen: .3, temp: 165, secs: 15, pr: "firm pressure" },
  leather:   { color: "#5a3220", rough: .45, sheen: .2, temp: 130, secs: 10, pr: "light pressure, cover sheet" },
};
let fab = FABRICS.cotton, onFabric = null;
const recipe = f => `${f.temp} °C · ${f.secs} s · ${f.pr}`;
root?.querySelectorAll("[data-fabric]").forEach(b => b.addEventListener("click", () => {
  const f = FABRICS[b.dataset.fabric]; if (!f || f === fab) return;
  fab = f;
  root.querySelectorAll("[data-fabric]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  const note = root.querySelector(".xp-fabric"); if (note) note.innerHTML = `<b>${b.textContent}</b> · ${recipe(f)}`;
  onFabric?.();
}));

if (root && canvas) boot().catch(e => { console.warn(e); fallback("init error"); });

async function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch { return fallback("no webgl"); }
  if (!renderer.getContext()) return fallback("no context");

  const isPhone = matchMedia("(max-width: 760px)").matches;
  let DPR = Math.min(devicePixelRatio || 1, isPhone ? 1.75 : 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x0b0b12, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);

  /* ---------- studio environment (guide step 05) ---------- */
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.BoxGeometry(200, 120, 200), new THREE.MeshBasicMaterial({ color: 0x07070b, side: THREE.BackSide })));
  const panel = (w, h, intensity, pos, hex = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); studio.add(m); return m;
  };
  panel(22, 14, 3.2, [-22, 20, 20]);              // key softbox, off-axis
  panel(2.4, 34, 7, [30, 4, 12]);                 // strip · edge line
  panel(2.4, 34, 5, [-30, 4, -14]);               // strip · edge line
  panel(30, 4, 1.2, [0, 40, 0]);                  // overhead fill
  panel(10, 10, 1.1, [-18, -6, 30], 0x00a8f0);    // brand cyan kicker
  panel(10, 10, 1.0, [20, -6, 28], 0xe5007e);     // brand magenta kicker
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.035).texture;
  scene.background = (() => {   // studio sweep: lifted centre, ink edges
    const c = document.createElement("canvas"); c.width = 16; c.height = 512; const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#07070c"); g.addColorStop(.45, "#1b1d29"); g.addColorStop(.75, "#141520"); g.addColorStop(1, "#08080d");
    x.fillStyle = g; x.fillRect(0, 0, 16, 512); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // a soft key for the non-metal parts (fabric, silicone)
  scene.environmentIntensity = 1.5;
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-300, 900, 600); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 1.6); rim.position.set(500, 400, -700); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe6f2, .8); fill.position.set(600, 200, 500); scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x2a1020, .6));

  /* ---------- materials (guide step 04) ---------- */
  const brushed = brushedTexture("striped"), brushedC = brushedTexture("circular");
  const satinAlu = new THREE.MeshPhysicalMaterial({ color: "#b9bcc2", metalness: 1, roughness: .32, anisotropy: .8, anisotropyMap: brushed });
  const polished = new THREE.MeshPhysicalMaterial({ color: "#e9ebef", metalness: 1, roughness: .06 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: "#6c707c", metalness: 1, roughness: .34, anisotropy: .7, anisotropyMap: brushed });   // gunmetal
  const graphiteEdge = new THREE.MeshPhysicalMaterial({ color: "#a9adb8", metalness: 1, roughness: .08 });
  const inkCoat = new THREE.MeshPhysicalMaterial({ color: "#eceef3", metalness: 0, roughness: .32, clearcoat: 1, clearcoatRoughness: .06, iridescence: .2, iridescenceIOR: 1.5 });   // white lacquer
  const silicone = new THREE.MeshPhysicalMaterial({ color: "#8a8f99", metalness: 0, roughness: .85 });
  const rubber = new THREE.MeshPhysicalMaterial({ color: "#121216", metalness: 0, roughness: .7, sheen: .4, sheenColor: new THREE.Color("#333") });
  const fabric = new THREE.MeshPhysicalMaterial({ color: "#121214", metalness: 0, roughness: .95, sheen: 1, sheenRoughness: .6, sheenColor: new THREE.Color("#4a4a55") });
  const heater = new THREE.MeshPhysicalMaterial({ color: "#3b2a22", metalness: 1, roughness: .35, emissive: new THREE.Color("#ff5a00"), emissiveIntensity: 0 });
  const stripeMats = ["#00A8F0", "#7B2FF7", "#E5007E", "#FF6B00", "#FFC400"].map(c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: true }));
  const glass = new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: .05, transparent: true, opacity: .16, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false });

  const loader = new THREE.TextureLoader();
  const loadTex = url => new Promise(res => loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null)));
  const [logoTex] = await Promise.all([loadTex("assets/img/logo-mark.webp")]);

  /* ---------- geometry: every part built from code (guide step 03) ---------- */
  const press = new THREE.Group(); scene.add(press);
  { // soft contact shadow grounds the machine
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"), g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,.75)"); g.addColorStop(.55, "rgba(0,0,0,.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -14; press.add(sh);
  }
  const parts = [];      // explode participants
  const labelled = [];   // callouts
  const meshes = [];     // for blueprint mode
  const reg = (obj, { lift = [0, 0, 0], order = .5, label, sub, anchor = [0, 0, 0] } = {}) => {
    parts.push({ obj, base: obj.position.clone(), lift: new THREE.Vector3(...lift), order });
    if (label) labelled.push({ obj, label, sub, anchor: new THREE.Vector3(...anchor) });
    obj.traverse(o => { if (o.isMesh) meshes.push(o); });
    return obj;
  };
  const mesh = (geo, mat, pos = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); return m; };

  // base & feet
  const base = mesh(slab(470, 540, 52, 26, 2.4), [graphite, graphiteEdge]);
  [[-200, -235], [200, -235], [-200, 235], [200, 235]].forEach(([x, z]) => base.add(mesh(new THREE.CylinderGeometry(16, 18, 14, 24), rubber, [x, -7, z])));
  press.add(reg(base, { lift: [0, -60, 0], order: .08, label: "Steel base", sub: "Powder-coated, anti-slip feet", anchor: [-180, 52, 120] }));
  const stripe = new THREE.Group();
  stripeMats.forEach((m, i) => stripe.add(mesh(new THREE.BoxGeometry(70, 4, 1.5), m, [-140 + i * 70, 30, 270.6])));
  base.add(stripe);

  // pedestal + lower platen + silicone pad
  const pedestal = mesh(new THREE.CylinderGeometry(42, 52, 70, 40), [satinAlu, polished, polished], [0, 52 + 35, 0]);
  press.add(reg(pedestal, { lift: [0, -20, 0], order: .2 }));
  const lower = mesh(slab(380, 380, 24, 10, 1.6), [satinAlu, polished], [0, 122, 0]);
  press.add(reg(lower, { lift: [0, 40, 0], order: .35, label: "Lower platen", sub: "15 × 15 in, threadable", anchor: [190, 12, 120] }));
  const pad = mesh(slab(380, 380, 8, 10, 1), silicone, [0, 146, 0]);
  press.add(reg(pad, { lift: [0, 85, 0], order: .45, label: "Silicone pad", sub: "Even pressure, edge to edge", anchor: [-190, 4, -60] }));

  // garment: tee outline extruded, with draped sleeves and hem
  const tee = new THREE.Shape();
  const P = [[-200, -250], [200, -250], [200, 120], [300, 80], [345, 170], [215, 255], [75, 262]];
  tee.moveTo(...P[0]); P.slice(1).forEach(p => tee.lineTo(...p));
  tee.quadraticCurveTo(0, 190, -75, 262); [[-215, 255], [-345, 170], [-300, 80], [-200, 120]].forEach(p => tee.lineTo(...p)); tee.closePath();
  const teeGeo = new THREE.ExtrudeGeometry(tee, { depth: 4, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2, curveSegments: 16 });
  teeGeo.rotateX(-Math.PI / 2); teeGeo.scale(.78, 1, .78);
  { // drape over the platen edges
    const p = teeGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), ox = Math.max(0, Math.abs(x) - 192), oz = Math.max(0, z - 192);
      p.setY(i, p.getY(i) - ox * .9 - oz * .9);
    }
    teeGeo.computeVertexNormals();
  }
  const shirt = mesh(teeGeo, fabric, [0, 154, 0]);
  // printed design with an ink-spread reveal (shader patch keeps physical lighting)
  const reveal = { value: 0 };
  const printMat = new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: .7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  printMat.onBeforeCompile = sh => {
    sh.uniforms.uReveal = reveal;
    sh.fragmentShader = "uniform float uReveal;\n" + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      { vec2 q = vMapUv - .5; float n = fract(sin(dot(floor(vMapUv * 64.), vec2(12.9898, 78.233))) * 43758.5453);
        float edge = length(q) * 1.5 + n * .18; if (edge > uReveal * 1.25) discard; }`);
  };
  const print = mesh(new THREE.PlaneGeometry(214, 150), printMat, [0, 6.6, -40]); print.rotation.x = -Math.PI / 2;
  shirt.add(print);
  press.add(reg(shirt, { lift: [0, 140, 0], order: .55, label: "Your garment", sub: "Cotton, poly, blends, silk, denim", anchor: [150, 6, 110] }));

  // DTF transfer film — pivots off the back edge when peeled
  const filmPivot = new THREE.Group(); filmPivot.position.set(0, 162, -175);
  const film = new THREE.Group(); film.position.set(0, 0, 175); filmPivot.add(film);
  film.add(mesh(new THREE.BoxGeometry(330, .6, 350), glass));
  const filmInkMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false });
  const filmInk = mesh(new THREE.PlaneGeometry(214, 150), filmInkMat, [0, .5, -40]); filmInk.rotation.x = -Math.PI / 2; film.add(filmInk);
  press.add(reg(filmPivot, { lift: [0, 210, 0], order: .7, label: "DTF transfer film", sub: "75 µm PET · white underbase", anchor: [-165, 0, 175] }));

  // rear column + hinge
  const column = mesh(slab(120, 90, 250, 14, 1.6), [graphite, graphiteEdge], [0, 50, -262]);
  press.add(reg(column, { lift: [0, 0, -90], order: .15, label: "Hinge column", sub: "Over-centre clamp geometry", anchor: [60, 140, 0] }));
  const pin = mesh(new THREE.CylinderGeometry(14, 14, 170, 32), polished, [0, 300, -262]); pin.rotation.z = Math.PI / 2;
  press.add(reg(pin, { lift: [0, 0, -90], order: .15 }));

  // lid (clamshell): pivots at the hinge
  const lid = new THREE.Group(); lid.position.set(0, 300, -262); press.add(lid);
  const LZ = 262;  // platen centre in lid space
  const plate = mesh(slab(380, 380, 30, 10, 2), [satinAlu, polished], [0, -138, LZ]);
  const heatFace = mesh(slab(372, 372, 2, 8, .6), heater, [0, -139.5, LZ]);
  const housing = mesh(slab(406, 406, 58, 30, 3), [inkCoat, graphiteEdge], [0, -104, LZ]);
  const bracket = mesh(slab(130, 150, 70, 12, 2), [graphite, graphiteEdge], [0, -40, 70]);
  const handleGrp = new THREE.Group(); handleGrp.position.set(0, -46, LZ + 175);
  [-118, 118].forEach(x => handleGrp.add(mesh(new THREE.CylinderGeometry(9, 11, 64, 24), polished, [x, 32, 0])));
  const grip = mesh(new THREE.CylinderGeometry(17, 17, 220, 40), rubber, [0, 68, 0]); grip.rotation.z = Math.PI / 2; handleGrp.add(grip);
  [-122, 122].forEach(x => { const cap = mesh(new THREE.SphereGeometry(18, 32, 16), polished, [x, 68, 0]); handleGrp.add(cap); });
  const lidStripe = new THREE.Group();
  stripeMats.forEach((m, i) => lidStripe.add(mesh(new THREE.BoxGeometry(60, 3, 1.5), m, [-120 + i * 60, -80, LZ + 204])));
  lid.add(reg(plate, { lift: [0, -40, 0], order: .8, label: "Heat platen", sub: "Cast aluminium · up to 230 °C", anchor: [190, 15, -120] }));
  lid.add(reg(heatFace, { lift: [0, -40, 0], order: .8 }));
  lid.add(reg(housing, { lift: [0, 70, 0], order: .9, label: "Insulated housing", sub: "Lacquered steel, cool-touch", anchor: [-200, 58, 40] }));
  lid.add(reg(lidStripe, { lift: [0, 70, 0], order: .9 }));
  lid.add(reg(bracket, { lift: [0, 40, -40], order: .85 }));
  lid.add(reg(handleGrp, { lift: [0, 180, 60], order: 1, label: "Clamp handle", sub: "Hold to press — try it", anchor: [120, 68, 0] }));

  // control unit with live display + polished dial
  // mounted on the right of the hinge column, facing the operator
  const ctrl = new THREE.Group(); ctrl.position.set(128, 168, -262);
  ctrl.add(mesh(slab(132, 40, 76, 8, 1.4), [graphite, graphiteEdge], [0, -38, 0]));
  const dispCanvas = document.createElement("canvas"); dispCanvas.width = 256; dispCanvas.height = 96;
  const dispTex = new THREE.CanvasTexture(dispCanvas); dispTex.colorSpace = THREE.SRGBColorSpace;
  const disp = mesh(new THREE.PlaneGeometry(76, 30), new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }), [-18, 10, 20.6]); ctrl.add(disp);
  const dial = mesh(new THREE.LatheGeometry([[0, 0], [18, 0], [19, 2], [19, 14], [17, 17], [0, 18]].map(([x, y]) => new THREE.Vector2(x, y)), 48),
    new THREE.MeshPhysicalMaterial({ color: "#d9dce2", metalness: 1, roughness: .28, anisotropy: 1, anisotropyMap: brushedC }), [40, -16, 20]);
  dial.rotation.x = Math.PI / 2; ctrl.add(dial);
  press.add(reg(ctrl, { lift: [150, 40, 60], order: .3, label: "Control unit", sub: "Digital temp & timer", anchor: [0, 10, 20] }));

  let lastDisp = "";
  function drawDisplay(temp, secs, phase) {
    const txt = `${Math.round(temp)}|${secs}|${phase}`; if (txt === lastDisp) return; lastDisp = txt;
    const c = dispCanvas.getContext("2d");
    c.fillStyle = "#050608"; c.fillRect(0, 0, 256, 96);
    c.fillStyle = phase === "done" ? "#25D366" : temp > 150 ? "#FF6B00" : "#00A8F0";
    c.font = "700 54px 'Unbounded', monospace"; c.textBaseline = "middle"; c.fillText(`${Math.round(temp)}°`, 12, 50);
    c.font = "700 22px 'Nunito Sans', sans-serif"; c.fillStyle = "#B7BACB";
    c.fillText(phase === "done" ? "DONE" : `${secs}s`, 190, 36); c.fillText("C", 190, 66);
    dispTex.needsUpdate = true;
  }
  drawDisplay(160, 15, "ready");

  // steam: sprite particles rising from the platen seam
  const steamTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const STEAM = 90, steamGeo = new THREE.BufferGeometry(), steamPos = new Float32Array(STEAM * 3), steamLife = new Float32Array(STEAM);
  for (let i = 0; i < STEAM; i++) steamLife[i] = Math.random();
  steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
  const steamMat = new THREE.PointsMaterial({ map: steamTex, size: 150, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const steam = new THREE.Points(steamGeo, steamMat); press.add(steam);

  // blueprint mode: edges of every mesh (guide step 07)
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x38c8ff, transparent: true, opacity: .85 });
  const edges = [];
  meshes.forEach(m => { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), edgeMat); e.visible = false; m.add(e); edges.push(e); });
  let blueprint = false;
  const bpMat = new THREE.MeshBasicMaterial({ color: 0x0b1420, transparent: true, opacity: .55 });
  const origMats = new Map(meshes.map(m => [m, m.material]));
  function setBlueprint(on) {
    blueprint = on;
    meshes.forEach(m => { m.material = on ? bpMat : origMats.get(m); });
    edges.forEach(e => e.visible = on);
    steam.visible = !on;
    root.classList.toggle("is-blueprint", on);
  }

  /* ---------- post: MSAA → bloom → output (ACES) → grain (guide step 09) ---------- */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .26, .4, 1.05);   // high threshold: glints only
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: .045 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uAmount; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float g = h(vUv * 1000.) - .5;
        float v = smoothstep(1.15, .35, length(vUv - .5) * 1.35);
        gl_FragColor = vec4(c.rgb * mix(.82, 1., v) + g * uAmount, 1.); }`
  });
  composer.addPass(grain);

  /* ---------- scroll cue list (guide step 06) ---------- */
  // frame = millimetres that must fit on screen; az/el in degrees; ox = horizontal screen offset (fraction of frame)
  const CUES = [
    { id: "hero", at: 0, shot: { frame: 1180, az: -32, el: 20, ox: .2, oy: 0, tx: [0, 260, 0], explode: 0, timeScale: 1 } },
    { id: "close", at: .25, shot: { frame: 600, az: 16, el: 34, ox: -.28, oy: 0, tx: [0, 165, 40], explode: 0, timeScale: 1 / 6 } },
    { id: "apart", at: .5, shot: { frame: 1650, az: -36, el: 14, ox: 0, oy: -.06, tx: [0, 420, 0], explode: 1, timeScale: 1 } },
    { id: "around", at: .75, shot: { frame: 1250, az: 132, el: 16, ox: .2, oy: 0, tx: [0, 300, 0], explode: .35, timeScale: 1 } },
    { id: "back", at: 1, shot: { frame: 1180, az: 24, el: 22, ox: -.2, oy: 0, tx: [0, 260, 0], explode: 0, timeScale: 1 } }
  ];
  const KEYS = ["frame", "az", "el", "ox", "oy", "explode", "timeScale"];
  function shotAt(p) {
    let i = 0; while (i < CUES.length - 2 && p > CUES[i + 1].at) i++;
    const a = CUES[i], b = CUES[i + 1], t = ease((p - a.at) / (b.at - a.at));
    const s = {}; KEYS.forEach(k => s[k] = mix(a.shot[k], b.shot[k], t));
    s.tx = a.shot.tx.map((v, j) => mix(v, b.shot.tx[j], t));
    return s;
  }
  const cur = { ...shotAt(0) };

  /* ---------- state + interaction (guide step 08) ---------- */
  const S = { scroll: 0, holding: false, pressT: 0, heat: 0, done: false, peel: 0, temp: 158, mx: 0, my: 0, ex: 0, ey: 0, time: 0, visible: true };
  const holdBtn = root.querySelector("[data-hold]"), ring = root.querySelector(".xp-hold__ring circle.fg"), holdLabel = root.querySelector(".xp-hold__label");
  const status = root.querySelector(".xp__status");
  const HEAT_SECS = 2.6;

  // Web Audio — synthesized, zero audio files; unlocked by the hold gesture
  let ac = null, hiss = null, soundOn = true;
  function audio() {
    if (!soundOn) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { soundOn = false; return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function noiseBuffer(a, secs = 1) { const b = a.createBuffer(1, a.sampleRate * secs, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function clunk() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + .18);
    g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .25); o.connect(g).connect(a.destination); o.start(t); o.stop(t + .3);
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain(); n.buffer = noiseBuffer(a, .1); f.type = "bandpass"; f.frequency.value = 2400;
    ng.gain.setValueAtTime(.25, t); ng.gain.exponentialRampToValueAtTime(.001, t + .08); n.connect(f).connect(ng).connect(a.destination); n.start(t);
  }
  function startHiss() {
    const a = audio(); if (!a || hiss) return;
    const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    n.buffer = noiseBuffer(a, 2); n.loop = true; f.type = "highpass"; f.frequency.value = 3200; g.gain.value = 0;
    g.gain.linearRampToValueAtTime(.12, a.currentTime + .5); n.connect(f).connect(g).connect(a.destination); n.start(); hiss = { n, g };
  }
  function stopHiss() { if (!hiss || !ac) return; const { n, g } = hiss; g.gain.cancelScheduledValues(ac.currentTime); g.gain.setTargetAtTime(0, ac.currentTime, .12); n.stop(ac.currentTime + .6); hiss = null; }
  function ding() {
    const a = audio(); if (!a) return; const t = a.currentTime;
    [[880, .22], [1318.5, .14], [1760, .07]].forEach(([fq, v]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = fq; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.4); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 1.5); });
  }
  function tick() { const a = audio(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = "square"; o.frequency.value = 2100; g.gain.setValueAtTime(.03, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03); o.connect(g).connect(a.destination); o.start(t); o.stop(t + .04); }

  const setStatus = t => { if (status) status.textContent = t; };
  const fabColor = new THREE.Color(fab.color);
  onFabric = () => {   // new fabric on the platen: fresh garment, new recipe
    fabColor.set(fab.color);
    if (S.holding) return;
    S.done = false; S.heat = 0; S.peel = 0; reveal.value = 0; filmInkMat.opacity = 1; stopHiss();
    holdLabel.textContent = "Hold to press"; setStatus(`Ready · ${recipe(fab)}`);
  };
  function beginHold(e) {
    e?.preventDefault?.();
    if (S.done) { // reset for another go
      S.done = false; S.peel = 0; reveal.value = 0; filmInkMat.opacity = 1; holdLabel.textContent = "Hold to press"; setStatus(`Ready · ${recipe(fab)}`); return;
    }
    S.holding = true; holdBtn.classList.add("is-holding"); audio();
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function endHold() {
    if (!S.holding) return;
    S.holding = false; holdBtn.classList.remove("is-holding");
    if (!S.done && S.heat < 1) { setStatus("Released early — hold until the ring completes"); }
  }
  if (holdBtn) {
    holdBtn.addEventListener("pointerdown", beginHold);
    addEventListener("pointerup", endHold); addEventListener("pointercancel", endHold);
    holdBtn.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) beginHold(e); });
    holdBtn.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") endHold(); });
    holdBtn.addEventListener("contextmenu", e => e.preventDefault());
  }
  root.querySelector("[data-blueprint]")?.addEventListener("click", e => { setBlueprint(!blueprint); e.currentTarget.setAttribute("aria-pressed", blueprint); });
  root.querySelector("[data-sound]")?.addEventListener("click", e => { soundOn = !soundOn; if (!soundOn) stopHiss(); e.currentTarget.setAttribute("aria-pressed", soundOn); });
  addEventListener("pointermove", e => { S.mx = e.clientX / innerWidth * 2 - 1; S.my = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  // phone tilt (after the gesture) nudges the studio like the cursor does
  addEventListener("deviceorientation", e => { if (e.gamma == null) return; S.mx = Math.max(-1, Math.min(1, e.gamma / 30)); S.my = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); }, { passive: true });

  /* ---------- labels (two clean columns + leader lines) ---------- */
  const labelLayer = root.querySelector(".xp__labels"), svgLines = root.querySelector(".xp__lines");
  const labelEls = labelled.map(l => {
    const el = document.createElement("div"); el.className = "xp-label"; el.innerHTML = `<b>${l.label}</b><span>${l.sub}</span>`; labelLayer.appendChild(el);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path"); svgLines.appendChild(line);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle"); dot.setAttribute("r", 3.5); svgLines.appendChild(dot);
    return { ...l, el, line, dot };
  });
  const v3 = new THREE.Vector3();
  function layoutLabels(alpha, w, h) {
    labelLayer.style.opacity = alpha; if (alpha < .02) return;
    const pts = labelEls.map(l => { l.obj.localToWorld(v3.copy(l.anchor)); v3.project(camera); return { l, x: (v3.x * .5 + .5) * w, y: (-v3.y * .5 + .5) * h }; });
    const cx = w / 2, colW = Math.min(250, w * .22), gap = Math.max(54, h * .085);
    ["L", "R"].forEach(side => {
      const col = pts.filter(p => side === "L" ? p.x < cx : p.x >= cx).sort((a, b) => a.y - b.y);
      const top = h / 2 - (col.length - 1) * gap / 2;
      col.forEach((p, i) => {
        const lx = side === "L" ? Math.max(16, w * .06) : w - Math.max(16, w * .06) - colW, ly = top + i * gap;
        p.l.el.style.transform = `translate(${lx}px, ${ly - 18}px)`; p.l.el.style.width = colW + "px"; p.l.el.style.textAlign = side === "L" ? "right" : "left";
        const ex = side === "L" ? lx + colW + 8 : lx - 8;
        p.l.line.setAttribute("d", `M${ex},${ly} L${(ex + p.x) / 2},${ly} L${p.x},${p.y}`);
        p.l.dot.setAttribute("cx", p.x); p.l.dot.setAttribute("cy", p.y);
      });
    });
  }

  /* ---------- scroll-driven text reveals (guide lesson 04: no observers) ---------- */
  const beats = [...root.querySelectorAll(".xp-beat")];
  function updateBeats(vh) {
    beats.forEach((b, idx) => {
      const r = b.getBoundingClientRect(), c = (r.top + r.height / 2 - vh / 2) / vh; // 0 = centred
      let v = clamp01(1 - Math.abs(c) * 1.6);
      if (idx === 0 && c > -.5) v = 1;            // hero copy is fully visible on arrival
      b.style.setProperty("--v", v.toFixed(3));
      b.classList.toggle("is-on", v > .35);
    });
  }

  /* ---------- sizing ---------- */
  let W = 0, H = 0;
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight; if (!W || !H) return;
    renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
    composer.setPixelRatio(DPR); composer.setSize(W, H);
    bloom.resolution.set(W * DPR, H * DPR);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    svgLines.setAttribute("viewBox", `0 0 ${W} ${H}`);
  }
  new ResizeObserver(resize).observe(canvas); resize();

  function scrollProgress() {
    const r = root.getBoundingClientRect(), total = r.height - innerHeight;
    return total > 0 ? clamp01(-r.top / total) : 0;
  }
  new IntersectionObserver(([en]) => { S.visible = en.isIntersecting; if (S.visible) loop.start(); }, { rootMargin: "100px" }).observe(root);

  /* ---------- pose: one clock drives everything ---------- */
  const right = new THREE.Vector3(), up = new THREE.Vector3(), tgt = new THREE.Vector3();
  let beatSecs = -1;
  function pose(dt) {
    const s = shotAt(S.scroll);
    const k = SNAP ? 1e3 : 3.2;
    KEYS.forEach(key => cur[key] = damp(cur[key], s[key], k, dt));
    cur.tx = cur.tx.map((v, i) => damp(v, s.tx[i], k, dt));
    S.time += dt * cur.timeScale;

    // press physics: lid closes while holding, heat accumulates once clamped
    const closeTarget = S.holding && !S.done ? 1 : 0;
    S.pressT = damp(S.pressT, closeTarget, S.holding ? 7 : 4, dt);
    if (S.pressT > .97 && S.holding && !S.done) {
      if (S.heat === 0) { clunk(); startHiss(); setStatus("Pressing…"); }
      S.heat = Math.min(1, S.heat + dt / HEAT_SECS);
      const secsLeft = Math.ceil(fab.secs * (1 - S.heat)); if (secsLeft !== beatSecs) { beatSecs = secsLeft; tick(); }
      reveal.value = Math.max(reveal.value, S.heat * .2);
      if (S.heat >= 1) { S.done = true; S.holding = false; holdBtn?.classList.remove("is-holding"); stopHiss(); ding(); setStatus("Done! Peeling the film…"); holdLabel.textContent = "Press again"; }
    } else if (!S.holding && !S.done && S.heat > 0) { S.heat = Math.max(0, S.heat - dt * .8); if (S.heat === 0) { stopHiss(); beatSecs = -1; } }
    if (!S.holding) stopHiss();
    if (S.done) { S.peel = Math.min(1, S.peel + dt * .55); reveal.value = Math.min(1, .2 + easeOut(S.peel) * .8); filmInkMat.opacity = 1 - easeOut(S.peel); if (S.peel >= 1) setStatus("Flawless. That's the Trendli9 finish."); }
    S.temp = damp(S.temp, S.holding && S.pressT > .9 ? fab.temp + 2 : fab.temp - 2 + Math.sin(S.time * .7) * 1.5, 2, dt);
    drawDisplay(S.temp, S.done ? 0 : Math.ceil(fab.secs * (1 - S.heat)), S.done ? "done" : S.heat > 0 ? "press" : "ready");
    fabric.color.lerp(fabColor, 1 - Math.exp(-6 * dt)); fabric.roughness = damp(fabric.roughness, fab.rough, 6, dt); fabric.sheen = damp(fabric.sheen, fab.sheen, 6, dt);
    if (ring) ring.style.strokeDashoffset = String(1 - (S.done ? 1 : S.heat));

    // lid angle: open → closed by press; explode shot holds it nearly closed
    const open = -.95;
    lid.rotation.x = mix(mix(open, -0.004, easeOut(S.pressT)), -.12, cur.explode);
    filmPivot.rotation.x = -1.95 * easeOut(S.peel);
    const glow = S.done ? Math.max(0, 1 - S.peel * 1.4) : S.heat;   // cools after the press
    heater.emissiveIntensity = (glow > 0 ? .4 + glow * 1.4 : 0) * (1 + Math.sin(S.time * 9) * .08);

    // staggered explode: top parts leave first, come back last (guide step 07)
    const e = cur.explode;
    for (const p of parts) {
      const delay = (1 - p.order) * .42, t = ease((e - delay) / .58);
      p.obj.position.copy(p.base).addScaledVector(p.lift, t);
    }

    // steam
    const steamOn = (S.heat > 0 || (S.done && S.peel < .6)) && !blueprint;
    steamMat.opacity = damp(steamMat.opacity, steamOn ? .14 : 0, 3, dt);
    if (steamMat.opacity > .005) {
      for (let i = 0; i < STEAM; i++) {
        steamLife[i] += dt * (.35 + (i % 7) * .04) * Math.max(cur.timeScale, .25);
        if (steamLife[i] > 1) steamLife[i] = 0;
        const a = i * 2.399, edge = 190, L = steamLife[i];
        const sx = Math.cos(a) > 0 ? edge : -edge, sz = Math.sin(a * 1.3) * edge;
        const side = i % 2 ? [sx, sz] : [Math.sin(a) * edge, Math.sign(Math.cos(a * 1.7)) * edge];
        steamPos[i * 3] = side[0] + Math.sin(S.time * 2 + i) * 12 * L;
        steamPos[i * 3 + 1] = 160 + L * 260;
        steamPos[i * 3 + 2] = side[1] + Math.cos(S.time * 1.6 + i) * 12 * L;
      }
      steamGeo.attributes.position.needsUpdate = true;
    }

    // camera: frame by size so the same cue works on a phone and a monitor
    const portrait = camera.aspect < .9;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitH = cur.frame / (2 * Math.tan(vFov / 2)), fitW = fitH / camera.aspect;
    const dist = Math.max(fitH, fitW) * (portrait ? .74 : 1);   // phones: let the object fill the width
    const az = THREE.MathUtils.degToRad(cur.az + S.ex * 6), el = THREE.MathUtils.degToRad(cur.el - S.ey * 4);
    tgt.set(...cur.tx);
    camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(tgt);
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const visW = 2 * dist * Math.tan(vFov / 2) * camera.aspect, visH = 2 * dist * Math.tan(vFov / 2);
    const ox = portrait ? 0 : cur.ox, oy = portrait ? .17 : cur.oy;  // +ox → object moves right, +oy → up
    camera.position.addScaledVector(right, -ox * visW).addScaledVector(up, -oy * visH);
    camera.lookAt(tgt.clone().addScaledVector(right, -ox * visW).addScaledVector(up, -oy * visH));

    // cursor rotates the studio (environment), eased
    S.ex = damp(S.ex, S.mx, 2.5, dt); S.ey = damp(S.ey, S.my, 2.5, dt);
    scene.environmentRotation.set(S.ey * .45, -S.ex * .8, 0);
    press.rotation.y = Math.sin(S.time * .25) * .03;
    grain.uniforms.uTime.value = S.time % 100;
  }

  /* ---------- adaptive quality loop ---------- */
  let fpsT = 0, fpsN = 0, bloomOn = true;
  function adapt(dt) {
    fpsT += dt; fpsN++;
    if (fpsT < 2) return;
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (fps < 40) {
      if (DPR > 1) { DPR = Math.max(1, DPR - .25); resize(); }
      else if (bloomOn) { bloomOn = false; bloom.enabled = false; }
    }
  }

  const clock = new THREE.Timer();
  const loop = {
    running: false,
    start() { if (this.running) return; this.running = true; clock.update(); requestAnimationFrame(frame); }
  };
  function frame(ts) {
    if (!S.visible || document.hidden) { loop.running = false; return; }
    clock.update(ts);
    const dt = Math.min(clock.getDelta(), SNAP ? .5 : 1 / 20);
    S.scroll = scrollProgress();
    pose(dt);
    composer.render(dt);
    layoutLabels(clamp01((cur.explode - .55) / .35) * (blueprint ? 1 : 1), W, H);
    updateBeats(innerHeight);
    adapt(dt);
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loop.start(); });

  /* ---------- warm up: compile every shader behind the loader ---------- */
  pose(1 / 60);
  try { await renderer.compileAsync(scene, camera); } catch { }
  composer.render(0);
  root.classList.add("is-ready");
  loop.start();
}
