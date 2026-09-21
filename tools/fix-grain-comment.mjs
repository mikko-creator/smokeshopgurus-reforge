// Repair the --grain comment by line, since the broken text carries trailing
// whitespace that a literal match kept missing.
import fs from 'node:fs';

const P = 'tools/apply-brand-layer.mjs';
const lines = fs.readFileSync(P, 'utf8').split('\n');

const i = lines.findIndex((l) => l.includes('one line to restore and no authored stylesheet had to change'));
if (i < 0) { console.error('comment not found'); process.exit(2); }

// the broken comment runs three lines: the 'change. ... is a' line and the two after
lines.splice(i, 3,
  '     one line to restore and no authored stylesheet had to change. The keyword',
  '     "none" is a valid background-image LAYER, so a declaration written as',
  '     var(--grain), var(--sheen) still resolves — it simply paints the sheen on',
  '     its own with an empty layer above it. Put the repeating-linear-gradient',
  '     back on this one property to restore the roughness. */');

// drop the now-duplicated closing marker if the old one survived
const j = lines.findIndex((l, k) => k > i && k < i + 8 && l.trim() === 'still resolves — it just paints the sheen alone. */');
if (j >= 0) lines.splice(j, 1);

fs.writeFileSync(P, lines.join('\n'));
console.log('comment repaired:');
lines.slice(i - 3, i + 6).forEach((l) => console.log('  ' + l));
