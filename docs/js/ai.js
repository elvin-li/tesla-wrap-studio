// AI helpers.
//  free (default): several free picture services start at the same time. The first picture wins; pictures
//                  that land later are handed to onExtra (the page shows them as extra choices).
//                  Face + person finding runs with MediaPipe in a Web Worker (nothing is uploaded).
//  custom        : any OpenAI-compatible API the user fills in. The key is kept only in this browser.

const STORE = 'ai.cfg';
const DEFAULTS = { provider: 'free', base: 'https://api.openai.com/v1', key: '', imgModel: 'gpt-image-1', visModel: 'gpt-4o-mini', count: 1 };

export const loadCfg = () => ({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') });
export const saveCfg = (c) => localStorage.setItem(STORE, JSON.stringify(c));
export const isCustom = (c) => c.provider === 'custom';
export const ready = (c) => !isCustom(c) || !!(c.key && c.base);
export const canEdit = (c) => isCustom(c) && ready(c);

const endpoint = (c, p) => c.base.trim().replace(/\/+$/, '') + p;
const abortErr = () => new DOMException('stop', 'AbortError');
const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) return rej(abortErr());
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortErr()); }, { once: true });
});

async function call(c, path, init) {
  const r = await fetch(endpoint(c, path), { ...init, headers: { Authorization: `Bearer ${c.key.trim()}`, ...(init.headers || {}) } });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`${r.status} ${txt.slice(0, 160)}`); }
  if (!r.ok) throw new Error(j.error?.message || j.message || `HTTP ${r.status}`);
  return j;
}
function b64Blob(b64, type = 'image/png') {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
async function imageOut(j) {
  const d = j.data?.[0] || j.images?.[0];
  if (!d) throw new Error('no image in reply');
  if (d.b64_json) return b64Blob(d.b64_json);
  if (d.url) {
    try { const r = await fetch(d.url); if (r.ok) return await r.blob(); } catch { /* fall through */ }
    throw new Error('image-url-blocked');
  }
  throw new Error('no image in reply');
}

const sizeFor = (m) => (/dall-e-3/i.test(m) ? '1792x1024' : /gpt-image/i.test(m) ? '1536x1024' : '1024x1024');
const WRAP_HINT = ', vivid colour, sharp detail, no text, no watermark';
const FACE_HINT = ', one person, upper body, face clearly visible and lit, looking at the camera';

// ---------- free services --------------------------------------------------------------------------
const POLL_IMG = 'https://image.pollinations.ai/prompt/';
const POLL_TXT = 'https://text.pollinations.ai/openai';
const FLUX = 'https://black-forest-labs-flux-1-schnell.hf.space';    // Hugging Face Space, ZeroGPU
const HORDE = 'https://aihorde.net/api/v2';                         // AI Horde, volunteer GPUs
const AGENT = 'wrap-studio:2:github.com/elvin-li/tesla-wrap-studio';
export const FREE_SERVICES = ['FLUX.1-schnell (Hugging Face)', 'Pollinations', 'AI Horde'];

// ---------- Pollinations account (optional) ------------------------------------------------------
// The visitor signs in at enter.pollinations.ai and lets this page spend a small budget of their own Pollen
// ("Bring Your Own Pollen"). Pictures then come from gen.pollinations.ai: no logo, no 45 s queue.
// The key stays in this tab only (sessionStorage), as Pollinations asks, and is only sent to gen.pollinations.ai.
// Optional: an App Key (pk_..., free at enter.pollinations.ai/keys, redirect URI = this page) shows the app name
// on the sign-in screen. Without it Pollinations shows this site's address instead.
export const POLLEN_APP_KEY = '';
const POLL_GEN = 'https://gen.pollinations.ai';
const PKEY = 'pollen.key', PSTATE = 'pollen.state';
export const pollenKey = () => { try { return sessionStorage.getItem(PKEY) || ''; } catch { return ''; } };
const pollenChanged = (why) => window.dispatchEvent(new CustomEvent('pollen:change', { detail: why }));
export function pollenLogout(why = 'logout') {
  try { sessionStorage.removeItem(PKEY); } catch { /* storage off */ }
  pollenChanged(why);
}
export function pollenLoginUrl() {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(PSTATE, state);
  // no scope: a budgeted key can read its own balance and make pictures without one. expiry 7 days (their default).
  const q = new URLSearchParams({ redirect_uri: location.origin + location.pathname, models: 'image,text', budget: '5', expiry: '7', state });
  if (POLLEN_APP_KEY) q.set('client_id', POLLEN_APP_KEY);
  return 'https://enter.pollinations.ai/authorize?' + q;
}
// Run once when the page opens. Pollinations comes back with #api_key=sk_...&state=... (or #error=...).
// Returns 'ok' | 'denied' | 'bad' | null (nothing to do). The key is taken out of the address bar at once.
export function pollenCallback() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('api_key') && !h.has('error')) return null;
  let want = '';
  try { want = sessionStorage.getItem(PSTATE) || ''; sessionStorage.removeItem(PSTATE); } catch { /* storage off */ }
  history.replaceState(null, '', location.pathname + location.search);
  if (h.has('error')) return 'denied';
  const key = h.get('api_key') || '';
  if (!want || h.get('state') !== want || !/^sk_[\w-]{8,200}$/.test(key)) return 'bad';
  sessionStorage.setItem(PKEY, key);
  pollenChanged('login');
  return 'ok';
}
// Pollen left on this key (null when unknown). A refused key (401) is dropped. A key whose budget the visitor
// cleared on the consent screen gets 403 here (no budget, no account:usage scope): it still makes pictures.
export async function pollenBalance() {
  const key = pollenKey(); if (!key) return null;
  try {
    const r = await fetch(`${POLL_GEN}/account/balance`, { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401) { pollenLogout('expired'); return null; }
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.balance === 'number' ? j.balance : null;
  } catch { return null; }
}
// One picture with the visitor's own key: model flux = FLUX.1-schnell, about 0.002 Pollen.
async function pollinationsKeyed(prompt, { signal }) {
  const key = pollenKey();
  const url = `${POLL_GEN}/image/${encodeURIComponent(prompt)}?model=flux&width=1536&height=960&seed=${(Math.random() * 2147483647) | 0}`;
  const r = await fetch(url, { signal, headers: { Authorization: `Bearer ${key}` } });
  if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) return r.blob();
  if (r.status === 401) { pollenLogout('expired'); throw new Error('pollen-expired'); }
  if (r.status === 403) { pollenLogout('noimage'); throw new Error('pollen-noimage'); }   // image models were unticked
  if (r.status === 402) { pollenChanged('empty'); throw new Error('pollen-empty'); }
  throw new Error(`pollen HTTP ${r.status}`);
}

// Chinese (or any) line -> short English image prompt. Falls back to the raw text.
async function englishPrompt(text, signal) {
  if (/^[\x00-\x7f]*$/.test(text)) return text;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  const stop = () => ctl.abort(); signal?.addEventListener('abort', stop, { once: true });
  try {
    const r = await fetch(POLL_TXT, {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages: [
        { role: 'system', content: 'Translate the user text into one short English prompt for an image model. Reply with the prompt only.' },
        { role: 'user', content: text }] }),
    });
    const out = (await r.json()).choices?.[0]?.message?.content?.trim();
    return out && out.length < 400 ? out.replace(/^["']|["']$/g, '') : text;
  } catch (e) { if (signal?.aborted) throw abortErr(); return text; }
  finally { clearTimeout(t); signal?.removeEventListener('abort', stop); }
}

// FLUX.1-schnell on Hugging Face: about 3 s, no key. Its free GPU time is small (about 1 picture a day per
// visitor), so after a refusal it is skipped for an hour.
const FLUX_PAUSE = 'ai.fluxPause';
async function flux(prompt, { signal }) {
  if (Date.now() < +(localStorage.getItem(FLUX_PAUSE) || 0)) throw new Error('flux-paused');
  const r = await fetch(`${FLUX}/gradio_api/call/infer`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [prompt, 0, true, 1536, 960, 4] }),
  });
  if (!r.ok) throw new Error(`flux HTTP ${r.status}`);
  const { event_id: ev } = await r.json();
  const sse = await (await fetch(`${FLUX}/gradio_api/call/infer/${ev}`, { signal })).text();
  const kind = [...sse.matchAll(/^event:\s*(\w+)/gm)].map((m) => m[1]).pop();
  const data = [...sse.matchAll(/^data:\s*(.*)$/gm)].map((m) => m[1]).pop();
  if (kind !== 'complete') {
    localStorage.setItem(FLUX_PAUSE, String(Date.now() + 3600e3));
    throw new Error('flux-refused');
  }
  const file = JSON.parse(data)?.[0];
  const img = await fetch(file?.url || `${FLUX}/gradio_api/file=${file?.path}`, { signal });
  if (!img.ok) throw new Error(`flux file HTTP ${img.status}`);
  return img.blob();
}

// Pollinations: no key, about 1 picture / 45 s per visitor; waits out its limit (onWait = seconds left).
async function pollinations(prompt, { signal, onWait }) {
  const url = `${POLL_IMG}${encodeURIComponent(prompt)}?width=1536&height=960&nologo=true&model=flux&seed=${(Math.random() * 1e9) | 0}`;
  for (let tries = 0; tries < 12; tries++) {
    const r = await fetch(url, { signal });
    if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) return r.blob();
    let wait = 15;
    try { const m = (await r.json()).error?.message?.match(/after (\d+)\s*s/i); if (m) wait = +m[1] + 1; } catch { /* keep 15 */ }
    if (![402, 429, 500, 502, 503, 504].includes(r.status)) throw new Error(`HTTP ${r.status}`);
    for (let s = wait; s > 0; s--) { onWait?.(s); await sleep(1000, signal); }
    onWait?.(0);
  }
  throw new Error('free-busy');
}

// AI Horde: volunteer GPUs, no key, slow queue. Anonymous jobs must stay under 576x576 pixels of area.
async function horde(prompt, { signal }) {
  const head = { apikey: '0000000000', 'Client-Agent': AGENT, 'Content-Type': 'application/json' };
  const r = await fetch(`${HORDE}/generate/async`, {
    method: 'POST', signal, headers: head,
    body: JSON.stringify({ prompt: `${prompt} ### text, watermark, blurry`, nsfw: false, censor_nsfw: true, r2: false, shared: false,
      slow_workers: true, params: { width: 704, height: 448, steps: 20, n: 1, sampler_name: 'k_euler_a', cfg_scale: 6 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(j.message || `horde HTTP ${r.status}`);
  const cancel = () => fetch(`${HORDE}/generate/status/${j.id}`, { method: 'DELETE', headers: { 'Client-Agent': AGENT }, keepalive: true }).catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (let k = 0; k < 120; k++) {
      await sleep(5000, signal);
      const c = await (await fetch(`${HORDE}/generate/check/${j.id}`, { signal, headers: { 'Client-Agent': AGENT } })).json();
      if (c.faulted || c.is_possible === false) throw new Error('horde-failed');
      if (c.done) break;
    }
    const s = await (await fetch(`${HORDE}/generate/status/${j.id}`, { signal, headers: { 'Client-Agent': AGENT } })).json();
    const g = s.generations?.[0];
    if (!g?.img || g.censored) throw new Error('horde-empty');
    return g.img.startsWith('http') ? (await fetch(g.img, { signal })).blob() : b64Blob(g.img, 'image/webp');
  } finally { signal?.removeEventListener('abort', cancel); }
}

// Race: FLUX + Pollinations start together; AI Horde joins after 25 s without a picture, or when both fail.
async function freeGenerate(prompt, { signal, onWait, onExtra, face } = {}) {
  if (face) preload();                                    // face models load while the picture is made
  const p = (await englishPrompt(prompt, signal)) + (face ? FACE_HINT : '') + WRAP_HINT;
  return new Promise((resolve, reject) => {
    let won = false, running = 0, hordeOn = false, timer = 0;
    const errors = [];
    const done = (name) => (blob) => {
      if (signal?.aborted) return;
      blob.source = name;
      if (!won) { won = true; clearTimeout(timer); onWait?.(0); resolve(blob); } else onExtra?.(blob, name);
    };
    const failed = (name) => (e) => {
      running--;
      if (e?.name === 'AbortError') return;
      errors.push(`${name}: ${e?.message || e}`);
      if (!won && running === 0) { if (!hordeOn) startHorde(); else reject(new Error(errors.some((x) => /free-busy/.test(x)) ? 'free-busy' : errors.join('; '))); }
    };
    const run = (name, fn) => { running++; fn().then(done(name), failed(name)); };
    function startHorde() {
      if (hordeOn || won || signal?.aborted) return;
      hordeOn = true; run('AI Horde', () => horde(p, { signal }));
    }
    signal?.addEventListener('abort', () => { clearTimeout(timer); if (!won) reject(abortErr()); }, { once: true });
    const classic = () => pollinations(p, { signal, onWait: (s) => { if (!won) onWait?.(s); } });
    run('FLUX', () => flux(p, { signal }));
    // signed in: the visitor's own key (no logo, no queue); if it is refused, carry on with the free queue
    run('Pollinations', () => (pollenKey()
      ? pollinationsKeyed(p, { signal }).catch((e) => { if (e?.name === 'AbortError') throw e; return classic(); })
      : classic()));
    timer = setTimeout(startHorde, 25000);
  });
}

// ---------- public: pictures ---------------------------------------------------------------------
export async function generate(c, prompt, opt = {}) {
  if (!isCustom(c)) return freeGenerate(prompt, opt);
  const body = JSON.stringify({ model: c.imgModel, prompt: prompt + (opt.face ? FACE_HINT : '') + WRAP_HINT, n: 1, size: sizeFor(c.imgModel),
    ...(/dall-e/i.test(c.imgModel) ? { response_format: 'b64_json' } : {}) });
  const one = () => call(c, '/images/generations', { method: 'POST', signal: opt.signal, headers: { 'Content-Type': 'application/json' }, body }).then(imageOut);
  const n = Math.max(1, Math.min(4, +c.count || 1));
  if (n === 1) return one();
  // n requests at once: the first picture resolves, the others arrive through onExtra
  return new Promise((resolve, reject) => {
    let won = false, left = n; const errs = [];
    for (let k = 0; k < n; k++) one().then((b) => { if (!won) { won = true; resolve(b); } else opt.onExtra?.(b, 'API'); },
      (e) => { errs.push(e); if (--left === 0 && !won) reject(errs[0]); });
  });
}
export async function edit(c, blob, prompt) {
  const fd = new FormData();
  fd.append('model', c.imgModel); fd.append('prompt', prompt + WRAP_HINT); fd.append('n', '1');
  fd.append('size', sizeFor(c.imgModel)); fd.append('image', blob, 'source.png');
  return imageOut(await call(c, '/images/edits', { method: 'POST', body: fd }));
}

// ---------- custom API: where is the face ----------------------------------------------------------
export async function locate(c, dataUrl, w, h) {
  const ask = `Image size ${w}x${h}. Find the main face (forehead to chin, ear to ear) and the main subject (whole person, animal or object). `
    + 'Reply with JSON only: {"face":[x0,y0,x1,y1] or null,"subject":[x0,y0,x1,y1]}. Numbers are fractions 0-1 of width and height.';
  const body = (json) => JSON.stringify({
    model: c.visModel, temperature: 0, ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [{ role: 'user', content: [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url: dataUrl } }] }],
  });
  const post = (json) => call(c, '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(json) });
  let j; try { j = await post(true); } catch { j = await post(false); }
  const txt = j.choices?.[0]?.message?.content || '';
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('bad reply');
  const r = JSON.parse(m[0]);
  const norm = (b) => {
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number')) return null;
    let [x0, y0, x1, y1] = b; const mx = Math.max(...b);
    if (mx > 1.5) { const k = mx > 1000 ? Math.max(w, h) : 1000; x0 /= k; x1 /= k; y0 /= k; y1 /= k; }
    const c4 = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)].map((v) => Math.min(1, Math.max(0, v)));
    return c4[2] - c4[0] > 0.01 && c4[3] - c4[1] > 0.01 ? c4 : null;
  };
  return { face: norm(r.face), subject: norm(r.subject) };
}

// ---------- free, in the browser: face + person cut-out (MediaPipe) ------------------------------
// Runs in a Web Worker (ai-worker.js), so model loading and detection never block the page.
// If the worker cannot start, the same code runs on the page instead.
let worker = null, workerOk = true, seq = 0;
const waits = new Map();
function getWorker() {
  if (!workerOk || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url));        // classic worker: MediaPipe uses importScripts
    worker.onmessage = ({ data: m }) => { const w = waits.get(m.id); if (!w) return; waits.delete(m.id); m.t === 'err' ? w.rej(new Error(m.msg)) : w.res(m); };
    worker.onerror = (e) => { e.preventDefault?.(); dropWorker(new Error(e.message || 'ai worker failed')); };
  } catch { workerOk = false; worker = null; }
  return worker;
}
function dropWorker(err) {
  workerOk = false; try { worker?.terminate(); } catch {} worker = null;
  for (const w of waits.values()) w.rej(err); waits.clear();
}
const ask = (msg, transfer = []) => new Promise((res, rej) => {
  const w = getWorker(); if (!w) return rej(new Error('no-worker'));
  const id = ++seq; waits.set(id, { res, rej }); w.postMessage({ ...msg, id }, transfer);
});

// Start loading the face + person models in the background. Safe to call many times.
let preloading = null;
export function preload() {
  return (preloading ??= ask({ t: 'preload' }).catch((e) => { console.warn('[ai] worker preload failed, using the page:', e); dropWorker(e); return mediapipe(); }));
}

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';
let mpTasks = null;
function mediapipe() {
  return (mpTasks ??= (async () => {
    const v = await import(`${MP}/vision_bundle.mjs`);
    const files = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const mk = (Task, path, extra = {}) => Task.createFromOptions(files, { baseOptions: { modelAssetPath: `${MODELS}/${path}`, delegate: 'CPU' }, runningMode: 'IMAGE', ...extra })
      .catch((e) => { console.warn(e); return null; });
    const [face, seg] = await Promise.all([
      mk(v.FaceDetector, 'face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', { minDetectionConfidence: 0.4 }),
      mk(v.ImageSegmenter, 'image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', { outputConfidenceMasks: true, outputCategoryMask: false }),
    ]);
    return { face, seg };
  })().catch((e) => { mpTasks = null; throw e; }));
}

// The picture is scaled exactly as before (max side 1024) and handed over as pixels.
function inputPixels(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const k = Math.min(1, 1024 / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  return { cv, data: x.getImageData(0, 0, w, h) };
}

// Returns { face:[x0,y0,x1,y1]|null, subject:[..]|null, alpha:{w,h,data}|null } (boxes in 0..1).
export async function localFind(img) {
  const { cv, data } = inputPixels(img);
  if (getWorker()) {
    try { const r = await ask({ t: 'find', img: data }, [data.data.buffer]); return { face: r.face, subject: r.subject, alpha: r.alpha }; }
    catch (e) { console.warn('[ai] worker find failed, using the page:', e); dropWorker(e); }
  }
  const { face: fd, seg } = await mediapipe();
  const { boxes } = await import('./ai-boxes.js');
  return boxes(fd ? fd.detect(cv).detections || [] : [], seg ? seg.segment(cv) : null, cv.width, cv.height);
}
