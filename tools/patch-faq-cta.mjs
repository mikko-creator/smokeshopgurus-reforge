// The FAQ page ended with "Still need a hand? Contact us or call (505)-288-9953."
// — two links inline in a sentence, 81x20 and 122x20 at phone width. As a pair of
// buttons they are real targets and a clearer close to the page.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
let g = fs.readFileSync(P, 'utf8');
const D = '$';

const from = '<p class="muted" style="margin-top:var(--gap-5)">Still need a hand? <a href="/pages/contact">Contact us</a> or call <a href="tel:'
  + D + '{attr(PHONE)}">' + D + '{esc(PHONE)}</a>.</p>';

if (!g.includes(from)) { console.error('FAQ sign-off not found'); process.exit(2); }

const to = '<div class="faq-cta">\n'
  + '        <p class="muted">Still need a hand?</p>\n'
  + '        <div class="faq-cta__actions">\n'
  + '          <a class="btn btn--primary btn--knurled" href="/pages/contact">Contact us</a>\n'
  + '          <a class="btn" href="tel:' + D + '{attr(PHONE)}">Or call ' + D + '{esc(PHONE)}</a>\n'
  + '        </div>\n'
  + '      </div>';

g = g.replace(from, to);
fs.writeFileSync(P, g);
console.log('FAQ sign-off rebuilt as buttons');
