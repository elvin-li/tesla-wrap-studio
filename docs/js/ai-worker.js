// Classic Web Worker for the free face + person finder (MediaPipe tasks-vision).
// Classic, not module: MediaPipe's wasm loader calls importScripts(), which module workers do not have.
// The ES module bundle and ai-boxes.js are loaded with dynamic import(), which classic workers allow.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';
let tasks = null;

// Download the bundle completely before import() asks for it: a failed import() is remembered for the life of
// the worker, a failed fetch() is not, so a later try can still work. net marks "did not download".
async function prefetch(u) {
  try { const r = await fetch(u); if (!r.ok) throw new Error(`download failed (${r.status}): ${u}`); await r.arrayBuffer(); }
  catch (e) { e.net = true; throw e; }
}

function init() {
  return (tasks ??= (async () => {
    await prefetch(`${MP}/vision_bundle.mjs`);
    const v = await import(`${MP}/vision_bundle.mjs`);
    const files = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const mk = (Task, path, extra = {}) => Task.createFromOptions(files, { baseOptions: { modelAssetPath: `${MODELS}/${path}`, delegate: 'CPU' }, runningMode: 'IMAGE', ...extra });
    // both models download and start at the same time
    const [face, seg] = await Promise.all([
      mk(v.FaceDetector, 'face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', { minDetectionConfidence: 0.4 }),
      mk(v.ImageSegmenter, 'image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', { outputConfidenceMasks: true, outputCategoryMask: false }),
    ]);
    const { boxes } = await import('./ai-boxes.js');
    return { face, seg, boxes };
  })().catch((e) => { tasks = null; throw e; }));
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.t === 'preload') { await init(); self.postMessage({ t: 'ok', id: m.id }); return; }
    if (m.t === 'find') {
      const { face, seg, boxes } = await init();
      const img = m.img;                                        // ImageData, same pixels the page used before
      const r = boxes(face.detect(img).detections || [], seg.segment(img), img.width, img.height);
      self.postMessage({ t: 'ok', id: m.id, ...r }, r.alpha ? [r.alpha.data.buffer] : []);
    }
  } catch (e) {
    self.postMessage({ t: 'err', id: m.id, msg: String((e && e.message) || e), net: !!(e && e.net) });
  }
};
