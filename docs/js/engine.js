// Image engine: template mask, "wrap around the car" projection, poster / mirror / tile layouts,
// 256-colour quantisation and an indexed-PNG encoder. Pure JS, runs fully in the browser.

export const OUTLINE = [40, 28, 34];

// ---------- template ----------------------------------------------------------------------------
export function parseTemplate(imgData) {
  const { width: W, height: H, data } = imgData;
  const mask = new Uint8Array(W * H), lines = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3], l = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    if (a > 127 && l > 150) mask[i] = 1;          // white (incl. light grid lines on Cybertruck) = paintable
    else if (a > 127) lines[i] = 1;               // black template outlines (overlay only)
  }
  const inner = edt(invert(mask), W, H);          // distance of mask pixels to the outside
  const edge = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (mask[i] && inner[i] <= 2.01) edge[i] = 1;
  return { W, H, mask, lines, edge, surf: null };
}

const invert = (m) => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o; };

// Felzenszwalb & Huttenlocher exact Euclidean distance transform: distance to the nearest pixel with f=1.
export function edt(feat, W, H) {
  const INF = 1e20, n = Math.max(W, H);
  const g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = feat[i] ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      do { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) k--; else break; } while (k >= 0);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
  };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; pass(H); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; pass(W); for (let x = 0; x < W; x++) g[y * W + x] = d[x]; }
  const out = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0; const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc / k;
      acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / k;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}
function gaussian(src, W, H, sigma) {   // 3 box passes ~ gaussian
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  return boxBlur(boxBlur(boxBlur(src, W, H, r), W, H, r), W, H, r);
}

// Per sheet pixel: azimuth around the car (0 = sheet top) and height = smoothed distance from the outer
// outline of the car silhouette. Same idea as mylwrap.core.car_surface_coords.
export function surface(T) {
  if (T.surf) return T.surf;
  const { W, H, mask } = T, close = 34, P = 2 * close + 64, PW = W + 2 * P, PH = H + 2 * P;
  const m = new Uint8Array(PW * PH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[(y + P) * PW + x + P] = mask[y * W + x];
  const dOut = edt(m, PW, PH);                                      // dilate
  const dil = new Uint8Array(PW * PH); for (let i = 0; i < dil.length; i++) dil[i] = dOut[i] <= close ? 1 : 0;
  const dIn = edt(invert(dil), PW, PH);                             // erode
  const sil = new Uint8Array(PW * PH); for (let i = 0; i < sil.length; i++) sil[i] = dIn[i] > close ? 1 : 0;
  // fill holes: flood the outside from the border
  const out = new Uint8Array(PW * PH), st = [];
  for (let x = 0; x < PW; x++) { st.push(x, (PH - 1) * PW + x); }
  for (let y = 0; y < PH; y++) { st.push(y * PW, y * PW + PW - 1); }
  while (st.length) {
    const i = st.pop(); if (out[i] || sil[i]) continue; out[i] = 1;
    const x = i % PW, y = (i / PW) | 0;
    if (x > 0) st.push(i - 1); if (x < PW - 1) st.push(i + 1); if (y > 0) st.push(i - PW); if (y < PH - 1) st.push(i + PW);
  }
  const d = gaussian(edt(out, PW, PH), PW, PH, 14);
  const theta = new Float32Array(W * H), dist = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    dist[i] = d[(y + P) * PW + x + P];
    let t = Math.atan2(-(x - W / 2), -(y - H / 2)) * 180 / Math.PI; theta[i] = (t + 360) % 360;
  }
  let dmax = 1; for (let i = 0; i < W * H; i++) if (T.mask[i] && dist[i] > dmax) dmax = dist[i];
  T.surf = { theta, dist, dmax };
  return T.surf;
}

// ---------- hood + side doors -------------------------------------------------------------------
// All square templates share one layout: car front = sheet top, hood = big piece near the top centre,
// each side (doors) = pieces down the left / right edge. Cybertruck (1024x768) is laid out sideways -> null.
export function zones(T) {
  if (T.zones !== undefined) return T.zones;
  const { W, H, mask } = T;
  if (W !== H) return (T.zones = null);
  const lab = new Int32Array(W * H), comps = [], st = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    const c = { id: comps.length + 1, n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: 0, y1: 0 };
    lab[s] = c.id; st.push(s);
    while (st.length) {
      const i = st.pop(), x = i % W, y = (i / W) | 0;
      c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && mask[j] && !lab[j]) { lab[j] = c.id; st.push(j); }
    }
    c.cx = c.sx / c.n / W; c.cy = c.sy / c.n / H; comps.push(c);
  }
  const hood = comps.filter((c) => c.cx > 0.38 && c.cx < 0.62 && c.cy > 0.12 && c.cy < 0.4).sort((a, b) => b.n - a.n)[0];
  const side = (left) => {
    // door panels: on the outer edge, mid height, big and solid (the thin curved pillar strips are skipped)
    const cs = comps.filter((c) => (left ? c.cx < 0.27 : c.cx > 0.73) && c.cy > 0.3 && c.cy < 0.72 && c.n > 0.008 * W * H
      && c.n / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) > 0.4);
    if (!cs.length) return null;
    const z = { x0: Math.min(...cs.map((c) => c.x0)), x1: Math.max(...cs.map((c) => c.x1)),
                y0: Math.max(0.27 * H, Math.min(...cs.map((c) => c.y0))), y1: Math.min(0.8 * H, Math.max(...cs.map((c) => c.y1))) };
    z.cx = (z.x0 + z.x1) / 2; z.cy = (z.y0 + z.y1) / 2; return z;
  };
  if (!hood) return (T.zones = null);
  return (T.zones = { lab, hood, left: side(true), right: side(false) });
}

// Tiny copy of the picture: sampled with bilinear it gives a soft, blurred background.
function small(src, side = 40) {
  if (src._small) return src._small;
  const k = side / Math.max(src.w, src.h), w = Math.max(2, Math.round(src.w * k)), h = Math.max(2, Math.round(src.h * k));
  const data = new Float32Array(w * h * 4), cnt = new Float32Array(w * h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const j = Math.min(h - 1, (y * k) | 0) * w + Math.min(w - 1, (x * k) | 0), i = (y * src.w + x) * 4;
    data[j * 4] += src.data[i]; data[j * 4 + 1] += src.data[i + 1]; data[j * 4 + 2] += src.data[i + 2]; cnt[j]++;
  }
  for (let j = 0; j < w * h; j++) for (let c = 0; c < 3; c++) data[j * 4 + c] /= Math.max(1, cnt[j]);
  return (src._small = { w, h, data });
}
const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---------- source picture ------------------------------------------------------------------------
export function detectHorizon(src) {
  const { w, h, data } = src, mean = new Float32Array(h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; s += data[i] + data[i + 1] + data[i + 2]; } mean[y] = s / w; }
  let best = h / 2, bv = -1;
  for (let y = Math.floor(h / 4); y < h - Math.floor(h / 10) - 1; y++) { const g = Math.abs(mean[y + 1] - mean[y]); if (g > bv) { bv = g; best = y; } }
  return best;
}

function bilinear(src, u, v, out, o, clamp) {
  const { w, h, data } = src;
  u = clamp ? Math.min(w - 1, Math.max(0, u)) : ((u % w) + w) % w; v = Math.min(h - 1, Math.max(0, v));
  const x0 = Math.floor(u), y0 = Math.floor(v), x1 = (x0 + 1) % w, y1 = Math.min(h - 1, y0 + 1), fx = u - x0, fy = v - y0;
  for (let c = 0; c < 3; c++) {
    const a = data[(y0 * w + x0) * 4 + c], b = data[(y0 * w + x1) * 4 + c], cc = data[(y1 * w + x0) * 4 + c], dd = data[(y1 * w + x1) * 4 + c];
    out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy;
  }
}

// Face mode: face on the hood (turned to read from the front), the subject standing upright on each side's
// doors (head toward the roof), a soft blurred copy of the picture everywhere else.
// opts: face / subject = [x0,y0,x1,y1] in 0..1, faceSize, faceCrop, sideOn, sideZoom, sideShift, bgDark, feather,
//       cut (use src.alpha = person mask {w,h,data} so only the person is drawn on the doors)
function faceSampler(T, src, o, px) {
  const { W, H } = T, Z = zones(T), lab = Z?.lab;
  const bsrc = Z ? small(src) : src, bgS = Math.max(W / bsrc.w, H / bsrc.h), dark = Z ? 1 - o.bgDark : 1;
  const fg = new Float32Array(3), fe = Math.max(0.02, o.feather), cut = o.cut ? src.alpha : null;
  const f = o.face || [0.32, 0.1, 0.68, 0.5];
  const fcx = (f[0] + f[2]) / 2 * src.w, fcy = (f[1] + f[3]) / 2 * src.h;
  const fw = Math.max(4, (f[2] - f[0]) / 2 * src.w * o.faceCrop), fh = Math.max(4, (f[3] - f[1]) / 2 * src.h * o.faceCrop);
  let hood = null, sides = [];
  if (Z) {
    const h = Z.hood, s = Math.min((h.x1 - h.x0) / 2 / fw, (h.y1 - h.y0) / 2 / fh) * o.faceSize;
    hood = { id: h.id, cx: h.cx * W, cy: h.cy * H, rx: fw * s, ry: fh * s, s };
    if (o.sideOn) {
      const b = o.subject || [0, 0, 1, 1], u0 = b[0] * src.w, v0 = b[1] * src.h, sw = (b[2] - b[0]) * src.w;
      const sh = Math.min((b[3] - b[1]) * src.h, sw * 1.3);           // tall subject -> keep head and upper body
      for (const [z, dir] of [[Z.left, 1], [Z.right, -1]]) if (z) {
        const zw = z.x1 - z.x0, zh = z.y1 - z.y0, s2 = Math.min(zw / sh, zh / sw) * o.sideZoom;
        sides.push({ z, dir, s: s2, cx: z.cx, cy: z.cy + o.sideShift * zh, u0, v0, sw, sh, ucx: u0 + sw / 2, vcy: v0 + sh / 2 });
      }
    }
  }
  return (i, x, y) => {
    bilinear(bsrc, (x - W / 2) / bgS + bsrc.w / 2, (y - H / 2) / bgS + bsrc.h / 2, px, 0, true);
    px[0] *= dark; px[1] *= dark; px[2] *= dark;
    let a = 0;
    if (hood && lab[i] === hood.id) {
      const dx = x - hood.cx, dy = y - hood.cy, e = Math.hypot(dx / hood.rx, dy / hood.ry);
      a = 1 - smooth(1 - fe, 1, e);
      if (a > 0) bilinear(src, fcx - dx / hood.s, fcy - dy / hood.s, fg, 0, true);   // rotated 180°
    } else for (const q of sides) {
      if (x < q.z.x0 - 4 || x > q.z.x1 + 4 || y < q.z.y0 || y > q.z.y1) continue;
      const dx = x - q.cx, dy = y - q.cy;
      const u = q.ucx + q.dir * dy / q.s, v = q.vcy - q.dir * dx / q.s;           // image top -> toward the roof
      const ea = (u - q.u0) / q.sw, eb = (v - q.v0) / q.sh, edge = Math.min(ea, 1 - ea, eb, 1 - eb);
      a = smooth(0, fe * 0.6, edge);
      if (a > 0 && cut) {                                                         // person only, no box around it
        const ax = Math.min(cut.w - 1, Math.max(0, (u / src.w * cut.w) | 0)), ay = Math.min(cut.h - 1, Math.max(0, (v / src.h * cut.h) | 0));
        a *= smooth(0.25, 0.75, cut.data[ay * cut.w + ax]);
      }
      if (a > 0) bilinear(src, u, v, fg, 0, true);
      break;
    }
    if (a > 0) for (let c = 0; c < 3; c++) px[c] = px[c] * (1 - a) + fg[c] * a;
  };
}

// ---------- render ------------------------------------------------------------------------------
// opts: mode wrap|poster|mirror|tile, zoom, panX, panY, angle, spin, horizonD, horizonRow, oceanK, skyK,
//       bright, sat, contrast, vignette, outline
//
// The per-pixel math is isolated in makeSampler/renderBand so one worker can fill any row range
// [y0,y1) of the frame with EXACTLY the same arithmetic as the full-frame render. render() is kept
// as a thin wrapper over renderBand(0,H) for the single-thread fallback and the pixel-identity tests.

// Build the sampler closure + shared post-process params for a given template/source/options.
// px is the scratch Float32Array(3) the sampler writes the source colour into.
export function makeSampler(T, src, o, px) {
  const { W, H } = T;
  let sampler;
  if (o.mode === 'wrap') {
    const { theta, dist, dmax } = surface(T);
    // auto-fit: the sill (d=0) reaches the bottom of the picture, the roof top (dmax) reaches its top
    const hr = o.horizonRow ?? detectHorizon(src), hd = Math.min(o.horizonD, dmax - 1);
    const sea = (src.h - 1 - hr) * o.oceanK / hd, sky = hr * o.skyK / Math.max(1, dmax - hd), pw = src.w * 2;
    sampler = (i) => {
      const t = (theta[i] - o.spin + 720) % 360, d = dist[i];
      let u = t / 360 * pw;
      const v = d <= hd ? hr + (hd - d) * sea : hr - (d - hd) * sky;
      if (u >= src.w) u = pw - 1 - u;                               // mirrored panorama [A | flip(A)] = seamless
      bilinear(src, Math.min(src.w - 1, Math.max(0, u)), v, px, 0);
    };
  } else if (o.mode === 'face') {
    sampler = faceSampler(T, src, o, px);
  } else {
    const a = (o.angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const cover = Math.max(W / src.w, H / src.h), s = cover * (o.zoom || 1);
    const tile = o.mode === 'tile';
    const ts = tile ? (W / Math.max(src.w, src.h)) * (o.zoom || 1) * 0.35 : s;
    const cx = src.w / 2 + o.panX * src.w, cy = src.h / 2 + o.panY * src.h;
    sampler = (i, x, y) => {
      if (o.mode === 'mirror' && x >= W / 2) x = W - 1 - x;
      const dx = x - W / 2, dy = y - H / 2;
      let u = (ca * dx + sa * dy) / ts + cx, v = (-sa * dx + ca * dy) / ts + cy;
      if (tile) { u = ((u % src.w) + src.w) % src.w; v = ((v % src.h) + src.h) % src.h; }
      bilinear(src, u, v, px, 0);
    };
  }
  return sampler;
}

// Fill rows [y0,y1) using the given sampler. Identical arithmetic to render().
// base = the frame row stored at index 0 of T's per-pixel arrays and of `out` (0 for full-size arrays;
// a worker that keeps only its own rows passes base = y0 - <row offset of this band in its arrays>).
// x and y stay absolute, so geometry, vignette and sampling are unchanged.
export function renderBand(T, o, sampler, px, out, y0, y1, base = 0) {
  const { W, H, mask, edge } = T;
  const br = o.bright, sat = o.sat, con = o.contrast, vig = o.vignette, R = Math.hypot(W, H) * 0.5;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const i = (y - base) * W + x, j = i * 4;
    out[j + 3] = 255;
    if (!mask[i]) continue;
    if (o.outline && edge[i]) { out[j] = OUTLINE[0]; out[j + 1] = OUTLINE[1]; out[j + 2] = OUTLINE[2]; continue; }
    sampler(i, x, y);
    const l = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
    const r = Math.hypot(x - W / 2, y - H / 2) / R, vf = 1 - vig * r * r;
    for (let c = 0; c < 3; c++) {
      let v = l + (px[c] - l) * sat;
      v = (v - 128) * con + 128;
      out[j + c] = v * br * vf;
    }
    if (out[j] + out[j + 1] + out[j + 2] === 0) out[j] = 1;        // keep "pure black" reserved for outside
  }
  return out;
}

export function render(T, src, o) {
  const { W, H } = T, out = new Uint8ClampedArray(W * H * 4), px = new Float32Array(3);
  const sampler = makeSampler(T, src, o, px);
  return renderBand(T, o, sampler, px, out, 0, H);
}

// ---------- quantise + PNG ----------------------------------------------------------------------
export function quantize(rgba, mask, W, colors = 256, dither = true) {
  const n = mask.length, idxs = [];
  const step = Math.max(1, Math.floor(n / 120000));
  for (let i = 0; i < n; i += step) if (mask[i]) idxs.push(i);
  let boxes = [Uint32Array.from(idxs)];
  const range = (b) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const i of b) for (let c = 0; c < 3; c++) { const v = rgba[i * 4 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  };
  while (boxes.length < colors - 1) {
    let bi = -1, bs = 0, bc = 0;
    boxes.forEach((b, k) => { if (b.length < 2) return; const r = range(b); const c = r.indexOf(Math.max(...r)); const s = r[c] * Math.sqrt(b.length); if (s > bs) { bs = s; bi = k; bc = c; } });
    if (bi < 0) break;
    const b = Array.from(boxes[bi]).sort((p, q) => rgba[p * 4 + bc] - rgba[q * 4 + bc]), mid = b.length >> 1;
    boxes.splice(bi, 1, Uint32Array.from(b.slice(0, mid)), Uint32Array.from(b.slice(mid)));
  }
  const pal = [[0, 0, 0]];
  for (const b of boxes) { const s = [0, 0, 0]; for (const i of b) for (let c = 0; c < 3; c++) s[c] += rgba[i * 4 + c]; pal.push(s.map((v) => Math.round(v / Math.max(1, b.length)))); }
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r, g, b) => {
    r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (cache[key] >= 0) return cache[key];
    let best = 1, bd = 1e9;
    for (let k = 1; k < pal.length; k++) { const p = pal[k], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; best = k; } }
    return (cache[key] = best);
  };
  const out = new Uint8Array(n);
  const err = dither ? new Float32Array(n * 3) : null;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) { out[i] = 0; continue; }
    let r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    if (err) { r += err[i * 3]; g += err[i * 3 + 1]; b += err[i * 3 + 2]; }
    const k = nearest(r | 0, g | 0, b | 0); out[i] = k;
    if (err) {
      const e = [r - pal[k][0], g - pal[k][1], b - pal[k][2]];
      const spread = (j, f) => { if (j < n && mask[j]) for (let c = 0; c < 3; c++) err[j * 3 + c] += e[c] * f; };
      spread(i + 1, 7 / 16); spread(i + W - 1, 3 / 16); spread(i + W, 5 / 16); spread(i + W + 1, 1 / 16);
    }
  }
  return { index: out, palette: pal };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, body) {
  const out = new Uint8Array(12 + body.length), dv = new DataView(out.buffer);
  dv.setUint32(0, body.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8); dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length))); return out;
}
async function zlib(data) {
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}
export async function encodeIndexedPNG(W, H, index, palette) {
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 3;
  const plte = new Uint8Array(palette.length * 3); palette.forEach((p, k) => plte.set(p, k * 3));
  const raw = new Uint8Array((W + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W + 1)] = 0; raw.set(index.subarray(y * W, y * W + W), y * (W + 1) + 1); }
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array(0))];
  return new Blob(parts, { type: 'image/png' });
}

// Smallest-loss export that passes Tesla's 1 MB limit.
export async function exportWrap(T, rgba) {
  const tries = [[256, true], [256, false], [160, false], [96, false]];
  for (const [c, d] of tries) {
    const q = quantize(rgba, T.mask, T.W, c, d);
    const blob = await encodeIndexedPNG(T.W, T.H, q.index, q.palette);
    if (blob.size < 1_000_000) return { blob, colors: c, dither: d, index: q.index };
  }
  throw new Error('too-big');
}
