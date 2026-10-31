// Optional AI helper. Talks straight from the browser to an OpenAI-compatible API the user fills in
// (OpenAI, SiliconFlow, a self-hosted proxy, ...). The key is kept only in this browser's localStorage.

const STORE = 'ai.cfg';
const DEFAULTS = { base: 'https://api.openai.com/v1', key: '', imgModel: 'gpt-image-1', visModel: 'gpt-4o-mini' };

export const loadCfg = () => ({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') });
export const saveCfg = (c) => localStorage.setItem(STORE, JSON.stringify(c));
export const ready = (c) => !!(c.key && c.base);

const endpoint = (c, p) => c.base.trim().replace(/\/+$/, '') + p;

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
const WRAP_HINT = ' Wide landscape picture, bold clear shapes, rich colour, no text, no watermark.';

// text -> picture
export async function generate(c, prompt) {
  const body = { model: c.imgModel, prompt: prompt + WRAP_HINT, n: 1, size: sizeFor(c.imgModel) };
  if (/dall-e/i.test(c.imgModel)) body.response_format = 'b64_json';
  return imageOut(await call(c, '/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}

// picture + text -> new picture
export async function edit(c, blob, prompt) {
  const fd = new FormData();
  fd.append('model', c.imgModel); fd.append('prompt', prompt + WRAP_HINT); fd.append('n', '1');
  fd.append('size', sizeFor(c.imgModel)); fd.append('image', blob, 'source.png');
  return imageOut(await call(c, '/images/edits', { method: 'POST', body: fd }));
}

// picture -> where the face and the main subject are, as [x0,y0,x1,y1] in 0..1
export async function locate(c, dataUrl, w, h) {
  const ask = `Image size ${w}x${h}. Find the main face (forehead to chin, ear to ear) and the main subject (whole person, animal or object). `
    + 'Reply with JSON only: {"face":[x0,y0,x1,y1] or null,"subject":[x0,y0,x1,y1]}. Numbers are fractions 0-1 of width and height.';
  const body = (json) => JSON.stringify({
    model: c.visModel, temperature: 0, ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [{ role: 'user', content: [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url: dataUrl } }] }],
  });
  const post = (json) => call(c, '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(json) });
  let j; try { j = await post(true); } catch { j = await post(false); }        // some providers reject response_format
  const txt = j.choices?.[0]?.message?.content || '';
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('bad reply');
  const r = JSON.parse(m[0]);
  const norm = (b) => {
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number')) return null;
    let [x0, y0, x1, y1] = b; const mx = Math.max(...b);
    if (mx > 1.5) { const k = mx > 1000 ? Math.max(w, h) : 1000; x0 /= k; x1 /= k; y0 /= k; y1 /= k; }   // pixels or 0-1000
    const c4 = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)].map((v) => Math.min(1, Math.max(0, v)));
    return c4[2] - c4[0] > 0.01 && c4[3] - c4[1] > 0.01 ? c4 : null;
  };
  return { face: norm(r.face), subject: norm(r.subject) };
}

// Built-in face finder (Chrome on Android / some desktops). No network.
export async function localFace(bitmap, w, h) {
  if (!('FaceDetector' in window)) return null;
  try {
    const fs = await new window.FaceDetector({ fastMode: false, maxDetectedFaces: 5 }).detect(bitmap);
    if (!fs.length) return null;
    const b = fs.sort((p, q) => q.boundingBox.width * q.boundingBox.height - p.boundingBox.width * p.boundingBox.height)[0].boundingBox;
    return [b.x / w, (b.y - b.height * 0.15) / h, (b.x + b.width) / w, (b.y + b.height * 1.05) / h].map((v) => Math.min(1, Math.max(0, v)));
  } catch { return null; }
}
