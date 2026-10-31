import { MODELS, templateUrl, vehicleUrl } from './models.js';
import { parseTemplate, render, exportWrap, detectHorizon, zones } from './engine.js';
import * as AI from './ai.js';

// ---------- i18n --------------------------------------------------------------------------------
const I18N = {
  en: {
    'nav.how': 'How to use', 'hero.title': 'One picture. Your Tesla, wrapped.',
    'hero.sub': 'Drop in an image and it covers the whole car. All 12 official models. Your picture never leaves your browser.',
    s1: 'Pick your car', s2: 'Add a picture', s3: 'Pick a style', s4: 'Fine-tune', reset: 'Reset',
    'drop.t': 'Drop it here, or click to choose', 'drop.s': 'You can also paste with ⌘V / Ctrl+V',
    demo: 'No picture? Try:', 'demo.1': 'Sunset sea', 'demo.2': 'Neon grid', 'demo.3': 'Ink mountains',
    'm.wrap': 'Wrap', 'm.wrap.s': 'scene goes round', 'm.poster': 'Poster', 'm.poster.s': 'fill it all',
    'm.mirror': 'Mirror', 'm.mirror.s': 'both sides same', 'm.tile': 'Tile', 'm.tile.s': 'repeat pattern',
    't.outline': 'Panel outline', 'v.sheet': 'Wrap', 'v.lines': 'Show panels', 'v.car': 'Car photo',
    empty: 'Add a picture first', dl: 'Download wrap PNG',
    'how.t': 'Put it in the car', 'how.1': 'Make a folder', 'how.1p': 'On a USB drive (exFAT / FAT32) make a <code>Wraps</code> folder at the top level.',
    'how.2': 'Copy it in', 'how.2p': 'Put the PNG in. Up to 10 at a time.', 'how.3': 'Plug it in',
    'how.3p': 'Toybox → Paint Shop → Wraps, then pick yours.', 'how.4': 'Or use the app', 'how.4p': 'Tesla app 4.59+: Creations → Wrap → Upload.',
    fine: 'Templates come from Tesla\'s official repo teslamotors/custom-wraps. This project is not made by Tesla. Only use pictures you have the right to use.',
    // sliders
    horizonD: 'Horizon', horizonShift: 'Sky / sea', spin: 'Turn', oceanK: 'Sea depth', skyK: 'Sky height',
    zoom: 'Zoom', panX: 'Left / right', panY: 'Up / down', angle: 'Rotate',
    bright: 'Brightness', sat: 'Colour', contrast: 'Contrast', vignette: 'Edge shade',
    'st.loadTpl': 'Loading template…', 'st.render': 'Drawing…', 'st.ready': 'Ready', 'st.export': 'Making PNG…',
    'st.err': 'Could not load the template. Check your network.',
    'c.size': 'Size', 'c.bytes': 'Under 1 MB', 'c.name': 'Name ≤ 30', 'c.black': 'Outside is black',
    'm.face': 'Face', 'm.face.s': 'face on hood',
    'f.tip': 'Click the face in the picture to put it on the hood. Red = hood, blue = doors.',
    'f.ai': 'Find the face with AI', 'f.side': 'Figure on the doors',
    'ai.t': 'AI create / edit', 'ai.s': 'uses your own API', 'ai.ph': 'One line, e.g. cyberpunk city at night, neon, rain',
    'ai.gen': 'Make a new picture', 'ai.edit': 'Change this picture', 'ai.cfg': 'API settings', 'ai.base': 'API URL',
    'ai.img': 'Image model', 'ai.vis': 'Vision model',
    'ai.note': 'Works with OpenAI-style APIs (OpenAI, SiliconFlow, your own proxy…). The key stays in this browser only. When you use AI, your text and picture go to that API and it bills you.',
    faceSize: 'Face size', faceCrop: 'Face framing', sideZoom: 'Door figure', sideShift: 'Front / back', bgDark: 'Background dim', feather: 'Soft edge',
    'st.ai': 'AI is drawing… (10–60 s)', 'st.aiFind': 'AI is looking for the face…', 'st.noKey': 'Fill in the API key first',
    'st.noPrompt': 'Write a line first', 'st.noSrc': 'Add a picture first', 'st.noFace': 'This car has a different layout. Face style is not ready for it.',
    'st.found': 'Face found', 'st.notFound': 'No face found. Click the face yourself.', 'st.aiErr': 'AI failed: ',
    'st.urlBlocked': 'The API gave a link the browser may not read. Try a model that returns b64_json.',
  },
  zh: {
    faceSize: '脸大小', faceCrop: '脸取景', sideZoom: '车门人物', sideShift: '前后移', bgDark: '背景压暗', feather: '边缘柔和',
    'st.ai': 'AI 正在画…（10–60 秒）', 'st.aiFind': 'AI 正在找脸…', 'st.noKey': '先在“接口设置”里填 API Key',
    'st.noPrompt': '先写一句话', 'st.noSrc': '先放一张图片', 'st.noFace': '这个车型布局不同，暂不支持车头脸。',
    'st.found': '找到脸了', 'st.notFound': '没找到脸，请在小图上点一下脸。', 'st.aiErr': 'AI 出错：',
    'st.urlBlocked': '接口返回的图片链接浏览器读不了，换个能返回 b64_json 的模型。',
    horizonD: '地平线高度', horizonShift: '天空 / 海面', spin: '转一转', oceanK: '海面深度', skyK: '天空高度',
    zoom: '放大', panX: '左右移', panY: '上下移', angle: '旋转',
    bright: '亮度', sat: '色彩', contrast: '对比度', vignette: '四周压暗',
    'st.loadTpl': '正在加载模板…', 'st.render': '正在生成…', 'st.ready': '好了', 'st.export': '正在导出…',
    'st.err': '模板加载失败，请检查网络。',
    'c.size': '尺寸', 'c.bytes': '小于 1 MB', 'c.name': '文件名 ≤ 30', 'c.black': '模板外纯黑',
  },
};
let lang = (localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en'));
const zhDefaults = {};
document.querySelectorAll('[data-i18n]').forEach((el) => (zhDefaults[el.dataset.i18n] = el.innerHTML));
const t = (k) => (lang === 'en' ? I18N.en[k] : I18N.zh[k] ?? zhDefaults[k]) ?? zhDefaults[k] ?? k;
function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.innerHTML = lang === 'zh' ? zhDefaults[el.dataset.i18n] : I18N.en[el.dataset.i18n] ?? zhDefaults[el.dataset.i18n]));
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.dataset.zhPh ??= el.placeholder;
    el.placeholder = lang === 'zh' ? el.dataset.zhPh : I18N.en[el.dataset.i18nPh] ?? el.dataset.zhPh;
  });
  $('#lang').textContent = lang === 'zh' ? 'EN' : '中文';
  buildModels(); buildSliders(); setStatus(lastStatus, lastExtra);
}

// ---------- state -------------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const SL = {
  wrap: [['horizonD', 20, 260, 1, 100], ['horizonShift', -0.3, 0.3, 0.01, 0], ['spin', 0, 360, 1, 0], ['oceanK', 0.2, 1.5, 0.01, 1], ['skyK', 0.2, 1.5, 0.01, 1]],
  poster: [['zoom', 1, 3, 0.01, 1], ['panX', -0.5, 0.5, 0.01, 0], ['panY', -0.5, 0.5, 0.01, 0], ['angle', -180, 180, 1, 0]],
  mirror: [['zoom', 1, 3, 0.01, 1], ['panX', -0.5, 0.5, 0.01, 0], ['panY', -0.5, 0.5, 0.01, 0], ['angle', -180, 180, 1, 0]],
  tile: [['zoom', 0.3, 3, 0.01, 1], ['panX', -0.5, 0.5, 0.01, 0], ['panY', -0.5, 0.5, 0.01, 0], ['angle', -180, 180, 1, 0]],
  face: [['faceSize', 0.5, 1.6, 0.01, 1], ['faceCrop', 1, 2.6, 0.01, 1.5], ['sideZoom', 0.4, 2, 0.01, 0.95], ['sideShift', -0.4, 0.4, 0.01, -0.18],
         ['bgDark', 0, 0.85, 0.01, 0.35], ['feather', 0.04, 0.5, 0.01, 0.2]],
  common: [['bright', 0.5, 1.5, 0.01, 1], ['sat', 0, 2, 0.01, 1.1], ['contrast', 0.6, 1.6, 0.01, 1.05], ['vignette', 0, 0.6, 0.01, 0.15]],
};
const S = { model: localStorage.getItem('model') || 'modely-l', mode: 'wrap', view: 'sheet', src: null, srcName: '', T: null, rgba: null, vals: {} };
const templates = new Map();
const resetVals = () => { for (const k of ['wrap', 'poster', 'mirror', 'tile', 'face', 'common']) for (const [n, , , , d] of SL[k]) S.vals[`${k}.${n}`] = d; };
resetVals();
const val = (n) => S.vals[`${S.mode}.${n}`] ?? S.vals[`common.${n}`];

// ---------- UI builders -------------------------------------------------------------------------
function buildModels() {
  const box = $('#models'); box.innerHTML = '';
  for (const m of MODELS) {
    const b = document.createElement('button');
    b.className = 'model' + (m.id === S.model ? ' on' : ''); b.setAttribute('role', 'option'); b.dataset.id = m.id;
    b.innerHTML = `<img loading="lazy" src="${vehicleUrl(m.id)}" alt=""><b>${m.name}</b><small>${m.sub[lang]}</small>`;
    b.onclick = () => selectModel(m.id);
    box.appendChild(b);
  }
}
function buildSliders() {
  const box = $('#sliders'); box.innerHTML = '';
  for (const [grp, list] of [[S.mode, SL[S.mode]], ['common', SL.common]]) for (const [n, mn, mx, st] of list) {
    const key = `${grp}.${n}`, row = document.createElement('label'); row.className = 'sl';
    const fmt = (v) => (st >= 1 ? Math.round(v) : (+v).toFixed(2));
    row.innerHTML = `<span>${t(n)}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${S.vals[key]}"><output>${fmt(S.vals[key])}</output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.oninput = () => { S.vals[key] = +inp.value; out.textContent = fmt(inp.value); schedule(); };
    inp.ondblclick = () => { const d = SL[grp].find((x) => x[0] === n)[4]; inp.value = d; inp.oninput(); };
    box.appendChild(row);
  }
}
let lastStatus = '', lastExtra = '';
function setStatus(k, extra = '') { lastStatus = k; lastExtra = extra; $('#status').textContent = k ? t(k) + extra : ''; }

// ---------- template / source -------------------------------------------------------------------
function loadImage(src, cors) {
  return new Promise((res, rej) => { const im = new Image(); if (cors) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function pixels(im, maxSide) {
  const s = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * s)), h = Math.max(1, Math.round(im.naturalHeight * s));
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h);
}
async function getTemplate(id) {
  if (templates.has(id)) return templates.get(id);
  const im = await loadImage(templateUrl(id), true);
  const T = parseTemplate(pixels(im, 4096)); T.id = id; templates.set(id, T); return T;
}
async function selectModel(id) {
  S.model = id; localStorage.setItem('model', id);
  document.querySelectorAll('.model').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  $('#carImg').src = vehicleUrl(id);
  $('.empty-car').style.backgroundImage = `url(${templateUrl(id)})`;
  if (!$('#fname').dataset.touched) $('#fname').value = defaultName();
  busy(true); setStatus('st.loadTpl');
  try { S.T = await getTemplate(id); } catch { setStatus('st.err'); busy(false); return; }
  const c = $('#out'); c.width = S.T.W; c.height = S.T.H;
  $('#canvasWrap').style.aspectRatio = `${S.T.W}/${S.T.H}`;
  busy(false); schedule();
}
async function setSource(blobOrUrl, name) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const im = await loadImage(url, false);
  const d = pixels(im, 2048);
  S.src = { w: d.width, h: d.height, data: d.data };
  S.srcName = (name || 'wrap').replace(/\.[^.]+$/, '');
  S.autoHorizon = detectHorizon(S.src);
  S.im = im; S.face = guessFace(); S.subject = null; S.faceFrom = 'guess'; setStatus('st.ready');
  const th = $('#thumb'); th.src = url; th.hidden = false;
  $('#faceImg').src = url; showRects();
  if (!$('#fname').dataset.touched) $('#fname').value = defaultName();
  $('#empty').hidden = true; schedule();
  findFace(false);
}

// ---------- face: guess / built-in finder / AI / click ------------------------------------------
function guessFace() {
  const { w, h } = S.src, side = 0.34 * Math.min(w, h), cx = w / 2, cy = h * 0.36;
  return [(cx - side / 2) / w, (cy - side * 0.6) / h, (cx + side / 2) / w, (cy + side * 0.6) / h];
}
function showRects() {
  const put = (el, b) => { el.hidden = !b; if (b) Object.assign(el.style, { left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%` }); };
  put($('#faceRect'), S.src && S.face);
  put($('#subjRect'), S.src && $('#sideOn').checked && S.subject);
}
async function findFace(useAI) {
  if (!S.src) return;
  const src = S.src;
  if (!useAI) {
    const f = await AI.localFace(S.im, S.im.naturalWidth, S.im.naturalHeight);
    if (f && S.src === src && S.faceFrom === 'guess') { S.face = f; S.faceFrom = 'local'; showRects(); schedule(); }
    if (S.mode === 'face' && S.faceFrom === 'guess' && AI.ready(cfg())) return findFace(true);   // auto: one call per picture
    return;
  }
  const c = cfg(); if (!AI.ready(c)) { openCfg(); return setStatus('st.noKey'); }
  aiBusy(true); setStatus('st.aiFind');
  try {
    const N = 1000, k = N / Math.max(src.w, src.h), dw = src.w * k, dh = src.h * k, ox = (N - dw) / 2, oy = (N - dh) / 2;
    const cv = new OffscreenCanvas(N, N), x = cv.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.drawImage(S.im, ox, oy, dw, dh);
    const url = await blobToDataUrl(await cv.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
    const r = await AI.locate(c, url, N, N);
    const back = (b) => b && [(b[0] * N - ox) / dw, (b[1] * N - oy) / dh, (b[2] * N - ox) / dw, (b[3] * N - oy) / dh].map((v) => Math.min(1, Math.max(0, v)));
    if (S.src !== src) return;
    S.faceFrom = 'ai';
    if (r.subject) S.subject = back(r.subject);
    if (r.face) { S.face = back(r.face); setStatus('st.found'); } else setStatus('st.notFound');
    showRects(); schedule();
  } catch (e) { console.error(e); setStatus('st.aiErr', e.message); S.faceFrom = 'tried'; }
  aiBusy(false);
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

// ---------- AI picture ------------------------------------------------------------------------------
const cfg = () => ({ base: $('#aiBase').value || 'https://api.openai.com/v1', key: $('#aiKey').value, imgModel: $('#aiImg').value || 'gpt-image-1', visModel: $('#aiVis').value || 'gpt-4o-mini' });
function openCfg() { $('#ai').open = true; $('#aiCfgBox').open = true; $('#aiKey').focus(); }
function aiBusy(on) { busy(on); ['#aiGen', '#aiEdit', '#aiFind'].forEach((s) => ($(s).disabled = on)); }
async function aiPicture(editing) {
  const c = cfg(), prompt = $('#aiPrompt').value.trim();
  if (!AI.ready(c)) { openCfg(); return setStatus('st.noKey'); }
  if (!prompt) { $('#aiPrompt').focus(); return setStatus('st.noPrompt'); }
  if (editing && !S.src) return setStatus('st.noSrc');
  aiBusy(true); setStatus('st.ai');
  try {
    let blob;
    if (editing) {
      const cv = new OffscreenCanvas(S.src.w, S.src.h);
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(S.src.data), S.src.w, S.src.h), 0, 0);
      blob = await AI.edit(c, await cv.convertToBlob({ type: 'image/png' }), prompt);
    } else blob = await AI.generate(c, prompt);
    aiBusy(false);
    await setSource(blob, 'ai_' + prompt.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 14));
  } catch (e) {
    console.error(e); aiBusy(false);
    e.message === 'image-url-blocked' ? setStatus('st.urlBlocked') : setStatus('st.aiErr', e.message);
  }
}
function defaultName() {
  const base = (S.srcName || 'wrap').normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'wrap';
  const short = S.model.replace('model', 'm').replace(/-20(\d\d)/, '$1').replace(/-(base|performance|premium|plaid)$/, (x) => x.slice(0, 2));
  return `${short}_${base}`.slice(0, 26);
}

// ---------- render loop -------------------------------------------------------------------------
let pending = false;
function schedule() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; draw(); }); }
function busy(on) { $('#busy').hidden = !on; }
function draw() {
  const ready = S.T && S.src; $('#dl').disabled = !ready;
  if (!ready) return;
  const o = {
    mode: S.mode, outline: $('#outline').checked,
    bright: val('bright'), sat: val('sat'), contrast: val('contrast'), vignette: val('vignette'),
  };
  if (S.mode === 'wrap') Object.assign(o, {
    horizonD: val('horizonD'), spin: val('spin'), oceanK: val('oceanK'), skyK: val('skyK'),
    horizonRow: Math.max(0, Math.min(S.src.h - 1, S.autoHorizon + val('horizonShift') * S.src.h)),
  }); else if (S.mode === 'face') Object.assign(o, {
    face: S.face, subject: S.subject, sideOn: $('#sideOn').checked, faceSize: val('faceSize'), faceCrop: val('faceCrop'),
    sideZoom: val('sideZoom'), sideShift: val('sideShift'), bgDark: val('bgDark'), feather: val('feather'),
  }); else Object.assign(o, { zoom: val('zoom'), panX: val('panX'), panY: val('panY'), angle: val('angle') });
  S.rgba = render(S.T, S.src, o);
  paint(); $('#checks').innerHTML = '';
  if (S.mode === 'face' && !zones(S.T)) setStatus('st.noFace');
  else if (!['st.ai', 'st.aiFind', 'st.aiErr', 'st.urlBlocked', 'st.found', 'st.notFound', 'st.noKey', 'st.noPrompt', 'st.noSrc'].includes(lastStatus)) setStatus('st.ready');
}
function paint() {
  const c = $('#out'), x = c.getContext('2d');
  const showCar = S.view === 'car';
  $('#carImg').hidden = !showCar; c.hidden = showCar;
  if (!S.rgba) return;
  const img = new ImageData(new Uint8ClampedArray(S.rgba), S.T.W, S.T.H);
  if (S.view === 'lines') {
    const d = img.data, { mask, lines, W, H } = S.T;
    for (let i = 0; i < W * H; i++) if (!mask[i] && !lines[i]) { d[i * 4] = 14; d[i * 4 + 1] = 15; d[i * 4 + 2] = 20; }
    for (let i = 0; i < W * H; i++) if (mask[i]) for (let k = 0; k < 3; k++) d[i * 4 + k] = d[i * 4 + k] * 0.55 + 255 * 0.45 * (k === 0 ? 0.3 : 0.2);
  }
  x.putImageData(img, 0, 0);
}

// ---------- export ------------------------------------------------------------------------------
function cleanName() {
  let n = $('#fname').value.replace(/\.png$/i, '').replace(/[^A-Za-z0-9 _-]+/g, '_').trim().slice(0, 26) || 'wrap';
  $('#fname').value = n; return n + '.png';
}
async function download() {
  if (!S.rgba) return;
  const name = cleanName(); busy(true); setStatus('st.export'); $('#dl').disabled = true;
  try {
    const r = await exportWrap(S.T, S.rgba);
    const outsideBlack = (() => { for (let i = 0; i < S.T.mask.length; i++) if (!S.T.mask[i] && r.index[i] !== 0) return false; return true; })();
    const checks = [
      ['c.size', `${S.T.W}×${S.T.H}`, S.T.W <= 1024 && S.T.H <= 1024 && Math.max(S.T.W, S.T.H) >= 512],
      ['c.bytes', `${Math.round(r.blob.size / 1024)} KB`, r.blob.size < 1_000_000],
      ['c.name', `${name.length}`, name.length <= 30],
      ['c.black', '', outsideBlack],
    ];
    $('#checks').innerHTML = checks.map(([k, v, ok]) => `<li class="${ok ? 'ok' : 'bad'}">${t(k)}${v ? ' · ' + v : ''}</li>`).join('');
    const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus('st.ready');
  } catch (e) { console.error(e); setStatus('st.err'); }
  busy(false); $('#dl').disabled = false;
}

// ---------- events ------------------------------------------------------------------------------
const drop = $('#drop');
$('#file').onchange = (e) => e.target.files[0] && setSource(e.target.files[0], e.target.files[0].name);
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === drop) drop.classList.remove('over'); }));
document.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')); if (f) setSource(f, f.name); });
document.addEventListener('paste', (e) => { const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/')); if (it) setSource(it.getAsFile(), 'pasted'); });
document.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = () => setSource(b.dataset.demo, b.dataset.demo.split('/').pop().replace('demo_', ''))));
document.querySelectorAll('.mode').forEach((b) => (b.onclick = () => {
  S.mode = b.dataset.mode; document.querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === b)); buildSliders();
  $('#faceBox').hidden = S.mode !== 'face'; setStatus('st.ready'); schedule();
  if (S.mode === 'face' && S.faceFrom === 'guess' && AI.ready(cfg())) findFace(true);
}));
$('#facePick').onclick = (e) => {
  if (!S.src) return;
  const r = e.currentTarget.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  const f = S.face, hw = (f[2] - f[0]) / 2, hh = (f[3] - f[1]) / 2;
  S.face = [px - hw, py - hh, px + hw, py + hh]; S.faceFrom = 'click'; showRects(); schedule();
};
$('#sideOn').onchange = () => { showRects(); schedule(); };
$('#aiFind').onclick = () => findFace(true);
$('#aiGen').onclick = () => aiPicture(false);
$('#aiEdit').onclick = () => aiPicture(true);
{
  const c = AI.loadCfg(), map = { aiBase: 'base', aiKey: 'key', aiImg: 'imgModel', aiVis: 'visModel' };
  for (const [id, k] of Object.entries(map)) { $('#' + id).value = c[k]; $('#' + id).onchange = () => AI.saveCfg(cfg()); }
}
document.querySelectorAll('#view button').forEach((b) => (b.onclick = () => {
  S.view = b.dataset.view; document.querySelectorAll('#view button').forEach((x) => x.classList.toggle('on', x === b)); paint();
}));
$('#outline').onchange = schedule;
$('#reset').onclick = () => { resetVals(); buildSliders(); schedule(); };
$('#dl').onclick = download;
$('#fname').oninput = () => ($('#fname').dataset.touched = '1');
$('#lang').onclick = () => { lang = lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('lang', lang); applyLang(); };

applyLang();
selectModel(MODELS.some((m) => m.id === S.model) ? S.model : 'modely-l');
