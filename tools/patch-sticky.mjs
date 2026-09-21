// Add a sticky add-to-cart bar to the product page.
//
// This is a real pattern, not padding: on a long product page the price and the
// buy action scroll away, and the source itself renders its product form more
// than once for the same reason. It carries the title, price, a quantity field
// and the add button, all from data already on the page.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
let s = fs.readFileSync(P, 'utf8');

const anchor = '    <dialog class="lightbox" data-lightbox>';
if (!s.includes(anchor)) { console.error('lightbox anchor not found'); process.exit(2); }

const bar = [
  '    <div class="stickybuy" data-sticky hidden>',
  '      <div class="shell stickybuy__inner">',
  '        <p class="stickybuy__title">${esc(p.title)}</p>',
  '        <p class="stickybuy__price"><span class="visually-hidden">Regular price</span>${esc(p.price)} USD</p>',
  '        <div class="field stickybuy__qty">',
  '          <label for="sticky-qty-${attr(p.handle)}">Quantity</label>',
  '          <input id="sticky-qty-${attr(p.handle)}" type="number" min="1" step="1" value="1">',
  '        </div>',
  '        ${p.available === false',
  '          ? `<p class="pcard__stock pcard__stock--out">Sold out</p>`',
  '          : `<button class="btn btn--primary btn--knurled" type="button" data-add="${attr(p.handle)}" data-title="${attr(p.title)}" data-price="${attr(p.price)}">Add to cart</button>`}',
  '      </div>',
  '    </div>',
  '',
].join('\n');

s = s.replace(anchor, bar + anchor);
fs.writeFileSync(P, s);
console.log('sticky buy bar added before the lightbox');
