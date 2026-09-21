// crop.mjs — cut a band out of a full-height capture so it can actually be looked at.
//
// A 1440x12420 screenshot shown whole is downscaled to the point where a texture,
// a tint and a shimmer all look identical. Judging a surface finish means looking
// at pixels near 1:1, which means cropping.
//
//   node tools/crop.mjs <in.png> <out.png> <y> <height> [x] [width]

import os from 'node:os';
import path from 'node:path';

// a static import specifier has to be a literal, so the skill's png lib is
// resolved at runtime the same way every other probe in this directory does it
const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG, writePNG } = await import('file:///' + SK.split(path.sep).join('/'));

const [, , inFile, outFile, yArg, hArg, xArg, wArg] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: crop.mjs <in.png> <out.png> <y> <height> [x] [width]');
  process.exit(2);
}

const src = readPNG(inFile);
const x = Math.max(0, Number(xArg || 0));
const y = Math.max(0, Number(yArg || 0));
const w = Math.min(Number(wArg || src.width), src.width - x);
const h = Math.min(Number(hArg || 600), src.height - y);

if (w <= 0 || h <= 0) {
  console.error('crop falls outside the image: source is ' + src.width + 'x' + src.height);
  process.exit(2);
}

// decodePNG hands back a Uint8Array, not a Buffer — set/subarray, not copy()
const out = { width: w, height: h, data: new Uint8Array(w * h * 4) };
for (let row = 0; row < h; row++) {
  const from = ((y + row) * src.width + x) * 4;
  out.data.set(src.data.subarray(from, from + w * 4), row * w * 4);
}
writePNG(outFile, out);
console.log('cropped ' + src.width + 'x' + src.height + ' -> ' + w + 'x' + h + ' at (' + x + ',' + y + ')  ' + outFile);
