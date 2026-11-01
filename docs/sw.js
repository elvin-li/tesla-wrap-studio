// Wrap Studio service worker.
// - cache-first for immutable third-party files (pinned Tesla template/car images, pinned MediaPipe bundle+wasm)
// - stale-while-revalidate for the mutable MediaPipe model storage (one path uses 'latest')
// - network-first with cache fallback for this app's own files (so a new deploy never mixes old/new JS; works offline)
// - never handles non-GET; never caches AI hosts or any non-whitelisted host; never stores error/opaque responses
// - after activation, warms the cache with all 24 template+car images, 4 at a time (skips on Save-Data)

const VERSION = 'v1';
const STATIC_CACHE = `ws-static-${VERSION}`;   // same-origin app files
const IMMUTABLE_CACHE = `ws-immutable-${VERSION}`; // pinned cross-origin files
const MODELS_CACHE = `ws-models-${VERSION}`;   // mediapipe model storage (SWR)
const OURS = [STATIC_CACHE, IMMUTABLE_CACHE, MODELS_CACHE];

// --- pinned Tesla repo (keep in sync with docs/js/models.js) ---------------------------------
const TESLA_SHA = '86c7d31454caf0f20af6f6af105f577643f13bce';
const TESLA_RAW = `https://raw.githubusercontent.com/teslamotors/custom-wraps/${TESLA_SHA}`;
// Model ids duplicated from docs/js/models.js (12 models). Keep in sync.
const MODEL_IDS = [
  'modely-l', 'modely-2025-base', 'modely-2025-premium', 'modely-2025-performance', 'modely',
  'model3-2024-base', 'model3-2024-performance', 'model3',
  'models-2025-plaid', 'models-2021', 'modelx-2021', 'cybertruck',
];
const WARM_URLS = MODEL_IDS.flatMap((id) => [
  `${TESLA_RAW}/${id}/template.png`,
  `${TESLA_RAW}/${id}/vehicle_image.png`,
]); // 24 total

const MEDIAPIPE_PREFIX = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/';
const MP_MODELS_PREFIX = 'https://storage.googleapis.com/mediapipe-models/';

// Hosts we must never cache or touch (AI image/text/vision backends). Matched by exact host or suffix.
const AI_HOSTS = ['pollinations.ai', 'aihorde.net', 'hf.space', 'huggingface.co'];

const isImmutable = (url) =>
  url.href.startsWith(TESLA_RAW + '/') || url.href.startsWith(MEDIAPIPE_PREFIX);
const isModelStore = (url) => url.href.startsWith(MP_MODELS_PREFIX);
const isAiHost = (url) =>
  AI_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h) || url.hostname.endsWith(h));

// A response safe to store: a real 200 from the network (not an error, not opaque).
const storable = (resp) => resp && resp.status === 200 && resp.type !== 'opaque' && resp.type !== 'opaqueredirect';

// The app's own files, saved at install so even the first visit works offline afterwards.
// Same-origin requests stay network-first, so these copies are only used when the network is down.
const APP_FILES = ['./', 'index.html', 'css/style.css', 'assets/favicon.svg', 'js/app.js', 'js/engine.js', 'js/pool.js',
  'js/worker.js', 'js/models.js', 'js/ai.js', 'js/ai-worker.js', 'js/ai-boxes.js'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(APP_FILES.map((u) => fetch(u, { cache: 'reload' })
      .then((r) => (storable(r) ? cache.put(u, r) : null)).catch(() => {})));   // one missing file never blocks install
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('ws-') && !OURS.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// The page asks for the warm-up a few seconds after it has loaded. Doing it inside 'activate' would hold
// every fetch of the first visit until all 24 downloads finished.
self.addEventListener('message', (event) => {
  if (event.data === 'warm') event.waitUntil(warmCache());
});

// Cache-first: return cache if present, else fetch (cors, cacheable) and store.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  // Cross-origin immutable assets are read pixel-by-pixel via getImageData, so they must stay
  // CORS-readable: request them in 'cors' mode and only store a real (non-opaque) 200.
  const resp = await fetch(request, { mode: 'cors', credentials: 'omit' });
  if (storable(resp)) cache.put(request, resp.clone());
  return resp;
}

// Stale-while-revalidate: serve cache immediately, refresh in background.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fetching = fetch(request, { mode: 'cors', credentials: 'omit' })
    .then((resp) => { if (storable(resp)) cache.put(request, resp.clone()); return resp; })
    .catch(() => null);
  if (hit) { fetching.catch(() => {}); return hit; }
  const resp = await fetching;
  if (resp) return resp;
  throw new Error('swr: no cache and network failed');
}

// Network-first (same-origin app shell): try network, fall back to cache (offline).
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(request);
    if (storable(resp)) cache.put(request, resp.clone());
    return resp;
  } catch (err) {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;            // never touch non-GET
  const url = new URL(request.url);
  if (isAiHost(url)) return;                        // never touch AI hosts
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }
  if (isImmutable(url)) { event.respondWith(cacheFirst(request, IMMUTABLE_CACHE)); return; }
  if (isModelStore(url)) { event.respondWith(staleWhileRevalidate(request, MODELS_CACHE)); return; }
  // Any other host (not whitelisted): pass through untouched, do not cache.
});

// Warm the 24 immutable images in the background, 4 at a time.
async function warmCache() {
  try {
    if (self.navigator && self.navigator.connection && self.navigator.connection.saveData) return;
  } catch { /* no connection info */ }
  const cache = await caches.open(IMMUTABLE_CACHE);
  const queue = WARM_URLS.slice();
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      try {
        if (await cache.match(u)) continue;
        const resp = await fetch(u, { mode: 'cors', credentials: 'omit' });
        if (storable(resp)) await cache.put(u, resp.clone());
      } catch { /* a failed warm fetch is non-fatal */ }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}
