// shoot-pairs.mjs — take the baseline/rebuild screenshot pairs sr-pixeldiff wants.
//
//   audit/screens/baseline/<slug>.<width>.png
//   audit/screens/rebuild/<slug>.<width>.png
//
// Full document height on both sides: a short capture returns a verdict about
// the part of the page it never compared.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WIDTHS = [390, 768, 1024, 1440];
const PAGES = [
  ['index', '/', ''],
  ['collections-glass-bongs', '/collections/glass-bongs', '/collections/glass-bongs/'],
  ['products-aleaf-10-bubble-beaker', '/products/aleaf-10-bubble-beaker', '/products/aleaf-10-bubble-beaker/'],
  ['pages-about', '/pages/about', '/pages/about/'],
  ['pages-contact', '/pages/contact', '/pages/contact/'],
  ['pages-faqs', '/pages/faqs', '/pages/faqs/'],
];
const SOURCE = 'https://smokeshopgurus.com';
const LOCAL = 'http://127.0.0.1:8788';
const INIT = "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}";

const side = process.argv[2];
if (side !== 'baseline' && side !== 'rebuild') { console.error('usage: shoot-pairs.mjs baseline|rebuild'); process.exit(2); }

for (const w of WIDTHS) {
  const urls = [], names = [];
  for (const [slug, srcPath, localPath] of PAGES) {
    urls.push(side === 'baseline' ? SOURCE + srcPath : LOCAL + localPath);
    names.push(slug + '.' + w);
  }
  const spec = { settleMs: 2600, paintMs: 1200, initScript: INIT, urls, names };
  const f = path.join('tools', 'shots-' + side + '-' + w + '.json');
  fs.writeFileSync(f, JSON.stringify(spec, null, 1));
  console.log('--- ' + side + ' @ ' + w + 'px ---');
  try {
    execFileSync(process.execPath,
      ['tools/shoot.mjs', '--project', process.cwd(), '--urls', f, '--out', 'audit/screens/' + side, '--viewport', String(w)],
      { stdio: 'inherit' });
  } catch (e) {
    console.log('  (some shots failed at ' + w + 'px)');
  }
}

const dir = 'audit/screens/' + side;
const n = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.png')).length : 0;
console.log('\n' + side + ': ' + n + ' png(s) in ' + dir);
