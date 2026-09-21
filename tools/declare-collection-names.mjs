// Record the client's own collection names as declared facts.
//
// WHY: sr-fabrication's superlative detector captures the matched phrase PLUS the
// next 50 characters. "Best seller" is the name of one of the client's own
// collections — it appears four times in the capture — but on the collection page
// the phrase is followed by the breadcrumb/heading sequence, so the 50-character
// span traces to nothing while the phrase itself traces fine.
//
// The seven product-page instances were fixed structurally (superlative-named
// categories ordered last, sentence closed with a full stop) so the captured span
// is exactly the phrase. The remaining one is the collection page's own
// breadcrumb + H1, which cannot be reordered without removing the breadcrumb.
// Declaring it is the remedy the tool itself names, and the client IS the source:
// it is their collection.
import fs from 'node:fs';

const P = 'facts/client-facts.json';
const facts = JSON.parse(fs.readFileSync(P, 'utf8'));
const model = JSON.parse(fs.readFileSync('src/data/site-model.json', 'utf8'));

const SUPERLATIVE = /\b(?:#1|number one|best|leading|largest|fastest[- ]growing|top[- ]rated|most trusted)\b/i;
const names = model.collections.map((c) => c.title).filter((t) => SUPERLATIVE.test(t));

// The exact rendered sequence on each such collection page: breadcrumb, hero
// eyebrow, H1, product count.
const rendered = model.collections
  .filter((c) => SUPERLATIVE.test(c.title))
  .map((c) => `${c.title} Collection ${c.title} ${c.productHandles.length}`);

facts.collectionNames = {
  note: 'Collection names the client publishes that contain a superlative. These are '
    + 'the client\'s own category names, present in audit/content-inventory.json, not claims '
    + 'written for the rebuild. They are declared here because sr-fabrication captures a '
    + 'superlative plus the following 50 characters, so the phrase traces but the captured '
    + 'span does not.',
  names,
  renderedContext: rendered,
  evidence: 'grep "Best seller" audit/raw/collections-best-seller.html -> 3 hits; audit/raw/index.html -> 1 hit',
};

fs.writeFileSync(P, JSON.stringify(facts, null, 2));
console.log('declared ' + names.length + ' superlative collection name(s): ' + names.join(', '));
rendered.forEach((r) => console.log('  context: ' + JSON.stringify(r)));
