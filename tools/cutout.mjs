// cutout.mjs — lift a product off its studio background so it can float.
//
// The marquee asks for products with no backing panel. The photographs are shot
// on white, so removing the CSS well alone would leave each photo's own white
// rectangle sitting on a dark page — the opposite of floating. The white has to
// come out of the PIXELS.
//
// NOT A WHITE KEY. "Make every near-white pixel transparent" destroys products
// that are themselves white or near-white — and several of these are: a white
// rolling-paper box, pale packaging, a lighter display with white labels. It
// would punch holes straight through them.
//
// So this is a FLOOD FILL from the border. Only background that is CONNECTED to
// the edge of the frame is removed, which leaves white that is enclosed by the
// product untouched. The background colour is sampled from the border rather
// than assumed to be #fff, because studio sweeps are rarely pure white.
//
// It also refuses to guess. If the border is not a single flat colour, the
// photograph is not a clean cut-out and the tool says so instead of hacking a
// hole in it — the caller then keeps the original.
//
//   node tools/cutout.mjs <in> <out.png> [--tol 42] [--feather 1.5] [--max 700]

import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: cutout.mjs <in> <out.png> [--tol n] [--feather n]');
  process.exit(2);
}
const num = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const TOL = num('tol', 42);
const FEATHER = num('feather', 1.5);
const MAX = num('max', 700);

const ext = path.extname(inFile).toLowerCase().replace('.', '') || 'png';
const mime = ext === 'jpg' ? 'jpeg' : ext;
const b64 = fs.readFileSync(inFile).toString('base64');

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Runtime.enable', {}, sessionId);
  await sleep(250);

  const res = await s.send('Runtime.evaluate', {
    expression: `(function(){
      return new Promise(function(done, fail){
        var img = new Image();
        img.onload = function(){
          try {
            var w = img.width, h = img.height;
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            var d = ctx.getImageData(0, 0, w, h);
            var px = d.data;

            // --- what colour IS the background? ---------------------------
            // median of the border ring, not the corners alone: a vignette or a
            // soft shadow in one corner would otherwise set the target colour.
            var rs = [], gs = [], bs = [];
            function sample(x, y) {
              var i = (y * w + x) * 4;
              rs.push(px[i]); gs.push(px[i+1]); bs.push(px[i+2]);
            }
            for (var x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
            for (var y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }
            function median(a) { a.sort(function(p, q){ return p - q; }); return a[a.length >> 1]; }
            var br = median(rs.slice()), bg2 = median(gs.slice()), bb = median(bs.slice());

            // how uniform is that border? a busy border means this is not a
            // cut-out photograph and nothing should be removed
            var off = 0, tot = 0;
            for (var k = 0; k < rs.length; k++) {
              tot++;
              var dd = Math.abs(rs[k]-br) + Math.abs(gs[k]-bg2) + Math.abs(bs[k]-bb);
              if (dd > ${TOL} * 3) off++;
            }
            var borderNoise = off / tot;

            // --- flood fill from every border pixel -------------------------
            var mask = new Uint8Array(w * h);      // 1 = background
            var stack = [];
            function near(i) {
              return Math.abs(px[i]-br) + Math.abs(px[i+1]-bg2) + Math.abs(px[i+2]-bb) <= ${TOL} * 3;
            }
            for (var x2 = 0; x2 < w; x2++) {
              if (near((0 * w + x2) * 4)) stack.push(x2);
              if (near(((h-1) * w + x2) * 4)) stack.push((h-1) * w + x2);
            }
            for (var y2 = 0; y2 < h; y2++) {
              if (near((y2 * w + 0) * 4)) stack.push(y2 * w);
              if (near((y2 * w + (w-1)) * 4)) stack.push(y2 * w + (w-1));
            }
            while (stack.length) {
              var p = stack.pop();
              if (mask[p]) continue;
              if (!near(p * 4)) continue;
              mask[p] = 1;
              var px2 = p % w, py2 = (p / w) | 0;
              if (px2 > 0) stack.push(p - 1);
              if (px2 < w - 1) stack.push(p + 1);
              if (py2 > 0) stack.push(p - w);
              if (py2 < h - 1) stack.push(p + w);
            }

            // --- alpha, softened at the boundary ----------------------------
            var alpha = new Float32Array(w * h);
            for (var q = 0; q < w * h; q++) alpha[q] = mask[q] ? 0 : 255;
            var rad = Math.max(1, Math.round(${FEATHER}));
            var tmp = new Float32Array(w * h);
            for (var pass = 0; pass < 2; pass++) {
              for (var yy = 0; yy < h; yy++) {
                for (var xx = 0; xx < w; xx++) {
                  var sum = 0, n = 0;
                  for (var dy = -rad; dy <= rad; dy++) {
                    var ty = yy + dy; if (ty < 0 || ty >= h) continue;
                    for (var dx = -rad; dx <= rad; dx++) {
                      var tx = xx + dx; if (tx < 0 || tx >= w) continue;
                      sum += alpha[ty * w + tx]; n++;
                    }
                  }
                  tmp[yy * w + xx] = sum / n;
                }
              }
              alpha.set(tmp);
            }

            var removed = 0;
            for (var m2 = 0; m2 < w * h; m2++) {
              var a = alpha[m2];
              // anything the fill marked stays fully clear; the blur only
              // softens the rim of the kept region
              if (mask[m2]) a = Math.min(a, 90);
              px[m2 * 4 + 3] = Math.round(Math.max(0, Math.min(255, a)));
              if (px[m2 * 4 + 3] < 16) removed++;
            }
            ctx.putImageData(d, 0, 0);

            /* Downscale AFTER the cut, never before. The flood fill needs the
               original pixels: on an interpolated image the background/product
               boundary is a gradient, the fill either leaks through it or stops
               short, and the result is a halo. Cutting at full resolution and
               resizing the finished alpha keeps the edge clean.
               These display at 210px (168 on a phone), so even at DPR 3 there is
               nothing to gain above ~700px — and alpha costs bytes. */
            var outC = c;
            var scale = Math.min(1, ${MAX} / Math.max(w, h));
            if (scale < 1) {
              outC = document.createElement('canvas');
              outC.width = Math.round(w * scale);
              outC.height = Math.round(h * scale);
              var octx = outC.getContext('2d');
              octx.imageSmoothingQuality = 'high';
              octx.drawImage(c, 0, 0, outC.width, outC.height);
            }

            done(JSON.stringify({
              w: w, h: h,
              outW: outC.width, outH: outC.height,
              bg: br + ',' + bg2 + ',' + bb,
              borderNoise: +(borderNoise * 100).toFixed(1),
              removedPct: +(removed / (w * h) * 100).toFixed(1),
              url: outC.toDataURL('image/png')
            }));
          } catch (e) { fail(String(e)); }
        };
        img.onerror = function(){ fail('decode failed'); };
        img.src = 'data:image/${mime};base64,${b64}';
      });
    })()`,
    returnByValue: true, awaitPromise: true,
  }, sessionId, 180000);

  if (res.exceptionDetails) {
    console.error('cutout failed: ' + (res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)));
    process.exit(1);
  }
  const out = JSON.parse(res.result.value);
  console.log(path.basename(inFile));
  console.log('  ' + out.w + 'x' + out.h + ' -> ' + out.outW + 'x' + out.outH + '   border colour rgb(' + out.bg + ')'
    + '   border noise ' + out.borderNoise + '%');
  console.log('  background removed: ' + out.removedPct + '%');

  // fail closed: say no rather than ship a damaged product photo
  if (out.borderNoise > 12) {
    console.log('  REFUSED — the border is not a flat colour, so this is not a cut-out photograph');
    process.exitCode = 3;
  } else if (out.removedPct < 3) {
    console.log('  REFUSED — almost nothing was removed; the background is not reachable from the edge');
    process.exitCode = 3;
  } else if (out.removedPct > 92) {
    console.log('  REFUSED — nearly the whole frame was removed; the fill ate the product');
    process.exitCode = 3;
  } else {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.from(out.url.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log('  written ' + (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB -> ' + path.basename(outFile));
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
