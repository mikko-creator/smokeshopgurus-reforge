// Add "Skip to product information" to the product page, line-addressed.
// A literal multi-line anchor failed to match, so this finds the two lines it
// needs and edits those.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
const lines = fs.readFileSync(P, 'utf8').split('\n');

// The product body is the `const body` whose next lines open .pdp
let bodyIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].includes('const body = ')) continue;
  const near = lines.slice(i, i + 5).join('\n');
  if (near.includes('<div class="pdp">')) { bodyIdx = i; break; }
}
if (bodyIdx < 0) { console.error('product body not found'); process.exit(2); }

const stageIdx = lines.findIndex((l, i) => i > bodyIdx && l.includes('class="pdp__stage"'));
if (stageIdx < 0) { console.error('pdp__stage not found'); process.exit(2); }

if (lines[bodyIdx].includes('Skip to product information')) {
  console.log('already patched'); process.exit(0);
}

lines[bodyIdx] = lines[bodyIdx].replace(
  'const body = `',
  'const body = `<a class="skip-link" href="#product-information">Skip to product information</a>\n    '
);
lines[stageIdx] = lines[stageIdx].replace('class="pdp__stage"', 'class="pdp__stage" id="product-information"');

fs.writeFileSync(P, lines.join('\n'));
console.log('patched body line ' + (bodyIdx + 1) + ' and stage line ' + (stageIdx + 1));
console.log('  ' + lines[bodyIdx].trim().slice(0, 100));
console.log('  ' + lines[stageIdx].trim());
