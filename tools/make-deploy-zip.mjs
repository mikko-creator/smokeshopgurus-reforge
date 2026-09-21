// make-deploy-zip.mjs — the lean deliverable.
//
// sr-package builds the full handoff: dist, src, audit evidence AND the 3,592
// downloaded source images, which is 480 MB. That is the right archive to keep
// and the wrong thing to hand someone who just needs to put the site online.
//
// This writes dist/ + docs/ only — what actually gets deployed and read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'zip.mjs');
const { collectDir, writeZip } = await import('file:///' + SK.split(path.sep).join('/'));

const files = [
  ...collectDir('dist', 'smokeshopgurus-site/'),
  ...collectDir('docs', 'smokeshopgurus-site/docs/'),
];

const out = 'smokeshopgurus-deploy-v20260921.zip';
writeZip(out, files);
const bytes = fs.statSync(out).size;
console.log('deploy zip written -> ' + out);
console.log('  entries ' + files.length + '  ·  ' + (bytes / 1024 / 1024).toFixed(1) + ' MB');
console.log('  contains dist/ (the site) and docs/ (README, DEPLOY, BRAND-SYSTEM, CHANGE-LOG)');
