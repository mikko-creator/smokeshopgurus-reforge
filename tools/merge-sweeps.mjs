// merge-sweeps.mjs — fold every raw sweep into the project's sweep store.
//
// Each raw file is named "<side>.<page>.<width>.json". The label must carry BOTH
// the page and the width: labelling by page alone makes the four viewports of a
// page overwrite each other, and the collect step then reports one width and
// declares the other three unswept.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SR_SWEEP = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'sr-sweep.mjs'
);
const RAW = 'audit/sweep-raw';

// Start from a clean store so an earlier mislabelled run cannot leave stale files.
const store = 'audit/capture/sweeps';
if (fs.existsSync(store)) {
  fs.rmSync(store, { recursive: true, force: true });
  console.log('cleared ' + store);
}

let ok = 0; const failed = [];
for (const f of fs.readdirSync(RAW).sort()) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue;
  const parts = f.replace(/\.json$/, '').split('.');
  const side = parts[0];
  const width = parts[parts.length - 1];
  const page = parts.slice(1, -1).join('-') || 'page';
  const label = page + '-' + width;
  try {
    execFileSync(process.execPath,
      [SR_SWEEP, '--project', process.cwd(), '--merge', path.join(RAW, f), '--side', side, '--label', label],
      { stdio: 'pipe' });
    ok++;
  } catch (e) {
    failed.push(f + ': ' + String(e.stderr || e).slice(0, 160));
  }
}
console.log('merged ' + ok + ', failed ' + failed.length);
failed.slice(0, 5).forEach((x) => console.log('  ' + x));
console.log('store now holds ' + (fs.existsSync(store) ? fs.readdirSync(store).length : 0) + ' file(s)');
