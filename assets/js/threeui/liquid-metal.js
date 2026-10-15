/*!
 * Liquid-metal buttons for Trendli9 Prints.
 *
 * Ported from ThreeUI Community (github.com/MengTo/threeui), MIT License,
 * Copyright (c) 2026 Meng To. See THIRD_PARTY_NOTICES.txt for the full licence.
 * Source: src/shaders/liquid-metal-button/liquid-metal-button.html
 *
 * Changes from the original:
 *  - plain browser script (no React, no iframe); upgrades existing
 *    [data-liquid-metal] <a>/<button> elements in place;
 *  - one shared offscreen WebGL2 context renders every button, and each frame
 *    is blitted into a small per-button 2D canvas that sits behind the label;
 *  - the spectral dispersion and the travelling rim are tinted with the
 *    Trendli9 CMYK ink palette (cyan > violet > magenta > orange > yellow)
 *    instead of a physical rainbow;
 *  - the bloom is faded out before the canvas edge, since the halo area is
 *    smaller than the original's full-page stage;
 *  - pauses off-screen / in hidden tabs; one static frame for reduced motion.
 *
 * Usage: <a class="btn" data-liquid-metal href="...">Label</a>
 * Elements added after load: window.LiquidMetal.upgrade(rootElement)
 * If WebGL2 is unavailable, buttons are left untouched.
 */
(function () {
  'use strict';
  if (window.LiquidMetal) return;

  var SELECTOR = '[data-liquid-metal]';
  var PAD = 0.75;          // halo room around the pill, in button heights
  var MAX_DPR = 2;

  /* ----------------------------- shaders ------------------------------ */
  var VERT = '#version 300 es\n' +
    'in vec2 position; void main(){ gl_Position = vec4(position,0.,1.); }';

  var HEAD = `#version 300 es
precision highp float;
out vec4 o;

uniform vec2  uC;        // pill centre, device px
uniform vec2  uHalf;     // pill half-extent, device px
uniform float uT;        // seconds
uniform float uHover;    // 0..1
uniform float uPress;    // 0..1, eased
uniform vec4  uRip[3];   // xy centre (button heights, +y down), z start, w live
uniform vec4  uRipK;     // speed, ring width, decay, amplitude
uniform vec4  uRipK2;    // facet depth, facet count, crest sharpness, emission
uniform vec4  uPtr;      // xy trailing cursor, z strength, w normalised speed
uniform vec4  uPtrK;     // radius, base amplitude, speed amplitude, rim lift

#define PI 3.14159265

// Trendli9 ink ramp: cyan > violet > magenta > orange > yellow
vec3 ink(float k){
  k = clamp(k, 0., 1.) * 4.;
  const vec3 c0 = vec3(0.000, 0.659, 0.941);
  const vec3 c1 = vec3(0.482, 0.184, 0.969);
  const vec3 c2 = vec3(0.898, 0.000, 0.494);
  const vec3 c3 = vec3(1.000, 0.420, 0.000);
  const vec3 c4 = vec3(1.000, 0.769, 0.000);
  if(k < 1.) return mix(c0, c1, k);
  if(k < 2.) return mix(c1, c2, k - 1.);
  if(k < 3.) return mix(c2, c3, k - 2.);
  return mix(c3, c4, k - 3.);
}
// periodic version (ping-pong) so it wraps seamlessly
vec3 inkLoop(float u){ u = fract(u); return ink(1. - abs(2. * u - 1.)); }

float sdPill(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x,q.y),0.) + length(max(q,0.)) - r;
}

float ripple(vec2 p, float t){
  float sum = 0.;
  for(int i = 0; i < 3; i++){
    if(uRip[i].w < 0.5) continue;
    float age = t - uRip[i].z;
    if(age < 0. || age > 4.) continue;
    vec2  rp = p - uRip[i].xy;
    float facet = 1. + uRipK2.x * cos(uRipK2.y * atan(rp.y, rp.x) + age * 2.1 + float(i) * 2.4);
    float x = (length(rp) - age * uRipK.x * facet) / uRipK.y;
    sum += exp(-pow(abs(x) + 1e-4, uRipK2.z)) * exp(-age * uRipK.z);
  }
  return sum;
}

float pointerW(vec2 p){
  if(uPtr.z < 0.001) return 0.;
  float d = length(p - uPtr.xy) / uPtrK.x;
  return exp(-d*d) * uPtr.z;
}
vec2 pointerWarp(vec2 p){
  float w = pointerW(p);
  if(w <= 0.) return vec2(0.);
  return normalize(p - uPtr.xy + vec2(1e-5)) * w * (uPtrK.y + uPtrK.z * uPtr.w);
}
`;

  // the travelling rim, in its own pass so the blur never touches it
  var FRAG_RIM = HEAD + `
uniform float uBw;       // stroke half-width, device px
uniform float uE[8];     // base, hot, chroma-across, chroma-along, speed, topBias, press lift, ripple lift

float perim(vec2 d, float a, float r){
  float P = 4.*a + 2.*PI*r;
  float s;
  if(d.x >= a){
    float th = atan(d.y, d.x - a); if(th < 0.) th += 2.*PI;
    s = (th <= PI*0.5) ? r*th : P - r*(2.*PI - th);
  } else if(d.x <= -a){
    float th = atan(d.y, d.x + a); if(th < 0.) th += 2.*PI;
    s = r*PI*0.5 + 2.*a + r*(th - PI*0.5);
  } else if(d.y >= 0.){
    s = r*PI*0.5 + (a - d.x);
  } else {
    s = r*PI*1.5 + 2.*a + (d.x + a);
  }
  return s / P;
}
float pb(float u, float w){ u = fract(u); float x = min(u, 1.-u); return exp(-(x*x)/(w*w)); }
float rimHot(float s, float t){
  float v = uE[0];
  v += 0.62 * pb(s - t*uE[4],             0.075);
  v += 0.44 * pb(s + t*uE[4]*0.63 + 0.41, 0.135);
  v += 0.30 * pb(s - t*uE[4]*0.34 + 0.73, 0.200);
  return v;
}
float rimBand(float sd, float off){ return 1. - smoothstep(0., uBw*1.05, abs(sd + uBw*0.55 + off)); }

void main(){
  vec2  d  = gl_FragCoord.xy - uC;
  float sd = sdPill(d, uHalf, uHalf.y);
  if(sd > uBw*2.5 || sd < -uBw*3.5){ o = vec4(0.); return; }

  float a = max(uHalf.x - uHalf.y, 0.);
  float s = perim(d, a, uHalf.y);
  float top = mix(1., 0.5 + 0.5 * (d.y / uHalf.y), uE[5]);

  vec2  p   = vec2(d.x, -d.y) / (uHalf.y * 2.);
  float lift = 1. + uPress * uE[6] + ripple(p, uT) * uE[7]
             + pointerW(p) * uPtrK.w;

  vec3 band = vec3(
    rimBand(sd,  uE[2]) * rimHot(s + uE[3], uT),
    rimBand(sd,  0.   ) * rimHot(s,         uT),
    rimBand(sd, -uE[2]) * rimHot(s - uE[3], uT));
  // ink tint drifting round the outline (white-hot where the lobes pile up)
  vec3 tint = mix(vec3(1.), inkLoop(s - uT * uE[4] * 0.5), 0.78) * 1.35;
  o = vec4(band * tint * uE[1] * top * lift, 1.);
}`;

  var FRAG_SCENE = HEAD + `
uniform float uP[21];    // tunables
uniform float uInk;      // how strongly the sheet is washed with the ink ramp

float h21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  float a = h21(i), b = h21(i+vec2(1,0)), c = h21(i+vec2(0,1)), d = h21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y) * 2. - 1.;
}
float fbm(vec2 p, float g){
  float s = 0., a = 1., n = 0.;
  for(int i=0;i<4;i++){ s += a*vn(p); n += a; p = p*2.03 + 11.7; a *= g; }
  return s / n;
}
float fbm(vec2 p){ return fbm(p, 0.5); }

float wig(float x, float t, float seed){
  return vn(vec2(x,          t*0.150 + seed)) * 0.60
       + vn(vec2(x*2.07 + 4., t*0.105 + seed)) * 0.27
       + vn(vec2(x*4.30 - 7., t*0.080 + seed)) * 0.13;
}
float valleyAt(vec2 p, float t){ return wig(p.x*uP[0], t, 0.0) * uP[1]; }
float densAt  (vec2 p, float t){ return uP[2] * exp(uP[3] * wig(p.x*uP[4] + 9.0, t, 2.7)); }

float surface(vec2 p, float t){
  float V = (p.y - valleyAt(p,t)) * densAt(p,t);
  V += uP[5] * fbm(p*vec2(0.8, 1.7)*uP[6] + vec2(t*0.05, -t*0.03), uP[17]);
  return V - uP[7];
}
float tone(float v){
  float u = fract(v);
  float e = uP[9], W = uP[10] * 0.5;
  return smoothstep(0.5-W-e, 0.5-W, u) * (1. - smoothstep(0.5+W, 0.5+W+e, u));
}

void main(){
  vec2  d  = gl_FragCoord.xy - uC;
  float sd = sdPill(d, uHalf, uHalf.y);
  float pill = 1. - smoothstep(-1., 1., sd);
  float S = uHalf.y * 2.;
  float t = uT;

  if(uHover <= 0.0015 || pill <= 0.0015){ o = vec4(0., 0., 0., pill); return; }

  vec2  p = vec2(d.x, -d.y) / S;
  vec2  q = p + pointerWarp(p);

  float h0 = surface(q, t);
  vec2  gp = vec2(dFdx(h0), -dFdy(h0)) * S;
  float V  = surface(q - gp * uP[8] / max(uP[2], .001), t);

  vec2  gd = normalize(gp + vec2(1e-5));
  V += uP[13] * fbm(vec2(dot(q,gd)*uP[14], dot(q, vec2(-gd.y,gd.x))*uP[14]*0.04) + vec2(0., t*0.06));

  float rip  = ripple(p, t);
  float well = pointerW(p);
  V += rip * uRipK.w;

  // dispersion: one plateau sample per "wavelength", skewed like the original,
  // but each wavelength is weighted by the ink ramp instead of a rainbow
  const int N = 21;
  float mid = 1. - pow(0.5, uP[12]);
  vec3 col = vec3(0.), wsum = vec3(0.);
  for(int i=0;i<N;i++){
    float k = float(i)/float(N-1);
    vec3  w = ink(k);
    col  += w * tone(V + ((1. - pow(1. - k, uP[12])) - mid) * uP[11]);
    wsum += w;
  }
  col /= wsum;
  col = pow(col, vec3(uP[15]));

  // slow ink wash drifting across the sheet so the white-hot core reads as ink
  col *= mix(vec3(1.), inkLoop(p.x * 0.22 + q.y * 0.10 - t * 0.035) * 1.25, uInk);

  float lit = smoothstep(uP[18], uP[19], q.y - valleyAt(q, t));
  lit *= mix(1., lit, 0.55);
  col *= uP[16] * lit;
  col = col * (1. + rip * 1.15 + well * 0.60);

  o = vec4(col * pill * uHover, pill);
}`;

  var FRAG_DOWN = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uTex, uTex2;
uniform vec2 uDstTexel;
uniform vec2 uSrcTexel;
uniform float uAdd;
void main(){
  vec2 uv = gl_FragCoord.xy * uDstTexel;
  vec2 e = uDstTexel * 0.25;
  vec4 s = texture(uTex, uv + vec2(-e.x,-e.y)) + texture(uTex, uv + vec2( e.x,-e.y))
         + texture(uTex, uv + vec2(-e.x, e.y)) + texture(uTex, uv + vec2( e.x, e.y));
  s *= 0.25;
  if(uAdd > 0.5){
    vec4 r = texture(uTex2, uv + vec2(-e.x,-e.y)) + texture(uTex2, uv + vec2( e.x,-e.y))
           + texture(uTex2, uv + vec2(-e.x, e.y)) + texture(uTex2, uv + vec2( e.x, e.y));
    s.rgb += r.rgb * 0.25;
  }
  o = s;
}`;

  var FRAG_BLUR = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uDir; uniform float uR;
void main(){
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 st = uTexel * uDir * uR;
  vec4 s = texture(uTex, uv) * 0.1964;
  s += (texture(uTex, uv + st*1.4118) + texture(uTex, uv - st*1.4118)) * 0.2969;
  s += (texture(uTex, uv + st*3.2941) + texture(uTex, uv - st*3.2941)) * 0.0944;
  s += (texture(uTex, uv + st*5.1765) + texture(uTex, uv - st*5.1765)) * 0.0104;
  o = s;
}`;

  var FRAG_COMP = HEAD + `
uniform sampler2D uSoft, uRim, uGlow;
uniform vec2  uRes;
uniform float uPad;
uniform float uGlowGain, uGlowIn, uOccl, uDim, uPunch;

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 glow = texture(uGlow, uv).rgb;
  // fade the halo out before the canvas edge so it never shows a hard rectangle
  vec2 ed = min(gl_FragCoord.xy, uRes - gl_FragCoord.xy) / max(uPad, 1.);
  glow *= smoothstep(0., 1., ed.x) * smoothstep(0., 1., ed.y);

  vec2  d    = gl_FragCoord.xy - uC;
  float sd   = sdPill(d, uHalf, uHalf.y);
  float pill = 1. - smoothstep(-1., 1., sd);

  vec4 m = texture(uSoft, uv);
  // scrim: knock the metal back through the middle where the label sits
  float veil = 1. - smoothstep(0.46, 0.88, abs(d.y) / uHalf.y);
  vec3 metal = pow(max(m.rgb / max(m.a, 1e-3), 0.), vec3(uPunch));
  vec3 core = metal * pill * mix(1., uDim, veil) + texture(uRim, uv).rgb;

  float rip = ripple(vec2(d.x, -d.y) / (uHalf.y * 2.), uT);
  core += vec3(rip * rip) * uRipK2.w * pill * mix(1., 0.42, veil);

  float sdSh = sdPill(d + vec2(0., uHalf.y * 0.62), uHalf * 0.94, uHalf.y * 0.94);
  float occl = uOccl * exp(-max(sdSh, 0.) / (uHalf.y * 0.75));

  vec3 rgb = core + glow * uGlowGain * mix(1., uGlowIn, pill) * (1. - occl * (1. - pill));
  float a = clamp(max(rgb.r, max(rgb.g, rgb.b)), 0., 1.);
  o = vec4(min(rgb, vec3(1.)), a);
}`;

  /* ----------------------------- tunables ----------------------------- */
  // metal field, uP[0..20] — values as in the original
  var P = {
    valFreq: 0.50, valAmp: 0.55, dens: 2.40, densVar: 2.20, densFreq: 0.32,
    wobAmp: 0.12, wobFreq: 1.60, lift: 0.05, refract: 0.18, edge: 0.04,
    width: 0.46, disp: 0.30, skew: 1.50, fineAmp: 0.0, fineFreq: 9.0,
    gamma: 1.00, gain: 1.90, octGain: 0.32, litLo: -0.26, litHi: 0.10, dim: 0.44
  };
  // animated rim, uE[0..7]
  var E = {
    base: 0.20, hot: 0.82, chromA: 0.42, chromS: 0.030,
    speed: 0.070, top: 0.35, press: 0.85, ripple: 1.60
  };
  // composite (glow trimmed slightly: the halo has less room than the original stage)
  var C = { glow: 1.60, glowR: 0.95, glowIn: 0.30, occl: 0.62, soften: 0.24, punch: 1.50, ink: 0.45 };
  // disturbances — distances in button heights, times in seconds
  var R = {
    speed: 1.85, width: 0.20, decay: 1.35, amp: 1.35,
    facet: 0.18, lobes: 6.0, sharp: 1.15, emit: 0.45,
    ptrRad: 0.55, ptrAmp: 0.32, ptrFast: 0.40, ptrRim: 0.80,
    ptrLag: 0.0016, ptrVref: 4.5
  };
  var PKEYS = Object.keys(P), EKEYS = Object.keys(E);
  var uArr = new Float32Array(PKEYS.length), eArr = new Float32Array(EKEYS.length);
  PKEYS.forEach(function (k, i) { uArr[i] = P[k]; });
  EKEYS.forEach(function (k, i) { eArr[i] = E[k]; });
  var GLOW_TEX = 129;

  /* ----------------------- shared WebGL2 context ---------------------- */
  var gl = null, glCanvas = null, hasFloat = false;
  var pScene, pRim, pDown, pBlur, pComp;

  function initGL() {
    if (gl) return true;
    glCanvas = document.createElement('canvas');
    glCanvas.width = glCanvas.height = 2;
    try {
      gl = glCanvas.getContext('webgl2', {
        alpha: true, antialias: false, premultipliedAlpha: true,
        preserveDrawingBuffer: false, powerPreference: 'default'
      });
    } catch (e) { gl = null; }
    if (!gl) return false;
    try {
      pScene = prog(FRAG_SCENE); pRim = prog(FRAG_RIM);
      pDown = prog(FRAG_DOWN); pBlur = prog(FRAG_BLUR); pComp = prog(FRAG_COMP);
    } catch (e) {
      gl = null;
      return false;
    }
    var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    var vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    hasFloat = !!gl.getExtension('EXT_color_buffer_half_float');
    glCanvas.addEventListener('webglcontextlost', teardownAll);
    return true;
  }

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function prog(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'position');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }
  function makeTarget() {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex: tex, fbo: fbo, w: 0, h: 0 };
  }
  function sizeTarget(t, w, h) {
    if (t.w === w && t.h === h) return;
    t.w = w; t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    if (hasFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  function freeTarget(t) {
    if (!gl || gl.isContextLost()) return;
    gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo);
  }

  /* ----------------------------- instances ---------------------------- */
  var insts = [];
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var io = null, ro = null;

  function Inst(el, index) {
    this.el = el;
    this.cv = document.createElement('canvas');
    this.cv.className = 'lm-canvas';
    this.cv.setAttribute('aria-hidden', 'true');
    this.ctx = this.cv.getContext('2d');
    this.T = { core: makeTarget(), rim: makeTarget(), s1: makeTarget(), s2: makeTarget(), a: makeTarget(), b: makeTarget() };
    this.W = 0; this.H = 0; this.BW = 0; this.BH = 0; this.CX = 0; this.CY = 0;
    this.padPx = 0; this.DOWN = 4;
    this.needResize = true; this.visible = false; this.drawn = null;
    // offset each button's clock so neighbouring rims don't move in lockstep
    this.clock = calm.matches ? 2.0 : index * 1.7;
    this.hover = 0; this.hoverTarget = 0; this.press = 0; this.pressTarget = 0;
    this.RIP = [0, 1, 2].map(function () { return { x: 0, y: 0, t: -99, on: 0 }; });
    this.ripArr = new Float32Array(12); this.ripNext = 0;
    this.ptr = { x: 0, y: 0 }; this.ptrS = { x: 0, y: 0 }; this.ptrAmt = 0; this.ptrSpeed = 0;
    this.on = { over: false, press: false, focus: false };
  }

  Inst.prototype.sync = function () {
    var on = this.on;
    this.hoverTarget = (on.over || on.press || on.focus) ? 1 : 0;
    this.pressTarget = on.press ? 1 : 0;
    this.el.classList.toggle('lm-hot', this.hoverTarget > 0.5);
    this.el.classList.toggle('lm-press', on.press);
    kick();
  };
  Inst.prototype.addRipple = function (x, y) {
    if (calm.matches) return;               // no travelling waves for reduced motion
    var r = this.RIP[this.ripNext];
    this.ripNext = (this.ripNext + 1) % this.RIP.length;
    r.x = x; r.y = y; r.t = this.clock; r.on = 1;
  };
  // pointer position -> button-height units from the pill centre, +y down
  Inst.prototype.localPt = function (e) {
    var b = this.el.getBoundingClientRect(), s = b.height || 1;
    this.ptr.x = (e.clientX - (b.left + b.width / 2)) / s;
    this.ptr.y = (e.clientY - (b.top + b.height / 2)) / s;
  };

  Inst.prototype.resize = function () {
    var el = this.el, w = el.offsetWidth, h = el.offsetHeight;
    this.needResize = false;
    if (!w || !h) { this.W = 0; return; }
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var pad = Math.round(h * PAD);
    var cs = this.cv.style;
    cs.left = -(pad + el.clientLeft) + 'px';
    cs.top = -(pad + el.clientTop) + 'px';
    cs.width = (w + 2 * pad) + 'px';
    cs.height = (h + 2 * pad) + 'px';
    var W = Math.max(2, Math.round((w + 2 * pad) * dpr));
    var H = Math.max(2, Math.round((h + 2 * pad) * dpr));
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.cv.width = W; this.cv.height = H; }
    this.padPx = pad * dpr;
    this.BW = w * dpr; this.BH = h * dpr;
    this.CX = (pad + w / 2) * dpr;
    this.CY = H - (pad + h / 2) * dpr;      // gl_FragCoord is y-up
    var T = this.T;
    sizeTarget(T.core, W, H); sizeTarget(T.rim, W, H);
    var hw = Math.max(2, Math.ceil(W / 2)), hh = Math.max(2, Math.ceil(H / 2));
    sizeTarget(T.s1, hw, hh); sizeTarget(T.s2, hw, hh);
    this.DOWN = Math.max(1, Math.min(4, Math.round(this.BH / GLOW_TEX)));
    var dw = Math.max(2, Math.ceil(W / this.DOWN)), dh = Math.max(2, Math.ceil(H / this.DOWN));
    sizeTarget(T.a, dw, dh); sizeTarget(T.b, dw, dh);
    // the shared drawing buffer only ever grows
    if (glCanvas.width < W || glCanvas.height < H) {
      glCanvas.width = Math.max(glCanvas.width, W);
      glCanvas.height = Math.max(glCanvas.height, H);
    }
  };

  Inst.prototype.step = function (dt) {
    var still = calm.matches;
    if (!still) this.clock += dt;

    if (still) {
      this.hover = this.hoverTarget; this.press = this.pressTarget;
    } else {
      // asymmetric ease: quick to bloom, a touch quicker to die
      var k = this.hoverTarget > this.hover ? 1 - Math.pow(0.0012, dt) : 1 - Math.pow(0.00012, dt);
      this.hover += (this.hoverTarget - this.hover) * k;
      if (Math.abs(this.hoverTarget - this.hover) < 0.0008) this.hover = this.hoverTarget;
      // press snaps on and lets go slowly
      var pk = this.pressTarget > this.press ? 1 - Math.pow(1e-9, dt) : 1 - Math.pow(0.004, dt);
      this.press += (this.pressTarget - this.press) * pk;
      if (Math.abs(this.pressTarget - this.press) < 0.002) this.press = this.pressTarget;
    }

    var ripLive = false;
    for (var i = 0; i < 3; i++) {
      var r = this.RIP[i];
      if (r.on && (still || this.clock - r.t > 4)) r.on = 0;
      if (r.on) ripLive = true;
      this.ripArr[i * 4] = r.x; this.ripArr[i * 4 + 1] = r.y;
      this.ripArr[i * 4 + 2] = r.t; this.ripArr[i * 4 + 3] = r.on;
    }

    // the well trails the cursor and swells with how fast it is being dragged
    if (still) {
      this.ptrAmt = 0; this.ptrSpeed = 0;
    } else {
      var lag = 1 - Math.pow(R.ptrLag, dt);
      var dx = (this.ptr.x - this.ptrS.x) * lag, dy = (this.ptr.y - this.ptrS.y) * lag;
      this.ptrS.x += dx; this.ptrS.y += dy;
      var inst = Math.min(Math.hypot(dx, dy) / Math.max(dt, 1e-3) / R.ptrVref, 1);
      this.ptrSpeed += (inst - this.ptrSpeed) * (1 - Math.pow(inst > this.ptrSpeed ? 0.001 : 0.02, dt));
      var want = (this.on.over || this.on.press) ? 1 : 0;
      this.ptrAmt += (want - this.ptrAmt) * (1 - Math.pow(0.004, dt));
      if (Math.abs(want - this.ptrAmt) < 0.002) this.ptrAmt = want;
    }

    if (this.needResize) { this.resize(); this.drawn = null; }
    if (!this.W) return;

    // reduced motion: one static frame, redrawn only when state or size changes
    var sig = (still && !ripLive) ? this.hover + '|' + this.press + '|' + this.W + '|' + this.H : null;
    if (sig !== null && sig === this.drawn) return;
    this.drawn = sig;
    this.render();
  };

  function drawTo(t, inst) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : inst.W, t ? t.h : inst.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function common(pr, s) {
    gl.uniform2f(pr.u.uC, s.CX, s.CY);
    gl.uniform2f(pr.u.uHalf, s.BW / 2, s.BH / 2);
    gl.uniform1f(pr.u.uT, s.clock);
    gl.uniform1f(pr.u.uHover, s.hover);
    gl.uniform1f(pr.u.uPress, s.press);
    gl.uniform4fv(pr.u.uRip, s.ripArr);
    gl.uniform4f(pr.u.uRipK, R.speed, R.width, R.decay, R.amp);
    gl.uniform4f(pr.u.uRipK2, R.facet, R.lobes, R.sharp, R.emit);
    gl.uniform4f(pr.u.uPtr, s.ptrS.x, s.ptrS.y, s.ptrAmt, s.ptrSpeed);
    gl.uniform4f(pr.u.uPtrK, R.ptrRad, R.ptrAmp, R.ptrFast, R.ptrRim);
  }

  Inst.prototype.render = function () {
    var s = this, T = this.T, W = this.W, H = this.H, BH = this.BH;
    var bw = Math.max(1.5, 3.2 * (BH / 516));      // stroke half-width, device px

    // 1. metal, masked to the pill
    gl.useProgram(pScene.p);
    common(pScene, s);
    gl.uniform1fv(pScene.u.uP, uArr);
    gl.uniform1f(pScene.u.uInk, C.ink);
    drawTo(T.core);

    // 2. rim, kept out of the softening blur so the outline stays razor thin
    gl.useProgram(pRim.p);
    common(pRim, s);
    gl.uniform1f(pRim.u.uBw, bw);
    gl.uniform1fv(pRim.u.uE, eArr);
    drawTo(T.rim);

    // 3. soften the metal: half-res box down, then separable gaussian passes
    gl.useProgram(pDown.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.core.tex);
    gl.uniform1i(pDown.u.uTex, 0);
    gl.uniform1i(pDown.u.uTex2, 1);
    gl.uniform1f(pDown.u.uAdd, 0);
    gl.uniform2f(pDown.u.uDstTexel, 1 / T.s1.w, 1 / T.s1.h);
    gl.uniform2f(pDown.u.uSrcTexel, 1 / W, 1 / H);
    drawTo(T.s1);

    gl.useProgram(pBlur.p);
    gl.uniform1i(pBlur.u.uTex, 0);
    gl.uniform2f(pBlur.u.uTexel, 1 / T.s1.w, 1 / T.s1.h);
    var sigTex = C.soften * (BH * 0.5) * 0.95;
    if (sigTex > 0.1) {
      var iters = Math.min(4, Math.max(1, Math.ceil(sigTex / 3.0)));
      gl.uniform1f(pBlur.u.uR, sigTex / Math.sqrt(iters) / 1.95);
      for (var i = 0; i < iters; i++) {
        gl.bindTexture(gl.TEXTURE_2D, T.s1.tex); gl.uniform2f(pBlur.u.uDir, 1, 0); drawTo(T.s2);
        gl.bindTexture(gl.TEXTURE_2D, T.s2.tex); gl.uniform2f(pBlur.u.uDir, 0, 1); drawTo(T.s1);
      }
    }

    // 4. bloom, fed by the softened metal plus the crisp rim
    gl.useProgram(pDown.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.s1.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.rim.tex);
    gl.uniform1i(pDown.u.uTex, 0);
    gl.uniform1i(pDown.u.uTex2, 1);
    gl.uniform1f(pDown.u.uAdd, 1);
    gl.uniform2f(pDown.u.uDstTexel, 1 / T.a.w, 1 / T.a.h);
    gl.uniform2f(pDown.u.uSrcTexel, 1 / T.s1.w, 1 / T.s1.h);
    drawTo(T.a);

    gl.useProgram(pBlur.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(pBlur.u.uTex, 0);
    gl.uniform2f(pBlur.u.uTexel, 1 / T.a.w, 1 / T.a.h);
    var rs = C.glowR * (BH / this.DOWN) / GLOW_TEX;
    var radii = [1.0, 2.3, 5.2, 9.0];
    for (var j = 0; j < radii.length; j++) {
      gl.uniform1f(pBlur.u.uR, radii[j] * rs);
      gl.bindTexture(gl.TEXTURE_2D, T.a.tex); gl.uniform2f(pBlur.u.uDir, 1, 0); drawTo(T.b);
      gl.bindTexture(gl.TEXTURE_2D, T.b.tex); gl.uniform2f(pBlur.u.uDir, 0, 1); drawTo(T.a);
    }

    // 5. composite into the shared drawing buffer (bottom-left W x H region)
    gl.useProgram(pComp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.s1.tex); gl.uniform1i(pComp.u.uSoft, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.rim.tex); gl.uniform1i(pComp.u.uRim, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.a.tex); gl.uniform1i(pComp.u.uGlow, 2);
    common(pComp, s);
    gl.uniform2f(pComp.u.uRes, W, H);
    gl.uniform1f(pComp.u.uPad, this.padPx);
    gl.uniform1f(pComp.u.uGlowGain, C.glow);
    gl.uniform1f(pComp.u.uGlowIn, C.glowIn);
    gl.uniform1f(pComp.u.uOccl, C.occl);
    gl.uniform1f(pComp.u.uDim, P.dim);
    gl.uniform1f(pComp.u.uPunch, C.punch);
    drawTo(null, this);
    gl.activeTexture(gl.TEXTURE0);

    // 6. blit to this button's own 2D canvas (same task, so the buffer is intact)
    this.ctx.clearRect(0, 0, W, H);
    this.ctx.drawImage(glCanvas, 0, glCanvas.height - H, W, H, 0, 0, W, H);
  };

  Inst.prototype.bind = function () {
    var self = this, el = this.el;
    el.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      // land the well where the cursor actually entered
      self.localPt(e);
      self.ptrS.x = self.ptr.x; self.ptrS.y = self.ptr.y; self.ptrSpeed = 0;
      self.on.over = true; self.sync();
    });
    el.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse') { self.on.over = false; self.sync(); }
    });
    el.addEventListener('pointerdown', function (e) {
      self.localPt(e);
      self.on.press = true; self.sync();
      self.addRipple(self.ptr.x, self.ptr.y);
    });
    // only keyboard focus keeps it lit
    el.addEventListener('focus', function () {
      var fv = false;
      try { fv = el.matches(':focus-visible'); } catch (err) { fv = false; }
      self.on.focus = fv; self.sync();
    });
    el.addEventListener('blur', function () { self.on.focus = false; self.sync(); });
    // keyboard activation ripples from the centre
    el.addEventListener('keydown', function (e) {
      if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
      self.on.press = true; self.sync(); self.addRipple(0, 0);
    });
    el.addEventListener('keyup', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      self.on.press = false; self.sync();
    });
  };

  /* ------------------------------- loop ------------------------------- */
  var raf = 0, last = 0;
  function kick() {
    if (raf || document.hidden || !gl) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (!gl || gl.isContextLost()) return;
    var dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20); last = now;
    var any = false;
    for (var i = 0; i < insts.length; i++) {
      var s = insts[i];
      if (!s.visible) continue;
      any = true;
      s.step(dt);
    }
    if (any && !document.hidden) raf = requestAnimationFrame(tick);
  }

  // window-level listeners shared by every instance
  function onMove(e) {
    for (var i = 0; i < insts.length; i++) {
      var s = insts[i];
      if (s.on.over || s.on.press) s.localPt(e);
    }
  }
  function onUp() {
    for (var i = 0; i < insts.length; i++) {
      var s = insts[i];
      if (s.on.press) { s.on.press = false; s.sync(); }
    }
  }
  function onResize() { insts.forEach(function (s) { s.needResize = true; }); kick(); }
  function onVisibility() { if (!document.hidden) kick(); }
  function onMotionChange() {
    insts.forEach(function (s) { s.drawn = null; if (calm.matches) s.clock = 2.0; });
    kick();
  }
  var globalsBound = false;
  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (calm.addEventListener) calm.addEventListener('change', onMotionChange);
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var s = en.target.__lm;
          if (s) s.visible = en.isIntersecting;
        });
        kick();
      }, { rootMargin: '80px' });
    }
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(function (entries) {
        entries.forEach(function (en) { var s = en.target.__lm; if (s) s.needResize = true; });
        kick();
      });
    }
  }

  function teardownAll() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    insts.forEach(function (s) {
      if (io) io.unobserve(s.el);
      if (ro) ro.unobserve(s.el);
      if (s.cv.parentNode) s.cv.parentNode.removeChild(s.cv);
      s.el.classList.remove('lm-ready', 'lm-hot', 'lm-press');
      s.el.__lm = null;
    });
    insts = [];
    gl = null;
  }

  function upgrade(root) {
    var scope = root || document;
    var els = [];
    if (scope.matches && scope.matches(SELECTOR)) els.push(scope);
    if (scope.querySelectorAll) els = els.concat(Array.prototype.slice.call(scope.querySelectorAll(SELECTOR)));
    els = els.filter(function (el) { return !el.__lm; });
    if (!els.length || !initGL()) return 0;    // no WebGL2: leave buttons as they are
    bindGlobals();
    els.forEach(function (el) {
      var s = new Inst(el, insts.length);
      el.__lm = s;
      el.insertBefore(s.cv, el.firstChild);
      el.classList.add('lm-ready');
      s.bind();
      insts.push(s);
      if (io) io.observe(el); else s.visible = true;
      if (ro) ro.observe(el);
    });
    kick();
    return els.length;
  }

  window.LiquidMetal = { upgrade: upgrade };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { upgrade(document); });
  } else {
    upgrade(document);
  }
})();
