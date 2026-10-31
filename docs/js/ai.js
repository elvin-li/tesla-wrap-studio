// AI helpers.
//  free (default): pictures from Pollinations (no key, ~1 picture / 45 s per visitor), face + person finding
//                  with MediaPipe running inside the browser (nothing is uploaded).
//  custom        : any OpenAI-compatible API the user fills in. The key is kept only in this browser.

const STORE = 'ai.cfg';
const DEFAULTS = { provider: 'free', base: 'https://api.openai.com/v1', key: '', imgModel: 'gpt-image-1', visModel: 'gpt-4o-mini' };

export const loadCfg = () => ({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') });
export const saveCfg = (c) => localStorage.setItem(STORE, JSON.stringify(c));
export const isCustom = (c) => c.provider === 'custom';
export const ready = (c) => !isCustom(c) || !!(c.key && c.base);
export const canEdit = (c) => isCustom(c) && ready(c);

const endpoint = (c, p) => c.base.trim().replace(/\/+$/, '') + p;
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('stop', 'AbortError')); }, { once: true });
});

async function call(c, path, init) {
  const r = await fetch(endpoint(c, path), { ...init, headers: { Authorization: `Bearer ${c.key.trim()}`, ...(init.headers || {}) } });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`${r.status} ${txt.slice(0, 160)}`); }
  if (!r.ok) throw new Error(j.error?.message || j.message || `HTTP ${r.status}`);
  return j;
}
function b64Blob(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: 'image/png' });
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

// ---------- free pictures ------------------------------------------------------------------------
const POLL_IMG = 'https://image.pollinations.ai/prompt/';
const POLL_TXT = 'https://text.pollinations.ai/openai';

// Chinese (or any) line -> short English image prompt. Falls back to the raw text.
async function englishPrompt(text, signal) {
  if (/^[\x00-\x7f]*$/.test(text)) return text;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    signal?.addEventListener('abort', () => ctl.abort(), { once: true });
    const r = await fetch(POLL_TXT, {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages: [
        { role: 'system', content: 'Translate the user text into one short English prompt for an image model. Reply with the prompt only.' },
        { role: 'user', content: text }] }),
    });
    clearTimeout(t);
    const out = (await r.json()).choices?.[0]?.message?.content?.trim();
    return out && out.length < 400 ? out.replace(/^["']|["']$/g, '') : text;
  } catch (e) { if (signal?.aborted) throw e; return text; }
}

// onWait(seconds) is called while we wait for the free limit to reset.
async function freeGenerate(prompt, { signal, onWait, seed, face } = {}) {
  const p = (await englishPrompt(prompt, signal)) + (face ? FACE_HINT : '') + WRAP_HINT;
  const url = `${POLL_IMG}${encodeURIComponent(p)}?width=1536&height=960&nologo=true&model=flux&seed=${seed ?? (Math.random() * 1e9) | 0}`;
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

// ---------- public: pictures ---------------------------------------------------------------------
export async function generate(c, prompt, opt) {
  if (!isCustom(c)) return freeGenerate(prompt, opt);
  const body = { model: c.imgModel, prompt: prompt + (opt?.face ? FACE_HINT : '') + WRAP_HINT, n: 1, size: sizeFor(c.imgModel) };
  if (/dall-e/i.test(c.imgModel)) body.response_format = 'b64_json';
  return imageOut(await call(c, '/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
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

// Returns { face:[x0,y0,x1,y1]|null, subject:[..]|null, alpha:{w,h,data}|null } (boxes in 0..1).
export async function localFind(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const k = Math.min(1, 1024 / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
  const { face: fd, seg } = await mediapipe();
  const out = { face: null, subject: null, alpha: null };
  if (fd) {
    const ds = fd.detect(cv).detections || [];
    const b = ds.map((d) => d.boundingBox).sort((p, q) => q.width * q.height - p.width * p.height)[0];
    if (b) out.face = [b.originX / w, (b.originY - b.height * 0.28) / h, (b.originX + b.width) / w, (b.originY + b.height * 1.08) / h]
      .map((v) => Math.min(1, Math.max(0, v)));
  }
  if (seg) {
    const r = seg.segment(cv), m = r.confidenceMasks?.[0];
    if (m) {
      const data = m.getAsFloat32Array().slice(), mw = m.width, mh = m.height;
      r.close?.();
      let n = 0, x0 = mw, y0 = mh, x1 = 0, y1 = 0;
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (data[y * mw + x] > 0.5) {
        n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const share = n / (mw * mh);
      if (share > 0.03 && share < 0.8) { out.alpha = { w: mw, h: mh, data }; out.subject = [x0 / mw, y0 / mh, (x1 + 1) / mw, (y1 + 1) / mh]; }
    }
  }
  return out;
}
