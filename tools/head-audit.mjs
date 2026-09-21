// head-audit.mjs — count head fields per built page and report duplicates.
// sr-seo --apply writes into pages the generator had already filled, so the one
// thing worth proving is that nothing got written twice.
import fs from 'node:fs';
import path from 'node:path';

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.html?$/i.test(e.name)) out.push(f);
  }
  return out;
};

const FIELDS = {
  title: /<title[\s>]/gi,
  description: /<meta[^>]+name=["']description["']/gi,
  canonical: /<link[^>]+rel=["']canonical["']/gi,
  'og:title': /property=["']og:title["']/gi,
  'og:description': /property=["']og:description["']/gi,
  'og:url': /property=["']og:url["']/gi,
  'twitter:card': /name=["']twitter:card["']/gi,
  'ld+json': /application\/ld\+json/gi,
};

const files = walk('dist');
const dupes = [];
const missing = [];
const totals = {};

for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  const head = h.slice(0, h.indexOf('</head>') + 7 || h.length);
  for (const [name, re] of Object.entries(FIELDS)) {
    const n = (head.match(re) || []).length;
    totals[name] = (totals[name] || 0) + (n > 0 ? 1 : 0);
    const cap = name === 'ld+json' ? 4 : 1;
    if (n > cap) dupes.push(f + ' :: ' + name + ' x' + n);
    if (n === 0 && name !== 'ld+json') missing.push(f + ' :: ' + name);
  }
}

console.log('pages: ' + files.length);
for (const [k, v] of Object.entries(totals)) console.log('  ' + k.padEnd(16) + v + ' page(s) have it');
console.log('duplicates: ' + dupes.length);
dupes.slice(0, 8).forEach((d) => console.log('  ' + d));
console.log('missing: ' + missing.length);
missing.slice(0, 8).forEach((d) => console.log('  ' + d));
