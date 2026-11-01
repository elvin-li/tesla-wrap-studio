// Shared by the page and ai-worker.js: MediaPipe results -> face box, person box and person mask.
// Boxes are fractions 0..1 of the picture. Same padding math as before.
export function boxes(detections, segResult, w, h) {
  const out = { face: null, subject: null, alpha: null };
  const b = detections.map((d) => d.boundingBox).sort((p, q) => q.width * q.height - p.width * p.height)[0];
  if (b) out.face = [b.originX / w, (b.originY - b.height * 0.28) / h, (b.originX + b.width) / w, (b.originY + b.height * 1.08) / h]
    .map((v) => Math.min(1, Math.max(0, v)));
  const m = segResult?.confidenceMasks?.[0];
  if (m) {
    const data = m.getAsFloat32Array().slice(), mw = m.width, mh = m.height;
    segResult.close?.();
    let n = 0, x0 = mw, y0 = mh, x1 = 0, y1 = 0;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (data[y * mw + x] > 0.5) {
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const share = n / (mw * mh);
    if (share > 0.03 && share < 0.8) { out.alpha = { w: mw, h: mh, data }; out.subject = [x0 / mw, y0 / mh, (x1 + 1) / mw, (y1 + 1) / mh]; }
  } else segResult?.close?.();
  return out;
}
