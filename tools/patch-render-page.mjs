// Second pass: the two anchors the first pass could not find, addressed by line
// rather than by a long literal, because the surrounding template strings carry
// escapes that shells and Python both rewrite.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
const lines = fs.readFileSync(P, 'utf8').split('\n');
let applied = 0;

// 1. contact page: its own "Get in Touch" heading and the full block structure
const ci = lines.findIndex((l, i) => i > 770 && l.includes('<div class="prose">'));
if (ci >= 0 && lines[ci + 1].includes('pg.paragraphs.map')) {
  lines[ci + 1] = '          <h2>Get in Touch</h2>';
  lines.splice(ci + 2, 0, '          ${renderBlocks(blocks)}');
  applied++;
  console.log('  ok   contact heading at line ' + (ci + 2));
} else {
  console.log('  SKIP contact heading (ci=' + ci + ')');
}

// 2. the filtered-empty note must render on an empty collection too, since the
//    source shows "0 products" and its own no-results line there.
const ei = lines.findIndex((l) => l.includes('data-facet-none'));
if (ei >= 0) {
  lines[ei] = '      <p class="empty-note" data-facet-none${list.length ? \' hidden\' : \'\'}>'
    + 'No products found Use fewer filters or '
    + '<button class="facets__removeall" type="button" data-facet-removeall>Remove all</button></p>';
  applied++;
  console.log('  ok   empty-state note at line ' + (ei + 1));
} else {
  console.log('  SKIP empty-state note');
}

fs.writeFileSync(P, lines.join('\n'));
console.log('applied ' + applied + ' patch(es)');
