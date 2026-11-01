import { MODELS, templateUrl, vehicleUrl } from './models.js';
import { parseTemplate, render, exportWrap, detectHorizon, zones } from './engine.js';
import { Pool, poolSupported } from './pool.js';
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
    't.outline': 'Panel outline', 'v.sheet': 'Wrap', 'v.lines': 'Show panels', 'v.car': 'Car photo', 'v.3d': '3D view',
    'v3d.hint': 'Drag to turn, scroll to zoom. The body is an approximate shape.',
    'cam.three': '3/4', 'cam.front': 'Front', 'cam.side': 'Side', 'cam.rear': 'Rear', 'cam.top': 'Top', 'cam.spin': 'Spin',
    'st.load3d': 'Loading 3D…', 'st.no3d': 'This browser cannot show the 3D view.',
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
    'f.ai': 'Find the face again', 'f.side': 'Figure on the doors', 'f.cut': 'Person only (cut out)',
    'ai.t': 'AI picture', 'ai.s': 'free, no sign-up', 'ai.ph': 'One line, e.g. cyberpunk city at night, neon, rain',
    'ai.prov': 'Service', 'ai.pFree': 'Free (Pollinations)', 'ai.pCustom': 'My own API (OpenAI style)',
    'ai.free': 'Free: FLUX (Hugging Face) and Pollinations draw at the same time; AI Horde joins after 25 s. The first picture is used, later ones show up below. Your words go to these services. Face finding runs in your browser. Signed in to Pollinations, pictures use your own allowance (about 0.002 Pollen each); the sign-in key stays in this tab only.',
    'ai.count': 'At once', 'st.extra': 'Another picture arrived',
    'pl.in': 'Sign in to Pollinations: no logo, no queue', 'pl.on': 'Signed in to Pollinations', 'pl.out': 'Sign out', 'pl.bal': ' · N Pollen left',
    'st.plOk': 'Signed in. New pictures have no logo.', 'st.plDenied': 'Sign-in cancelled', 'st.plBad': 'Sign-in did not work. Please try again.',
    'st.plExpired': 'Pollinations sign-in ran out. Using the free queue.', 'st.plEmpty': 'Your Pollen is used up. Using the free queue.',
    'ai.stop': 'Stop', 'ai.ideas': 'Ideas:',
    'st.threads': ' · N threads',
    'st.wait': 'Free limit, waiting', 'st.stopped': 'Stopped', 'st.freeBusy': 'The free service is busy. Try again in a minute.',
    'ai.gen': 'Make a new picture', 'ai.edit': 'Change this picture', 'ai.cfg': 'API settings', 'ai.base': 'API URL',
    'ai.img': 'Image model', 'ai.vis': 'Vision model',
    'ai.note': 'Works with OpenAI-style APIs (OpenAI, SiliconFlow, your own proxy…). The key stays in this browser only. When you use AI, your text and picture go to that API and it bills you.',
    faceSize: 'Face size', faceCrop: 'Face framing', sideZoom: 'Door figure', sideShift: 'Front / back', bgDark: 'Background dim', feather: 'Soft edge',
    'st.ai': 'AI is drawing… (10–60 s)', 'st.aiFind': 'Looking for the face…', 'st.noKey': 'Fill in the API key first',
    'st.noPrompt': 'Write a line first', 'st.noSrc': 'Add a picture first', 'st.noFace': 'This car has a different layout. Face style is not ready for it.',
    'st.found': 'Face found', 'st.notFound': 'No face found. Click the face yourself.', 'st.aiErr': 'AI failed: ',
    'st.urlBlocked': 'The API gave a link the browser may not read. Try a model that returns b64_json.',
  },
  zh: {
    faceSize: '脸大小', faceCrop: '脸取景', sideZoom: '车门人物', sideShift: '前后移', bgDark: '背景压暗', feather: '边缘柔和',
    'st.ai': 'AI 正在画…（10–60 秒）', 'st.aiFind': '正在找脸…', 'st.noKey': '先在“接口设置”里填 API Key',
    'st.threads': ' · N 线程',
    'st.extra': '又来了一张备选图',
    'pl.bal': ' · 剩 N Pollen',
    'st.load3d': '正在加载 3D…', 'st.no3d': '这个浏览器显示不了 3D。',
    'st.plOk': '登录好了，新图不再有小标志。', 'st.plDenied': '已取消登录', 'st.plBad': '登录没成功，请再试一次。',
    'st.plExpired': 'Pollinations 登录过期了，先用免费排队。', 'st.plEmpty': '你的 Pollen 用完了，先用免费排队。',
    'st.wait': '免费额度排队中，还要', 'st.stopped': '已停止', 'st.freeBusy': '免费服务太忙，过一分钟再试。',
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
// Worker pool: frames, template prep and export run on other CPU cores. No pool -> the old one-thread path.
let pool = null;
if (poolSupported()) {
  try {
    pool = new Pool();
    pool.onfail = (e) => { console.warn('[pool] back to one thread:', e); pool = null; S.T = null; if (S.model) selectModel(S.model); };
  } catch (e) { console.warn('[pool] not started:', e); pool = null; }
}
window.__wrap = { threads: pool ? pool.threads : 1, frames: 0, lastFrameMs: 0 };
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
    b.onpointerenter = b.onfocus = () => prefetchModel(m.id);
    b.onpointerleave = () => clearTimeout(hoverTimer);
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
let notice = null;                // a message that must outlive the next "ready" (shown in its place once)
function setStatus(k, extra = '') {
  if (k === 'st.ready' && notice) { k = notice; notice = null; extra = ''; }
  lastStatus = k; lastExtra = extra;
  const thr = k === 'st.ready' && pool ? t('st.threads').replace('N', pool.threads) : '';
  $('#status').textContent = k ? t(k) + extra + thr : '';
}

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
const tplPixels = async (id) => pixels(await loadImage(templateUrl(id), true), 4096);
async function getTemplate(id) {
  if (pool) {
    try { return await pool.template(id, tplPixels); }
    catch (e) { if (pool) throw e; }            // the pool stopped: carry on with one thread
  }
  if (templates.has(id)) return templates.get(id);
  const T = parseTemplate(await tplPixels(id)); T.id = id; T.hasZones = !!zones(T); templates.set(id, T); return T;
}
// Hovering a car starts its template prep in the background, so the click is instant.
let hoverTimer = 0;
function prefetchModel(id) {
  clearTimeout(hoverTimer);
  if (!pool || id === S.model) return;
  hoverTimer = setTimeout(() => pool?.template(id, tplPixels).catch(() => {}), 150);
}
async function selectModel(id) {
  S.model = id; localStorage.setItem('model', id);
  document.querySelectorAll('.model').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  $('#carImg').src = vehicleUrl(id);
  $('.empty-car').style.backgroundImage = `url(${templateUrl(id)})`;
  if (!$('#fname').dataset.touched) $('#fname').value = defaultName();
  busy(true); setStatus('st.loadTpl');
  if (pool) pool.active = id;
  let T;
  try { T = await getTemplate(id); } catch (e) { console.error(e); if (S.model === id) { setStatus('st.err'); busy(false); } return; }
  if (S.model !== id) return;                    // another car was picked meanwhile
  S.T = T;
  if (!S.src) setStatus('st.ready');              // loaded; nothing to draw until a picture is added
  if (S.view === '3d') view3d(true);              // the 3D body follows the car even before a picture
  const c = $('#out'); c.width = S.T.W; c.height = S.T.H;
  $('#canvasWrap').style.aspectRatio = `${S.T.W}/${S.T.H}`;
  busy(false); schedule();
}
async function setSource(blobOrUrl, name) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const im = await loadImage(url, false);
  const d = pixels(im, 2048);
  S.src = { w: d.width, h: d.height, data: d.data };
  pool?.setSource(S.src);                         // sent to the workers once per picture
  S.srcName = (name || 'wrap').replace(/\.[^.]+$/, '');
  S.autoHorizon = detectHorizon(S.src);
  S.im = im; S.face = guessFace(); S.subject = null; S.faceFrom = 'guess'; setStatus('st.ready');
  const th = $('#thumb'); th.src = url; th.hidden = false;
  $('#faceImg').src = url; showRects();
  if (!$('#fname').dataset.touched) $('#fname').value = defaultName();
  $('#empty').hidden = true; schedule();
  if (S.mode === 'face') findFace(false);
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
// auto: free finder in the browser first; the paid API is used only when the user asks (button) and has a key.
async function findFace(useApi) {
  if (!S.src) return;
  const src = S.src, c = cfg();
  if (useApi && !(AI.isCustom(c) && AI.ready(c))) useApi = false;
  aiBusy(true); setStatus('st.aiFind');
  try {
    if (!useApi) {
      src.looked = true;
      const r = await AI.localFind(S.im);
      if (S.src !== src) return;
      if (r.alpha) { src.alpha = r.alpha; pool?.setAlpha(r.alpha); }
      if (r.subject) S.subject = r.subject;
      if (r.face && S.faceFrom !== 'click') { S.face = r.face; S.faceFrom = 'local'; }
      setStatus(r.face ? 'st.found' : 'st.notFound');
    } else {
      const N = 1000, k = N / Math.max(src.w, src.h), dw = src.w * k, dh = src.h * k, ox = (N - dw) / 2, oy = (N - dh) / 2;
      const cv = new OffscreenCanvas(N, N), x = cv.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.drawImage(S.im, ox, oy, dw, dh);
      const url = await blobToDataUrl(await cv.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
      const r = await AI.locate(c, url, N, N);
      const back = (b) => b && [(b[0] * N - ox) / dw, (b[1] * N - oy) / dh, (b[2] * N - ox) / dw, (b[3] * N - oy) / dh].map((v) => Math.min(1, Math.max(0, v)));
      if (S.src !== src) return;
      if (r.subject) S.subject = back(r.subject);
      if (r.face) { S.face = back(r.face); S.faceFrom = 'ai'; setStatus('st.found'); } else setStatus('st.notFound');
    }
    showRects(); schedule();
  } catch (e) { console.error(e); if (S.src === src) setStatus('st.aiErr', e.message); }
  finally { aiBusy(false); }
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

// ---------- AI picture ------------------------------------------------------------------------------
const cfg = () => ({
  provider: $('#aiProv').value, base: $('#aiBase').value || 'https://api.openai.com/v1', key: $('#aiKey').value,
  imgModel: $('#aiImg').value || 'gpt-image-1', visModel: $('#aiVis').value || 'gpt-4o-mini', count: +$('#aiCount').value || 1,
});
function syncProvider() {
  const custom = $('#aiProv').value === 'custom';
  $('#aiCustom').hidden = !custom;
  $('#aiEdit').hidden = !custom;
  $('#aiFree').hidden = custom;
  $('#pollen').hidden = custom;
}
// Pollinations sign-in row: button when signed out; name, Pollen left and "sign out" when signed in.
let pollenBal = null;
async function syncPollen(fetchBalance) {
  const on = !!AI.pollenKey();
  $('#pollenIn').hidden = on; $('#pollenOn').hidden = !on;
  if (!on) pollenBal = null;
  else if (fetchBalance) pollenBal = await AI.pollenBalance();
  $('#pollenBal').textContent = AI.pollenKey() && pollenBal != null ? t('pl.bal').replace('N', (+pollenBal).toFixed(2)) : '';
  if (on && !AI.pollenKey()) syncPollen(false);          // the balance call found the key refused
}
function openCfg() { $('#ai').open = true; $('#aiCfgBox').open = true; $('#aiKey').focus(); }
let aiCtl = null;
function aiBusy(on) { busy(on); ['#aiGen', '#aiEdit', '#aiFind'].forEach((s) => ($(s).disabled = on)); }
async function aiPicture(editing) {
  const c = cfg(), prompt = $('#aiPrompt').value.trim();
  if (!AI.ready(c)) { openCfg(); return setStatus('st.noKey'); }
  if (!prompt) { $('#aiPrompt').focus(); return setStatus('st.noPrompt'); }
  if (editing && !S.src) return setStatus('st.noSrc');
  aiCtl?.abort();                                   // stop pictures still coming from the last request
  if (S.mode === 'face') AI.preload();              // face models load while the picture is made
  aiBusy(true); setStatus('st.ai'); $('#aiStop').hidden = false;
  aiCtl = new AbortController();
  try {
    let blob;
    if (editing) {
      const cv = new OffscreenCanvas(S.src.w, S.src.h);
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(S.src.data), S.src.w, S.src.h), 0, 0);
      blob = await AI.edit(c, await cv.convertToBlob({ type: 'image/png' }), prompt);
    } else blob = await AI.generate(c, prompt, {
      face: S.mode === 'face', signal: aiCtl.signal,
      onWait: (s) => (s ? setStatus('st.wait', ` ${s}s`) : setStatus('st.ai')),
      onExtra: (b, name) => { addHistory(b, name); setStatus('st.extra', name ? ` · ${name}` : ''); },
    });
    aiBusy(false); $('#aiStop').hidden = true;
    addHistory(blob, blob.source);
    await setSource(blob, 'ai_' + prompt.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 14));
  } catch (e) {
    console.error(e); aiBusy(false); $('#aiStop').hidden = true;
    if (e.name === 'AbortError') setStatus('st.stopped');
    else if (e.message === 'image-url-blocked') setStatus('st.urlBlocked');
    else if (e.message === 'free-busy') setStatus('st.freeBusy');
    else setStatus('st.aiErr', e.message);
  }
}
// last AI pictures, click to reuse (kept in memory only)
const hist = [];
function addHistory(blob, from = '') {
  const url = URL.createObjectURL(blob); hist.unshift({ url, blob, from }); if (hist.length > 6) URL.revokeObjectURL(hist.pop().url);
  const box = $('#aiHist'); box.hidden = false; box.innerHTML = '';
  for (const h of hist) {
    const b = document.createElement('button'); b.type = 'button'; b.title = h.from;
    const im = document.createElement('img'); im.src = h.url; im.alt = h.from; b.appendChild(im);
    b.onclick = () => setSource(h.blob, 'ai'); box.appendChild(b);
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
    sideZoom: val('sideZoom'), sideShift: val('sideShift'), bgDark: val('bgDark'), feather: val('feather'), cut: $('#cutOn').checked,
  }); else Object.assign(o, { zoom: val('zoom'), panX: val('panX'), panY: val('panY'), angle: val('angle') });
  const t0 = performance.now();
  if (pool) return requestFrame(o, t0);
  S.rgba = render(S.T, S.src, o);
  frameDone(t0);
}
// Latest wins: one frame in flight; while it renders, newer requests replace each other.
let frameBusy = false, nextFrame = null;
function requestFrame(o, t0) {
  nextFrame = { o, t0, T: S.T, sid: pool.src };
  if (!frameBusy) pumpFrames();
}
async function pumpFrames() {
  frameBusy = true;
  while (nextFrame && pool) {
    const job = nextFrame; nextFrame = null;
    try {
      const rgba = await pool.frame(job.T, job.o);
      if (job.T === S.T && pool && job.sid === pool.src) { S.rgba = rgba; frameDone(job.t0); }
    } catch (e) { if (pool) console.error(e); break; }
  }
  frameBusy = false;
}
function frameDone(t0) {
  S.frame = (S.frame || 0) + 1;
  paint(); $('#checks').innerHTML = '';
  if (S.mode === 'face' && !S.T.hasZones) setStatus('st.noFace');
  else if (!lastStatus.startsWith('st.') || ['st.ready', 'st.render', 'st.loadTpl', 'st.noFace'].includes(lastStatus)) setStatus('st.ready');
  const ms = performance.now() - t0;
  window.__wrap.frames++; window.__wrap.lastFrameMs = ms; window.__wrap.threads = pool ? pool.threads : 1;
  document.dispatchEvent(new CustomEvent('wrap:frame', { detail: { ms, threads: window.__wrap.threads } }));
  earlyExport();
  if (!warmed) { warmed = true; setTimeout(warmUp, 1500); }
}
// After the first picture, idle cores prepare every other car in the background (skipped on small or
// data-saving devices), so switching cars is instant. One template at a time on the helper worker.
let warmed = false;
async function warmUp() {
  if (!pool || (navigator.deviceMemory || 8) < 8 || navigator.connection?.saveData) return;
  const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1000 }) : setTimeout(r, 50)));
  for (const m of MODELS) {
    if (!pool) return;
    if (m.id === S.model) continue;
    await idle();
    await pool?.template(m.id, tplPixels).catch(() => {});
  }
}
// While the picture sits still, make its PNG on the helper worker, so "download" is instant.
let early = null, earlyTimer = 0;
function earlyExport() {
  clearTimeout(earlyTimer); early = null;
  if (!pool) return;
  const frame = S.frame, T = S.T, rgba = S.rgba;
  earlyTimer = setTimeout(() => {
    if (!pool || S.frame !== frame) return;
    const p = pool.exportOne(T, rgba, 0); p.catch(() => {});
    early = { frame, p };
  }, 400);
}
function paint() {
  const c = $('#out'), x = c.getContext('2d');
  const showCar = S.view === 'car', show3d = S.view === '3d';
  $('#carImg').hidden = !showCar; c.hidden = showCar || show3d; $('#v3d').hidden = !show3d;
  $('#empty').hidden = !!S.src || show3d;
  view3d(show3d);
  if (!S.rgba || show3d) return;                  // the flat canvas is hidden; switching back repaints it
  const img = new ImageData(new Uint8ClampedArray(S.rgba), S.T.W, S.T.H);
  if (S.view === 'lines') {
    const d = img.data, { mask, lines, W, H } = S.T;
    for (let i = 0; i < W * H; i++) if (!mask[i] && !lines[i]) { d[i * 4] = 14; d[i * 4 + 1] = 15; d[i * 4 + 2] = 20; }
    for (let i = 0; i < W * H; i++) if (mask[i]) for (let k = 0; k < 3; k++) d[i * 4 + k] = d[i * 4 + k] * 0.55 + 255 * 0.45 * (k === 0 ? 0.3 : 0.2);
  }
  x.putImageData(img, 0, 0);
}

// ---------- 3D preview (its code and three.js load only when it is opened) ----------------------------
let viewer = null, viewerLoading = null;
async function view3d(on) {
  if (!on) { viewer?.setActive(false); return; }
  if (!S.T) return;
  if (!viewer) {
    if (!viewerLoading) {
      setStatus('st.load3d');
      viewerLoading = import('./view3d.js').then((m) => {
        viewer = new m.Viewer($('#v3d'));
        $('#v3d').addEventListener('v3d:spin', syncSpin);
        setStatus('st.ready');
      }).catch((e) => { console.error(e); viewerLoading = null; setStatus('st.no3d'); setView('sheet'); });
    }
    await viewerLoading;
    if (!viewer || S.view !== '3d') return;
  }
  try { viewer.setCar(S.T, S.model); } catch (e) { console.error(e); setStatus('st.no3d'); return setView('sheet'); }
  viewer.paint(S.rgba);
  viewer.setActive(true);
  syncSpin();
}
function syncSpin() { $('#v3dSpin').classList.toggle('on', !!viewer?.spinning); }
function setView(v) {
  S.view = v;
  document.querySelectorAll('#view button').forEach((x) => x.classList.toggle('on', x.dataset.view === v));
  paint();
}

// ---------- export ------------------------------------------------------------------------------
function cleanName() {
  let n = $('#fname').value.replace(/\.png$/i, '').replace(/[^A-Za-z0-9 _-]+/g, '_').trim().slice(0, 26) || 'wrap';
  $('#fname').value = n; return n + '.png';
}
async function download() {
  if (!S.rgba) return;
  const name = cleanName(); busy(true); setStatus('st.export'); $('#dl').disabled = true;
  const t0 = performance.now();
  try {
    let r, outsideBlack;
    if (pool) {
      r = await pool.exportFirst(S.T, S.rgba, early && early.frame === S.frame ? early.p : null);
      outsideBlack = r.black;
    } else {
      r = await exportWrap(S.T, S.rgba);
      outsideBlack = (() => { for (let i = 0; i < S.T.mask.length; i++) if (!S.T.mask[i] && r.index[i] !== 0) return false; return true; })();
    }
    document.dispatchEvent(new CustomEvent('wrap:export', { detail: { ms: performance.now() - t0, bytes: r.blob.size, colors: r.colors, dither: r.dither } }));
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
  if (S.mode === 'face' && S.src && !S.src.looked) findFace(false);
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
$('#aiStop').onclick = () => aiCtl?.abort();
$('#cutOn').onchange = schedule;
// pointing at the face style starts loading its models in the background
for (const ev of ['pointerenter', 'focus']) document.querySelector('[data-mode=face]').addEventListener(ev, () => AI.preload(), { once: true });
document.querySelectorAll('[data-idea]').forEach((b) => (b.onclick = () => { $('#aiPrompt').value = b.textContent; $('#aiPrompt').focus(); }));
$('#aiPrompt').onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); aiPicture(false); } };
{
  const c = AI.loadCfg(), map = { aiProv: 'provider', aiBase: 'base', aiKey: 'key', aiImg: 'imgModel', aiVis: 'visModel', aiCount: 'count' };
  for (const [id, k] of Object.entries(map)) { $('#' + id).value = c[k]; $('#' + id).onchange = () => { AI.saveCfg(cfg()); syncProvider(); }; }
  syncProvider();
}
document.querySelectorAll('#view button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
document.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => viewer?.cam(b.dataset.cam)));
$('#v3dSpin').onclick = () => { if (viewer) { viewer.spinning = !viewer.spinning; syncSpin(); } };
$('#outline').onchange = schedule;
$('#reset').onclick = () => { resetVals(); buildSliders(); schedule(); };
$('#dl').onclick = download;
$('#fname').oninput = () => ($('#fname').dataset.touched = '1');
$('#lang').onclick = () => { lang = lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('lang', lang); applyLang(); syncPollen(false); };

// Pollinations sign-in: the prompt is kept across the trip to enter.pollinations.ai and back.
$('#pollenIn').onclick = (e) => {
  e.preventDefault();
  try { sessionStorage.setItem('pollen.prompt', $('#aiPrompt').value); } catch { /* storage off */ }
  location.assign(AI.pollenLoginUrl());
};
$('#pollenOut').onclick = () => AI.pollenLogout();
window.addEventListener('pollen:change', (e) => {
  const k = { expired: 'st.plExpired', empty: 'st.plEmpty' }[e.detail];
  if (k) { notice = k; setStatus(k); }
  syncPollen(e.detail === 'login' || e.detail === 'empty');
});
// Coming back from enter.pollinations.ai (a full page load, or a hash change in the same page).
function pollenReturn() {
  const r = AI.pollenCallback();
  if (!r) return;
  $('#ai').open = true;
  notice = { ok: 'st.plOk', denied: 'st.plDenied', bad: 'st.plBad' }[r];
  setStatus(notice);
  syncPollen(r === 'ok');
}
window.addEventListener('hashchange', pollenReturn);
try { const p = sessionStorage.getItem('pollen.prompt'); if (p != null) { $('#aiPrompt').value = p; sessionStorage.removeItem('pollen.prompt'); } } catch { /* storage off */ }

applyLang();
syncPollen(!!AI.pollenKey());
pollenReturn();
selectModel(MODELS.some((m) => m.id === S.model) ? S.model : 'modely-l');
