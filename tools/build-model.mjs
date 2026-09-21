// build-model.mjs — turn audit/raw/*.html into one structured site model.
//
// The rebuild is generated from THIS file, never from the Shopify markup. That is
// the difference between reconstructing the result and vendoring the platform:
// nothing downstream ever sees a Shopify class, script or wrapper.
//
//   node tools/build-model.mjs   ->  src/data/site-model.json

import fs from 'node:fs';
import path from 'node:path';

const RAW = 'audit/raw';
const OUT = 'src/data/site-model.json';

const site = JSON.parse(fs.readFileSync('audit/site-inventory.json', 'utf8'));
const content = JSON.parse(fs.readFileSync('audit/content-inventory.json', 'utf8'));
const byUrl = new Map(content.pages.map((p) => [p.url, p]));

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
const txt = (s) => decode(strip(s));

const h1Of = (h) => txt((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');

// Shopify serves protocol-relative CDN urls and sizes them with ?width=. We keep
// the widest candidate we can see so the rebuild is never upscaling a thumbnail.
function absUrl(u) {
  if (!u) return '';
  u = decode(u).trim();
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return 'https://smokeshopgurus.com' + u;
  return u;
}

function sliceTag(html, from, tag) {
  const open = html.indexOf('>', from);
  if (open < 0) return '';
  let depth = 1;
  const re = new RegExp('<\\/?' + tag + '\\b', 'gi');
  re.lastIndex = open + 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(open + 1, m.index);
  }
  return '';
}

function productImages(html) {
  // Scope to the product's own media list. Taking every /cdn/shop/ image on the
  // page put the site LOGO first on all 82 products, because the header ships one.
  const li = html.search(/<ul[^>]*class="[^"]*product__media-list[^"]*"/i);
  const scope = li >= 0 ? sliceTag(html, li, 'ul') : html;
  const out = new Map();
  for (const m of scope.matchAll(/(?:src|data-src)="([^"]*\/cdn\/shop\/(?:files|products)\/[^"]+)"/gi)) {
    const raw = absUrl(m[1]);
    const base = raw.split('?')[0];
    // Only the SITE logo is excluded, by its exact name. A blanket /logo/i test
    // looked safe and silently dropped the real media of two products whose own
    // photographs are filenamed "WholesaleWarehouseLogoIdeas.jpg".
    if (/Smokeshop_Guru_Logo/i.test(base)) continue;
    const w = Number((raw.match(/[?&]width=(\d+)/) || [])[1] || 0);
    const prev = out.get(base);
    if (!prev || w > prev.w) out.set(base, { url: raw, w, base });
  }
  return [...out.values()].map((x) => x.url);
}

function readMeta(html) {
  const m = html.match(/var meta = (\{[\s\S]*?\});\s*for \(var attr/) || html.match(/var meta = (\{[\s\S]*?\});/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Take the balanced inner HTML of the div that starts at `from`. Regex cannot do
// this: the description nests, and a lazy match ends at the FIRST </div>, which is
// how the first attempt returned nothing at all.
function sliceDiv(html, from) {
  const open = html.indexOf('>', from);
  if (open < 0) return '';
  let depth = 1, i = open + 1;
  const re = /<\/?div\b/gi;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(open + 1, m.index);
    if (m.index > from + 200000) break;
  }
  return html.slice(open + 1, Math.min(html.length, from + 20000));
}

// The description is rendered by a Shopify app block whose class carries a
// per-shop hash, so it is located by marker rather than by exact class.
function productDescription(html) {
  const i = html.search(/<div[^>]*class="[^"]*ai-product-description-inner-[^"]*"/i);
  const inner = i >= 0 ? sliceDiv(html, i) : '';
  if (!inner) return { html: '', text: '', paragraphs: [], heading: '' };
  const heading = txt((inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '');
  const blocks = [];
  for (const m of inner.matchAll(/<(h[23]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = txt(m[2]);
    if (t.length > 2) blocks.push({ tag: m[1].toLowerCase(), text: t });
  }
  const paras = blocks.filter((b) => b.tag === 'p').map((b) => b.text);
  return { html: inner, text: paras.join('\n\n'), paragraphs: paras, heading, blocks };
}

const money = (cents) => '$' + (cents / 100).toFixed(2);

// The homepage is the one page whose structure is bespoke rather than templated,
// so every region is pulled by its own marker. Nothing here is written by hand:
// if a region is missing from the source it comes back empty and the rebuild
// renders nothing rather than inventing a replacement.
function extractHome(html, ci) {
  // Hero: the source's promise line is an H2 because the page carries no H1 at all.
  const hero = txt((html.match(/<h2[^>]*>\s*((?:(?!<\/h2>)[\s\S])*?Trusted Source[\s\S]*?)<\/h2>/i) || [])[1] || '');

  // Category tiles: heading + caption + collection href, in document order.
  const tiles = [];
  // Captures stop at the first '<' on purpose: a lazy [\s\S]*? ran clean across
  // three cards and returned one tile carrying the markup of the next two.
  for (const m of html.matchAll(/<h3 class="card__heading">\s*<a[^>]*?href="\/collections\/([a-z0-9-]+)"[^>]*>([^<]*)<\/a>\s*<\/h3>\s*<p class="card__caption">([^<]*)/gi)) {
    if (!tiles.some((t) => t.handle === m[1])) tiles.push({ handle: m[1], title: txt(m[2]), teaser: txt(m[3]) });
  }

  // Product rails, each keyed by the H2 that introduces it.
  function rail(headingRe) {
    const hm = html.search(headingRe);
    if (hm < 0) return [];
    const chunk = html.slice(hm, hm + 120000);
    const stop = chunk.search(/<h2[^>]*>(?![\s\S]{0,40}$)/i);
    const scope = chunk;
    const hs = [...new Set([...scope.matchAll(/href="\/products\/([a-z0-9-]+)"/gi)].map((m) => m[1]))];
    return hs;
  }
  const latestIdx = html.search(/>\s*Latest Products\s*</i);
  const bestIdx = html.search(/>\s*Best Seller\s*</i);
  const faqIdx = html.search(/>\s*Frequently Asked Questions\s*</i);
  const seg = (from, to) => (from < 0 ? '' : html.slice(from, to > from ? to : from + 150000));
  const handlesIn = (s) => [...new Set([...s.matchAll(/href="\/products\/([a-z0-9-]+)"/gi)].map((m) => m[1]))];
  const latest = handlesIn(seg(latestIdx, bestIdx));
  const best = handlesIn(seg(bestIdx, faqIdx));

  // FAQ: the collapsible rows under the FAQ heading. Question from the summary's
  // h3, answer from the region that follows it.
  const faqs = [];
  const faqScope = seg(faqIdx, faqIdx + 60000);
  // The answer div carries its class on the NEXT LINE after '<div', so the class
  // cannot be anchored to the tag name.
  for (const m of faqScope.matchAll(/<h3 class="accordion__title[^"]*">([\s\S]*?)<\/h3>[\s\S]*?<div[^>]*class="accordion__content rte"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const q = txt(m[1]); const a = txt(m[2]);
    if (q && a) faqs.push({ q, a });
  }

  // Trust badges: icon rows near the foot of the page.
  const badges = [];
  for (const m of html.matchAll(/<h3[^>]*class="ai-icon-box-title-[^"]*"[^>]*>([^<]*)<\/h3>\s*<p[^>]*class="ai-icon-box-description-[^"]*"[^>]*>([^<]*)<\/p>/gi)) {
    const t = txt(m[1]); const d = txt(m[2]);
    if (t && !badges.some((b) => b.title === t)) badges.push({ title: t, text: d });
  }

  return { hero, tiles, latest, best, faqs, badges, bodyChars: ci.bodyChars || 0 };
}

// The primary navigation, read off the source's own header rather than retyped.
// Retyping it is how a rebuild quietly loses a category nobody notices is gone.
//
// The source menu is TWO levels deep: "Explore More" holds sub-groups (Glass,
// Mushroom, Papers ...) which hold the collection links. A flat regex walked
// straight through that boundary and handed Explore More the Glass links, so
// the structure is walked with a balanced-tag reader instead.
function summaryLabel(block) {
  const m = block.match(/<summary[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
  return m ? txt(m[1]) : '';
}

function directLinks(block) {
  const out = [];
  for (const m of block.matchAll(/<a[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = txt(m[2]);
    const href = decode(m[1]);
    // NOT deduped by href. The source's Cones menu genuinely lists "Bulk Pre
    // Rolled Cones" twice; removing the repeat is an edit to the client's menu.
    if (t) out.push({ label: t, href });
  }
  return out;
}

function extractNav(html) {
  const start = html.indexOf('header__inline-menu');
  if (start < 0) return [];
  const listIdx = html.indexOf('<ul', start);
  const list = sliceTag(html, listIdx, 'ul');
  if (!list) return [];

  const out = [];
  // Walk top-level <li> children of the inline menu.
  const liRe = /<li\b/gi;
  let m;
  while ((m = liRe.exec(list))) {
    const item = sliceTag(list, m.index, 'li');
    if (!item) continue;
    liRe.lastIndex = m.index + 1 + item.length;

    const dIdx = item.search(/<details\b/i);
    if (dIdx < 0) {
      const a = directLinks(item)[0];
      if (a) out.push({ label: a.label, href: a.href, children: [], groups: [] });
      continue;
    }
    const details = sliceTag(item, dIdx, 'details');
    const label = summaryLabel('<summary' + details.split('<summary')[1]);
    const subIdx = details.search(/<ul[^>]*class="header__submenu/i);
    const sub = subIdx >= 0 ? sliceTag(details, subIdx, 'ul') : '';

    // A sub-group is a nested <details> inside the panel; anything else is a link.
    const groups = [];
    let rest = sub;
    const ndRe = /<details\b/gi;
    let n;
    while ((n = ndRe.exec(sub))) {
      const nd = sliceTag(sub, n.index, 'details');
      if (!nd) continue;
      ndRe.lastIndex = n.index + 1 + nd.length;
      const gLabel = summaryLabel('<summary' + nd.split('<summary')[1]);
      const gUlIdx = nd.search(/<ul\b/i);
      const gUl = gUlIdx >= 0 ? sliceTag(nd, gUlIdx, 'ul') : '';
      const links = directLinks(gUl);
      if (gLabel && links.length) groups.push({ label: gLabel, children: links });
      rest = rest.replace(nd, ' ');
    }
    const children = directLinks(rest).filter((c) => !groups.some((g) => g.children.some((x) => x.href === c.href)));
    if (label) out.push({ label, href: '', children, groups });
  }
  return out;
}

const products = [];
const paginated = [];
const collections = [];
const pages = [];
let blog = null;
let home = null;
let nav = [];
let logo = '';

for (const rec of site.pages || []) {
  if (rec.status !== 200) continue;
  const file = path.join(RAW, rec.savedAs || '');
  if (!rec.savedAs || !fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const url = rec.url;
  const u = new URL(url);
  const p = u.pathname;
  const ci = byUrl.get(url) || {};

  if (/^\/products\//.test(p)) {
    const meta = readMeta(html);
    const mp = meta && meta.product;
    const variants = (mp && mp.variants) || [];
    const prices = variants.map((v) => v.price).filter((n) => typeof n === 'number');
    const desc = productDescription(html);
    // Stock state, read off the "available" flags the theme prints for the
    // product's variants. A product counts as available when ANY variant is,
    // which is what "can I buy this" means; only all-false is out of stock.
    // Not inferred from anything else — an availability filter built on a guess
    // would be a fabricated claim about the client's stock.
    const avail = [...html.matchAll(/"available"\s*:\s*(true|false)/g)].map((x) => x[1]);
    const available = avail.length ? avail.includes('true') : null;

    products.push({
      type: 'product',
      url, handle: p.replace('/products/', ''),
      title: h1Of(html) || txt(rec.title || ''),
      vendor: (mp && mp.vendor) || '',
      priceCents: prices.length ? Math.min(...prices) : null,
      priceMaxCents: prices.length ? Math.max(...prices) : null,
      price: prices.length ? money(Math.min(...prices)) : '',
      variants: variants.map((v) => ({ title: v.public_title || v.name, sku: v.sku || '', price: money(v.price) })),
      description: desc.text,
      paragraphs: desc.paragraphs,
      descHeading: desc.heading,
      descBlocks: desc.blocks || [],
      available,
      images: productImages(html),
      bodyChars: ci.bodyChars || 0,
    });
  } else if (/^\/collections\//.test(p)) {
    // Paginated pages are not duplicates: page 2 carries products page 1 never
    // listed. Dropping them silently truncates the collection, so they are folded
    // into the base collection below rather than skipped.
    const handles = [...new Set([...html.matchAll(/href="\/products\/([a-z0-9-]+)"/gi)].map((m) => m[1]))];
    if (/[?&]page=/.test(url)) {
      paginated.push({ handle: p.replace('/collections/', ''), handles });
      continue;
    }
    // Same app-block pattern as the product description: a per-shop hashed class.
    const di = html.search(/<div[^>]*class="[^"]*ai-collection-banner__description-[^"]*"/i);
    const dInner = di >= 0 ? sliceDiv(html, di) : '';
    const dHeading = txt((dInner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '');
    const dParas = [...dInner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((x) => txt(x[1])).filter((t) => t.length > 2);
    collections.push({
      type: 'collection',
      url, handle: p.replace('/collections/', ''),
      title: h1Of(html),
      descHeading: dHeading,
      description: dParas.join('\n\n'),
      paragraphs: dParas,
      productHandles: handles,
    });
  } else if (/^\/pages\//.test(p)) {
    // The .rte block NESTS: policy pages put their real copy inside a further
    // wrapper, with h3 headings and <ul> lists. A lazy match to the first
    // </div> returned the opening paragraph and dropped every clause after it,
    // which on a returns policy is losing the part that matters.
    const ri = html.search(/<div[^>]*class="[^"]*\brte\b[^"]*"/i);
    const rte = ri >= 0 ? sliceDiv(html, ri) : '';
    const blocks = [];
    for (const m of rte.matchAll(/<(h2|h3|h4|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const t = txt(m[2]);
      if (t.length > 2) blocks.push({ tag: m[1].toLowerCase(), text: t });
    }
    pages.push({
      type: 'page', url, handle: p.replace('/pages/', ''),
      title: h1Of(html),
      paragraphs: blocks.filter((b) => b.tag === 'p').map((b) => b.text),
      blocks,
      headings: (ci.headings || []).filter((h) => h.level >= 2).map((h) => h.text),
    });
  } else if (p === '/') {
    home = extractHome(html, ci);
    nav = extractNav(html);
    logo = absUrl((html.match(/(?:src|data-src)="([^"]*Smokeshop_Guru_Logo[^"]*)"/i) || [])[1] || '');
  } else if (/^\/blogs\//.test(p)) {
    blog = { type: 'blog', url, title: h1Of(html) };
  }
}

// Fold every ?page=N listing back into its base collection.
let folded = 0;
for (const pg of paginated) {
  const base = collections.find((c) => c.handle === pg.handle);
  if (!base) continue;
  const before = base.productHandles.length;
  base.productHandles = [...new Set([...base.productHandles, ...pg.handles])];
  folded += base.productHandles.length - before;
}

// Collections a product actually belongs to — derived, not guessed.
const memberOf = new Map();
for (const c of collections) for (const h of c.productHandles) {
  if (!memberOf.has(h)) memberOf.set(h, []);
  memberOf.get(h).push(c.handle);
}
for (const pr of products) pr.collections = memberOf.get(pr.handle) || [];

const model = {
  schema: 'smokeshopgurus/site-model@1',
  generated: new Date().toISOString(),
  source: 'https://smokeshopgurus.com/',
  counts: { products: products.length, collections: collections.length, pages: pages.length, blog: blog ? 1 : 0 },
  nav, logo, home, products, collections, pages, blog,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(model, null, 1));

console.log('site model written -> ' + OUT);
console.log('  products    ' + products.length + '  (' + products.filter((x) => x.price).length + ' priced, ' + products.filter((x) => x.description).length + ' with description, ' + products.filter((x) => x.images.length).length + ' with images)');
console.log('  paginated   ' + paginated.length + ' page listings folded in, ' + folded + ' extra product(s) recovered');
console.log('  collections ' + collections.length + '  (' + collections.filter((x) => x.productHandles.length).length + ' non-empty)');
if (home) console.log('  home        hero=' + (home.hero ? 'yes' : 'NO') + ', tiles=' + home.tiles.length + ', latest=' + home.latest.length + ', best=' + home.best.length + ', faqs=' + home.faqs.length + ', badges=' + home.badges.length);
console.log('  stock       ' + products.filter((x) => x.available === true).length + ' in stock, ' + products.filter((x) => x.available === false).length + ' out, ' + products.filter((x) => x.available === null).length + ' unknown');
console.log('  colDesc     ' + collections.filter((c) => c.description).length + ' collection(s) with description');
console.log('  pages       ' + pages.length + '  (' + pages.filter((x) => x.paragraphs.length).length + ' with prose, ' + pages.reduce((a, x) => a + (x.blocks || []).length, 0) + ' content blocks)');
const noImg = products.filter((x) => !x.images.length).map((x) => x.handle);
if (noImg.length) console.log('  NO IMAGES:  ' + noImg.slice(0, 8).join(', ') + (noImg.length > 8 ? ' …+' + (noImg.length - 8) : ''));
const noDesc = products.filter((x) => !x.description).map((x) => x.handle);
if (noDesc.length) console.log('  NO DESC:    ' + noDesc.slice(0, 8).join(', ') + (noDesc.length > 8 ? ' …+' + (noDesc.length - 8) : ''));
