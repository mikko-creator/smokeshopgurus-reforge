// Replace the product gallery thumbnails with real lightbox buttons carrying the
// source's own accessible label ("Open media N in modal"). Line-addressed for the
// same reason as the other patchers: the template literal is full of escapes.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
const lines = fs.readFileSync(P, 'utf8').split('\n');
const i = lines.findIndex((l) => l.includes('pdp__thumbs'));
if (i < 0) { console.error('thumbs block not found'); process.exit(2); }
if (!lines[i + 1].includes('imgs.map')) { console.error('unexpected shape at line ' + (i + 2)); process.exit(2); }

lines[i + 1] =
  '            ${imgs.map((u, n) => `<button class="pdp__thumb" type="button" data-zoom data-full="${attr(u)}" aria-haspopup="dialog">'
  + '<span class="visually-hidden">Open media ${n + 1} in modal</span>'
  + '<img src="${attr(u)}" alt="${attr(p.title + \' — view \' + (n + 1))}" width="68" height="68" loading="lazy" decoding="async"></button>`).join(\'\')}';

fs.writeFileSync(P, lines.join('\n'));
console.log('patched line ' + (i + 2));
console.log(lines[i + 1].slice(0, 120) + '…');
