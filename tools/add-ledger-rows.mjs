// add-ledger-rows.mjs — record the two pages the rebuild ADDS.
//
// The rebuild ships /search/ and /cart/, which the source did not have as pages:
// Shopify served search from a modal and the cart from its own runtime. Both are
// deliberate additions, so each gets an ADD row with a reason, exactly as a
// REMOVE would.
//
// sr-plan.mjs --set only updates rows that already exist, and there is no CLI to
// create one, so the rows are written here — by a script, with their reasoning,
// rather than typed into the JSON by hand. Re-running sr-plan.mjs keeps them:
// it carries forward any row the new crawl does not produce.
import fs from 'node:fs';

const P = 'audit/change-control.json';
const ledger = JSON.parse(fs.readFileSync(P, 'utf8'));

const ROWS = [
  {
    id: 'rebuild/search#add',
    url: 'https://smokeshopgurus.com/search',
    pageType: 'added',
    index: 1,
    label: 'Search results',
    sourceTag: '(none — added by the rebuild)',
    sourceClass: '',
    decision: 'ADD',
    why: 'The source had a /search FORM on all 150 pages but no search results PAGE — '
      + 'Shopify answered the query from its own runtime. A static build has no such runtime, '
      + 'so dropping it would have removed a function the site had. This page answers the same '
      + 'form, at the same action, from a generated index of all 82 products and 46 collections.',
    narrativeSlot: 'objection-handling',
    presetId: '',
    rebuiltAs: 'search/index.html',
  },
  {
    id: 'rebuild/cart#add',
    url: 'https://smokeshopgurus.com/cart',
    pageType: 'added',
    index: 1,
    label: 'Quote basket',
    sourceTag: '(none — added by the rebuild)',
    sourceClass: '',
    decision: 'ADD',
    why: 'The source ran Shopify cart and checkout, which a static build cannot reproduce and '
      + 'must not pretend to. This page keeps the basket affordance without faking payment: items '
      + 'and quantities collect in the browser and are sent as a quote request to the phone and '
      + 'email the client already publishes. docs/DEPLOY.md records checkout as the one '
      + 'integration a buyer would need wired.',
    narrativeSlot: 'strategic-cta',
    presetId: '',
    rebuiltAs: 'cart/index.html',
  },
];

let added = 0;
for (const row of ROWS) {
  if (ledger.rows.some((r) => r.id === row.id)) { console.log('  already present: ' + row.id); continue; }
  ledger.rows.push(row);
  added++;
  console.log('  added ' + row.id + ' -> ' + row.decision);
}
ledger.rowCount = ledger.rows.length;
ledger.updated = new Date().toISOString();
fs.writeFileSync(P, JSON.stringify(ledger, null, 2));

const counts = ledger.rows.reduce((a, r) => { a[r.decision] = (a[r.decision] || 0) + 1; return a; }, {});
console.log('ledger now ' + ledger.rows.length + ' rows: ' + JSON.stringify(counts));
