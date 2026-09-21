// One-shot repair: a patch written through a non-raw Python string turned the
// regex escapes \1 and \b into the literal control characters chr(1) and chr(8),
// which a terminal renders as nothing — so the source LOOKED right and matched
// nothing. This strips every control character from the file and restores the
// two regexes by hand.
import fs from 'node:fs';

const p = 'tools/build-model.mjs';
let src = fs.readFileSync(p, 'utf8');

const ctrl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const found = (src.match(ctrl) || []).length;
console.log('control characters found: ' + found);
src = src.replace(ctrl, '');

const BS = String.fromCharCode(92);
let n = 0;
// restore the backreference in the page-block matcher
if (src.includes('<' + BS + '/>/gi')) {
  src = src.replace('<' + BS + '/>/gi', '<' + BS + '/' + BS + '1>/gi');
  n++;
}
// restore the word boundaries around the rte class match
if (src.includes('class="[^"]*rte[^"]*"')) {
  src = src.replace('class="[^"]*rte[^"]*"', 'class="[^"]*' + BS + 'brte' + BS + 'b[^"]*"');
  n++;
}
fs.writeFileSync(p, src);
console.log('regexes restored: ' + n);
for (const line of src.split('\n')) {
  if (line.includes('h2|h3|h4|p|li') || line.includes('brte')) console.log('  ' + line.trim());
}
