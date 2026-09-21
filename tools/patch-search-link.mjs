// Make the search index reachable after sr-rebase.
//
// shop.js fetches '/search-index.json' as a string literal. sr-rebase rewrites
// references in HTML and CSS, not strings inside JavaScript, so once the build is
// served from a subdirectory that absolute path resolves to the server root and
// search silently returns nothing. Putting the URL on a <link> lets sr-rebase
// rewrite it like any other reference, and the script reads it back resolved.
import fs from 'node:fs';

const G = 'tools/generate.mjs';
let g = fs.readFileSync(G, 'utf8');
const anchor = '      <p class="muted" data-search-summary></p>';
if (!g.includes(anchor)) { console.error('search page anchor not found'); process.exit(2); }
g = g.replace(anchor,
  '      <link rel="preload" as="fetch" id="search-index-url" href="/search-index.json" crossorigin>\n' + anchor);
fs.writeFileSync(G, g);
console.log('search-index link added to the search page');

const S = 'src/scripts/shop.js';
let s = fs.readFileSync(S, 'utf8');
const from = "    fetch('/search-index.json')";
if (!s.includes(from)) { console.error('fetch call not found in shop.js'); process.exit(2); }
s = s.replace(from,
  "    var link = document.getElementById('search-index-url');\n"
  + "    // .href on a <link> is already resolved against the document, so this works\n"
  + "    // from any directory the build is served out of.\n"
  + "    fetch(link ? link.href : 'search-index.json')");
fs.writeFileSync(S, s);
console.log('shop.js now reads the resolved link href');
