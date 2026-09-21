// trace-claim.mjs — show what the source corpus actually says around a phrase,
// using the same normalisation sr-fabrication uses. The point is to find out
// whether a flagged "claim" is invented or simply captured with a different
// 50-character tail than the source has.
import fs from 'node:fs';

const content = JSON.parse(fs.readFileSync('audit/content-inventory.json', 'utf8'));

// same shape as sr-fabrication's normalise: lowercase, collapse whitespace
const normalise = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const corpus = normalise((content.pages || []).map((p) =>
  [p.title, p.metaDescription, p.bodyText, p.footerText,
    (p.headings || []).map((h) => h.text).join(' '),
    (p.ctas || []).map((c) => c.text).join(' ')].join(' \n ')).join(' \n '));

const needle = normalise(process.argv[2] || 'best seller');
console.log('corpus chars: ' + corpus.length);
let i = -1, n = 0;
const tails = new Set();
while ((i = corpus.indexOf(needle, i + 1)) >= 0 && n < 40) {
  n++;
  tails.add(corpus.slice(i, i + 62));
}
console.log('occurrences of "' + needle + '": ' + n);
[...tails].slice(0, 12).forEach((t) => console.log('   ' + JSON.stringify(t)));
