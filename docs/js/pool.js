// Worker pool for the pixel engine.
//  - N render workers. Frame rows are cut into blocks of B rows and dealt round-robin, so the work is
//    even and each worker keeps only its own rows of every template (one copy in total, not N).
//  - 1 helper worker for template prep and export, so neither ever stalls a frame.
//  - Every worker imports the same engine.js as the page: the pixels are byte-identical.
// Messages to one worker are handled in order, so 'tpl' / 'src' / 'alpha' never need an answer.

const B = 16;                 // rows per block
const KEEP = 12;              // templates kept in the workers (all cars; about the memory the one-thread page used)
const EXPORT_TRIES = [[256, true], [256, false], [160, false], [96, false]];   // same order as engine.exportWrap

export function poolSize() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  return Math.max(2, Math.min(mem <= 4 ? 4 : 8, cores - 2));
}
export const poolSupported = () => typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
  && typeof CompressionStream === 'function' && typeof Blob === 'function';

// rows of a H-row frame that render worker k owns: [y0, y1, rowOffsetInItsArrays]
function plan(H, N) {
  const rows = Array.from({ length: N }, () => []), used = new Array(N).fill(0);
  for (let b = 0, y = 0; y < H; b++, y += B) {
    const k = b % N, y1 = Math.min(H, y + B);
    rows[k].push([y, y1, used[k]]); used[k] += y1 - y;
  }
  return { rows, used };
}

export class Pool {
  constructor(n = poolSize()) {
    this.N = n; this.threads = n + 1; this.seq = 0; this.wait = new Map(); this.dead = false;
    this.onfail = null; this.cache = new Map(); this.loading = new Map(); this.src = 0;
    const mk = () => {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._msg(e.data);
      w.onerror = (e) => this._fail(new Error('worker: ' + (e.message || 'failed to start')));
      w.onmessageerror = () => this._fail(new Error('worker: message error'));
      return w;
    };
    this.render = Array.from({ length: n }, mk);
    this.aux = mk();
  }

  _msg(m) {
    const p = this.wait.get(m.jid); if (!p) return;
    this.wait.delete(m.jid);
    m.t === 'err' ? p.rej(new Error(m.msg)) : p.res(m);
  }
  _fail(e) {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.wait.values()) p.rej(e);
    this.wait.clear();
    for (const w of [...this.render, this.aux]) w.terminate();
    this.onfail?.(e);
  }
  _ask(w, msg, transfer = []) {
    if (this.dead) return Promise.reject(new Error('pool stopped'));
    const jid = ++this.seq;
    return new Promise((res, rej) => { this.wait.set(jid, { res, rej }); w.postMessage({ ...msg, jid }, transfer); });
  }
  _tell(msg, transfer) { if (!this.dead) for (const w of this.render) w.postMessage(msg, transfer); }

  // ---- templates ---------------------------------------------------------------------------------
  // load(id) -> ImageData of the template. Returns the page's handle {id, W, H, mask, lines, hasZones}.
  template(id, load) {
    if (this.cache.has(id)) { const T = this.cache.get(id); this.cache.delete(id); this.cache.set(id, T); return Promise.resolve(T); }
    if (!this.loading.has(id)) {
      const job = (async () => {
        const img = await load(id);
        const r = await this._ask(this.aux, { t: 'prep', id, img }, [img.data.buffer]);
        const { W, H } = r, { rows, used } = plan(H, this.N);
        const lab = r.lab && (r.lab.reduce((a, b) => (b > a ? b : a), 0) < 65536 ? Uint16Array.from(r.lab) : r.lab);
        this.render.forEach((w, k) => {
          const n = used[k] * W, mask = new Uint8Array(n), edge = new Uint8Array(n), theta = new Float32Array(n), dist = new Float32Array(n);
          const lb = lab ? new lab.constructor(n) : null;
          for (const [y0, y1, lo] of rows[k]) {
            const a = y0 * W, b = y1 * W, at = lo * W;
            mask.set(r.mask.subarray(a, b), at); edge.set(r.edge.subarray(a, b), at);
            theta.set(r.theta.subarray(a, b), at); dist.set(r.dist.subarray(a, b), at);
            if (lb) lb.set(lab.subarray(a, b), at);
          }
          const tr = [mask.buffer, edge.buffer, theta.buffer, dist.buffer]; if (lb) tr.push(lb.buffer);
          w.postMessage({ t: 'tpl', id, W, H, dmax: r.dmax, z: r.z, rows: rows[k], nrows: used[k], mask, edge, theta, dist, lab: lb }, tr);
        });
        const T = { id, W, H, mask: r.mask, lines: r.lines, hasZones: !!r.z, rows };
        this.cache.set(id, T);
        while (this.cache.size > KEEP) {          // drop the least recently used, never the car on screen
          const old = [...this.cache.keys()].find((k) => k !== this.active && k !== id);
          if (!old) break;
          this.cache.delete(old); this._tell({ t: 'drop', id: old });
        }
        return T;
      })();
      this.loading.set(id, job);
      job.finally(() => this.loading.delete(id)).catch(() => {});
    }
    return this.loading.get(id);
  }

  // ---- picture -----------------------------------------------------------------------------------
  setSource(src) {                       // copied once to every render worker
    this.src++;
    const s = { w: src.w, h: src.h, data: src.data };
    if (src.alpha) s.alpha = src.alpha;
    this._tell({ t: 'src', src: s });
  }
  setAlpha(alpha) { this._tell({ t: 'alpha', alpha: alpha || null }); }

  // ---- one frame: all render workers at once --------------------------------------------------------
  async frame(T, o) {
    const parts = await Promise.all(this.render.map((w) => this._ask(w, { t: 'render', id: T.id, o })));
    const W = T.W, out = new Uint8ClampedArray(W * T.H * 4);
    parts.forEach(({ out: part }, k) => {
      for (const [y0, y1, lo] of T.rows[k]) out.set(part.subarray(lo * W * 4, (lo + y1 - y0) * W * 4), y0 * W * 4);
    });
    return out;
  }

  // ---- export --------------------------------------------------------------------------------------
  // One candidate on the helper worker (used for the early export while the user looks at the picture).
  exportOne(T, rgba, k = 0) {
    const [colors, dither] = EXPORT_TRIES[k];
    return this._ask(this.aux, { t: 'export', W: T.W, H: T.H, mask: T.mask, rgba, colors, dither })
      .then((r) => ({ blob: new Blob([r.bytes], { type: 'image/png' }), colors, dither, black: r.black }));
  }
  // Same rule as engine.exportWrap: the first candidate in order that is under 1 MB.
  async exportFirst(T, rgba, first) {
    const a = await (first || this.exportOne(T, rgba, 0));
    if (a.blob.size < 1_000_000) return a;
    const rest = await Promise.all(EXPORT_TRIES.slice(1).map(([colors, dither], i) =>
      this._ask(this.render[i % this.N], { t: 'export', W: T.W, H: T.H, mask: T.mask, rgba, colors, dither })
        .then((r) => ({ blob: new Blob([r.bytes], { type: 'image/png' }), colors, dither, black: r.black }))));
    const ok = rest.find((r) => r.blob.size < 1_000_000);
    if (!ok) throw new Error('too-big');
    return ok;
  }
}
