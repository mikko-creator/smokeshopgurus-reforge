// fetch-crossorigin-css.mjs — pull the stylesheets the browser refused to expose.
//
// A cross-origin sheet without CORS headers throws on .cssRules, so the capture
// records it as UNREADABLE and the motion inventory carries a blocking gap. The
// bytes are public; only the DOM read is blocked. Fetching them to the name
// sr-motion derives (audit/css/<slugifyUrl>.css) closes the gap with evidence
// rather than by waiving it.
//
// Google Fonts serves a different stylesheet per User-Agent: a plain fetch gets
// legacy TTF, a modern browser UA gets woff2. We want what the site actually
// loads, so we ask as the browser does.

import fs from 'node:fs';
import path from 'node:path';
import { slugifyUrl } from '../../.claude/skills/site-reforge/scripts/lib/util.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const cssDir = path.resolve('audit/css');
fs.mkdirSync(cssDir, { recursive: true });

const urls = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let ok = 0; const failed = [];

for (const url of urls) {
  const name = slugifyUrl(url).replace(/\.css$/i, '') + '.css';
  const dest = path.join(cssDir, name);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/css,*/*;q=0.1' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.text();
    if (!body.trim()) throw new Error('empty body');
    fs.writeFileSync(dest, body);
    ok++;
    console.log('  OK  ' + name + '  ' + body.length + ' bytes');
    const woff2 = (body.match(/url\(([^)]*\.woff2[^)]*)\)/gi) || []).length;
    if (woff2) console.log('      ' + woff2 + ' woff2 references');
  } catch (e) {
    failed.push({ url, reason: String(e.message || e) });
    console.log('  FAIL ' + url.slice(0, 90) + '  ' + String(e.message || e));
  }
}
console.log('fetched ' + ok + ', failed ' + failed.length);
if (failed.length) process.exitCode = 1;
