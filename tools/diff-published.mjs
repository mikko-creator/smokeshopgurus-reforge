// diff-published.mjs — is what is PUBLISHED the same as what was BUILT?
//
// "It looks different" is a claim about bytes somewhere. Rather than guess, this
// compares every file in dist/ against the published repository's git tree by
// hash, so the answer is a list of paths rather than an impression.
//
// It hashes the way git does — sha1("blob " + byteLength + "\0" + contents) —
// because that is exactly what the tree records. No downloads, no sampling: it
// covers every file, and it catches the case where a file is present in both
// but its contents differ.
//
// Two things it is specifically looking for, because both are invisible locally:
//   - files MISSING from the publish, usually because a .gitignore pattern
//     matched deeper than intended
//   - text files whose bytes changed on commit, because git on Windows can
//     rewrite line endings and the served file is then not the file on disk
//
//   node tools/diff-published.mjs <owner/repo> [--dir dist] [--ref main]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = process.argv[2];
if (!repo) { console.error('usage: diff-published.mjs <owner/repo> [--dir dist] [--ref main]'); process.exit(2); }
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const DIR = arg('dir', 'dist');
const REF = arg('ref', 'main');

// --- local side -------------------------------------------------------------
const local = new Map();
(function walk(d, base) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p, rel);
    else {
      const buf = fs.readFileSync(p);
      const h = crypto.createHash('sha1');
      h.update('blob ' + buf.length + '\0');
      h.update(buf);
      local.set(rel, { sha: h.digest('hex'), size: buf.length });
    }
  }
})(DIR, '');

// --- published side ---------------------------------------------------------
const out = execFileSync('gh', ['api', `repos/${repo}/git/trees/${REF}?recursive=1`, '--jq', '.tree[] | select(.type=="blob") | "\\(.path)\\t\\(.sha)\\t\\(.size)"'],
  { encoding: 'utf8', maxBuffer: 1e8 });
const remote = new Map();
for (const line of out.trim().split('\n')) {
  if (!line) continue;
  const [p, sha, size] = line.split('\t');
  remote.set(p, { sha, size: Number(size) });
}

// files the publish adds on purpose; not a discrepancy
const EXPECTED_EXTRA = new Set(['.nojekyll', 'README.md']);

const missing = [], extra = [], changed = [];
for (const [p, v] of local) {
  const r = remote.get(p);
  if (!r) { missing.push({ p, size: v.size }); continue; }
  if (r.sha !== v.sha) changed.push({ p, local: v.size, remote: r.size });
}
for (const [p] of remote) {
  if (!local.has(p) && !EXPECTED_EXTRA.has(p)) extra.push(p);
}

console.log('published vs built — ' + repo + '@' + REF + '  vs  ' + DIR + '/');
console.log('  local files     : ' + local.size);
console.log('  published files : ' + remote.size + '  (' + EXPECTED_EXTRA.size + ' of them added for the preview)');
console.log('');
console.log('  missing from the publish : ' + missing.length);
for (const m of missing.slice(0, 25)) console.log('     - ' + m.p + '   (' + (m.size / 1024).toFixed(1) + ' KB)');
if (missing.length > 25) console.log('     ... and ' + (missing.length - 25) + ' more');
console.log('  extra in the publish     : ' + extra.length);
for (const e of extra.slice(0, 15)) console.log('     + ' + e);
console.log('  present but DIFFERENT    : ' + changed.length);
for (const c of changed.slice(0, 25)) {
  console.log('     ~ ' + c.p + '   local ' + c.local + ' B, published ' + c.remote + ' B'
    + (c.local !== c.remote ? '   (' + (c.remote - c.local > 0 ? '+' : '') + (c.remote - c.local) + ' B)' : '   (same length, different bytes)'));
}
if (changed.length > 25) console.log('     ... and ' + (changed.length - 25) + ' more');

const bad = missing.length + extra.length + changed.length;
console.log('\n  ' + (bad === 0
  ? 'the published site is byte-for-byte the build'
  : bad + ' difference(s) — listed above'));
if (bad) process.exitCode = 1;
