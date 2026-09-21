// accept-failures.mjs — close each recorded failure with a stated reason.
//
// C24 fails while any failure is open. Accepting one is a decision with a name
// on it, not a way to make a number go green, so every entry below says what the
// target actually was and why fetching it was never going to succeed.
import fs from 'node:fs';

const P = 'audit/failures.json';
const f = JSON.parse(fs.readFileSync(P, 'utf8'));

const RULES = [
  {
    match: (i) => i.stage === 'crawl:page' && /customer_authentication/.test(i.target),
    reason: 'Shopify customer-account OAuth bounce. The chain leaves the origin for shopify.com '
      + 'and shop.app and returns a login flow, not a page of the site. robots.txt disallows '
      + '/account and the rebuild has no account system (see docs/DEPLOY.md). Nothing about the '
      + 'site is missing from the harvest because of it.',
  },
  {
    match: (i) => /sf_private_access_tokens/.test(i.target),
    reason: 'Shopify private storefront-token endpoint. It answers 401 to everyone, is disallowed '
      + 'by the site\'s own robots.txt (/sf_*), and is platform infrastructure rather than an asset '
      + 'of the site.',
  },
  {
    match: (i) => /\/(GET|POST|development)$/.test(i.target),
    reason: 'Not a real URL. The asset pass reads candidate paths out of inline script, and these '
      + 'are string literals from the theme\'s own JavaScript — HTTP verbs and an environment name — '
      + 'resolved against the origin. Each 404s because nothing was ever published there. No asset '
      + 'of the site is missing.',
  },
];

let closed = 0; const untouched = [];
for (const item of f.items || []) {
  if (item.resolved || item.accepted) continue;
  const rule = RULES.find((r) => r.match(item));
  if (!rule) { untouched.push(item); continue; }
  item.accepted = true;
  item.acceptedReason = rule.reason;
  item.acceptedAt = new Date().toISOString();
  closed++;
}

fs.writeFileSync(P, JSON.stringify(f, null, 2));
console.log('accepted ' + closed + ' failure(s)');
console.log('still open: ' + untouched.length);
untouched.slice(0, 8).forEach((i) => console.log('   ' + i.stage + ' :: ' + i.reason + ' :: ' + String(i.target).slice(0, 90)));
