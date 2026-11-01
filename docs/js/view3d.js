// 3D preview of the wrap on an approximate car body.
// No free 3D model of Tesla's cars exists, so the body is built from the template sheet itself. The sheet is an
// exploded top view: front at the top, each side folded out to the left / right edge, the nose and tail panels
// folded out above / below the hood. Every panel is folded back onto a simple car shape, so the art lands about
// where it would on the real car. It is an approximation, not Tesla's model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE = [34, 37, 43];             // body parts the wrap does not cover (trim, gaps)
const GLASS = [9, 12, 17];
const WT = 2560, HT = 320, TW = 1024, TH = 400;   // wall and top texture sizes
const famOf = (id) => (id === 'cybertruck' ? 'cyber' : /^model[yx]/.test(id) ? 'suv' : 'sedan');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const median = (a) => { const s = a.filter(Number.isFinite).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };

// ---------- reading the sheet ------------------------------------------------------------------------
// The sheet turned so the car front is at the top and car-left at the left (Cybertruck sheets lie sideways).
function frameOf(T) {
  const { W, H, mask } = T;
  if (W <= H) return { w: W, h: H, m: mask, src: (x, y) => y * W + x };
  const w = H, h = W, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = mask[(H - 1 - x) * W + y];
  return { w, h, m, src: (x, y) => (H - 1 - x) * W + y };
}

function label(m, w, h) {
  const lab = new Int32Array(w * h), comps = [null], st = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    const id = comps.length, c = { id, n: 0, x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0 };
    let top = 0; st[top++] = s; lab[s] = id;
    while (top) {
      const i = st[--top], x = i % w, y = (i / w) | 0;
      c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && m[i - 1] && !lab[i - 1]) { lab[i - 1] = id; st[top++] = i - 1; }
      if (x < w - 1 && m[i + 1] && !lab[i + 1]) { lab[i + 1] = id; st[top++] = i + 1; }
      if (y > 0 && m[i - w] && !lab[i - w]) { lab[i - w] = id; st[top++] = i - w; }
      if (y < h - 1 && m[i + w] && !lab[i + w]) { lab[i + w] = id; st[top++] = i + w; }
    }
    c.cx = c.sx / c.n / w; c.cy = c.sy / c.n / h;
    comps.push(c);
  }
  return { lab, comps };
}

// Side strip, row by row. The widest piece in a row gives the fold line (left: its inner = right edge).
function band(lab, cls, w, h, k, left) {
  const xi = new Float32Array(h).fill(NaN), xo = new Float32Array(h).fill(NaN), hole = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    const ext = new Map(); let outer = left ? w : -1, inner = left ? -1 : w;
    for (let x = 0, r = y * w; x < w; x++) {
      const id = lab[r + x]; if (!id || cls[id] !== k) continue;
      const e = ext.get(id); if (e) { if (x < e[0]) e[0] = x; if (x > e[1]) e[1] = x; } else ext.set(id, [x, x]);
      if (left ? x < outer : x > outer) outer = x;
      if (left ? x > inner : x < inner) inner = x;
    }
    let best = null;
    for (const e of ext.values()) if (e[1] - e[0] + 1 >= 0.035 * w && (!best || e[1] - e[0] > best[1] - best[0])) best = e;
    if (!best) continue;
    xi[y] = left ? best[1] : best[0]; xo[y] = outer;
    // a gap inside the strip (Cybertruck side windows)
    let run = 0;
    for (let x = Math.min(outer, inner), r = y * w; x <= Math.max(outer, inner); x++) {
      const id = lab[r + x];
      if (id && cls[id] === k) run = 0; else if (++run > 8) { hole[y] = 1; break; }
    }
  }
  let y0 = 0, y1 = h - 1;
  while (y0 < h && !Number.isFinite(xi[y0])) y0++;
  while (y1 > y0 && !Number.isFinite(xi[y1])) y1--;
  for (const a of [xi, xo]) {                         // fill short gaps between pieces
    let last = y0;
    for (let y = y0 + 1; y <= y1; y++) if (Number.isFinite(a[y])) {
      for (let q = last + 1; q < y; q++) a[q] = a[last] + (a[y] - a[last]) * (q - last) / (y - last);
      last = y;
    }
  }
  return { xi, xo, hole, y0, y1 };
}

// Nose (k=3) or tail (k=4) panels, column by column: fold line = edge nearest the hood.
function cols(lab, cls, w, h, k) {
  const fold = new Float32Array(w).fill(NaN), far = new Float32Array(w).fill(NaN);
  let x0 = w, x1 = -1;
  for (let x = 0; x < w; x++) {
    let a = -1, b = -1;
    for (let y = 0; y < h; y++) { const id = lab[y * w + x]; if (id && cls[id] === k) { if (a < 0) a = y; b = y; } }
    if (a < 0) continue;
    fold[x] = k === 3 ? b : a; far[x] = k === 3 ? a : b;
    if (x < x0) x0 = x; x1 = x;
  }
  for (let x = x0 + 1, last = x0; x <= x1; x++) if (Number.isFinite(fold[x])) {
    for (let q = last + 1; q < x; q++) { fold[q] = fold[last]; far[q] = far[last]; }
    last = x;
  }
  const mid = [], cx0 = Math.round(x0 + 0.3 * (x1 - x0)), cx1 = Math.round(x0 + 0.7 * (x1 - x0));
  for (let x = cx0; x <= cx1; x++) mid.push(Math.abs(fold[x] - far[x]));
  return { fold, x0, x1, xc: (x0 + x1) / 2, hw: (x1 - x0) / 2, depth: median(mid) };
}

// ---------- the body plan ---------------------------------------------------------------------------
function makePlan(A, B, n) {
  const N = 4096, PX = new Float64Array(N + 1), PY = new Float64Array(N + 1), S = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {                      // left half: front tip -> rear tip
    const f = Math.PI * i / N, c = Math.cos(f), s = Math.sin(f);
    PX[i] = A * Math.sign(c) * Math.pow(Math.abs(c), 2 / n); PY[i] = B * Math.pow(Math.abs(s), 2 / n);
    if (i) S[i] = S[i - 1] + Math.hypot(PX[i] - PX[i - 1], PY[i] - PY[i - 1]);
  }
  const Ph = S[N];
  const find = (arr, v, dec) => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dec ? arr[m] > v : arr[m] < v) lo = m; else hi = m; } return lo; };
  return {
    Ph,
    at(sig) {                                         // point + outward normal at arc length sig
      sig = clamp(sig, 0, Ph);
      const i = Math.min(N - 1, find(S, sig, false)), t = (sig - S[i]) / Math.max(1e-9, S[i + 1] - S[i]);
      const dx = PX[i + 1] - PX[i], dy = PY[i + 1] - PY[i], l = Math.hypot(dx, dy) || 1;
      return { X: PX[i] + dx * t, Y: PY[i] + dy * t, nx: dy / l, ny: -dx / l };
    },
    sigOfX(X) { const i = Math.min(N - 1, find(PX, clamp(X, -A, A), true)); return S[i]; },
    halfW: (X) => B * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(X) / A), n)), 1 / n),
    tipX: (Y) => A * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(Y) / B), n)), 1 / n),
  };
}

// ---------- layout: body shape + where every texel of the body comes from on the sheet ---------------
export function layout(T, id) {
  const fam = famOf(id), F = frameOf(T), { w, h } = F, { lab, comps } = label(F.m, w, h);
  const hood = comps.filter((c) => c && c.cx > 0.36 && c.cx < 0.64 && c.cy > 0.05 && c.cy < 0.45).sort((a, b) => b.n - a.n)[0];
  if (!hood) return null;
  const cls = new Uint8Array(comps.length);           // 1 left side, 2 right side, 3 nose, 4 tail, 5 hood
  cls[hood.id] = 5;
  for (const c of comps) {
    if (!c || c === hood || c.n < 0.0025 * w * h) continue;
    if (c.cy * h < hood.y0 + 0.15 * (hood.y1 - hood.y0) && Math.abs(c.cx - 0.5) < 0.26) cls[c.id] = 3;
    else if (c.cy > 0.7 && (Math.abs(c.cx - 0.5) < 0.2 || (c.x0 < 0.38 * w && c.x1 > 0.62 * w))) cls[c.id] = 4;
    else if (c.cx < 0.3) cls[c.id] = 1;
    else if (c.cx > 0.7) cls[c.id] = 2;
  }
  const kind = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? cls[lab[y * w + x]] : 0);
  const bl = band(lab, cls, w, h, 1, true), br = band(lab, cls, w, h, 2, false);
  const nose = cols(lab, cls, w, h, 3), tail = cols(lab, cls, w, h, 4);
  if (bl.y1 <= bl.y0) return null;
  const cyber = fam === 'cyber', lb = bl.y1 - bl.y0;

  // size, in sheet pixels (1 px of art = 1 unit of body)
  const L = cyber ? lb + 1 : clamp(lb * 1.08, 0.72 * h, 1.12 * h);
  const Wd = L * (cyber ? 0.357 : 0.39), A = L / 2, B = Wd / 2;
  const plan = makePlan(A, B, cyber ? 12 : 4.2), Ph = plan.Ph, s0 = (Ph - lb) / 2;
  const rowOf = (sig) => bl.y0 + (sig - s0);
  const gc = (cyber ? 0.055 : 0.034) * L;
  const midRows = []; for (let y = Math.round(bl.y0 + 0.3 * lb); y <= bl.y0 + 0.7 * lb; y++) midRows.push(bl.xi[y] - bl.xo[y]);
  const hwall = clamp(median(midRows), 0.125 * L, 0.19 * L);
  const Zb = gc + hwall;
  const Zf = gc + clamp((nose.depth || 0) * 1.1, 0.5 * hwall, 0.92 * hwall);
  const Zr = gc + clamp((tail.depth || 0) * 1.05, 0.62 * hwall, 1.1 * hwall);
  const Xhf = A - (cyber ? 0.015 : 0.03) * L, Xc = Xhf - (hood.y1 - hood.y0), Xr0 = -A + (fam === 'suv' ? 0.2 : 0.26) * L;

  // Cybertruck: roof line and arches straight from the strip edges (outer edge = sill, inner edge = roof line)
  const smoothRow = (a, r) => (y) => { let s = 0, n = 0; for (let q = Math.round(y) - r; q <= Math.round(y) + r; q++) { const v = a[clamp(q, bl.y0, bl.y1)]; if (Number.isFinite(v)) { s += v; n++; } } return n ? s / n : 0; };
  const roofAt = smoothRow(bl.xi, 5), sillAt = smoothRow(bl.xo, 2);
  const ztop = cyber
    ? (X) => gc + roofAt(rowOf(plan.sigOfX(X)))
    : (X) => (X >= Xhf ? Zf : X >= Xc ? Zf + (Zb - Zf) * ease((Xhf - X) / (Xhf - Xc)) : X >= Xr0 ? Zb : Zb + (Zr - Zb) * ease((Xr0 - X) / (Xr0 + A)));

  // wheels
  let wheels;
  const Rw = (cyber ? 0.077 : 0.074) * L, tw = (cyber ? 0.06 : 0.052) * L;
  if (cyber) {                                        // arch notches in the strip's outer edge
    const runs = []; let a = -1;
    for (let y = bl.y0; y <= bl.y1 + 1; y++) {
      const notch = y <= bl.y1 && bl.xo[y] > 0.025 * w;
      if (notch && a < 0) a = y; else if (!notch && a >= 0) { if (y - a > 0.06 * lb) runs.push([a, y - 1]); a = -1; }
    }
    runs.sort((p, q) => p[0] - q[0]);
    const cen = runs.length >= 2 ? [runs[0], runs[runs.length - 1]].map(([p, q]) => (p + q) / 2) : [bl.y0 + 0.2 * lb, bl.y0 + 0.8 * lb];
    wheels = cen.map((y) => plan.at(s0 + (y - bl.y0)).X);
  } else wheels = [A - 0.19 * L, -A + 0.205 * L];
  const Ra = 1.14 * Rw, Za = 0.93 * Rw;
  const zbot = cyber
    ? (X) => gc + sillAt(rowOf(plan.sigOfX(X)))
    : (X) => { let z = gc; for (const xw of wheels) { const d = Math.abs(X - xw); if (d < Ra) z = Math.max(z, Za + Math.sqrt(Ra * Ra - d * d)); } return z; };

  // Cybertruck glass: from the windscreen base back to the end of the side windows
  let Xglass = Xc;
  if (cyber) { let last = -1; for (let y = bl.y0; y <= bl.y0 + 0.75 * lb; y++) if (bl.hole[y]) last = y; if (last > 0) Xglass = plan.at(s0 + (last + 10 - bl.y0)).X; }

  // where each body texel comes from: >= 0 sheet pixel, -1 trim, -2 glass
  let zmax = 0; for (let i = 0; i <= 400; i++) zmax = Math.max(zmax, ztop(-A + 2 * A * i / 400));
  zmax += 2;
  const pick = (x, y, k) => { x = Math.round(x); y = Math.round(y); return kind(x, y) === k ? F.src(x, y) : -1; };
  const wall = new Int32Array(WT * HT);
  for (let c = 0; c < WT; c++) {
    const sf = (c + 0.5) / WT * 2 * Ph, left = sf < Ph, sl = left ? sf : 2 * Ph - sf, p = plan.at(sl), Zt = ztop(p.X), y = rowOf(sl);
    for (let r = 0; r < HT; r++) {
      const Z = (r + 0.5) / HT * zmax, d = Zt - Z;
      let s = -1;
      if (d >= -1 && y >= bl.y0 && y <= bl.y1) {
        if (cyber) {
          s = pick(left ? Z - gc : w - 1 - (Z - gc), y, left ? 1 : 2);
          if (s < 0 && Z > gc + sillAt(y) + 2 && Z < gc + roofAt(y) - 2 && bl.hole[Math.round(y)]) s = -2;
        } else {
          const b = left ? bl : br, xi = b.xi[Math.round(y)];
          if (Number.isFinite(xi)) s = pick(left ? xi - d : xi + d, y, left ? 1 : 2);
        }
      }
      if (s === -1 && d >= -1 && sl <= nose.hw + 2) { const x = Math.round(nose.xc + (left ? -sl : sl)); if (x >= 0 && x < w && Number.isFinite(nose.fold[x])) s = pick(x, nose.fold[x] - d, 3); }
      if (s === -1 && d >= -1 && Ph - sl <= tail.hw + 2) { const x = Math.round(tail.xc + (left ? -(Ph - sl) : Ph - sl)); if (x >= 0 && x < w && Number.isFinite(tail.fold[x])) s = pick(x, tail.fold[x] + d, 4); }
      wall[r * WT + c] = s;
    }
  }
  const top = new Int32Array(TW * TH), xch = (hood.x0 + hood.x1) / 2;
  for (let r = 0; r < TH; r++) {
    const Y = -B + (r + 0.5) / TH * 2 * B;
    for (let c = 0; c < TW; c++) {
      const X = -A + (c + 0.5) / TW * 2 * A;
      let s = -1;
      if (X <= Xhf && X >= Xc) s = pick(xch - Y, hood.y0 + (Xhf - X), 5);
      const df = plan.tipX(Y) - X, dr = X + plan.tipX(Y);
      if (s === -1 && df >= 0 && df < 0.12 * L) { const x = Math.round(nose.xc - Y); if (x >= 0 && x < w && Number.isFinite(nose.fold[x])) s = pick(x, nose.fold[x] + df, 3); }
      if (s === -1 && dr >= 0 && dr < 0.12 * L) { const x = Math.round(tail.xc - Y); if (x >= 0 && x < w && Number.isFinite(tail.fold[x])) s = pick(x, tail.fold[x] - dr, 4); }
      if (s === -1 && cyber && X < Xc && X > Xglass) s = -2;
      top[r * TW + c] = s;
    }
  }
  return { fam, L, Wd, A, B, plan, Ph, gc, Zb, Zf, Zr, Xhf, Xc, ztop, zbot, zmax, wheels, Rw, tw, wall, top };
}

// ---------- meshes --------------------------------------------------------------------------------
function gridGeometry(nu, nv, fn, flip) {             // fn(i, j) -> [x3, y3, z3, u, v]
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2), idx = [];
  for (let i = 0, k = 0; i <= nu; i++) for (let j = 0; j <= nv; j++, k++) {
    const p = fn(i, j); pos.set(p.slice(0, 3), k * 3); uv.set(p.slice(3, 5), k * 2);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1, c = b + 1, d = a + 1;
    if (flip) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function buildCar(Lo, wallTex, topTex) {
  const { fam, L, Wd, A, B, plan, Ph, ztop, zbot, zmax } = Lo, cyber = fam === 'cyber';
  const g = new THREE.Group();
  const paint = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.38, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 });
  const NS = 260, NR = 30, shoulder = (t) => (cyber ? 0 : Wd * (0.01 * Math.sin(Math.PI * t) - 0.02 * t * t * t * t));
  const st = []; for (let i = 0; i <= NS; i++) { const p = plan.at(Ph * i / NS); st.push({ ...p, zt: ztop(p.X), zb: Math.min(zbot(p.X), ztop(p.X) - 2) }); }
  const wallMat = paint(wallTex);
  for (const left of [true, false]) {
    g.add(new THREE.Mesh(gridGeometry(NS, NR, (i, j) => {
      const p = st[i], t = j / NR, Z = p.zb + (p.zt - p.zb) * t, o = shoulder(t), X = p.X + p.nx * o, Y = p.Y + p.ny * o;
      const sig = Ph * i / NS;
      return [X, Z, left ? -Y : Y, (left ? sig : 2 * Ph - sig) / (2 * Ph), Z / zmax];
    }, !left), wallMat));
  }
  const K = 36, o1 = shoulder(1);
  g.add(new THREE.Mesh(gridGeometry(NS, K, (i, k) => {
    const p = st[i], s = -1 + 2 * k / K, yt = p.Y + p.ny * o1, X = p.X + p.nx * o1, Y = s * yt;
    const crown = cyber ? 0 : 0.018 * Wd * (1 - s * s) * Math.min(1, yt / (0.6 * B));
    return [X, p.zt + crown, -Y, (X + A) / (2 * A), (Y + B) / (2 * B)];
  }, true), paint(topTex)));
  if (!cyber) {                                       // glass cabin
    const suv = fam === 'suv', Hc = (suv ? 0.125 : 0.1) * L, Xc = Lo.Xc + 0.01 * L, Xrc = -A + (suv ? 0.075 : 0.16) * L;
    const ws = (suv ? 1.25 : 1.6) * Hc, rs = (suv ? 0.75 : 1.9) * Hc, NC = 90, K2 = 28;
    const hc = (X) => Hc * Math.min(ease((Xc - X) / ws), ease((X - Xrc) / rs));
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b0e14, roughness: 0.05, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25 });
    g.add(new THREE.Mesh(gridGeometry(NC, K2, (i, k) => {
      const X = Xc + (Xrc - Xc) * i / NC, th = Math.PI * k / K2, bc = plan.halfW(X) * 0.9, sn = Math.sin(th);
      return [X, ztop(X) - 1.5 + hc(X) * Math.pow(sn, 0.6), -Math.cos(th) * bc * (1 - 0.16 * sn), 0, 0];
    }, false), glass));
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, Math.max(10, Lo.Zb * 0.82 - Lo.gc), Wd * 0.8), dark);
  box.position.set(0, Lo.gc + (Lo.Zb * 0.82 - Lo.gc) / 2, 0); g.add(box);
  // wheels
  const tire = new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.92 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x3b3f47, metalness: 0.9, roughness: 0.3 });
  const { Rw, tw } = Lo;
  for (const xw of Lo.wheels) for (const sgn of [-1, 1]) {
    const wg = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(Rw, Rw, tw, 48).rotateX(Math.PI / 2), tire);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(Rw * 0.66, Rw * 0.66, tw * 1.04, 40).rotateX(Math.PI / 2), rim);
    wg.add(t, r);
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(Rw * 0.12, Rw * 1.22, tw * 0.2), rim);
      sp.rotation.z = (k * 2 * Math.PI) / 5; sp.position.z = sgn * tw * 0.47; wg.add(sp);
    }
    wg.position.set(xw, Rw, sgn * (plan.halfW(xw) - tw / 2 - 0.004 * L));
    g.add(wg);
  }
  if (cyber) {                                        // the light bars
    const lit = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4 });
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.008 * L, 0.006 * L, Wd * 0.94), lit(0xf2f6ff)); f.position.set(A + 1, Lo.ztop(A - 1) - 3, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.008 * L, 0.006 * L, Wd * 0.94), lit(0xff2b2b)); r.position.set(-A - 1, Lo.ztop(-A + 1) - 6, 0);
    g.add(f, r);
  }
  // soft shadow on the ground
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sh.scale.set(L * 1.35, 1, Wd * 1.9); sh.position.y = 0.5; g.add(sh);
  return g;
}

// ---------- viewer ------------------------------------------------------------------------------------
const CAMS = { three: [0.78, 0.36, -0.66], front: [1, 0.2, 0.001], side: [0.001, 0.16, -1], rear: [-1, 0.24, 0.001], top: [0.06, 1, 0.001] };

export class Viewer {
  constructor(host) {
    this.host = host;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    host.prepend(r.domElement);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.scene.environment = this.env;
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(4, 9, 3); this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1c22, 0.5));
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true; c.dampingFactor = 0.08; c.maxPolarAngle = Math.PI * 0.495; c.minDistance = 6; c.maxDistance = 40;
    c.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; c.autoRotateSpeed = 0.9;
    c.addEventListener('start', () => { c.autoRotate = false; this.anim = null; this.host.dispatchEvent(new Event('v3d:spin')); });
    r.domElement.addEventListener('dblclick', () => this.cam('three'));
    this.layouts = new Map(); this.car = null; this.active = false; this.dirty = true;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.loop = () => { if (!this.active) return; requestAnimationFrame(this.loop); this.frame(); };
  }
  get spinning() { return this.controls.autoRotate; }
  set spinning(v) { this.controls.autoRotate = !!v; }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    if (on) { this.resize(); requestAnimationFrame(this.loop); }
  }
  // build (once per template) the body for this car
  setCar(T, id) {
    const key = T.id + ':' + T.W + 'x' + T.H;
    if (this.key === key) return;
    let Lo = this.layouts.get(key);
    if (!Lo) { Lo = layout(T, id); if (!Lo) throw new Error('no-layout'); this.layouts.set(key, Lo); }
    this.key = key; this.Lo = Lo;
    if (this.car) { this.scene.remove(this.car); this.car.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material.map) o.material.map.dispose(); o.material?.dispose?.(); }); }
    const tex = (W, H, wrap) => {
      const t = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      if (wrap) t.wrapS = THREE.RepeatWrapping;
      return t;
    };
    this.wallTex = tex(WT, HT, true); this.topTex = tex(TW, TH, false);
    for (const [t, src] of [[this.wallTex, Lo.wall], [this.topTex, Lo.top]]) {     // trim and glass never change
      const d = t.image.data;
      for (let i = 0; i < src.length; i++) { const c = src[i] === -2 ? GLASS : BASE; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
      t.needsUpdate = true;
    }
    if (!Lo.live) Lo.live = [Lo.wall, Lo.top].map((src) => { const a = []; for (let i = 0; i < src.length; i++) if (src[i] >= 0) a.push(i, src[i]); return Int32Array.from(a); });
    this.car = buildCar(Lo, this.wallTex, this.topTex);
    this.car.scale.setScalar(10 / Lo.L);
    this.scene.add(this.car);
    this.target = new THREE.Vector3(0, (Lo.Zb + 0.06 * Lo.L) * 10 / Lo.L * 0.75, 0);
    this.cam('three', true);
  }
  // copy the current wrap onto the body
  paint(rgba) {
    if (!this.Lo || !rgba) return;
    const live = this.Lo.live;
    [this.wallTex, this.topTex].forEach((t, k) => {
      const d = t.image.data, a = live[k];
      for (let i = 0; i < a.length; i += 2) { const o = a[i] * 4, s = a[i + 1] * 4; d[o] = rgba[s]; d[o + 1] = rgba[s + 1]; d[o + 2] = rgba[s + 2]; }
      t.needsUpdate = true;
    });
    this.dirty = true;
  }
  cam(name, now) {
    const v = CAMS[name] || CAMS.three, dir = new THREE.Vector3(...v).normalize(), dist = 21;
    const to = this.target.clone().addScaledVector(dir, dist);
    if (now || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.camera.position.copy(to); this.controls.target.copy(this.target); this.controls.update(); this.dirty = true; return; }
    this.anim = { from: this.camera.position.clone(), to, t0: performance.now() };
    this.controls.autoRotate = false; this.host.dispatchEvent(new Event('v3d:spin'));
  }
  frame() {
    if (this.anim) {
      const t = ease((performance.now() - this.anim.t0) / 650);
      this.camera.position.lerpVectors(this.anim.from, this.anim.to, t);
      this.controls.target.lerp(this.target, t);
      if (t >= 1) this.anim = null;
      this.dirty = true;
    }
    const moved = this.controls.update();
    if (moved || this.dirty || this.controls.autoRotate) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
  }
  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }
}
