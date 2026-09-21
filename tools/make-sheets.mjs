// make-sheets.mjs — lay the generated imagery out as labelled contact sheets so
// every picture gets LOOKED AT. A text scan cannot see a fabricated wordmark;
// only a person reading the image can.
import fs from 'node:fs';
import path from 'node:path';

const prov = JSON.parse(fs.readFileSync('src/assets/generated/provenance.json', 'utf8'));
const imgs = prov.images;
fs.mkdirSync('audit/contact-sheets', { recursive: true });

const PER = 6;
const sheets = [];
for (let i = 0; i < imgs.length; i += PER) {
  const chunk = imgs.slice(i, i + PER);
  const n = Math.floor(i / PER) + 1;
  const cells = chunk.map((im) =>
    `<figure><img src="../../src/assets/generated/${im.file}"><figcaption>${im.id}</figcaption></figure>`
  ).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#111;font:15px/1.3 ui-monospace,monospace;color:#eee}
    .g{display:grid;grid-template-columns:repeat(3,520px);gap:12px;padding:12px}
    figure{margin:0}img{width:520px;height:520px;object-fit:cover;display:block;background:#000}
    figcaption{padding:5px 6px;background:#000;color:#4ade80}
  </style><div class="g">${cells}</div>`;
  const f = `audit/contact-sheets/sheet-${n}.html`;
  fs.writeFileSync(f, html);
  sheets.push(f);
}

const toUrl = (p) => 'file:///' + path.resolve(p).split(path.sep).join('/');
fs.writeFileSync('tools/sheet-urls.json', JSON.stringify({
  settleMs: 1500, paintMs: 900,
  urls: sheets.map(toUrl),
  names: sheets.map((_, i) => 'sheet-' + (i + 1)),
}, null, 1));

console.log('sheets written:', sheets.length, 'covering', imgs.length, 'images');
