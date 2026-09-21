// fetch-fonts.mjs — self-host the webfonts the source actually loads.
//
// sr-assets fetches images and stylesheets, not webfonts. Without this the
// rebuild renders in fallback type and every glyph differs from the measurement
// the design baseline was taken against. The font families come from the Google
// Fonts stylesheet the source links; the files are downloaded once and a local
// @font-face sheet is written to replace the third-party request entirely.

import fs from 'node:fs';
import path from 'node:path';

const CSS_DIR = 'audit/css';
const OUT_FONTS = 'src/assets/fonts';
const OUT_CSS = 'src/styles/fonts.css';

const sheet = fs.readdirSync(CSS_DIR).find((f) => /^css2-family-Fira-Sans/.test(f));
if (!sheet) { console.error('google fonts sheet not found in ' + CSS_DIR); process.exit(2); }
let css = fs.readFileSync(path.join(CSS_DIR, sheet), 'utf8');
fs.mkdirSync(OUT_FONTS, { recursive: true });

// Each @font-face in the Google sheet is one family/weight/style/subset. We keep
// latin and latin-ext only: the source is an English-language US storefront, and
// shipping every subset would multiply the payload for glyphs no page uses.
const faces = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi)]
  .map((m) => ({ subset: m[1], block: m[2] }))
  .filter((f) => f.subset === 'latin' || f.subset === 'latin-ext');

console.log('font faces in sheet: ' + faces.length + ' (latin/latin-ext)');

const seen = new Map();
let downloaded = 0; const failed = [];

for (const f of faces) {
  const family = (f.block.match(/font-family:\s*'([^']+)'/) || [])[1] || 'font';
  const weight = (f.block.match(/font-weight:\s*([^;]+);/) || [])[1].trim().replace(/\s+/g, '-');
  const style = (f.block.match(/font-style:\s*([^;]+);/) || [])[1].trim();
  const url = (f.block.match(/url\(([^)]+)\)\s*format\('woff2'\)/) || [])[1];
  if (!url) continue;
  const name = [family.replace(/\s+/g, ''), weight, style, f.subset].join('-').toLowerCase() + '.woff2';
  const dest = path.join(OUT_FONTS, name);
  if (!seen.has(url)) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      seen.set(url, name);
      downloaded++;
    } catch (e) { failed.push({ url, reason: String(e.message || e) }); continue; }
  }
  f.local = seen.get(url) || name;
  f.family = family; f.weight = weight; f.style = style;
}

const blocks = faces.filter((f) => f.local).map((f) =>
  f.block
    .replace(/src:\s*url\([^)]+\)\s*format\('woff2'\);/, `src: url('../assets/fonts/${f.local}') format('woff2');`)
    .replace(/^@font-face\s*\{/, '@font-face {\n  font-display: swap;')
);

fs.writeFileSync(OUT_CSS,
  '/* fonts.css — the source\'s own webfonts, self-hosted.\n' +
  '   Downloaded by tools/fetch-fonts.mjs from the Google Fonts stylesheet the live\n' +
  '   site links. Self-hosted so the rebuild makes no third-party request and the\n' +
  '   glyphs match the ones the design baseline was measured against. */\n\n' +
  blocks.join('\n\n') + '\n');

console.log('downloaded ' + downloaded + ' woff2 files, ' + failed.length + ' failed');
console.log('wrote ' + OUT_CSS + ' with ' + blocks.length + ' @font-face rules');
const fams = [...new Set(faces.filter((f) => f.local).map((f) => f.family))];
console.log('families: ' + fams.join(', '));
if (failed.length) process.exitCode = 1;
