// smoke-plate.mjs — turn a generated smoke photograph into a usable texture.
//
// The plates come back as white smoke on black, which cannot be used directly:
// dropped onto the page the black paints as a black rectangle, and a blend mode
// would fix that only where no ancestor happens to form a stacking context —
// which is not a property worth depending on. So the black is turned into real
// transparency and baked into the file.
//
// Three jobs, all of which the images actually need:
//
//   CROP — the model put a lit floor, and in one case an incense holder, along
//   the bottom of the frame despite the prompt excluding them. Those are real
//   objects; cropping is what makes the plate smoke-only, and it is why the raw
//   generations are never published.
//
//   LUMINANCE -> ALPHA — alpha comes from brightness, so the black falls away
//   and the smoke keeps its own soft gradient. A black floor lifts the whole
//   frame slightly, so everything under `floor` is pushed to zero before the
//   curve, otherwise the empty background arrives as a faint grey wash.
//
//   FEATHER — a crop leaves a hard edge, and a hard edge on a drifting plume
//   reads as a sliding rectangle. Alpha is rolled off smoothly at all four
//   borders so the texture has no edge to see.
//
// The image is handed to the page as a data: URL rather than a file:// path,
// because a file:// image taints the canvas and getImageData then throws.
//
//   node tools/smoke-plate.mjs <in.jpg> <out.png> [--top 0] [--bottom 0.18]
//                              [--floor 0.06] [--gamma 1.15] [--feather 0.10]

import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: smoke-plate.mjs <in.jpg> <out.png> [--top n] [--bottom n] [--floor n] [--gamma n] [--feather n]');
  process.exit(2);
}
const num = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const TOP = num('top', 0);
const BOTTOM = num('bottom', 0.18);
const FLOOR = num('floor', 0.06);
const GAMMA = num('gamma', 1.15);
const FEATHER = num('feather', 0.10);

const b64 = fs.readFileSync(inFile).toString('base64');
const ext = path.extname(inFile).toLowerCase() === '.png' ? 'png' : 'jpeg';

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Runtime.enable', {}, sessionId);
  await sleep(300);

  const res = await s.send('Runtime.evaluate', {
    expression: `(function(){
      return new Promise(function(done, fail){
        var img = new Image();
        img.onload = function(){
          try {
            var sx = 0, sy = Math.round(img.height * ${TOP});
            var sw = img.width;
            var sh = Math.round(img.height * (1 - ${TOP} - ${BOTTOM}));
            var c = document.createElement('canvas');
            c.width = sw; c.height = sh;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            var d = ctx.getImageData(0, 0, sw, sh);
            var px = d.data;
            var fx = Math.max(1, Math.round(sw * ${FEATHER}));
            var fy = Math.max(1, Math.round(sh * ${FEATHER}));
            for (var y = 0; y < sh; y++) {
              // smootherstep roll-off so the border has no visible seam
              var ty = Math.min(1, Math.min(y, sh - 1 - y) / fy);
              ty = ty * ty * (3 - 2 * ty);
              for (var x = 0; x < sw; x++) {
                var i = (y * sw + x) * 4;
                var r = px[i] / 255, g = px[i+1] / 255, b = px[i+2] / 255;
                var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                var a = (lum - ${FLOOR}) / (1 - ${FLOOR});
                if (a < 0) a = 0;
                a = Math.pow(a, ${GAMMA});
                var tx = Math.min(1, Math.min(x, sw - 1 - x) / fx);
                tx = tx * tx * (3 - 2 * tx);
                px[i+3] = Math.round(255 * a * tx * ty);
                // lift the colour towards white so thin smoke keeps its glow
                // once the darkness has become transparency instead
                var k = lum > 0 ? Math.min(1, 1 / Math.max(lum, 0.25)) : 1;
                px[i]   = Math.min(255, Math.round(px[i] * k));
                px[i+1] = Math.min(255, Math.round(px[i+1] * k));
                px[i+2] = Math.min(255, Math.round(px[i+2] * k));
              }
            }
            ctx.putImageData(d, 0, 0);
            // opaque-pixel census: a plate that is nearly all transparent, or
            // nearly all opaque, is a failed conversion rather than a texture
            var solid = 0, any = 0;
            for (var j = 3; j < px.length; j += 4) {
              if (px[j] > 8) any++;
              if (px[j] > 200) solid++;
            }
            done(JSON.stringify({
              w: sw, h: sh,
              anyPct: +(any / (sw * sh) * 100).toFixed(1),
              solidPct: +(solid / (sw * sh) * 100).toFixed(1),
              url: c.toDataURL('image/png')
            }));
          } catch (e) { fail(String(e)); }
        };
        img.onerror = function(){ fail('image failed to decode'); };
        img.src = 'data:image/${ext};base64,${b64}';
      });
    })()`,
    returnByValue: true, awaitPromise: true,
  }, sessionId, 120000);

  if (res.exceptionDetails) {
    console.error('conversion failed: ' + JSON.stringify(res.exceptionDetails.text || res.exceptionDetails));
    process.exit(1);
  }
  const out = JSON.parse(res.result.value);
  const data = out.url.replace(/^data:image\/png;base64,/, '');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(data, 'base64'));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);

  console.log(path.basename(inFile) + ' -> ' + path.basename(outFile));
  console.log('  cropped to ' + out.w + 'x' + out.h
    + '   (top ' + (TOP * 100).toFixed(0) + '%, bottom ' + (BOTTOM * 100).toFixed(0) + '% removed)');
  console.log('  pixels with any alpha : ' + out.anyPct + '%');
  console.log('  pixels near-opaque    : ' + out.solidPct + '%');
  console.log('  written ' + kb + ' KB');

  if (out.anyPct < 3) { console.log('  PLATE IS ALMOST ENTIRELY TRANSPARENT — conversion failed'); process.exitCode = 1; }
  else if (out.solidPct > 60) { console.log('  PLATE IS ALMOST ENTIRELY OPAQUE — the black did not fall away'); process.exitCode = 1; }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
