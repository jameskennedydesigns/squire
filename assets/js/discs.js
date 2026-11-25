/* ==========================================================================
   DISCS — 3D compact discs rendered with Three.js
   ---------------------------------------------------------------------------
   Two modes share one disc model (printed face, iridescent data side, bevelled
   rim, clear hub) and one lighting rig:

   • Hero carousel  — <section data-disc-gallery>: an arc of discs that steps
     one disc per scroll gesture, eases with a lean/dip "flow", tilts toward the
     pointer, gets a hand-drawn scribble on hover and opens the project on click.
   • Flat field     — <div data-disc-field>: every .wcard on the Portfolio
     canvas is drawn as a flat, face-on disc that tilts toward the pointer on
     hover.

   Motion constants are matched to the reference (a24.raviklaassens.com) by
   inspecting it; the code itself is written for this site.
   ========================================================================== */
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

/* ---- Tunables (reference values) -------------------------------------- */
const P = {
  // surface
  texGrain: .59, texPrint: .35, texScratches: .36, texGloss: 1,
  frontClearcoat: .8, frontRough: .42, frontMetal: .48,
  backBaseColor: '#1A1E2A', backRough: .23, backMetal: 1, backClearcoat: .34,
  backIridescence: 1, backIridIOR: 1.86, backIridThickness: 900, backRadialDetail: 1,
  edgeColor: '#FFFFFF', edgeRoughness: .04, edgeMetalness: .55, edgeBleed: .026,
  hubColor: '#FFFFFF', hubTransmission: .68, hubRoughness: .38, hubIOR: 2,
  hubMatrixWidth: .4, hubFrostedEdge: .54,
  discThickness: .01, edgeBevel: 1, holeSize: .14, hubSize: .24,
  // layout
  galleryScale: 1.08, hGap: 2.3, depthGap: 1, activeDiscY: .06,
  galleryRotX: -30, galleryRotY: -30, inactiveScale: .8,
  cameraDistance: 4.4, cameraFOV: 40,
  // light
  exposure: .86, environmentIntensity: 1,
  keyIntensity: .75, keyColor: '#FFF9E8', keyX: 3.5, keyY: -8,
  fillIntensity: .3, rimIntensity: .75, rimColor: '#499FF5', topStripIntensity: 1.9,
  fogColor: '#FFFFFF',
  // interaction
  hoverTiltStrength: .21, dragSensitivity: .95, dragVelocitySmoothing: .32, dragMaxVelocity: .5,
  friction: .89, maxSpinAngle: 180, resetDuration: 1.2, dragStartDistance: 5, snapDuration: .46,
  flowLean: .055, flowLeanMax: .3, flowBank: .32, flowDip: .014, flowDipMax: .09,
  followTight: 15, followBase: 11, followFalloff: 1.15, followMin: 6.5,
  snapFreq: 9.5, snapDamping: 12,
  wipePush: .012, wipePushMax: .5, wipeSpin: .009, wipeSpinMax: .4, wipeMinSpeed: 9,
  pushDamping: 4.5, pushReturn: 3.4, pressDepth: .55, pressTilt: 1.5,
  flightRecede: 2.2, flightStagger: .45, flightStaggerIn: .28, flightStaggerMax: 4,
  flightPopScale: .35, flightPopScaleIn: .02,
  // touch layout (≤ 991px)
  touchFlickVelocity: .035, touchPeek: 1, touchMinScale: .3, touchMaxScale: 3,
  touchGap: 2.2, touchDepth: .5, touchLeadMaxHeight: .6, touchDropY: 1,
  touchActiveScale: 1.5, touchInactiveScale: .6,
  // wheel stepping
  wheelNoiseFloor: .3, wheelStepThreshold: 6, wheelEventCap: 24, wheelEnvelopeTau: 550,
  wheelRiseFactor: 1.2, wheelTickGap: 34, wheelTickRatio: 1, wheelPauseGap: 130,
  wheelIdleReset: 150, wheelMinStepTick: 90, wheelMinStepFlick: 190,
  wheelSustainDelay: 480, wheelSustainRatio: .8,
  // hover scribble
  scribbleColor: '#000000', scribbleFps: 10, scribblePoints: 24, scribbleJitter: .028,
  scribbleLoops: 2, scribbleLoopGap: .045, scribblePadding: .06, scribbleWidth: .012,
  scribbleSweep: .68, scribbleSweepJitter: .4, scribbleIn: [.3, .5, .72], scribbleOut: [.72, .5, .3],
  scribbleLag: 15,
  artResolution: 1024
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Easing + a tiny tween engine -------------------------------------- */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(clamp(t, 0, 1));
  };
}
const Ease = {
  glide: bezier(.32, .72, 0, 1),
  none: t => t,
  p2in: t => t * t,
  p2out: t => 1 - (1 - t) ** 2,
  p3out: t => 1 - (1 - t) ** 3,
  p3inOut: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
};

class Tweens {
  constructor() { this.list = []; }
  to(target, props, { duration = .5, ease = Ease.p3out, delay = 0, onUpdate, onComplete } = {}) {
    const tw = { target, props, from: null, duration: Math.max(1e-4, duration), ease, delay, onUpdate, onComplete, t0: null, dead: false };
    tw.kill = () => { tw.dead = true; };
    this.list.push(tw);
    return tw;
  }
  killOf(target) { this.list.forEach(t => { if (t.target === target) t.dead = true; }); }
  isTweening(target) { return this.list.some(t => !t.dead && t.target === target); }
  get busy() { return this.list.some(t => !t.dead); }
  update(now) {
    const done = [];
    for (const tw of this.list) {
      if (tw.dead) continue;
      if (tw.t0 === null) tw.t0 = now;
      const el = (now - tw.t0) / 1000 - tw.delay;
      if (el < 0) continue;
      if (!tw.from) { tw.from = {}; for (const k in tw.props) tw.from[k] = tw.target[k]; }
      const p = clamp(el / tw.duration, 0, 1), e = tw.ease(p);
      for (const k in tw.props) tw.target[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
      tw.onUpdate && tw.onUpdate();
      if (p >= 1) { tw.dead = true; done.push(tw); }
    }
    this.list = this.list.filter(t => !t.dead);
    done.forEach(t => t.onComplete && t.onComplete());
  }
}

/* ---- Procedural surface maps (built off the main thread) --------------- */
const MAP_SRC = `
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  function toNormals(h, size) {
    const out = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + Math.max(0, x - 1)], r = h[y * size + Math.min(size - 1, x + 1)];
      const u = h[Math.max(0, y - 1) * size + x], d = h[Math.min(size - 1, y + 1) * size + x];
      let nx = l - r, ny = u - d, nz = 1; const k = 1 / Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      out[i] = (nx * k * .5 + .5) * 255; out[i + 1] = (ny * k * .5 + .5) * 255; out[i + 2] = (nz * k * .5 + .5) * 255; out[i + 3] = 255;
    }
    return out;
  }
  function grey(size, fn) {
    const out = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = Math.min(1, Math.max(.02, fn(x, y))) * 255, i = (y * size + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
    }
    return out;
  }
  const jobs = {
    frontNormal(size, s) {
      const h = new Float32Array(size * size), c = size / 2;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const r = Math.hypot(x - c, y - c) + 1e-4;
        h[y * size + x] = Math.sin(r * .6) * .02 + (hash(x * .4, y * .4) - .5) * .5 * s.texPrint;
      }
      for (let n = 0, N = Math.floor(30 * s.texScratches); n < N; n++) {
        const a = Math.random() * Math.PI * 2, len = 30 + Math.random() * 220, x0 = Math.random() * size, y0 = Math.random() * size;
        const depth = (Math.random() * .7 + .2) * s.texScratches;
        for (let t = 0; t < len; t++) {
          const px = Math.round(x0 + Math.cos(a) * t), py = Math.round(y0 + Math.sin(a) * t);
          if (px > 0 && py > 0 && px < size - 1 && py < size - 1) h[py * size + px] -= depth;
        }
      }
      for (let n = 0, N = Math.floor(500 * s.texScratches); n < N; n++)
        h[Math.floor(Math.random() * size) * size + Math.floor(Math.random() * size)] += (Math.random() - .5) * s.texScratches * 1.2;
      return toNormals(h, size);
    },
    backNormal(size, s) {
      const h = new Float32Array(size * size), c = size / 2;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const r = Math.hypot(x - c, y - c);
        h[y * size + x] = Math.sin(r * 3.2) * .5 * s.backRadialDetail + (hash(x * .6, y * .6) - .5) * .06 * s.backRadialDetail;
      }
      return toNormals(h, size);
    },
    frontRough(size, s) {
      const c = size / 2;
      return grey(size, (x, y) => {
        const r = Math.hypot(x - c, y - c) / c;
        return s.frontRough + (hash(x * 2.3, y * 2.3) - .5) * .35 * s.texGrain + (hash(x * .5, y * .5) - .5) * .3 * s.texPrint
          - (Math.sin(r * 14) * .5 + .5) * .5 * s.texGloss;
      });
    },
    backRough(size, s) {
      const c = size / 2;
      return grey(size, (x, y) => {
        const r = Math.hypot(x - c, y - c);
        return s.backRough + Math.sin(r * 1.6) * .06 * s.backRadialDetail + (hash(x * 1.2, y * 1.2) - .5) * .04 * s.backRadialDetail;
      });
    }
  };`;

let mapWorker = null, mapSeq = 0;
const mapWaiters = new Map();
function buildMap(job, size) {
  const settings = { texPrint: P.texPrint, texScratches: P.texScratches, texGrain: P.texGrain, texGloss: P.texGloss, frontRough: P.frontRough, backRough: P.backRough, backRadialDetail: P.backRadialDetail };
  const inline = () => new Function(MAP_SRC + '; return jobs;')()[job](size, settings);
  try {
    if (!mapWorker) {
      const url = URL.createObjectURL(new Blob([MAP_SRC + `
        self.onmessage = e => { const { id, job, size, settings } = e.data; const data = jobs[job](size, settings); self.postMessage({ id, data }, [data.buffer]); };`], { type: 'application/javascript' }));
      mapWorker = new Worker(url); URL.revokeObjectURL(url);
      mapWorker.onmessage = e => { const w = mapWaiters.get(e.data.id); if (w) { mapWaiters.delete(e.data.id); w(e.data.data); } };
    }
    return new Promise(res => { const id = ++mapSeq; mapWaiters.set(id, res); mapWorker.postMessage({ id, job, size, settings }); })
      .then(d => toCanvas(d, size));
  } catch { return Promise.resolve(toCanvas(inline(), size)); }
}
function toCanvas(data, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  return c;
}

/* ---- Disc artwork ------------------------------------------------------ */
const PH_TONES = ['#d9d9d9', '#cfcfcf', '#c4c4c4', '#e3e3e3'];
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 18; }
  x.putImageData(d, 0, 0);
  return (grainTile = c);
}
function arcText(x, text, cx, cy, R, centerAngle) {
  // letters stand upright along the lower rim, tops toward the centre
  const chars = [...text], widths = chars.map(ch => x.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let theta = centerAngle + total / R / 2;
  chars.forEach((ch, i) => {
    const a = theta - widths[i] / R / 2;
    x.save(); x.translate(cx + R * Math.cos(a), cy + R * Math.sin(a)); x.rotate(a - Math.PI / 2);
    x.fillText(ch, 0, 0); x.restore();
    theta -= widths[i] / R;
  });
}
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
/* Disc covers can be a still image, an animated GIF or a video (MP4 / WebM / MOV).
   Moving covers are redrawn onto the disc at MOTION_FPS while the discs are on
   screen; with reduced motion they hold their first frame.                    */
const MOTION_FPS = 24;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i, GIF_RE = /\.gif(\?|#|$)/i;
async function mediaKind(src) {
  if (VIDEO_RE.test(src) || /^data:video\//.test(src)) return 'video';
  if (GIF_RE.test(src) || /^data:image\/gif/.test(src)) return 'gif';
  if (/\/_blob\//.test(src)) {          // Site Editor uploads have no extension: ask the server
    try { const t = (await fetch(src.split('#')[0], { method: 'HEAD' })).headers.get('content-type') || ''; if (/^video\//.test(t)) return 'video'; if (/^image\/gif/.test(t)) return 'gif'; } catch {}
  }
  return 'image';
}
// browsers only keep GIFs and videos playing while they're in the document
function parkMedia(m) { m.setAttribute('aria-hidden', 'true'); m.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1'; document.body.appendChild(m); }
function loadVideo(src) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    const t = setTimeout(() => rej(new Error('video timeout')), 15000);
    v.addEventListener('loadeddata', () => { clearTimeout(t); res(v); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); rej(v.error); }, { once: true });
    v.src = src; parkMedia(v);
    if (REDUCED) v.pause(); else v.play().catch(() => {});
  });
}
// GIFs: decode frame by frame where the browser can (browsers pause GIFs that
// aren't visible on the page); otherwise fall back to a parked <img>
async function loadGif(src) {
  if (typeof ImageDecoder === 'function') {
    try {
      const data = await (await fetch(src.split('#')[0])).arrayBuffer();
      const dec = new ImageDecoder({ data, type: 'image/gif' });
      await dec.tracks.ready; await dec.completed.catch(() => {});
      const count = dec.tracks.selectedTrack ? dec.tracks.selectedTrack.frameCount : 1;
      let i = 0, frame = (await dec.decode({ frameIndex: 0 })).image, due = performance.now() + Math.max(20, (frame.duration || 1e5) / 1000), busy = false;
      const m = { kind: 'gif', moving: count > 1 && !REDUCED, get el() { return frame; },
        advance(now) {
          if (busy || count < 2 || now < due) return;
          busy = true; i = (i + 1) % count;
          dec.decode({ frameIndex: i }).then(r => { const old = frame; frame = r.image; old.close(); due = Math.max(due + Math.max(20, (frame.duration || 1e5) / 1000), now); }).catch(() => {}).finally(() => { busy = false; });
        } };
      return m;
    } catch (e) { /* fall through to <img> */ }
  }
  const el = await loadImage(src); parkMedia(el); el.style.opacity = '.01';
  return { el, kind: 'gif', moving: !REDUCED };
}
const mediaCache = new Map();         // one element per file, shared by every disc using it
function loadMedia(src) {
  if (!mediaCache.has(src)) mediaCache.set(src, (async () => {
    const kind = await mediaKind(src);
    if (kind === 'gif') return loadGif(src);
    const el = kind === 'video' ? await loadVideo(src) : await loadImage(src);
    return { el, kind, moving: kind !== 'image' && !REDUCED };
  })().catch(e => { mediaCache.delete(src); throw e; }));
  return mediaCache.get(src);
}
// moving covers: each is { tex, paint, last }; the frame loops call tickMotion
const motion = new Set();
function tickMotion(now) {
  let n = 0;
  motion.forEach(m => { if (now - m.last >= 1000 / MOTION_FPS - 4) { m.last = now; m.paint(); m.tex.needsUpdate = true; n++; } });
  return n > 0;
}
const hasMotion = () => motion.size > 0;
async function drawArt(item, i) {
  const S = P.artResolution, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), cx = S / 2, inner = S / 2 * Math.max(P.holeSize, P.hubSize);
  let media = null;
  if (item.art) { try { media = await loadMedia(item.art); } catch { console.warn('Could not load disc art:', item.art); } }
  const text = await textLayer(item, S);
  const grainPat = media ? null : x.createPattern(grain(), 'repeat');
  const paint = () => {
    x.save();
    x.beginPath(); x.arc(cx, cx, cx, 0, Math.PI * 2); x.arc(cx, cx, inner, 0, Math.PI * 2, true); x.clip('evenodd');
    x.fillStyle = '#0c0c0e'; x.fillRect(0, 0, S, S);
    if (media) {
      if (media.advance) media.advance(performance.now());
      const el = media.el, iw = el.displayWidth || el.videoWidth || el.naturalWidth || S, ih = el.displayHeight || el.videoHeight || el.naturalHeight || S;
      const r = iw / ih; let w = S, h = S; r > 1 ? (w = h * r) : (h = w / r);
      x.drawImage(el, cx - w / 2, cx - h / 2, w, h);
    } else {
      // placeholder cover: the reference's print layout, in the site's placeholder greys
      x.fillStyle = PH_TONES[i % PH_TONES.length]; x.fillRect(0, 0, S, S);
      const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.06)');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.fillStyle = grainPat; x.fillRect(0, 0, S, S);
    }
    x.drawImage(text, 0, 0);
    x.restore();
  };
  paint();
  if (media && media.moving) c.motion = { paint, el: media.el };
  return c;
}
// printed text, on top of the art or the generated cover; `ink` picks black or white
async function textLayer(item, S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), cx = S / 2;
  const ink = item.ink === 'white' ? '255,255,255' : '0,0,0';
  try { await document.fonts.load(`700 ${S * .1}px "Inter Display"`); await document.fonts.load(`800 ${S * .04}px "Inter Display"`); } catch {}
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = `rgba(${ink},.9)`;
  if (item.title) {
    let fs = S * .1; x.font = `700 ${fs}px "Inter Display", Inter, Helvetica, Arial, sans-serif`;
    if ('letterSpacing' in x) x.letterSpacing = `${-fs * .03}px`;
    while (x.measureText(item.title).width > S * .62 && fs > S * .05) { fs -= 2; x.font = `700 ${fs}px "Inter Display", Inter, Helvetica, Arial, sans-serif`; if ('letterSpacing' in x) x.letterSpacing = `${-fs * .03}px`; }
    x.fillText(item.title, cx, S * .245);
  }
  if (item.mark) {
    const mfs = S * .038; x.font = `800 ${mfs}px "Inter Display", Inter, Helvetica, Arial, sans-serif`;
    if ('letterSpacing' in x) x.letterSpacing = `${-mfs * .04}px`;
    x.fillText(item.mark, cx, S * .245 + mfs * 1.7);
  }
  if (item.rim) {
    const rfs = S * .0145; x.font = `500 ${rfs}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    if ('letterSpacing' in x) x.letterSpacing = `${rfs * .35}px`;
    x.fillStyle = `rgba(${ink},.7)`; x.textBaseline = 'middle';
    arcText(x, item.rim.toUpperCase(), cx, cx, S * .445, Math.PI / 2);
  }
  return c;
}

/* ---- Shared Three.js resources ----------------------------------------- */
let shared = null;
function lathe(points, segs) { const g = new THREE.LatheGeometry(points, segs); g.computeVertexNormals(); return g; }
function hubRing(rIn, rOut, height, ripple, segs) {
  const h = height / 2, a = Math.max(.002, rIn), span = Math.max(1e-4, rOut - a), pts = [new THREE.Vector2(a, -h), new THREE.Vector2(a, h)];
  const prof = t => h * (1 - ripple) + h * ripple * (.6 + .4 * Math.cos(t * Math.PI * 3));
  for (let k = 0; k <= 5; k++) pts.push(new THREE.Vector2(a + span * k / 5, prof(k / 5)));
  pts.push(new THREE.Vector2(rOut, h * .92), new THREE.Vector2(rOut, -h * .92));
  for (let k = 5; k >= 0; k--) pts.push(new THREE.Vector2(a + span * k / 5, -prof(k / 5)));
  return lathe(pts, segs);
}
function faceRing() {
  const g = new THREE.RingGeometry(P.hubSize, 1 - P.edgeBleed, 220, 1), p = g.attributes.position, uv = g.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) * .5 + .5, p.getY(k) * .5 + .5);
  uv.needsUpdate = true; return g;
}
function hubTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), g = x.createRadialGradient(256, 256, 40.96, 256, 256, 256);
  g.addColorStop(0, '#d9dde4'); g.addColorStop(.42, '#f0f2f5'); g.addColorStop(.72, '#cfd4dc'); g.addColorStop(1, '#b8bec8');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  [.255, .285, .315, .345].forEach((r, k) => { x.strokeStyle = `rgba(255,255,255,${.14 - k * .018})`; x.beginPath(); x.arc(256, 256, 512 * r, 0, Math.PI * 2); x.stroke(); });
  return c;
}
function envCanvas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#25282f'); g.addColorStop(.5, '#0e0f13'); g.addColorStop(1, '#020203');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  [[.14, .07, 1], [.4, .049, .6], [.26, .077, .85], [.62, .035, .35]].forEach(([y, h, k]) => {
    const s = x.createLinearGradient(0, 512 * (y - h), 0, 512 * (y + h));
    s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(.5, `rgba(255,255,255,${Math.max(.1, .85 * k)})`); s.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = s; x.fillRect(0, 512 * (y - h), 1024, 512 * h * 2);
  });
  return c;
}
async function getShared(renderer) {
  if (shared) return shared;
  const tex = (c, cs = THREE.NoColorSpace) => { const t = new THREE.CanvasTexture(c); t.colorSpace = cs; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
  const [fN, bN, fR, bR] = await Promise.all([buildMap('frontNormal', 1024), buildMap('backNormal', 1024), buildMap('frontRough', 512), buildMap('backRough', 512)]);
  const holeR = P.holeSize, hubR = P.hubSize, t = P.discThickness, span = hubR - holeR;
  const frostOut = holeR + span * .34, matrixOut = frostOut + span * P.hubMatrixWidth, hubH = t * 1.02;
  const e = t / 2, bev = .0015 + P.edgeBevel * Math.min(t * .55, .018), inR = 1 - P.edgeBleed;
  const blank = document.createElement('canvas'); blank.width = blank.height = 16;
  const bx = blank.getContext('2d'); bx.fillStyle = '#0c0c0e'; bx.fillRect(0, 0, 16, 16);
  shared = {
    tex,
    front: faceRing(), back: faceRing(),
    edge: lathe([new THREE.Vector2(inR, e), new THREE.Vector2(1 - bev, e), new THREE.Vector2(1, e - bev), new THREE.Vector2(1, -e + bev), new THREE.Vector2(1 - bev, -e), new THREE.Vector2(inR, -e)], 256),
    hub: hubRing(matrixOut, hubR, hubH, .22, 160),
    matrix: hubRing(frostOut, matrixOut, hubH * .88, .12, 128),
    frost: hubRing(holeR, frostOut, hubH * .96, .4, 128),
    pick: new THREE.CircleGeometry(1, 48),
    pickMat: new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthWrite: false }),
    frontNormal: tex(fN), backNormal: tex(bN), frontRoughMap: tex(fR), backRoughMap: tex(bR),
    blank: tex(blank, THREE.SRGBColorSpace)
  };
  shared.backMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(P.backBaseColor), roughness: P.backRough, metalness: P.backMetal, roughnessMap: shared.backRoughMap,
    clearcoat: P.backClearcoat, clearcoatRoughness: .06, iridescence: P.backIridescence, iridescenceIOR: P.backIridIOR,
    iridescenceThicknessRange: [140, P.backIridThickness], normalMap: shared.backNormal, normalScale: new THREE.Vector2(.5, .5), envMapIntensity: 1.5
  });
  shared.edgeMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(P.edgeColor), roughness: P.edgeRoughness, metalness: P.edgeMetalness, clearcoat: .7, clearcoatRoughness: .05, envMapIntensity: 1.8, side: THREE.DoubleSide });
  // The clear hub and frosted ring use plain transparency instead of physical
  // transmission: transmission re-renders the whole scene into an extra target
  // every frame (≈4–5× the GPU cost of a frame here). Opacity gives the same
  // see-through plastic at this size.
  shared.hubMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(P.hubColor), roughness: P.hubRoughness, metalness: 0, ior: P.hubIOR, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.3, transparent: true, opacity: 1 - P.hubTransmission * .7, depthWrite: false, side: THREE.DoubleSide });
  shared.matrixMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xdfe3e9), map: tex(hubTexture(), THREE.SRGBColorSpace), roughness: .28, metalness: .82, clearcoat: .7, clearcoatRoughness: .12, envMapIntensity: 1.45, side: THREE.DoubleSide });
  shared.frostMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xeef0f5), roughness: .25 + P.hubFrostedEdge * .55, metalness: 0, ior: 1.5, clearcoat: .4, clearcoatRoughness: .3, envMapIntensity: .9, transparent: true, opacity: 1 - (1 - P.hubFrostedEdge) * .5 * .7, depthWrite: false, side: THREE.DoubleSide });
  return shared;
}

/* One disc: group (layout) → spin (flip / drag spin) → meshes */
function makeDisc(sh) {
  const group = new THREE.Group(), spin = new THREE.Group(); group.add(spin);
  const frontMat = new THREE.MeshPhysicalMaterial({
    map: sh.blank, roughness: P.frontRough, metalness: P.frontMetal, roughnessMap: sh.frontRoughMap,
    clearcoat: P.frontClearcoat, clearcoatRoughness: .18 * (1 - P.texGloss), normalMap: sh.frontNormal,
    normalScale: new THREE.Vector2(.3, .3), envMapIntensity: .85
  });
  const t = P.discThickness;
  const front = new THREE.Mesh(sh.front, frontMat), back = new THREE.Mesh(sh.back, sh.backMat);
  const edge = new THREE.Mesh(sh.edge, sh.edgeMat), hub = new THREE.Mesh(sh.hub, sh.hubMat);
  const matrix = new THREE.Mesh(sh.matrix, sh.matrixMat), frost = new THREE.Mesh(sh.frost, sh.frostMat);
  front.position.z = t / 2 + 6e-4; back.position.z = -t / 2 - 6e-4; back.rotation.y = Math.PI;
  [edge, hub, matrix, frost].forEach(m => { m.rotation.x = Math.PI / 2; });
  spin.add(front, back, edge, hub, matrix, frost);
  const pick = new THREE.Mesh(sh.pick, sh.pickMat); pick.renderOrder = -1; group.add(pick);
  return {
    group, spin, pick, frontMat, hover: 0, spinX: 0, spinY: 0, resetTween: null,
    pushX: 0, pushY: 0, pushZ: 0, pushVX: 0, pushVY: 0, pushVZ: 0, pushRotX: 0, pushRotY: 0, pushRotVX: 0, pushRotVY: 0
  };
}

function makeStage(mount, { fov = P.cameraFOV, distance = P.cameraDistance, mobile = false } = {}) {
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.setClearColor(0, 0);
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = .5;
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', background: 'transparent', pointerEvents: 'none' });
  mount.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(P.fogColor, 7, 14);
  const camera = new THREE.PerspectiveCamera(fov, 1, .1, 100);
  camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, .25));
  const key = new THREE.DirectionalLight(P.keyColor, P.keyIntensity); key.position.set(P.keyX, P.keyY, 6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, P.fillIntensity); fill.position.set(-5, -2, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(P.rimColor, P.rimIntensity); rim.position.set(0, 3, -6); scene.add(rim);
  const strip = new THREE.RectAreaLight(0xffffff, P.topStripIntensity, 6, .4); strip.position.set(0, 3.2, 3); strip.lookAt(0, 0, 0); scene.add(strip);
  const envTex = new THREE.CanvasTexture(envCanvas()); envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture; scene.environmentIntensity = P.environmentIntensity;
  envTex.dispose(); pmrem.dispose();
  return { renderer, scene, camera, key, fill, rim, strip };
}

/* Items + art shared by both modes */
/* Printed disc text: each project can override it (discTitle / discMark /
   discRim); empty means the default worked out here.                       */
function discDefaults(p, S = window.SITE || {}) {
  const name = S.name || 'Your Name';
  return {
    title: p.title || 'Project',
    mark: S.brand || `${name}®`,
    rim: ['Designed by   ' + name, (p.services || '').split(',')[0].trim(), p.year || '', S.brand || name + '®'].filter(Boolean).join('   ·   ')
  };
}
function siteItems() {
  const S = window.SITE || {};
  return (S.projects || []).slice(0, 5).map((p, i) => {
    const d = discDefaults(p, S);
    return {
      index: i, slug: p.slug, title: p.discTitle || d.title, year: p.year || '',
      url: `project.html?p=${encodeURIComponent(p.slug)}`,
      art: p.disc || p.image || '',
      mark: p.discMark || d.mark,
      rim: p.discRim || d.rim,
      ink: p.discInk === 'white' ? 'white' : 'black'
    };
  });
}
// The Site Editor's canvas uses these to preview disc art and fill in defaults
window.__drawDiscArt = (item, i) => drawArt(Object.assign({ title: '', mark: '', rim: '', art: '', ink: 'black' }, item, { index: i }), i);
window.__discDefaults = p => discDefaults(p);
const artCache = new Map();
function artTexture(sh, item) {
  const key = `${item.art}|${item.title}|${item.mark}|${item.rim}|${item.ink}|${item.index}`;
  if (!artCache.has(key)) artCache.set(key, drawArt(item, item.index).then(c => {
    const t = sh.tex(c, THREE.SRGBColorSpace);
    if (c.motion) motion.add({ tex: t, paint: c.motion.paint, last: 0 });
    return t;
  }));
  return artCache.get(key);
}

/* ==========================================================================
   HERO CAROUSEL
   ========================================================================== */
async function initGallery(el) {
  const mount = el.querySelector('[data-disc-canvas]');
  const items = siteItems().slice(0, +(el.dataset.discCount || 4));
  if (!mount || !items.length) return;
  const N = items.length;
  const touchMQ = matchMedia('(max-width: 991px)');
  const isTouchLayout = () => touchMQ.matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const w = { ...P };
  const baseScale = w.galleryScale;
  const stage = makeStage(mount, { mobile: matchMedia('(max-width: 767px)').matches });
  const { renderer, scene, camera } = stage;
  const sh = await getShared(renderer);
  const tw = new Tweens();

  const root = new THREE.Group();
  root.rotation.set(w.galleryRotX * DEG, w.galleryRotY * DEG, 0);
  root.scale.setScalar(w.galleryScale);
  scene.add(root);

  const discs = items.map((it, i) => { const d = makeDisc(sh); d.index = i; d.group.userData.index = i; d.pick.userData.index = i; root.add(d.group); return d; });
  const picks = discs.map(d => d.pick);
  items.forEach((it, i) => artTexture(sh, it).then(t => { discs[i].frontMat.map = t; discs[i].frontMat.needsUpdate = true; wake(2); }));

  /* ---- state ---- */
  let L = 0, prevL = 0, active = -1, dragVel = 0, springVel = 0, flow = 0;
  let target = 0;               // index we are heading to
  const pos = { value: 0 };     // tweened carousel position
  let hoverIdx = -1, ptrX = 0, ptrY = 0, ptrDirty = false, ptrOver = false;
  let lastMoveT = 0, lastMX = 0, lastMY = 0, mvx = 0, mvy = 0;
  let down = false, downId = -1, dragging = false, isTouch = false, downX = 0, downY = 0, lastX = 0, lastY = 0, lastT = 0;
  let downDisc = -1, spinDisc = -1, suppressClickUntil = 0, keyFocus = false;
  let flight = true, ready = false, raf = 0, forceFrames = 3, lastFrame = performance.now(), inView = true;
  let touchSpan = 0;
  const G = { others: 0, active: .001, inbound: true };
  const reduced = REDUCED;

  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), hitUV = { x: 0, y: 0 };
  let rect = null; const hitList = [];
  addEventListener('scroll', () => { rect = null; }, { passive: true });
  function setPointer(e) {
    const r = rect || (rect = renderer.domElement.getBoundingClientRect());
    ndc.x = (e.clientX - r.left) / r.width * 2 - 1; ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    return { x: e.clientX - r.left, y: e.clientY - r.top, rect: r };
  }
  function pickDisc() {
    ray.setFromCamera(ndc, camera);
    hitList.length = 0;
    for (let k = 0; k < picks.length; k++) if (picks[k].parent.visible) ray.intersectObject(picks[k], false, hitList);
    hitList.sort((a, b) => a.distance - b.distance);
    const hit = hitList[0];
    if (!hit) return -1;
    if (hit.uv) { hitUV.x = hit.uv.x * 2 - 1; hitUV.y = hit.uv.y * 2 - 1; } else { hitUV.x = hitUV.y = 0; }
    return hit.object.userData.index;
  }
  const settled = () => Math.round(clamp(L, 0, N - 1));
  const headingTo = () => tw.isTweening(pos) ? clamp(target, 0, N - 1) : settled();

  /* ---- scroll pinning: page scroll ↔ disc index ---- */
  const pin = el.closest('[data-disc-pin]');
  if (pin) pin.style.setProperty('--disc-steps', String(Math.max(0, N - 1)));   // one scroll step per disc
  const stepPx = () => pin ? Math.max(1, pin.offsetHeight - el.offsetHeight) / Math.max(1, N - 1) : 0;
  const pinTop = () => pin ? pin.getBoundingClientRect().top + scrollY : 0;
  const indexFromScroll = () => clamp(Math.round((scrollY - pinTop()) / Math.max(1, stepPx())), 0, N - 1);
  const inPinZone = () => { if (!pin) return false; const t = pinTop(), y = scrollY; return y >= t - 2 && y <= t + stepPx() * (N - 1) + 2; };
  let syncing = false;
  function syncScroll(i) {
    if (!pin) return;
    const y = pinTop() + i * stepPx();
    syncing = true;
    if (window.lenis) window.lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
    requestAnimationFrame(() => { syncing = false; });
  }
  addEventListener('scroll', () => {
    if (syncing || !pin || flight) return;
    const i = indexFromScroll();
    if (i !== headingTo()) goTo(i, { source: 'wheel', fromScroll: true });
  }, { passive: true });

  /* ---- go to an index (wheel / key / click / flick / snap) ---- */
  function timing(source, dist) {
    const n = w.snapDuration;
    switch (source) {
      case 'wheel': return { duration: n + .05, ease: Ease.glide, kick: 2.5 };
      case 'key': return { duration: Math.min(.6, n - .04 + dist * .05), ease: Ease.glide, kick: 4 };
      case 'click': return { duration: clamp(.45 + dist * .11, n, 1.05), ease: Ease.glide, kick: Math.min(5, dist * 1.4) };
      case 'flick': return { duration: n + .1, ease: Ease.glide, kick: 0 };
      default: return { duration: n, ease: Ease.p3out, kick: 0 };
    }
  }
  function goTo(i, opt = {}) {
    const n = clamp(i, 0, N - 1), dist = Math.abs(n - L), t = timing(opt.source || 'snap', dist);
    target = n; dragVel = 0; springVel = 0; tw.killOf(pos);
    if (!reduced && t.kick) { const s = Math.sign(n - L); if (s) flow = clamp(flow + s * t.kick, -12, 12); }
    if (!opt.fromScroll) syncScroll(n);
    pos.value = L;
    if (reduced || opt.immediate) { L = n; prevL = n; flow = 0; setActive(n); wake(3); return; }
    tw.to(pos, { value: n }, { duration: t.duration, ease: t.ease, onUpdate: () => { L = pos.value; }, onComplete: () => { L = n; setActive(n); } });
    wake(3);
  }

  /* ---- active disc → DOM ---- */
  const live = document.createElement('p');
  live.setAttribute('aria-live', 'polite'); live.className = 'sr-only'; el.appendChild(live);
  let liveT = 0;
  function setActive(i) {
    const n = clamp(i, 0, N - 1);
    if (n === active) return;
    active = n;
    el.setAttribute('data-active-index', String(n));
    el.querySelectorAll('[data-disc-current]').forEach(x => { x.textContent = String(n + 1).padStart(2, '0'); });
    el.querySelectorAll('[data-disc-title]').forEach(x => { x.textContent = items[n].title; });
    clearTimeout(liveT); liveT = setTimeout(() => { live.textContent = `${items[n].title}, ${n + 1} of ${N}`; }, 350);
    updateCursor();
  }
  el.querySelectorAll('[data-disc-total]').forEach(x => { x.textContent = String(N).padStart(2, '0'); });

  /* ---- layout (one call per frame) ---- */
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function touchOffset(m, out) {
    const a = Math.min(Math.abs(m), 2.5);
    return out.set(m * w.touchGap, -a * w.touchDropY, -a * w.touchDepth);
  }
  function touchLocal(m) { touchOffset(m, tmpV); tmpQ.copy(root.quaternion).invert(); return tmpV.applyQuaternion(tmpQ); }

  function layout(dt, instant = false) {
    const front = settled();
    root.rotation.set(w.galleryRotX * DEG, w.galleryRotY * DEG, 0);
    root.scale.setScalar(w.galleryScale);
    const moving = !reduced && !flight;
    const lean = moving ? clamp(Math.sign(flow) * Math.sqrt(Math.abs(flow)) * w.flowLean, -w.flowLeanMax, w.flowLeanMax) : 0;
    const dip = moving ? Math.min(w.flowDipMax, Math.abs(flow) * w.flowDip) : 0;
    const follow = dragging ? w.followTight : w.followBase;
    const touch = isTouchLayout();
    const activeScale = touch ? Math.max(.5, w.touchActiveScale) : 1;
    const inactive = touch ? clamp(w.touchInactiveScale, .2, 1) : w.inactiveScale;
    let residual = 0;
    discs.forEach((d, i) => {
      const m = i - L, h = Math.abs(m), isFront = i === front, ang = m * .35;
      const depth = Math.max(P.discThickness * 3, .12, w.depthGap);
      let x = Math.sin(ang) * w.hGap * 2.4;
      let y = (isFront ? w.activeDiscY : 0) - dip * (isFront ? .7 : 1);
      let z = -Math.cos(ang) * depth * 2.4 + depth * 2.4;
      if (touch) { const o = touchLocal(m); x = o.x; y += o.y; z = o.z; }
      let rx = 0, ry = -ang + lean * (isFront ? 1 : 1.12);
      if (touch) ry = clamp(-m, 0, 1) * -2 * (w.galleryRotY * DEG) + lean * (isFront ? 1 : 1.12);
      const rz = -lean * w.flowBank * (isFront ? .7 : 1);
      const base = isFront ? activeScale : Math.max(inactive, 1 - h * (1 - inactive) * (touch ? 1 : .6));
      let scale, visible = true;
      if (isFront) scale = base * G.active;
      else {
        const others = clamp(G.others, 0, 2), inbound = G.inbound;
        const stag = clamp(inbound ? w.flightStaggerIn : w.flightStagger, 0, .9), cap = Math.max(1, Math.round(w.flightStaggerMax));
        const delay = Math.min(h, cap) / cap * stag, span = Math.max(.1, 1 - stag);
        const p = clamp((Math.min(1, others) - delay) / span, 0, 1);
        const s = (inbound ? Ease.glide(p) : p * (2 - p)) + Math.max(0, others - 1);
        visible = s > clamp(inbound ? w.flightPopScaleIn : w.flightPopScale, 0, .9);
        scale = base * s;
        const rec = 1 - Math.min(1, s); if (rec > 1e-4) z -= rec * w.flightRecede;
      }
      d.group.visible = visible;
      // hover tilt toward the pointer
      const want = +(hoverIdx === i && spinDisc < 0);
      d.hover += (want - d.hover) * Math.min(1, dt * 10);
      if (d.hover > .001) { rx += d.hover * w.hoverTiltStrength * ptrY; ry += d.hover * w.hoverTiltStrength * ptrX; }
      const k = clamp(follow - h * w.followFalloff, w.followMin, w.followTight);
      const A = instant || reduced || flight ? 1 : Math.min(1, dt * k);
      // push / press springs
      if (flight) { d.pushX = d.pushY = d.pushZ = d.pushVX = d.pushVY = d.pushVZ = d.pushRotX = d.pushRotY = d.pushRotVX = d.pushRotVY = 0; }
      else {
        const e = Math.abs(d.pushX) + Math.abs(d.pushY) + Math.abs(d.pushZ) + Math.abs(d.pushVX) + Math.abs(d.pushVY) + Math.abs(d.pushVZ) + Math.abs(d.pushRotX) + Math.abs(d.pushRotY) + Math.abs(d.pushRotVX) + Math.abs(d.pushRotVY);
        if (e > 8e-4) {
          const damp = Math.exp(-w.pushDamping * dt), ret = Math.min(1, dt * w.pushReturn);
          d.pushX += d.pushVX * dt; d.pushVX *= damp; d.pushY += d.pushVY * dt; d.pushVY *= damp; d.pushZ += d.pushVZ * dt; d.pushVZ *= damp;
          d.pushRotX += d.pushRotVX * dt; d.pushRotVX *= damp; d.pushRotY += d.pushRotVY * dt; d.pushRotVY *= damp;
          d.pushX -= d.pushX * ret; d.pushY -= d.pushY * ret; d.pushZ -= d.pushZ * ret; d.pushRotX -= d.pushRotX * ret; d.pushRotY -= d.pushRotY * ret;
          x += d.pushX; y += d.pushY; z += d.pushZ; residual += e;
        } else if (e > 0) { d.pushX = d.pushY = d.pushZ = d.pushVX = d.pushVY = d.pushVZ = d.pushRotX = d.pushRotY = d.pushRotVX = d.pushRotVY = 0; }
      }
      const g = d.group;
      if (instant) { g.position.set(x, y, z); g.rotation.set(rx, ry, rz); g.scale.setScalar(scale); }
      else {
        g.position.x += (x - g.position.x) * A; g.position.y += (y - g.position.y) * A; g.position.z += (z - g.position.z) * A;
        g.scale.setScalar(g.scale.x + (scale - g.scale.x) * A);
        g.rotation.x += (rx - g.rotation.x) * A; g.rotation.y += (ry - g.rotation.y) * A; g.rotation.z += (rz - g.rotation.z) * A;
      }
      if (spinDisc !== i && !d.resetTween) d.spinX += (0 - d.spinX) * Math.min(1, dt * 2.5);
      d.spin.rotation.x = d.spinX + d.pushRotX; d.spin.rotation.y = d.spinY + d.pushRotY;
      g.renderOrder = Math.round(500 + g.position.z * 10 - i * .01);
      residual += Math.abs(x - g.position.x) + Math.abs(y - g.position.y) + Math.abs(z - g.position.z) + Math.abs(scale - g.scale.x)
        + Math.abs(rx - g.rotation.x) + Math.abs(ry - g.rotation.y) + Math.abs(rz - g.rotation.z) + Math.abs(want - d.hover);
      if (spinDisc !== i) residual += Math.abs(d.spinX);
      if (d.resetTween) residual += 1;
    });
    return residual;
  }

  /* ---- hover scribble ---- */
  const SEG = w.scribblePoints * 3;
  const scrib = new THREE.Group(), scribGeo = [];
  const scribMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(el.dataset.discScribbleColor || w.scribbleColor), side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  for (let k = 0; k < w.scribbleLoops; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx = []; for (let s = 0; s < SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); scribGeo.push(g);
    const m = new THREE.Mesh(g, scribMat); m.renderOrder = 900; m.frustumCulled = false; scrib.add(m);
  }
  scrib.visible = false; root.add(scrib);
  const jit = new Float32Array(w.scribblePoints + 1);
  function drawLoop(k, phase) {
    const g = scribGeo[k], p = g.getAttribute('position');
    const R = 1 + w.scribblePadding + k * w.scribbleLoopGap, half = w.scribbleWidth * .5;
    const sweep = clamp(w.scribbleSweep * (1 + (Math.random() - .5) * w.scribbleSweepJitter), .12, 1) * phase;
    const arc = Math.PI * 2 * sweep, start = Math.random() * Math.PI * 2;
    for (let q = 0; q < jit.length; q++) jit[q] = 1 + (Math.random() - .5) * 2 * w.scribbleJitter;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG, a = start + t * arc, u = t * w.scribblePoints * sweep, i0 = Math.floor(u), i1 = Math.min(w.scribblePoints, i0 + 1);
      const f = u - i0, sm = f * f * (3 - 2 * f), j = jit[i0] * (1 - sm) + jit[i1] * sm;
      const taper = Math.min(1, Math.min(t, 1 - t) * 14 + .15), r0 = R * j - half * taper, r1 = R * j + half * taper;
      const c = Math.cos(a), sn = Math.sin(a);
      p.setXYZ(s * 2, c * r0, sn * r0, 0); p.setXYZ(s * 2 + 1, c * r1, sn * r1, 0);
    }
    p.needsUpdate = true;
  }
  let scribDirty = false, scribPhase = 'hidden', scribStep = 0, scribT = 0, scribIdx = -1, scribDt = .016, scribTimer = 0, motionTimer = 0;
  const scribbleTarget = () => ((hoverIdx >= 0 && hoverIdx === active) || keyFocus) && items[active]?.url ? active : -1;
  const isMoving = () => dragging || dragVel !== 0 || tw.isTweening(pos) || Math.abs(L - Math.round(L)) > .0015;
  function followScrib(d, snap) {
    if (snap) { scrib.position.copy(d.group.position); scrib.quaternion.copy(d.group.quaternion); scrib.scale.copy(d.group.scale); return; }
    const k = 1 - Math.exp(-Math.max(0, w.scribbleLag) * scribDt);
    scrib.position.lerp(d.group.position, k); scrib.quaternion.slerp(d.group.quaternion, k); scrib.scale.lerp(d.group.scale, k);
  }
  function scribble(now, dt) {
    scribDt = dt || .016;
    const tgt = scribbleTarget(), frame = 1000 / w.scribbleFps;
    if (tgt < 0) {
      if (scribPhase === 'hidden') return;
      if (scribPhase !== 'out') { scribPhase = 'out'; scribStep = 0; scribT = now; }
      const d = discs[scribIdx]; if (d) followScrib(d, isMoving());
      if (now - scribT < frame) return;
      scribT = now;
      if (scribStep >= w.scribbleOut.length || !d) { scribPhase = 'hidden'; scribIdx = -1; scrib.visible = false; scribDirty = true; return; }
      for (let k = 0; k < w.scribbleLoops; k++) drawLoop(k, w.scribbleOut[scribStep]);
      scribStep++; scribDirty = true; wake(0); return;
    }
    const d = discs[tgt];
    if (scribPhase === 'hidden' || scribIdx !== tgt) {
      scribPhase = 'in'; scribStep = 0; scribIdx = tgt; scribT = now; followScrib(d, true);
      for (let k = 0; k < w.scribbleLoops; k++) drawLoop(k, w.scribbleIn[0]);
      scribStep = 1; scrib.visible = true; scribDirty = true; wake(0); return;
    }
    followScrib(d, isMoving());
    if (reduced || now - scribT < frame) return;
    scribT = now;
    if (scribPhase === 'in' && scribStep < w.scribbleIn.length) { for (let k = 0; k < w.scribbleLoops; k++) drawLoop(k, w.scribbleIn[scribStep]); scribStep++; }
    else { scribPhase = 'on'; for (let k = 0; k < w.scribbleLoops; k++) drawLoop(k, 1); }
    scribDirty = true;
  }
  const scribbleLive = () => scribPhase !== 'hidden';

  /* ---- frame loop ---- */
  function wake(n = 2) { forceFrames = Math.max(forceFrames, n); if (!raf && ready && inView && !document.hidden) { lastFrame = performance.now(); renderedLast = false; raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    if (!inView || document.hidden) return;
    const real = (now - lastFrame) / 1000, dt = Math.min(.05, real); lastFrame = now;
    const f60 = Math.min(3, dt * 60);
    tw.update(now);
    if (ptrDirty) {
      ptrDirty = false;
      const h = ptrOver ? pickDisc() : -1;
      if (h !== hoverIdx) { if (h >= 0 && !down && !flight) wipe(h); hoverIdx = h; updateCursor(); forceFrames = Math.max(forceFrames, 2); }
    }
    scribble(now, dt);
    if (!dragging) {
      if (Math.abs(dragVel) > 1e-5) { L += dragVel * f60; dragVel *= reduced ? 0 : w.friction ** f60; if (Math.abs(dragVel) < 4e-4) dragVel = 0; }
      if (dragVel === 0 && !tw.isTweening(pos)) {
        const goal = Math.round(L), diff = goal - L;
        if (reduced) { L += diff * Math.min(1, dt * 20); springVel = 0; if (Math.abs(goal - L) < .001) L = goal; }
        else if (diff !== 0 || Math.abs(springVel) > 1e-5) {
          springVel += diff * w.snapFreq * w.snapFreq * dt; springVel *= Math.exp(-w.snapDamping * dt); L += springVel * dt;
          if (Math.abs(goal - L) < 8e-4 && Math.abs(springVel) < .004) { L = goal; springVel = 0; }
        }
      }
    }
    L = clamp(L, -.05, N - .95);
    if (reduced || flight) { flow = 0; prevL = L; }
    else {
      const v = clamp((L - prevL) / Math.max(dt, .001), -40, 40); prevL = L;
      flow += (v - flow) * Math.min(1, dt * (Math.abs(v) > Math.abs(flow) ? 14 : 6));
      if (Math.abs(flow) < .01) flow = 0;
    }
    if (!tw.isTweening(pos)) setActive(settled());
    const residual = layout(dt);
    const moving = dragging || down || dragVel !== 0 || springVel !== 0 || flow !== 0 || tw.busy || residual > .001;
    const mo = tickMotion(now);
    const draw = moving || forceFrames > 0 || scribDirty || mo;
    const busy = moving || forceFrames > 1;
    forceFrames = Math.max(0, forceFrames - 1); scribDirty = false;
    if (draw) { renderer.render(scene, camera); }
    sampleFrame(real, moving);
    if (busy) { renderedLast = true; raf = requestAnimationFrame(frame); return; }
    renderedLast = false;
    if (pin && !flight && !down && inPinZone() && indexFromScroll() !== active) syncScroll(active);
    // idle hover: wake only when the next scribble frame is due (10 fps), one render per frame
    if (scribbleLive()) { clearTimeout(scribTimer); scribTimer = setTimeout(() => wake(0), Math.max(16, 1000 / w.scribbleFps - (performance.now() - scribT) + 2)); }
    // moving covers (GIF / video): wake for their next frame only
    if (hasMotion()) { clearTimeout(motionTimer); motionTimer = setTimeout(() => wake(0), 1000 / MOTION_FPS); }
    forceFrames = 0;
  }

  /* ---- adaptive render scale ----
     Frames are sampled only during continuous motion. If 30 of them average
     over 26.5ms the canvas renders at a lower scale (100 → 85 → 70 → 55%).
     The pixel count is also capped at 12 MP. */
  const TIERS = [1, .85, .7, .55];
  let tier = 0, sampleSum = 0, sampleN = 0, renderedLast = false, lastDPR = devicePixelRatio || 1, lastArea = 0;
  function pixelRatio(W, H) {
    let r = Math.min(devicePixelRatio || 1, W <= 767 ? 1.5 : 2);
    if (W * H * r * r > 12e6) r = Math.sqrt(12e6 / (W * H));
    return r * TIERS[tier];
  }
  function sampleFrame(real, moving) {
    if (!moving || !renderedLast || flight || real > .08) { return; }
    sampleSum += real; sampleN++;
    if (sampleN < 30) return;
    const avg = sampleSum / sampleN; sampleSum = 0; sampleN = 0;
    if (avg > .0265 && tier < TIERS.length - 1) {
      tier = Math.min(TIERS.length - 1, tier + (avg > .045 ? 2 : 1));
      const W = Math.max(1, mount.clientWidth), H = Math.max(1, mount.clientHeight);
      renderer.setPixelRatio(pixelRatio(W, H)); renderer.setSize(W, H, false);
    }
  }

  /* ---- sizing ---- */
  const proj = new THREE.Vector3();
  const peekX = (scale, m) => { touchOffset(m, proj).multiplyScalar(scale); proj.project(camera); return proj.x; };
  const peek = s => Math.max(Math.abs(peekX(s, 1)), Math.abs(peekX(s, -1)));
  function fitTouch() {
    camera.updateMatrixWorld();
    if (!isTouchLayout()) { w.galleryScale = baseScale; touchSpan = 0; return; }
    const want = Math.max(.6, w.touchPeek);
    let lo = baseScale * clamp(w.touchMinScale, .1, 1), hi = baseScale * Math.max(1, w.touchMaxScale), s;
    if (peek(lo) > want) s = lo; else if (peek(hi) < want) s = hi;
    else { for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; peek(mid) > want ? (hi = mid) : (lo = mid); } s = (lo + hi) / 2; }
    proj.set(0, Math.max(.5, w.touchActiveScale) * s, 0).project(camera);
    const cap = clamp(w.touchLeadMaxHeight || 1, .2, 1); if (proj.y > cap) s *= cap / proj.y;
    w.galleryScale = s;
    const avg = (Math.abs(peekX(s, 1)) + Math.abs(peekX(s, -1))) / 2;
    touchSpan = avg > .05 ? clamp(2 / avg, 1, 4) : 0;
  }
  function resize() {
    const W = Math.max(1, mount.clientWidth), H = Math.max(1, mount.clientHeight), dpr = devicePixelRatio || 1;
    // a new screen or a big size change gets a fresh chance at full resolution
    if (dpr !== lastDPR || (lastArea && Math.abs(W * H - lastArea) > lastArea * .2)) { tier = 0; sampleSum = sampleN = 0; }
    lastDPR = dpr; lastArea = W * H; rect = null;
    renderer.setPixelRatio(pixelRatio(W, H));
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    fitTouch(); wake(3);
    if (pin && ready && !flight && inPinZone()) syncScroll(active);
  }
  new ResizeObserver(resize).observe(mount);
  touchMQ.addEventListener('change', () => { fitTouch(); wake(2); });

  /* ---- pointer interactions ---- */
  function wipe(i) {
    if (reduced) return;
    const d = discs[i]; if (!d || Math.hypot(mvx, mvy) < w.wipeMinSpeed) return;
    d.pushVX += clamp(mvx * w.wipePush, -w.wipePushMax, w.wipePushMax);
    d.pushVY -= clamp(mvy * w.wipePush, -w.wipePushMax, w.wipePushMax);
    d.pushRotVY += clamp(mvx * w.wipeSpin, -w.wipeSpinMax, w.wipeSpinMax);
    d.pushRotVX += clamp(mvy * w.wipeSpin, -w.wipeSpinMax, w.wipeSpinMax);
    wake();
  }
  function press(i) {
    if (reduced) return;
    const d = discs[i]; if (!d) return;
    d.pushVZ -= w.pressDepth; d.pushRotVY += hitUV.x * w.pressTilt; d.pushRotVX -= hitUV.y * w.pressTilt; wake();
  }
  function rubber(cur, delta) {
    const max = w.maxSpinAngle * DEG, over = Math.max(0, Math.abs(cur) - max * .8) / max, k = 1 / (1 + over * over * 14);
    return cur + delta * (Math.sign(delta) === Math.sign(cur) || cur === 0 ? k : 1);
  }
  function resetSpin(i) {
    const d = discs[i]; if (!d || (Math.abs(d.spinX) < .001 && Math.abs(d.spinY) < .001)) return;
    d.resetTween?.kill();
    d.resetTween = tw.to(d, { spinX: 0, spinY: 0 }, { duration: reduced ? .15 : w.resetDuration, ease: Ease.p3out, onComplete: () => { d.resetTween = null; } });
    wake();
  }
  function flip(i) {
    const d = discs[i]; if (!d) return;
    d.resetTween?.kill();
    const showingBack = Math.abs(d.spinY) > Math.PI / 2;
    d.resetTween = tw.to(d, { spinY: showingBack ? 0 : Math.PI, spinX: 0 }, { duration: reduced ? .15 : .75, ease: Ease.p3inOut, onComplete: () => { d.resetTween = null; } });
    wake();
  }
  function updateCursor() {
    if (down && dragging) { el.dataset.cursor = 'hidden'; return; }
    el.dataset.cursor = hoverIdx >= 0 && hoverIdx === active && !flight ? 'arrow' : '';
  }
  const NO_DRAG = 'a,button,input,textarea,select,label,[data-disc-no-drag]';
  function onDown(e) {
    if (flight || e.button !== 0 || !e.isPrimary || e.target.closest(NO_DRAG)) return;
    const p = setPointer(e);
    down = true; downId = e.pointerId; dragging = false; isTouch = e.pointerType !== 'mouse';
    downX = lastX = p.x; downY = lastY = p.y; lastT = performance.now(); downDisc = -1;
    const n = pickDisc();
    if (n >= 0 && Math.abs(n - L) < .6) downDisc = n;
    hoverIdx = n; ptrX = ndc.x; ptrY = ndc.y;
    addEventListener('pointermove', onDragMove, { passive: false });
    addEventListener('pointerup', onUp); addEventListener('pointercancel', onCancel);
    wake();
  }
  function startDrag(e) {
    dragging = true; tw.killOf(pos); pos.value = L; dragVel = 0; springVel = 0; spinDisc = downDisc;
    el.setAttribute('data-disc-dragging', 'true'); el.style.userSelect = 'none'; getSelection()?.removeAllRanges();
    if (spinDisc >= 0) { discs[spinDisc].resetTween?.kill(); discs[spinDisc].resetTween = null; }
    try { el.setPointerCapture(e.pointerId); } catch {}
    updateCursor(); wake();
  }
  function onDragMove(e) {
    if (!down || e.pointerId !== downId) return;
    const p = setPointer(e); ptrX = ndc.x; ptrY = ndc.y;
    if (!dragging) {
      const dx = p.x - downX, dy = p.y - downY;
      if (Math.hypot(dx, dy) < w.dragStartDistance) return;
      if (isTouch) {
        if (Math.abs(dy) > Math.abs(dx)) { endDrag(true, true); return; } // vertical swipe: let the page scroll
        downDisc = -1;
      }
      startDrag(e);
    }
    if (e.cancelable) e.preventDefault();
    const now = performance.now(), dx = p.x - lastX, dy = p.y - lastY, dtm = Math.max(8, now - lastT);
    lastX = p.x; lastY = p.y; lastT = now; wake();
    if (spinDisc >= 0) {
      const d = discs[spinDisc], k = w.dragSensitivity * .0045;
      d.spinY = rubber(d.spinY, dx * k); d.spinX = rubber(d.spinX, dy * k); return;
    }
    const span = isTouch ? (touchSpan || 1.8) : 6 * w.dragSensitivity;
    const step = -(dx / p.rect.width) * span;
    L = clamp(L + step, 0, N - 1);
    const v = clamp(16.667 / dtm * step, -w.dragMaxVelocity, w.dragMaxVelocity);
    dragVel += (v - dragVel) * w.dragVelocitySmoothing;
  }
  function endDrag(cancel, quiet = false) {
    if (!down) return;
    const was = dragging, spun = spinDisc;
    down = false; downId = -1; dragging = false; spinDisc = -1; downDisc = -1;
    removeEventListener('pointermove', onDragMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onCancel);
    el.removeAttribute('data-disc-dragging'); el.style.userSelect = '';
    updateCursor(); wake();
    if (!was || quiet) return;
    suppressClickUntil = performance.now() + 140;
    if (spun >= 0) { resetSpin(spun); dragVel = 0; return; }
    if (cancel) { dragVel = 0; goTo(Math.round(L)); return; }
    if (isTouch) {
      const dir = Math.abs(dragVel) >= w.touchFlickVelocity ? Math.sign(dragVel) : 0;
      const to = dir > 0 ? Math.floor(L) + 1 : dir < 0 ? Math.ceil(L) - 1 : Math.round(L);
      dragVel = 0; goTo(clamp(to, 0, N - 1), { source: 'flick', immediate: reduced }); return;
    }
    // mouse: glide with inertia, then the snap spring settles (page scroll is re-synced once at rest)
  }
  const onUp = () => endDrag(false), onCancel = () => endDrag(true);
  function onHoverMove(e) {
    ptrOver = true; setPointer(e);
    const now = performance.now(), gap = now - lastMoveT; lastMoveT = now;
    if (gap < 120) { const k = 16.7 / Math.max(8, gap); mvx = (e.clientX - lastMX) * k; mvy = (e.clientY - lastMY) * k; } else { mvx = mvy = 0; }
    lastMX = e.clientX; lastMY = e.clientY;
    keyFocus = false;
    if (!down) { ptrX = ndc.x; ptrY = ndc.y; }
    // resolve hover now so the custom cursor updates on this same move
    const h = pickDisc();
    if (h !== hoverIdx) { if (h >= 0 && !down && !flight) wipe(h); hoverIdx = h; updateCursor(); }
    ptrDirty = false; wake();
  }
  function onClick(e) {
    if (flight || performance.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest('a,button,[data-disc-no-open]')) return;
    setPointer(e);
    const n = pickDisc(); if (n < 0) return;
    e.preventDefault();
    if (n !== active) { press(n); goTo(n, { source: 'click' }); return; }
    open(e);
  }

  /* ---- open the front disc: press, spring, turn edge-on, navigate ---- */
  function open(e) {
    const it = items[active]; if (!it?.url) return;
    if (e && (e.metaKey || e.ctrlKey)) { window.open(it.url, '_blank', 'noopener'); return; }
    if (e?.type === 'click') press(active);
    endDrag(true, true); tw.killOf(pos); tw.killOf(G); dragVel = springVel = flow = 0;
    flight = true; G.inbound = false; hoverIdx = -1; keyFocus = false; updateCursor();
    el.setAttribute('data-disc-flight', 'true');
    const go = () => { location.href = it.url; };
    if (reduced) { go(); return; }
    const d = discs[active];
    d.resetTween?.kill(); d.resetTween = null;
    const settle = Math.abs(L - active) < .002 ? 0 : clamp(.12 + Math.abs(L - active) * .25, .12, .4);
    if (settle) { pos.value = L; tw.to(pos, { value: active }, { duration: settle, ease: Ease.p2out, onUpdate: () => { L = pos.value; } }); } else L = active;
    const t0 = settle * .6, pressT = .12, springT = .16, out = .55;
    tw.to(G, { active: .94 }, { duration: pressT, ease: Ease.p2out, delay: t0 });
    setTimeout(() => {
      tw.to(G, { active: 1.015 }, { duration: springT, ease: Ease.p2out });
      tw.to(G, { others: 0 }, { duration: out, ease: Ease.none });
      setTimeout(() => {
        tw.to(G, { active: .001 }, { duration: out, ease: Ease.p2in });
        const turns = Math.ceil((d.spinY + Math.PI / 2 - Math.PI / 2) / Math.PI - 1e-6);
        tw.to(d, { spinY: Math.PI / 2 + turns * Math.PI, spinX: 0 }, { duration: out, ease: Ease.p2in });
        wake(3);
      }, springT * 1000);
      wake(3);
    }, (t0 + pressT) * 1000);
    setTimeout(go, (t0 + pressT + Math.min(out, springT + out)) * 1000);
    wake(3);
  }
  // Coming back with the browser's back button restores a frozen page; reset it.
  addEventListener('pageshow', ev => { if (ev.persisted && flight && ready) { flight = false; G.others = 1; G.active = 1; discs.forEach(d => { d.spinY = 0; d.spinX = 0; }); el.removeAttribute('data-disc-flight'); wake(3); } });

  /* ---- wheel: one disc per scroll gesture (reference heuristics) ---- */
  let fresh = true, rising = false, acc = 0, accDir = 0, env = 0, peak = 0, ticks = 0, lastStepT = 0, lastWheelT = 0, wheelSeen = false, idleT = 0, passGesture = false;
  function wheelReset() { fresh = true; rising = false; acc = 0; accDir = 0; env = 0; peak = 0; ticks = 0; lastStepT = 0; lastWheelT = 0; wheelSeen = false; passGesture = false; }
  function dominant(e) {
    let x = e.deltaX, y = e.deltaY;
    if (e.deltaMode === 1) { x *= 16; y *= 16; } else if (e.deltaMode === 2) { x *= innerWidth; y *= innerHeight; }
    return Math.abs(x) > Math.abs(y) * 1.25 ? x : y;
  }
  function onWheel(e) {
    if (e.ctrlKey || flight || !inPinZone()) return;
    const d = dominant(e), mag = Math.abs(d), dir = d > 0 ? 1 : -1;
    const now = performance.now(), gap = wheelSeen ? now - lastWheelT : Infinity;
    lastWheelT = now; wheelSeen = true;
    clearTimeout(idleT); idleT = setTimeout(wheelReset, w.wheelIdleReset);
    if (passGesture) return;                 // this gesture already handed over to the page
    const cur = headingTo();
    const atEdge = (dir > 0 && cur >= N - 1) || (dir < 0 && cur <= 0);
    if (atEdge && fresh) { passGesture = true; return; }   // new gesture past the ends: scroll the page
    e.preventDefault(); e.stopPropagation();
    const decay = gap === Infinity ? 0 : Math.exp(-gap / w.wheelEnvelopeTau), prev = env * decay;
    if (mag < w.wheelNoiseFloor) { env = prev; return; }
    const rise = mag > prev * w.wheelRiseFactor;
    env = Math.max(mag, prev);
    if (!fresh) {
      ticks++; peak = Math.max(peak, mag);
      const since = now - lastStepT;
      const paused = gap >= w.wheelPauseGap;
      const tick = gap >= w.wheelTickGap && ticks <= 2 && since >= w.wheelMinStepTick && mag >= peak * w.wheelTickRatio;
      const flick = rise && since >= w.wheelMinStepFlick;
      const sustain = since >= w.wheelSustainDelay && env >= peak * w.wheelSustainRatio;
      if (!(paused || tick || flick || sustain)) return;
      fresh = true; acc = 0; accDir = 0; rising = !(paused || tick || sustain);
    }
    if (dir !== accDir) { acc = 0; accDir = dir; }
    acc += Math.min(rising ? Math.max(0, mag - prev) : mag, w.wheelEventCap);
    if (acc < w.wheelStepThreshold) return;
    if (atEdge) { passGesture = true; return; }
    fresh = false; rising = false; acc = 0; lastStepT = now; ticks = 0; peak = mag;
    goTo(clamp(cur + dir, 0, N - 1), { source: 'wheel' });
  }

  /* ---- keyboard ---- */
  function onKey(e) {
    if (flight || e.defaultPrevented || e.altKey) return;
    const a = document.activeElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName) || a?.isContentEditable) return;
    const focused = el.contains(a);
    if (!focused && (!ptrOver || (a && a !== document.body))) return;
    if ((e.metaKey || e.ctrlKey) && e.key !== 'Enter') return;
    if (e.key === 'Enter') { if (focused) { e.preventDefault(); open(e); } return; }
    if (e.key === ' ' || e.key === 'Spacebar') { if (focused) { e.preventDefault(); flip(active); } return; }
    let to = null;
    if (e.key === 'ArrowRight') to = headingTo() + 1; else if (e.key === 'ArrowLeft') to = headingTo() - 1;
    else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = N - 1; else return;
    e.preventDefault(); keyFocus = true; goTo(to, { source: 'key' });
  }

  el.style.cursor = 'grab';
  el.setAttribute('role', 'group'); el.setAttribute('aria-roledescription', 'carousel');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Featured projects');
  el.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End Enter Space');
  el.addEventListener('pointerdown', onDown, { capture: true });
  el.addEventListener('pointermove', onHoverMove, { passive: true });
  el.addEventListener('pointerleave', () => { ptrOver = false; if (!down) { hoverIdx = -1; updateCursor(); wake(); } });
  el.addEventListener('click', onClick, { capture: true });
  el.addEventListener('wheel', onWheel, { passive: false, capture: true });
  el.addEventListener('focus', () => wake());
  addEventListener('keydown', onKey);
  addEventListener('blur', () => { endDrag(true); keyFocus = false; wheelReset(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(3); });
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; }, false);
  new IntersectionObserver(es => { const v = es.some(x => x.isIntersecting); if (v !== inView) { inView = v; if (v) wake(3); } }, { rootMargin: '200px 0px' }).observe(el);

  // which project's disc is under a point (the Site Editor's canvas asks this; -1 = none)
  el.discAt = (x, y) => { rect = null; setPointer({ clientX: x, clientY: y }); const n = pickDisc(); return n >= 0 ? items[n].index : -1; };

  /* ---- start: wait for the front covers, then fly the discs in ---- */
  resize();
  const start = pin ? indexFromScroll() : 0;
  L = prevL = pos.value = target = start; setActive(start);
  layout(1, true);
  try { await Promise.race([Promise.all(items.slice(0, 3).map(it => artTexture(sh, it))), new Promise(r => setTimeout(r, 900))]); } catch {}
  if (renderer.compileAsync) { try { await Promise.race([renderer.compileAsync(scene, camera), new Promise(r => setTimeout(r, 1500))]); } catch {} }
  ready = true;
  el.setAttribute('data-disc-ready', 'true');
  document.dispatchEvent(new Event('discs:ready'));
  // [data-disc-wait]: hold the fly-in until the page says go (homepage intro, assets/js/intro.js)
  if (el.hasAttribute('data-disc-wait') && !window.__discGo) await new Promise(r => document.addEventListener('discs:go', r, { once: true }));
  if (reduced) { G.others = 1; G.active = 1; flight = false; el.removeAttribute('data-disc-flight'); layout(1, true); wake(3); return; }
  el.setAttribute('data-disc-flight', 'true');
  const inT = 1.05;
  tw.to(G, { active: 1 }, { duration: inT, ease: Ease.glide });
  tw.to(G, { others: 1 }, { duration: inT * .85, ease: Ease.none, delay: inT * .1, onComplete: () => { G.others = 1; G.active = 1; } });
  setTimeout(() => {
    flight = false; el.removeAttribute('data-disc-flight'); updateCursor();
    if (pin) { const i = indexFromScroll(); if (i !== headingTo()) goTo(i, { source: 'wheel', fromScroll: true }); }
    wake(2);
  }, inT * 900);
  wake(3);
}

/* ==========================================================================
   FLAT FIELD — Portfolio canvas
   Every `.wcard` is a transparent, circular hit area; the discs are drawn on
   one WebGL layer that tracks each card's on-screen box every frame.
   ========================================================================== */
async function initField(el) {
  const mount = el.querySelector('[data-disc-layer]') || el;
  const items = siteItems();
  const FOV = 30;
  const stage = makeStage(mount, { fov: FOV, distance: 10 });
  const { renderer, scene, camera } = stage;
  scene.fog = null;
  // A face-on disc would mirror the dark middle of the environment. Turn the
  // reflections + lights so a flat disc catches the same highlights as the
  // hero's front disc (viewed at -30° / -30°).
  const heroNormal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(P.galleryRotX * DEG, P.galleryRotY * DEG, 0));
  const heroReflect = new THREE.Vector3(0, 0, -1).reflect(heroNormal).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(heroReflect, new THREE.Vector3(0, 0, 1));
  scene.environmentRotation = new THREE.Euler().setFromQuaternion(turn);
  // lights keep the same angle to the disc face as in the hero
  const turnLights = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.galleryRotX * DEG, P.galleryRotY * DEG, 0)).invert();
  const sh = await getShared(renderer);
  const tw = new Tweens();
  let W = 1, H = 1, raf = 0, last = performance.now(), dirty = 3, motionTimer = 0;
  const pool = new Map();       // card element → disc
  const reduced = REDUCED;

  function resize() {
    W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, W <= 767 ? 1.5 : 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.fov = FOV;
    // 1 world unit = 1 CSS pixel on the z = 0 plane
    const dist = (H / 2) / Math.tan(FOV / 2 * DEG);
    camera.position.set(0, 0, dist); camera.near = dist / 20; camera.far = dist * 4;
    camera.updateProjectionMatrix(); camera.lookAt(0, 0, 0);
    // lights sit at the same relative spots as in the hero rig, scaled to pixel space
    const k = dist / P.cameraDistance;
    stage.key.position.set(P.keyX, P.keyY, 6).applyQuaternion(turnLights).multiplyScalar(k);
    stage.fill.position.set(-5, -2, 4).applyQuaternion(turnLights).multiplyScalar(k);
    stage.rim.position.set(0, 3, -6).applyQuaternion(turnLights).multiplyScalar(k);
    stage.strip.position.set(0, 3.2, 3).applyQuaternion(turnLights).multiplyScalar(k);
    stage.strip.width = 6 * k; stage.strip.height = .4 * k; stage.strip.lookAt(0, 0, 0);
    dirty = 3; wake();
  }

  function discFor(card) {
    let d = pool.get(card);
    if (d) return d;
    d = makeDisc(sh); d.tilt = { x: 0, y: 0 }; d.target = { x: 0, y: 0 }; d.hoverGoal = 0; d.lift = 0;
    const idx = +card.dataset.discIndex || 0, it = items[idx];
    if (it) artTexture(sh, it).then(t => { d.frontMat.map = t; d.frontMat.needsUpdate = true; dirty = 2; wake(); });
    scene.add(d.group); pool.set(card, d);
    card.addEventListener('pointerenter', () => { d.hoverGoal = 1; wake(); });
    card.addEventListener('pointerleave', () => { d.hoverGoal = 0; d.target.x = d.target.y = 0; wake(); });
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      d.target.x = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      d.target.y = clamp(-(e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
      wake();
    });
    return d;
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    tw.update(now);
    let moving = 0;
    const seen = new Set();
    el.querySelectorAll('.wcard').forEach(card => {
      const item = card.closest('.item'); const d = discFor(card); seen.add(card);
      const r = card.getBoundingClientRect();
      const vis = item && item.style.opacity !== '0' && r.right > -200 && r.left < W + 200 && r.bottom > -200 && r.top < H + 200;
      d.group.visible = !!vis;
      if (!vis) return;
      const cx = r.left + r.width / 2 - W / 2, cy = H / 2 - (r.top + r.height / 2), rad = r.width / 2;
      const g = d.group;
      if (Math.abs(g.position.x - cx) + Math.abs(g.position.y - cy) > .01) moving++;
      g.position.set(cx, cy, 0);
      // hover: ease in, tilt the face toward the pointer, lift slightly
      const k = Math.min(1, dt * 10);
      d.hover += (d.hoverGoal - d.hover) * (reduced ? 1 : k);
      d.tilt.x += (d.target.x - d.tilt.x) * (reduced ? 1 : Math.min(1, dt * 8));
      d.tilt.y += (d.target.y - d.tilt.y) * (reduced ? 1 : Math.min(1, dt * 8));
      // a small turn up-and-left (the hero's viewing angle) plus a lean toward the pointer
      const base = .14, follow = .2;                       // radians
      const ry = d.hover * (-base + d.tilt.x * follow) * (reduced ? 0 : 1);
      const rx = d.hover * (-base - d.tilt.y * follow) * (reduced ? 0 : 1);
      g.rotation.set(rx, ry, 0);
      g.scale.setScalar(rad * (1 + d.hover * .03));
      g.position.z = d.hover * rad * .08;
      if (Math.abs(d.hoverGoal - d.hover) > .001 || Math.abs(d.target.x - d.tilt.x) > .001 || Math.abs(d.target.y - d.tilt.y) > .001) moving++;
    });
    pool.forEach((d, card) => { if (!seen.has(card)) { scene.remove(d.group); pool.delete(card); } });
    tickMotion(now);
    renderer.render(scene, camera);
    if (moving || dirty > 0 || tw.busy) { if (dirty > 0) dirty--; raf = requestAnimationFrame(frame); }
    else if (hasMotion() && !document.hidden) { clearTimeout(motionTimer); motionTimer = setTimeout(wake, 1000 / MOTION_FPS); }
  }
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  // the canvas script moves the cards; follow along
  ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown'].forEach(t => addEventListener(t, wake, { passive: true }));
  document.addEventListener('work:frame', wake);
  addEventListener('resize', resize);
  resize();
  if (renderer.compileAsync) { try { await Promise.race([renderer.compileAsync(scene, camera), new Promise(r => setTimeout(r, 1500))]); } catch {} }
  el.setAttribute('data-disc-ready', 'true');
  wake();
}

/* ---- boot ---- */
function boot() {
  document.querySelectorAll('[data-disc-gallery]').forEach(el => initGallery(el).catch(e => { console.error('Disc gallery failed:', e); el.setAttribute('data-disc-failed', 'true'); document.dispatchEvent(new Event('discs:failed')); }));
  document.querySelectorAll('[data-disc-field]').forEach(el => initField(el).catch(e => { console.error('Disc field failed:', e); el.setAttribute('data-disc-failed', 'true'); }));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
