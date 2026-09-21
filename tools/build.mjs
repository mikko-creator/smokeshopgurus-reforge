// build.mjs — the whole build, in order, or nothing.
//
// WHY THIS EXISTS. generate.mjs re-copies the original assets into dist/ every
// run, which overwrites whatever sr-images converted on the previous pass. So a
// rebuild that runs only `generate` silently un-optimises the build: the pages
// are right, the pictures are 39MB of PNG again, and nothing in the gate fails
// because image optimisation is a report rather than a check.
//
// That happened twice during development. Both times it was caught by the size
// of the deploy zip, which is luck rather than process. The stages are not
// independent and must not be invocable a la carte, so this runs all four in
// order and stops at the first failure.
//
//   node tools/build.mjs [--site-url <url>]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts');

const siteUrlIdx = process.argv.indexOf('--site-url');
const SITE_URL = siteUrlIdx > -1 ? process.argv[siteUrlIdx + 1] : 'https://smokeshopgurus.com';

const STAGES = [
  ['render pages', 'tools/generate.mjs', []],
  ['seo', path.join(SK, 'sr-seo.mjs'), ['--project', '.', '--apply', '--site-url', SITE_URL]],
  // must run AFTER generate (which restores the originals) and BEFORE rebase
  // (which rewrites references, including the ones sr-images just changed)
  ['images', path.join(SK, 'sr-images.mjs'), ['--project', '.', '--apply']],
  ['rebase', path.join(SK, 'sr-rebase.mjs'), ['--dir', 'dist']],
  // last: rebase rewrites url() references inside the stylesheets, so slimming
  // has to happen after it has finished editing them
  ['slim css', 'tools/css-slim.mjs', []],
];

const raster = () => {
  let n = 0, bytes = 0;
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(png|jpe?g)$/i.test(e.name)) { n++; bytes += fs.statSync(p).size; }
    }
  };
  walk('dist');
  return { n, mb: (bytes / 1048576).toFixed(1) };
};

for (const [label, script, args] of STAGES) {
  process.stdout.write('  ' + label.padEnd(14));
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('FAILED (exit ' + r.status + ')');
    console.error((r.stderr || r.stdout || '').split('\n').slice(-12).join('\n'));
    process.exit(1);
  }
  const line = (r.stdout || '').split('\n').filter((l) => l.trim()).pop() || 'ok';
  console.log(line.trim().slice(0, 96));
}

// The check that would have caught both regressions: after a complete build,
// only images sr-images deliberately KEPT may still be raster.
const left = raster();
console.log('\n  raster files left in dist: ' + left.n + '  (' + left.mb + ' MB)');
let kept = 0;
try {
  const rep = JSON.parse(fs.readFileSync('audit/image-optimisation.json', 'utf8'));
  kept = (rep.images || []).filter((i) => /\.(png|jpe?g)$/i.test(i.file || '')).length;
} catch { /* no report yet */ }
console.log('  recorded as deliberately kept: ' + kept);
if (left.n > kept) {
  console.log('\n  BUILD IS UN-OPTIMISED — ' + (left.n - kept) + ' raster file(s) beyond the kept set.');
  process.exit(1);
}
console.log('  build complete and optimised');
