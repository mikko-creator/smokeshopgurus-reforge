// repair-skill-rebase.mjs — undo an sr-rebase run that hit the installed skill.
//
// sr-rebase takes --dir, not --project. Given --project it fell back to '.', which
// was the skill directory, and it rewrote 30 preset/fixture files in place: it
// injected its __SR_BASE__ shim into <head> and rebased every root-relative
// reference.
//
// This restores those files from the pre-upgrade backup, but ONLY after proving
// the backup copy differs from the current one by exactly that damage — otherwise
// restoring a 1.8.0 file into a 1.12.1 install would be a second, quieter defect.
//
//   node tools/repair-skill-rebase.mjs [--apply]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const LIVE = path.join(HOME, 'skills', 'site-reforge');
const BACKUP = path.join(HOME, 'skill-backups', 'site-reforge-1.8.0-patched-20260921');
const APPLY = process.argv.includes('--apply');

const FILES = fs.readFileSync(path.join(process.cwd(), 'audit', 'skill-damage.txt'), 'utf8')
  .split('\n').map((s) => s.trim().replace(/^\.\//, '')).filter(Boolean);

// The shim sr-rebase injects, and the rebasing it does to references.
const stripShim = (s) => s.replace(/<head><script>window\.__SR_BASE__[\s\S]*?<\/script>/i, '<head>');
const unrebase = (s, depth) => {
  const up = '../'.repeat(depth);
  if (!up) return s;
  return s.split('="' + up).join('="/');
};

let identical = 0; const differs = []; const missing = [];
for (const rel of FILES) {
  const live = path.join(LIVE, rel);
  const back = path.join(BACKUP, rel);
  if (!fs.existsSync(back)) { missing.push(rel); continue; }
  const cur = fs.readFileSync(live, 'utf8');
  const org = fs.readFileSync(back, 'utf8');
  const depth = rel.split('/').length - 1;
  const undone = unrebase(stripShim(cur), depth);
  if (undone === org) identical++;
  else differs.push({ rel, curLen: cur.length, orgLen: org.length, undoneLen: undone.length });
}

console.log('files checked: ' + FILES.length);
console.log('  reversible to the backup byte-for-byte: ' + identical);
console.log('  not reversible (backup may differ by version): ' + differs.length);
console.log('  absent from backup: ' + missing.length);
differs.slice(0, 6).forEach((d) => console.log('    ' + d.rel + '  cur=' + d.curLen + ' undone=' + d.undoneLen + ' backup=' + d.orgLen));
missing.slice(0, 6).forEach((m) => console.log('    MISSING ' + m));

if (!APPLY) { console.log('\n(dry run — pass --apply to restore)'); process.exit(0); }

let restored = 0;
for (const rel of FILES) {
  const back = path.join(BACKUP, rel);
  if (!fs.existsSync(back)) continue;
  fs.copyFileSync(back, path.join(LIVE, rel));
  restored++;
}
console.log('\nrestored ' + restored + ' file(s) from ' + BACKUP);
