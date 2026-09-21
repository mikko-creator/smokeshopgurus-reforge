// contact-sheet.mjs — lay transparent cut-outs onto the page colour so they can
// actually be judged.
//
// A cut-out viewed on white looks perfect even when it has a white fringe or a
// hole punched through a pale part of the product, because the defect is the
// same colour as the backdrop. These ship onto a near-black page, so that is
// what they have to be checked against.
//
//   node tools/contact-sheet.mjs <out.png> <in1.png> <in2.png> ...

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG, writePNG } = await import('file:///' + SK.split(path.sep).join('/'));

const [, , outFile, ...inputs] = process.argv;
if (!outFile || !inputs.length) {
  console.error('usage: contact-sheet.mjs <out.png> <in...>');
  process.exit(2);
}

const CELL = 240;
const PAD = 12;
const COLS = Math.min(inputs.length, 4);
const ROWS = Math.ceil(inputs.length / COLS);
const W = COLS * (CELL + PAD) + PAD;
const H = ROWS * (CELL + PAD) + PAD;

// the page background these will actually sit on
const BG = [10, 13, 16];

const out = { width: W, height: H, data: new Uint8Array(W * H * 4) };
for (let i = 0; i < W * H; i++) {
  out.data[i * 4] = BG[0]; out.data[i * 4 + 1] = BG[1];
  out.data[i * 4 + 2] = BG[2]; out.data[i * 4 + 3] = 255;
}

inputs.forEach((file, idx) => {
  const src = readPNG(file);
  const col = idx % COLS, row = (idx / COLS) | 0;
  const ox = PAD + col * (CELL + PAD);
  const oy = PAD + row * (CELL + PAD);
  const scale = Math.min(CELL / src.width, CELL / src.height);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const dx = ox + ((CELL - dw) >> 1);
  const dy = oy + ((CELL - dh) >> 1);

  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const si = (sy * src.width + sx) * 4;
      const a = src.data[si + 3] / 255;
      if (a <= 0) continue;
      const di = ((dy + y) * W + (dx + x)) * 4;
      for (let ch = 0; ch < 3; ch++) {
        out.data[di + ch] = Math.round(src.data[si + ch] * a + out.data[di + ch] * (1 - a));
      }
    }
  }
});

writePNG(outFile, out);
console.log('contact sheet: ' + inputs.length + ' cut-outs on rgb(' + BG.join(',') + ') -> ' + outFile);
