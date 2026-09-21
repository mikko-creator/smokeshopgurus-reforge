import fs from 'node:fs';
import path from 'node:path';
const ids = process.argv.slice(2);
const prov = JSON.parse(fs.readFileSync('src/assets/generated/provenance.json', 'utf8'));
const imgs = prov.images.filter(i => ids.includes(i.id));
const cells = imgs.map(im => `<figure><img src="../../src/assets/generated/${im.file}?v=${Date.now()}"><figcaption>${im.id}</figcaption></figure>`).join('\n');
const html = `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;background:#111;font:15px/1.3 ui-monospace,monospace;color:#eee}
 .g{display:grid;grid-template-columns:repeat(3,520px);gap:12px;padding:12px}
 figure{margin:0}img{width:520px;height:520px;object-fit:cover;display:block;background:#000}
 figcaption{padding:5px 6px;background:#000;color:#4ade80}
</style><div class="g">${cells}</div>`;
fs.writeFileSync('audit/contact-sheets/sheet-fix.html', html);
const toUrl = p => 'file:///' + path.resolve(p).split(path.sep).join('/');
fs.writeFileSync('tools/sheet-fix-urls.json', JSON.stringify({ settleMs: 1500, paintMs: 900, urls: [toUrl('audit/contact-sheets/sheet-fix.html')], names: ['sheet-fix'] }, null, 1));
console.log('fix sheet:', imgs.length, 'images');
