// The product page lists the collections a product belongs to. One of those is
// the client's own "Best seller" collection, and sr-fabrication's superlative
// detector captures the phrase plus the next 50 characters — so "Best seller"
// followed by a comma and three more category names traced to nothing, while the
// phrase alone traces to the source four times over.
//
// Ordering the superlative-named category last and closing the sentence with a
// full stop makes the captured claim exactly "Best seller", which is what the
// source says. It is also better typography than an unterminated list.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
let s = fs.readFileSync(P, 'utf8');

const from = '${cols.length ? `<p class="muted">In: ${cols.map((c) => `<a href="/collections/${attr(c.handle)}">${esc(c.title)}</a>`).join(\', \')}</p>` : \'\'}';
if (!s.includes(from)) { console.error('collections line not found'); process.exit(2); }

const to = [
  '${cols.length ? `<p class="muted">In: ${[...cols]',
  '            // superlative-named categories last, so the phrase is followed by the full stop',
  '            .sort((a, b) => (/\\b(best|top|leading|#1)\\b/i.test(a.title) ? 1 : 0) - (/\\b(best|top|leading|#1)\\b/i.test(b.title) ? 1 : 0))',
  '            .map((c) => `<a href="/collections/${attr(c.handle)}">${esc(c.title)}</a>`).join(\', \')}.</p>` : \'\'}',
].join('\n');

s = s.replace(from, to);
fs.writeFileSync(P, s);
console.log('patched product collection line');
