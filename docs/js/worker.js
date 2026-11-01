// One worker of the pool. It imports the same engine.js as the page, so every pixel it makes is
// byte-identical to the single-thread path.
//   prep   {jid, id, img}                    full template prep (parse + surface + zones), arrays sent back
//   tpl    {id, W, H, dmax, z, rows, ...}     keep only this worker's rows of a template
//   drop   {id}                              forget a template
//   src    {src}                             the picture ({w,h,data[,alpha]}), sent once per picture
//   alpha  {alpha}                           person mask for the face style cut-out (or null)
//   render {jid, id, o}                      draw this worker's rows of one frame
//   export {jid, W, H, mask, rgba, colors, dither}   quantize + PNG for one candidate
import { parseTemplate, surface, zones, makeSampler, renderBand, quantize, encodeIndexedPNG } from './engine.js';

const TPL = new Map();
let SRC = null;

const reply = (msg, transfer = []) => self.postMessage(msg, transfer);

self.onmessage = async ({ data: m }) => {
  try {
    switch (m.t) {
      case 'prep': {
        const T = parseTemplate(m.img), s = surface(T), Z = zones(T);
        const msg = { t: 'prep', jid: m.jid, W: T.W, H: T.H, mask: T.mask, lines: T.lines, edge: T.edge,
          theta: s.theta, dist: s.dist, dmax: s.dmax, z: Z ? { hood: Z.hood, left: Z.left, right: Z.right } : null, lab: Z ? Z.lab : null };
        const tr = [T.mask.buffer, T.lines.buffer, T.edge.buffer, s.theta.buffer, s.dist.buffer];
        if (Z) tr.push(Z.lab.buffer);
        reply(msg, tr);
        break;
      }
      case 'tpl': {
        // Arrays hold only this worker's rows (the bands in m.rows, stacked in order).
        // surface() / zones() return these cached values, so makeSampler() never recomputes them.
        TPL.set(m.id, {
          W: m.W, H: m.H, rows: m.rows, nrows: m.nrows, mask: m.mask, edge: m.edge,
          surf: { theta: m.theta, dist: m.dist, dmax: m.dmax },
          zones: m.z ? { lab: m.lab, hood: m.z.hood, left: m.z.left, right: m.z.right } : null,
        });
        break;
      }
      case 'drop': TPL.delete(m.id); break;
      case 'src': SRC = m.src; break;
      case 'alpha': if (SRC) { if (m.alpha) SRC.alpha = m.alpha; else delete SRC.alpha; } break;
      case 'render': {
        const T = TPL.get(m.id);
        if (!T || !SRC) throw new Error(!T ? 'no template ' + m.id : 'no picture');
        const px = new Float32Array(3), sampler = makeSampler(T, SRC, m.o, px);
        const out = new Uint8ClampedArray(T.nrows * T.W * 4);
        for (const [y0, y1, lo] of T.rows) renderBand(T, m.o, sampler, px, out, y0, y1, y0 - lo);
        reply({ t: 'done', jid: m.jid, out }, [out.buffer]);
        break;
      }
      case 'export': {
        const q = quantize(m.rgba, m.mask, m.W, m.colors, m.dither);
        const blob = await encodeIndexedPNG(m.W, m.H, q.index, q.palette);
        let black = true;
        for (let i = 0; i < m.mask.length; i++) if (!m.mask[i] && q.index[i] !== 0) { black = false; break; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        reply({ t: 'done', jid: m.jid, bytes, black, colors: m.colors, dither: m.dither }, [bytes.buffer]);
        break;
      }
    }
  } catch (e) {
    reply({ t: 'err', jid: m.jid, msg: String((e && e.stack) || e) });
  }
};
