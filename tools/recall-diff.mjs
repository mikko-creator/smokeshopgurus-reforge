// recall-diff.mjs — show WHICH tokens a rebuilt page is short of, and by how many.
//
// The parity report names the first 60 distinct missing words. That is enough to
// know something is wrong and not enough to know what to build. This prints the
// deficit per token, largest first, using the same multiset rule sr-parity uses.
//
//   node tools/recall-diff.mjs <source-url-path> [top]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'skills', 'site-reforge', 'scripts', 'lib');
const { getRegion, textOf } = await import('file:///' + path.join(SK, 'html.mjs').split(path.sep).join('/'));

const content = JSON.parse(fs.readFileSync('audit/content-inventory.json', 'utf8'));
const want = process.argv[2] || '/';
const top = Number(process.argv[3] || 30);

const page = content.pages.find((p) => new URL(p.url).pathname === want);
if (!page) { console.error('no source page for ' + want); process.exit(2); }

const rel = want === '/' ? 'index.html' : want.replace(/^\/|\/$/g, '') + '/index.html';
const file = path.join('dist', rel);
if (!fs.existsSync(file)) { console.error('no rebuilt file ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

const tok = (s) => (String(s || '').toLowerCase().match(/[a-z0-9À-ɏ']+/g) || []);
const count = (arr) => { const m = new Map(); for (const w of arr) m.set(w, (m.get(w) || 0) + 1); return m; };

const src = tok(page.bodyText);
const mainT = tok(textOf(getRegion(html, 'main')));
const fullT = tok(textOf(getRegion(html, 'body') || html));

function deficit(target) {
  const bag = count(target);
  const need = count(src);
  const out = [];
  let missing = 0;
  for (const [w, n] of need) {
    const have = bag.get(w) || 0;
    if (have < n) { out.push({ w, need: n, have, short: n - have }); missing += n - have; }
  }
  return { out: out.sort((a, b) => b.short - a.short), missing, recall: (src.length - missing) / src.length };
}

const dMain = deficit(mainT);
const dFull = deficit(fullT);
const d = dMain.recall >= dFull.recall ? dMain : dFull;
const which = dMain.recall >= dFull.recall ? 'main' : 'body';

console.log(want + '  source tokens ' + src.length + '  |  best region: ' + which
  + '  recall ' + (d.recall * 100).toFixed(1) + '%  short ' + d.missing + ' tokens');
console.log('token            need  have  short');
for (const r of d.out.slice(0, top)) {
  console.log('  ' + r.w.padEnd(16) + String(r.need).padStart(4) + String(r.have).padStart(6) + String(r.short).padStart(7));
}
const tail = d.out.slice(top).reduce((a, b) => a + b.short, 0);
if (tail) console.log('  ...' + (d.out.length - top) + ' more tokens, ' + tail + ' short in total');
