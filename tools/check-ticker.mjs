import fs from 'node:fs';
const m = JSON.parse(fs.readFileSync('src/data/site-model.json', 'utf8'));
const RE = /Free shipping on orders over \$[\d,.]+/i;

let n = 0; const variants = new Set();
for (const p of m.products) {
  const h = fs.readFileSync('audit/raw/products-' + p.handle + '.html', 'utf8');
  const t = h.match(RE);
  if (t) { n++; variants.add(t[0]); }
}
console.log('product pages with the ticker: ' + n + ' of ' + m.products.length);
console.log('distinct wordings: ' + [...variants].join(' | '));

for (const f of ['index.html', 'collections-glass-bongs.html', 'pages-about.html', 'pages-contact.html']) {
  const h = fs.readFileSync('audit/raw/' + f, 'utf8');
  const t = h.match(RE);
  console.log('  ' + f.padEnd(32) + (t ? t[0] : '(absent)'));
}

// how many times does it repeat on one product page?
const one = fs.readFileSync('audit/raw/products-aleaf-10-bubble-beaker.html', 'utf8');
console.log('repeats on one product page: ' + (one.match(new RegExp(RE.source, 'gi')) || []).length);
