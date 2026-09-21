// Turn the product page's category memberships into chips, and lift the email
// out of a running sentence onto its own control.
//
// Both were inline links inside prose at phone width — 66x20 and 110x15 hit
// areas. As chips and a button they are real 44px targets, which is what they
// should have been on a phone anyway.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
let g = fs.readFileSync(P, 'utf8');
let n = 0;
const swap = (name, from, to) => {
  if (!g.includes(from)) { console.log('  MISS ' + name); return; }
  g = g.replace(from, to); n++; console.log('  ok   ' + name);
};

const D = '$';

swap('chips wrapper',
  '<p class="muted">In: ' + D + '{[...cols]',
  '<p class="chips"><span class="chips__label">In:</span> ' + D + '{[...cols]');

swap('chip links',
  '.map((c) => `<a href="/collections/' + D + '{attr(c.handle)}">' + D + '{esc(c.title)}</a>`).join(\', \')}.</p>`',
  '.map((c) => `<a class="chip" href="/collections/' + D + '{attr(c.handle)}">' + D + '{esc(c.title)}</a>`).join(\' \')}.</p>`');

swap('email as its own control',
  '<p class="pdp__note">Or email <a href="mailto:' + D + '{attr(EMAIL)}">' + D + '{esc(EMAIL)}</a>. Opening hours: ' + D + '{esc(HOURS)}</p>',
  '<p class="pdp__note">Opening hours: ' + D + '{esc(HOURS)}</p>\n'
  + '            <a class="btn btn--sm btn--block" href="mailto:' + D + '{attr(EMAIL)}">Or email ' + D + '{esc(EMAIL)}</a>');

fs.writeFileSync(P, g);
console.log('applied ' + n + '/3');
