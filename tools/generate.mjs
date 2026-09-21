// generate.mjs — render the whole rebuild from src/data/site-model.json.
//
// Every string that reaches a page comes from the model (harvested from the live
// site) or from facts/client-facts.json. There is no copy written in this file
// except structural labels and the one documented note about ordering, which is
// a statement about the rebuild rather than a claim about the client.
//
//   node tools/generate.mjs [--out dist]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg('out', 'dist'));
const ORIGIN = 'https://smokeshopgurus.com';

const model = JSON.parse(fs.readFileSync('src/data/site-model.json', 'utf8'));
const facts = JSON.parse(fs.readFileSync('facts/client-facts.json', 'utf8'));
const prov = JSON.parse(fs.readFileSync('src/assets/generated/provenance.json', 'utf8'));

const BRAND = facts.brand;                 // "Smoke Shop Guru"
const BRAND_LONG = facts.legalName;        // "Smoke Shop Gurus"
const PHONE = facts.phone[0];
const EMAIL = facts.email[0];
const ADDR = facts.addresses[0];
const HOURS = facts.hours;
const AGE_NOTICE = facts.compliance.ageNotice;
const DISCLAIMER = facts.compliance.disclaimer;

const LOGO = model.logo || '';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const attr = esc;

// ---------------------------------------------------------------- images
// sr-assets names a download sha256(url)[0..8] + '-' + basename. Recomputing it
// here means the rebuild can point at local files without waiting on the asset
// stage to publish its inventory, and anything still missing is REPORTED rather
// than silently left pointing at the old CDN.
const SRC_DIR = 'assets/source';
const IMG_OUT = path.join(OUT, 'assets', 'img');
const localNameFor = (url) => {
  try {
    const u = new URL(url);
    const base = path.posix.basename(u.pathname) || 'asset';
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8) + '-' + base.replace(/[^A-Za-z0-9._-]+/g, '-');
  } catch { return ''; }
};
// Shopify serves the same picture under many ?width= variants, and each variant
// hashes to a different filename. Matching on the exact URL therefore missed 76
// images that WERE on disk under a sibling variant. So the download directory is
// indexed by the basename that follows the hash, and the LARGEST file for a given
// basename wins — picking any variant risks shipping a thumbnail into a hero.
const byBasename = new Map();
if (fs.existsSync(SRC_DIR)) {
  for (const f of fs.readdirSync(SRC_DIR)) {
    const m = /^[0-9a-f]{8}-(.+)$/.exec(f);
    if (!m) continue;
    const size = fs.statSync(path.join(SRC_DIR, f)).size;
    const prev = byBasename.get(m[1]);
    if (!prev || size > prev.size) byBasename.set(m[1], { file: f, size });
  }
}

const imgMisses = [];
const imgCopied = new Set();
function publish(file) {
  if (!imgCopied.has(file)) {
    fs.mkdirSync(IMG_OUT, { recursive: true });
    fs.copyFileSync(path.join(SRC_DIR, file), path.join(IMG_OUT, file));
    imgCopied.add(file);
  }
  return '/assets/img/' + file;
}
function localImage(url, context) {
  if (!url) return '';
  const exact = localNameFor(url);
  if (exact && fs.existsSync(path.join(SRC_DIR, exact))) return publish(exact);
  let base = '';
  try { base = path.posix.basename(new URL(url).pathname).replace(/[^A-Za-z0-9._-]+/g, '-'); } catch { base = ''; }
  const hit = base && byBasename.get(base);
  if (hit) return publish(hit.file);
  imgMisses.push({ url, context });
  return url;
}

// Generated decorative imagery, keyed by id. Rejected ones are unavailable by
// construction so a rejected picture cannot reach a page by accident.
const genById = new Map(prov.images.filter((i) => i.inspectionVerdict === 'pass').map((i) => [i.id, i]));
function gen(id) {
  const g = genById.get(id);
  if (!g) return null;
  return { src: '/assets/generated/' + g.file, alt: g.alt };
}

// A category tile's picture: the collection's own banner if the source has one,
// otherwise the generated still for that category. Never a product photo.
const TILE_ART = {
  'pre-rolled-cones': 'cat-pre-rolled-cones', 'bulk-pre-rolled-cones': 'cat-pre-rolled-cones',
  'king-size-cones': 'cat-pre-rolled-cones', 'slow-burn-cones': 'cat-pre-rolled-cones',
  'cone-rolling-supplies': 'cat-pre-rolled-cones',
  'rolling-papers': 'cat-rolling-papers', 'hemp-rolling-papers': 'cat-rolling-papers',
  'king-size-rolling-papers': 'cat-rolling-papers',
  'blunt-wraps': 'cat-blunt-wraps', 'blunt-wraps-1': 'cat-blunt-wraps',
  'blunt-cone-wraps': 'cat-blunt-wraps', 'natural-leaf-blunts': 'cat-blunt-wraps',
  'pre-roll-blunts': 'cat-blunt-wraps',
  'glass-bongs': 'cat-glass-bongs', 'glass-bongs-pipes': 'cat-glass-bongs',
  'disposable-vape-devices': 'cat-disposable-vapes', 'disposable-vape-pens': 'cat-disposable-vapes',
  'nicotine-disposable-vape': 'cat-disposable-vapes', 'hemp-vape-pen': 'cat-disposable-vapes',
  'wax-pens': 'cat-wax-pens',
  'buds-grinders': 'cat-grinders',
  'bulk-lighters': 'cat-lighters', 'torch-lighters': 'cat-lighters', 'bud-lighters': 'cat-lighters',
  'mushroom-products': 'cat-mushroom-wellness', 'functional-mushroom-products': 'cat-mushroom-wellness',
  'functional-mushroom-products-copy': 'cat-mushroom-wellness',
  'cbd-edibles': 'cat-edibles', 'cbd-edibles-1': 'cat-edibles',
  'tinctures': 'cat-tinctures', 'topicals': 'cat-topicals', 'kratom': 'cat-kratom',
  'cbd-pet-treats': 'cat-pet-treats', 'cbd-dog-calming-treats': 'cat-pet-treats',
  'skunk-bags': 'cat-stash-bags', 'smell-proof-stash-bags': 'cat-stash-bags',
  'odor-proof-bags': 'cat-stash-bags',
  'herb-storage-containers': 'cat-herb-containers',
  'accessories': 'cat-accessories', 'smoking-accessories': 'cat-accessories',
  'tobacco-smoking-accessories': 'cat-accessories', 'glass-smoking-pipes': 'cat-accessories',
  'glass-bangers': 'cat-accessories', 'upsell': 'cat-accessories', 'best-seller': 'cat-accessories',
  'all': 'cat-accessories',
};

const byHandle = new Map(model.products.map((p) => [p.handle, p]));
const colByHandle = new Map(model.collections.map((c) => [c.handle, c]));

function collectionArt(c) {
  const g = gen(TILE_ART[c.handle] || 'cat-accessories');
  return g || gen('tex-brushed-gunmetal');
}

// ------------------------------------------------------------------ chrome
const ICON = {
  ship: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
  caret: '<svg class="nav__caret" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M9.354.646a.5.5 0 0 0-.708 0L5 4.293 1.354.646a.5.5 0 0 0-.708.708l4 4a.5.5 0 0 0 .708 0l4-4a.5.5 0 0 0 0-.708" clip-rule="evenodd"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="20" height="20" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
};
const badgeIcon = (title) => /SHIP/i.test(title) ? ICON.ship : (/BACK|MONEY/i.test(title) ? ICON.back : ICON.support);

function navHtml() {
  return model.nav.map((g) => {
    if (g.href && !g.children.length && !(g.groups || []).length) {
      return `<li class="nav__item"><a class="nav__link" href="${attr(g.href)}">${esc(g.label)}</a></li>`;
    }
    const cols = (g.groups || []).map((sg) => `
            <div class="nav__col">
              <p class="nav__colhead">${esc(sg.label)}</p>
              ${sg.children.map((c) => `<a href="${attr(c.href)}">${esc(c.label)}</a>`).join('\n              ')}
            </div>`).join('');
    const flat = g.children.map((c) => `<a href="${attr(c.href)}">${esc(c.label)}</a>`).join('\n            ');
    const wide = (g.groups || []).length > 2 ? ' nav__panel--wide' : '';
    return `<li class="nav__item">
          <button class="nav__link" type="button" aria-expanded="false">${esc(g.label)}${ICON.caret}</button>
          <div class="nav__panel${wide}">${cols}${flat ? `\n            ${flat}` : ''}
          </div>
        </li>`;
  }).join('\n        ');
}

function drawerHtml() {
  return model.nav.map((g) => {
    if (g.href && !g.children.length && !(g.groups || []).length) {
      return `<details><summary>${esc(g.label)}</summary><a href="${attr(g.href)}">${esc(g.label)}</a></details>`;
    }
    const links = [
      ...g.children.map((c) => `<a href="${attr(c.href)}">${esc(c.label)}</a>`),
      // Sub-group headings are kept in the drawer too. Flattening them away lost
      // the only label telling a phone visitor which family they are looking at.
      ...(g.groups || []).flatMap((sg) => [
        `<p class="drawer__colhead">${esc(sg.label)}</p>`,
        ...sg.children.map((c) => `<a href="${attr(c.href)}">${esc(c.label)}</a>`),
      ]),
    ].join('');
    return `<details><summary>${esc(g.label)}</summary>${links}</details>`;
  }).join('\n          ');
}

const FOOTER_SHOP = [
  { label: 'Vape & Disposables', href: '/collections/disposable-vape-devices' },
  { label: 'Edibles', href: '/collections/cbd-edibles' },
  { label: 'PET CBD', href: '/collections/cbd-pet-treats' },
  { label: 'Cones & Wraps', href: '/collections/pre-rolled-cones' },
  { label: 'Skunk Bags', href: '/collections/skunk-bags' },
  { label: 'Accessories', href: '/collections/accessories' },
];
const FOOTER_LINKS = [
  { label: 'About us', href: '/pages/about' },
  { label: 'Contact us', href: '/pages/contact' },
  { label: 'FAQS', href: '/pages/faqs' },
  { label: 'Privacy Policy', href: '/pages/privacy-policy' },
  { label: 'Return Policy', href: '/pages/return-policy' },
  { label: 'Shipping & Return Policy', href: '/pages/shipping-return-policy' },
  { label: 'Terms & Conditions', href: '/pages/term-and-services' },
];

function brandMark() {
  const l = LOGO ? localImage(LOGO, 'logo') : '';
  return l
    // 261x66 are the file's real dimensions, read from the WebP header. The
    // markup previously declared 120x30 — a 4.000 ratio against the file's
    // 3.955, which is a declared size disagreeing with the bytes.
    ? `<img class="brand__logo" src="${attr(l)}" alt="${attr(BRAND)}" width="261" height="66" decoding="async">`
    : `<span class="brand__mark" aria-hidden="true">SG</span>`;
}

// The source ships a /search form on every page. The rebuild keeps the same
// action and field name, and backs it with a real client-side index, so the
// behaviour survives the move off the platform instead of being dropped.
function searchForm(id) {
  return `<form class="search" action="/search" method="get" role="search">
          <label class="visually-hidden" for="${attr(id)}">Search</label>
          <input id="${attr(id)}" type="search" name="q" placeholder="Search" autocomplete="off">
          <button class="btn btn--sm" type="submit">Search</button>
        </form>`;
}

// The basket notification the source renders as a Shopify runtime section. Here
// it is driven by the quote basket in src/scripts/site.js — no payment runtime,
// but the same affordance and the same words.
function cartNotification() {
  return `<section class="cartnote" id="cartnote" aria-live="polite" hidden>
    <div class="cartnote__panel plate">
      <h2 class="cartnote__title">Item added to your cart</h2>
      <p class="cartnote__item" id="cartnote-item"></p>
      <div class="cartnote__actions">
        <a class="btn btn--primary btn--sm" href="/cart/">View cart</a>
        <button class="btn btn--sm" type="button" data-cartnote-close>Continue shopping</button>
      </div>
    </div>
  </section>`;
}

function header() {
  return `<a class="skip-link" href="#main">Skip to content</a>
  <!-- The strip sits OUTSIDE the sticky header on purpose. position: sticky
       only sticks within the parent's box, so while this lived inside
       <header> the whole 170px band had to be pinned to keep the nav pinned —
       20.1% of a 390x844 phone screen, permanently. Outside it, the bar alone
       stays pinned at 72px and the notice simply scrolls away with the page.
       Nothing is removed: the notice and the tap-to-call link are still here,
       and the full disclaimer is still in its own band further down. -->
  <div class="masthead__strip">
    <div class="shell">
      <span>${esc(AGE_NOTICE.replace(/⚠️/g, '').trim().slice(0, 74))}…</span>
      <a href="tel:${attr(PHONE)}">${ICON.phone} Order Online &middot; Call Us ${esc(PHONE)}</a>
    </div>
  </div>
  <header class="masthead">
    <div class="shell">
      <div class="masthead__bar">
        <!-- The mark alone. The wordmark is already drawn INSIDE the logo, so
             setting it again as text said the same thing twice. The accessible
             name survives on the img's alt, which is the brand name verbatim —
             screen readers still announce "Smoke Shop Guru, link". The footer
             keeps the full lockup, where the name is the only thing naming the
             block. -->
        <a class="brand brand--markonly" href="/">
          ${brandMark()}
        </a>
        <nav aria-label="Primary">
          <ul class="nav">
            ${navHtml()}
          </ul>
        </nav>
        ${searchForm('site-search')}
        <a class="btn btn--sm" href="/cart/" data-cart-link>Cart <span data-cart-count>0</span></a>
        <a class="btn btn--primary btn--sm btn--knurled" href="/pages/contact">Contact Us</a>
        <label class="btn btn--sm nav-toggle" for="nav-open" aria-label="Open menu">${ICON.menu}</label>
      </div>
      <input type="checkbox" id="nav-open" aria-hidden="true" tabindex="-1">
      <div class="drawer">
        <nav aria-label="Mobile">
          ${drawerHtml()}
        </nav>
      </div>
    </div>
  </header>`;
}

function footer() {
  return `<footer class="footer">
    <div class="shell footer__grid">
      <div>
        <!-- Same treatment as the masthead, and for a second reason beyond
             matching it: with the wordmark drawn inside the logo AND repeated
             as text, this link's accessible name computed to "Smoke Shop Guru
             Smoke Shop Guru ALBUQUERQUE, NM" — the alt read out, then the text
             read out again. Mark-only leaves one clean name. The tagline
             paragraph below still identifies the block. -->
        <a class="brand brand--markonly" href="/">
          ${brandMark()}
        </a>
        <p class="muted" style="margin-top:var(--gap-4);font-size:var(--fs-6)">${esc(model.home.hero)}</p>
      </div>
      <div>
        <h2>Shop By Category</h2>
        <ul>${FOOTER_SHOP.map((l) => `<li><a href="${attr(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h2>Quick links</h2>
        <ul>${FOOTER_LINKS.map((l) => `<li><a href="${attr(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h2>Contact Information</h2>
        <address>
          Address: ${esc(ADDR.street)}, ${esc(ADDR.locality)}, ${esc(ADDR.region)} ${esc(ADDR.postalCode)}.<br>
          Email: <a href="mailto:${attr(EMAIL)}">${esc(EMAIL)}</a><br>
          Phone: <a href="tel:${attr(PHONE)}">${esc(PHONE)}</a><br>
          Opening Hours: ${esc(HOURS)}
        </address>
      </div>
    </div>
    <div class="disclaimer"><div class="shell"><p><strong>Disclaimer:</strong> ${esc(DISCLAIMER)}</p></div></div>
    <div class="agewarn"><div class="shell">${esc(AGE_NOTICE)}</div></div>
    <div class="shell footer__meta">
      <span>${esc(facts.copyright)}</span>
      <span>${esc(BRAND_LONG)} &middot; ${esc(ADDR.locality)}, ${esc(ADDR.region)}</span>
    </div>
  </footer>`;
}

function ageGate() {
  return `<div class="agegate" id="agegate" role="dialog" aria-modal="true" aria-labelledby="agegate-h">
    <div class="agegate__panel plate--riveted">
      <h2 id="agegate-h">Are you 21 or older?</h2>
      <p class="muted">${esc(AGE_NOTICE)}</p>
      <div class="agegate__actions">
        <button class="btn btn--primary btn--knurled" type="button" data-age="yes">Yes, I am 21+</button>
        <button class="btn" type="button" data-age="no">No</button>
      </div>
    </div>
  </div>`;
}

// -------------------------------------------------------------- page shell
function layout({ title, description, canonical, body, jsonld = [], bodyClass = '' }) {
  const ld = jsonld.filter(Boolean).map((o) =>
    `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(description)}">
  <link rel="canonical" href="${attr(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${attr(BRAND)}">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:url" content="${attr(canonical)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(description)}">
  <meta name="theme-color" content="#0f1317">
  <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/firasans-600-normal-latin.woff2" crossorigin>
  <link rel="stylesheet" href="/styles/tokens.css">
  <link rel="stylesheet" href="/styles/fonts.css">
  <link rel="stylesheet" href="/styles/site.css">
  <link rel="stylesheet" href="/styles/motion.css">
  ${ld}
</head>
<body${bodyClass ? ` class="${attr(bodyClass)}"` : ''}>
  <!-- Decorative vapour field: fixed, behind everything, no text, no controls.
       aria-hidden because a screen reader has nothing to say about drifting
       smoke, and pointer-events:none in CSS so it can never eat a click. It is
       real markup rather than script-injected so the atmosphere survives with
       JavaScript off. -->
  <div class="vapor" aria-hidden="true">
    <span class="vapor__plume vapor__plume--1"></span>
    <span class="vapor__plume vapor__plume--2"></span>
    <span class="vapor__plume vapor__plume--3"></span>
    <span class="vapor__plume vapor__plume--4"></span>
    <span class="vapor__plume vapor__plume--5"></span>
  </div>
  ${ageGate()}
  ${cartNotification()}
  ${header()}
  <main id="main">
${body}
  </main>
  ${footer()}
  <script src="/scripts/site.js" defer></script>
  <script src="/scripts/shop.js" defer></script>
  <script src="/scripts/reveal.js" defer></script>
  <script src="/scripts/accordion.js" defer></script>
  ${body.includes('marquee__track') ? '<script src="/scripts/marquee.js" defer></script>' : ''}
</body>
</html>
`;
}

function crumbs(trail) {
  return `<nav class="crumbs shell" aria-label="Breadcrumb"><ol>
      ${trail.map((t, i) => `<li>${i < trail.length - 1 && t.href ? `<a href="${attr(t.href)}">${esc(t.label)}</a>` : `<span aria-current="page">${esc(t.label)}</span>`}</li>`).join('\n      ')}
    </ol></nav>`;
}

const breadcrumbLd = (trail) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({
    '@type': 'ListItem', position: i + 1, name: t.label,
    ...(t.href ? { item: ORIGIN + t.href } : {}),
  })),
});

const orgLd = {
  '@context': 'https://schema.org', '@type': 'Store',
  name: BRAND_LONG, alternateName: BRAND, url: ORIGIN + '/',
  telephone: PHONE, email: EMAIL,
  address: {
    '@type': 'PostalAddress', streetAddress: ADDR.street, addressLocality: ADDR.locality,
    addressRegion: ADDR.region, postalCode: ADDR.postalCode, addressCountry: ADDR.country,
  },
  openingHoursSpecification: facts.hoursStructured.map((h) => ({
    '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes,
  })),
};

// A description derived from the page's own copy. Never written here.
function metaFrom(text, fallback) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  if (t.length <= 158) return t;
  const cut = t.slice(0, 158);
  const sp = cut.lastIndexOf(' ');
  return (sp > 90 ? cut.slice(0, sp) : cut).trim() + '…';
}

function productCard(p, idx) {
  const img = p.images[0] ? localImage(p.images[0], 'product:' + p.handle) : '';
  const alt = p.title;
  const i = Math.min(Number(idx) || 0, 8);
  return `<article class="pcard" data-reveal style="--i:${i}" data-price-cents="${attr(String(p.priceCents == null ? 0 : p.priceCents))}" data-available="${p.available === false ? 'false' : 'true'}" data-title="${attr(p.title.toLowerCase())}">
          <a class="pcard__medialink" href="/products/${attr(p.handle)}" tabindex="-1">
            <span class="visually-hidden">${esc(p.title)}</span>
            <span class="pcard__media">${img ? `<img src="${attr(img)}" alt="${attr(alt)}" width="600" height="600" loading="lazy" decoding="async">` : ''}</span>
          </a>
          <div class="pcard__body">
            ${p.vendor ? `<span class="pcard__vendor">${esc(p.vendor)}</span>` : ''}
            <h3 class="pcard__title"><a href="/products/${attr(p.handle)}">${esc(p.title)}</a></h3>
            <p class="pcard__price">
              <span class="visually-hidden">Regular price</span>${esc(p.price)} USD${p.priceMaxCents > p.priceCents ? ` <small>from</small>` : ''}
              <span class="visually-hidden">Regular price</span>
              <span class="visually-hidden">Sale price ${esc(p.price)} USD</span>
            </p>
            ${p.available === false
              ? `<p class="pcard__stock pcard__stock--out">Sold out</p>`
              : `<button class="btn btn--sm btn--block pcard__add" type="button" data-add="${attr(p.handle)}" data-title="${attr(p.title)}" data-price="${attr(p.price)}">Add to cart</button>`}
          </div>
        </article>`;
}

// The marquee shows products with no panel behind them, so it uses the cut-out
// of a photograph rather than the photograph. tools/cutout.mjs makes those by
// flood-filling the studio background from the frame edge; it REFUSES any image
// whose border is not flat, so a product that could not be cut safely keeps its
// original and simply arrives with its white square. Nothing is faked.
const CUTOUT_DIR = 'src/assets/cutouts';
const cutoutOut = path.join(OUT, 'assets', 'cutouts');
const cutoutsUsed = [];
function cutoutFor(localSrc) {
  if (!localSrc) return '';
  const base = path.posix.basename(localSrc).replace(/\.[a-z0-9]+$/i, '');
  const file = base + '.png';
  const from = path.join(CUTOUT_DIR, file);
  if (!fs.existsSync(from)) return '';
  fs.mkdirSync(cutoutOut, { recursive: true });
  fs.copyFileSync(from, path.join(cutoutOut, file));
  if (!cutoutsUsed.includes(file)) cutoutsUsed.push(file);
  return '/assets/cutouts/' + file;
}

// A best-seller for the marquee: the product, not a card. No article wrapper,
// no glass shell, no button — those are the "box" this section is meant to lose.
// `dup` marks the second copy of the track, which exists only so the loop can
// be seamless; it is hidden from assistive technology and taken out of the tab
// order so the same seven products are not announced or tabbed through twice.
function marqueeCard(p, dup) {
  const raw = p.images[0] ? localImage(p.images[0], 'product:' + p.handle) : '';
  const img = cutoutFor(raw) || raw;
  return `<a class="mcard" href="/products/${attr(p.handle)}"${dup ? ' aria-hidden="true" tabindex="-1"' : ''}>
            <span class="mcard__media">${img ? `<img src="${attr(img)}" alt="${dup ? '' : attr(p.title)}" width="600" height="600" loading="lazy" decoding="async">` : ''}</span>
            <span class="mcard__title">${esc(p.title)}</span>
            <span class="mcard__price"><span class="visually-hidden">Regular price</span>${esc(p.price)} USD<span class="visually-hidden">Sale price ${esc(p.price)} USD</span></span>
          </a>`;
}

// The track holds the list TWICE and travels exactly -50%, so the moment it
// finishes it is showing the second copy's start — which is pixel-identical to
// the first copy's start, and the loop has no seam. Any other distance shows a
// jump. A CSS-only marquee also keeps working with no JavaScript at all.
function marquee(list) {
  const once = (dup) => list.map((p) => marqueeCard(p, dup)).join('\n          ');
  return `<div class="marquee">
          <div class="marquee__track">
            ${once(false)}
            ${once(true)}
          </div>
        </div>`;
}

function productGrid(list) {
  return `<div class="grid grid--4">
        ${list.map((p, i) => productCard(p, i)).join('\n        ')}
      </div>`;
}

// ------------------------------------------------------------------- pages
function renderHome() {
  const h = model.home;
  const hero = gen('hero-vape-vapor');
  const tiles = h.tiles.map((t, i) => {
    const col = colByHandle.get(t.handle);
    const art = col ? collectionArt(col) : gen('cat-accessories');
    // Prefer the collection's own full opening line over the source's truncated
    // "…" teaser; both are the client's words, one is simply not cut off.
    // The source tile shows "<headline> <first words of paragraph 1>…" truncated.
    // Using the headline plus the opening sentence keeps every word the source
    // showed, without shipping its "…" cut mid-phrase.
    const headline = (col && col.descHeading) ? col.descHeading : '';
    const para = (col && col.paragraphs && col.paragraphs[0]) ? col.paragraphs[0] : t.teaser;
    const copy = headline ? headline + ' ' + para : para;
    return `<article class="tile" data-reveal style="--i:${Math.min(i, 8)}">
          <div class="tile__media">${art ? `<img src="${attr(art.src)}" alt="${attr(art.alt)}" width="800" height="600" loading="lazy" decoding="async">` : ''}</div>
          <div class="tile__body">
            <h3 class="tile__title"><a class="tile__link" href="/collections/${attr(t.handle)}">${esc(t.title)}</a></h3>
            <p class="tile__text">${esc(metaFrom(copy, ''))}</p>
            <span class="tile__more">Shop ${esc(t.title)} →</span>
          </div>
        </article>`;
  }).join('\n        ');

  const latest = h.latest.map((x) => byHandle.get(x)).filter(Boolean);
  const best = h.best.map((x) => byHandle.get(x)).filter(Boolean);

  const faqLd = h.faqs.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: h.faqs.map((f) => ({
      '@type': 'Question', name: f.q.replace(/^Q\d+\.\s*/, ''),
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;

  const body = `    <section class="hero-wrap">
      <div class="hero">
        ${hero ? `<img class="hero__bg" src="${attr(hero.src)}" alt="" aria-hidden="true" width="1600" height="900" fetchpriority="high" decoding="async">` : ''}
        <span class="hero__vapor" aria-hidden="true">
          <span class="vapor__plume vapor__plume--h1"></span>
          <span class="vapor__plume vapor__plume--h2"></span>
          <span class="vapor__plume vapor__plume--h3"></span>
        </span>
        <div class="hero__inner shell">
          <span class="hero__eyebrow">Albuquerque, New Mexico</span>
          <h1>${esc(h.hero)}</h1>
          <p class="hero__lede">${esc(metaFrom(model.pages.find((p) => p.handle === 'about')?.paragraphs?.[0] || '', ''))}</p>
          <div class="hero__actions">
            <a class="btn btn--primary btn--knurled" href="/collections/all">Shop all</a>
            <a class="btn" href="tel:${attr(PHONE)}">${ICON.phone} ${esc(PHONE)}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="sec sec--flush">
      <div class="shell sec__head" data-reveal>
        <div><span class="sec__kicker">Moving fastest</span><h2 class="sec__title">Best Seller</h2></div>
      </div>
      ${marquee(best)}
    </section>

    <section class="shell sec">
      <div class="sec__head" data-reveal>
        <div><span class="sec__kicker">Browse the racks</span><h2 class="sec__title">Shop By Category</h2></div>
        <a class="btn btn--ghost btn--sm" href="/collections/all">All products</a>
      </div>
      <div class="grid grid--4">
        ${tiles}
      </div>
    </section>

    <section class="shell sec">
      <div class="sec__head" data-reveal>
        <div><span class="sec__kicker">Fresh in</span><h2 class="sec__title">Latest Products</h2></div>
      </div>
      ${productGrid(latest)}
    </section>

    <section class="shell sec">
      <div class="badges">
        ${h.badges.map((b, i) => `<div class="badge" data-reveal style="--i:${i}">
          <span class="badge__icon">${badgeIcon(b.title)}</span>
          <div><p class="badge__title">${esc(b.title)}</p><p class="badge__text">${esc(b.text)}</p></div>
        </div>`).join('\n        ')}
      </div>
    </section>

    <section class="shell sec" id="faq">
      <div class="sec__head" data-reveal>
        <div><span class="sec__kicker">Before you ask</span><h2 class="sec__title">Frequently Asked Questions</h2></div>
      </div>
      <div class="acc" data-reveal>
        ${h.faqs.map((f, i) => `<details${i === 0 ? ' open' : ''}>
          <summary>${esc(f.q)}</summary>
          <div class="acc__body">${esc(f.a)}</div>
        </details>`).join('\n        ')}
      </div>
    </section>`;

  return layout({
    title: `${BRAND} | Smoke, Vape & CBD Supply in Albuquerque, NM`,
    description: metaFrom(h.hero + '. ' + (model.pages.find((p) => p.handle === 'about')?.paragraphs?.[0] || ''), h.hero),
    canonical: ORIGIN + '/',
    jsonld: [orgLd, faqLd],
    body,
  });
}

// Collection facets. The source runs these server-side through Shopify; here the
// same controls are real and run on the client over the cards already in the DOM.
// The labels are the source's own wording so the control a visitor learned on the
// old site is the control they meet on the new one.
function facets(list) {
  const inStock = list.filter((p) => p.available !== false).length;
  const outStock = list.length - inStock;
  const maxCents = Math.max(...list.map((p) => p.priceCents || 0));
  const maxPrice = '$' + (maxCents / 100).toFixed(2);

  // Rendered TWICE, as the source does: a control row for wide viewports and a
  // "Filter and sort" drawer for narrow ones. Only one is visible at a time.
  // Ids are suffixed per variant so the two copies never collide.
  const bar = (v) => `<div class="facets__bar">
        <div class="facets__group">
          <h2 class="facets__label">Filter:</h2>
          <details class="facets__drop">
            <summary>Availability <span data-facet-count>0 selected</span></summary>
            <div class="facets__panel">
              <p class="facets__head">Availability <button class="facets__reset" type="button" data-facet-reset="avail">Reset</button></p>
              <label><input type="checkbox" data-facet-avail="true"> In stock (${inStock})
                <span class="visually-hidden">In stock (${inStock} ${inStock === 1 ? 'product' : 'products'})</span></label>
              <label><input type="checkbox" data-facet-avail="false"> Out of stock (${outStock})
                <span class="visually-hidden">Out of stock (${outStock} ${outStock === 1 ? 'product' : 'products'})</span></label>
            </div>
          </details>
          <details class="facets__drop">
            <summary>Price</summary>
            <div class="facets__panel">
              <p class="facets__head">The highest price is ${esc(maxPrice)} <button class="facets__reset" type="button" data-facet-reset="price">Reset</button></p>
              <div class="facets__range">
                <label>$ <span class="visually-hidden">From</span><input type="number" min="0" step="1" placeholder="From" data-facet-min aria-label="From"></label>
                <label>$ <span class="visually-hidden">To</span><input type="number" min="0" step="1" placeholder="To" data-facet-max aria-label="To"></label>
              </div>
              <div class="facets__rangeactions">
                <button class="btn btn--sm" type="button" data-facet-clear>Clear</button>
                <button class="btn btn--sm btn--primary" type="button" data-facet-apply>Apply</button>
              </div>
            </div>
          </details>
          <button class="facets__removeall" type="button" data-facet-removeall>Remove all</button>
        </div>
        <div class="facets__group">
          <h2 class="facets__label"><label for="sort-by-${v}">Sort by:</label></h2>
          <select id="sort-by-${v}" data-sort>
            <option value="featured">Featured</option>
            <option value="relevant">Most relevant</option>
            <option value="best">Best selling</option>
            <option value="az">Alphabetically, A-Z</option>
            <option value="za">Alphabetically, Z-A</option>
            <option value="plh">Price, low to high</option>
            <option value="phl">Price, high to low</option>
            <option value="don">Date, old to new</option>
            <option value="dno">Date, new to old</option>
          </select>
          <h2 class="facets__count"><span data-product-count>${list.length}</span> products</h2>
        </div>
      </div>`;

  return `<section class="shell facets" data-facets>
      <div class="facets__wide">${bar('wide')}</div>
      <details class="facets__mobile">
        <summary><h2 class="facets__label">Filter and sort</h2></summary>
        <h2 class="visually-hidden">Filter</h2>
        ${bar('drawer')}
      </details>
    </section>`;
}

function renderCollection(c) {
  const list = c.productHandles.map((x) => byHandle.get(x)).filter(Boolean);
  const art = collectionArt(c);
  const trail = [{ label: 'Home', href: '/' }, { label: 'Collections', href: '/collections/all' }, { label: c.title }];
  const intro = c.paragraphs && c.paragraphs.length
    ? `<div class="prose shell-narrow" style="margin-inline:0">
        ${c.descHeading ? `<h2>${esc(c.descHeading)}</h2>` : ''}
        ${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
      </div>` : '';

  const body = `${crumbs(trail)}
    <section class="hero-wrap sec" style="margin-top:0">
      <div class="hero" style="margin-top:0">
        ${art ? `<img class="hero__bg" src="${attr(art.src)}" alt="" aria-hidden="true" width="1200" height="800" decoding="async">` : ''}
        <span class="hero__vapor" aria-hidden="true">
          <span class="vapor__plume vapor__plume--h1"></span>
          <span class="vapor__plume vapor__plume--h2"></span>
          <span class="vapor__plume vapor__plume--h3"></span>
        </span>
      <div class="hero__inner shell" style="padding-block:var(--gap-7)">
          <span class="hero__eyebrow">Collection</span>
          <h1>${esc(c.title)}</h1>
          <p class="hero__lede">${esc(list.length ? `${list.length} product${list.length === 1 ? '' : 's'} in this collection.` : 'This collection has no products listed at the moment.')}</p>
        </div>
      </div>
    </section>
    ${facets(list)}
    <section class="shell sec" style="margin-top:0">
      ${list.length ? productGrid(list) : '<p class="empty-note">No products are listed in this collection.</p>'}
      <p class="empty-note" data-facet-none${list.length ? ' hidden' : ''}>No products found Use fewer filters or <button class="facets__removeall" type="button" data-facet-removeall>Remove all</button></p>
      ${list.length ? `<h2 class="visually-hidden"><span data-product-count>${list.length}</span> products</h2>` : ''}
    </section>
    ${intro ? `<section class="shell sec">${intro}</section>` : ''}`;

  return layout({
    title: `${c.title} | ${BRAND}`,
    description: metaFrom(c.description, `${c.title} from ${BRAND_LONG} in Albuquerque, New Mexico.`),
    canonical: ORIGIN + '/collections/' + c.handle,
    jsonld: [breadcrumbLd(trail), {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: c.title, url: ORIGIN + '/collections/' + c.handle,
      ...(c.description ? { description: c.description } : {}),
    }],
    body,
  });
}

function renderProduct(p) {
  const imgs = p.images.map((u) => localImage(u, 'product:' + p.handle));
  const cols = (p.collections || []).map((h) => colByHandle.get(h)).filter(Boolean);
  const trail = [{ label: 'Home', href: '/' },
    ...(cols[0] ? [{ label: cols[0].title, href: '/collections/' + cols[0].handle }] : []),
    { label: p.title }];

  const related = (cols[0] ? cols[0].productHandles : [])
    .filter((h) => h !== p.handle).map((h) => byHandle.get(h)).filter(Boolean).slice(0, 4);

  const descBlocks = (p.descBlocks || []).map((b) =>
    b.tag === 'p' ? `<p>${esc(b.text)}</p>`
      : b.tag === 'li' ? `<li>${esc(b.text)}</li>`
        : `<${b.tag}>${esc(b.text)}</${b.tag}>`).join('\n        ');

  const body = `<a class="skip-link" href="#product-information">Skip to product information</a>
    ${crumbs(trail)}
    <section class="shell sec" style="margin-top:0">
      <div class="pdp">
        <div>
          <div class="pdp__stage" id="product-information">
            ${imgs[0] ? `<img id="pdp-main" src="${attr(imgs[0])}" alt="${attr(p.title)}" width="900" height="900" fetchpriority="high" decoding="async">` : ''}
          </div>
          ${imgs.length > 1 ? `<div class="pdp__thumbs">
            ${imgs.map((u, n) => `<button class="pdp__thumb" type="button" data-zoom data-full="${attr(u)}" aria-haspopup="dialog"><span class="visually-hidden">Open media ${n + 1} in modal</span><img src="${attr(u)}" alt="${attr(p.title + ' — view ' + (n + 1))}" width="68" height="68" loading="lazy" decoding="async"></button>`).join('')}
          </div>` : ''}
        </div>
        <div>
          ${p.vendor ? `<span class="pcard__vendor">${esc(p.vendor)}</span>` : ''}
          <h1>${esc(p.title)}</h1>
          <p class="pdp__price">
            <span class="visually-hidden">Regular price</span>${esc(p.price)} USD${p.priceMaxCents > p.priceCents ? ` – ${esc('$' + (p.priceMaxCents / 100).toFixed(2))} USD` : ''}
            <span class="visually-hidden">Sale price ${esc(p.price)} USD</span>
          </p>
          ${p.variants.length > 1 ? `<div class="field">
            <label for="variant-${attr(p.handle)}">Variant</label>
            <select id="variant-${attr(p.handle)}" data-variant>
              ${p.variants.map((v) => `<option value="${attr(v.title || '')}">${esc(v.title || p.title)} — ${esc(v.price)} USD</option>`).join('')}
            </select>
          </div>` : ''}
          <div class="field pdp__qty">
            <label for="qty-${attr(p.handle)}">Quantity</label>
            <input id="qty-${attr(p.handle)}" type="number" name="quantity" min="1" step="1" value="1" data-qty-input>
          </div>
          ${p.variants.length > 1 ? `<table class="spec"><caption class="visually-hidden">Variants</caption><tbody>
            ${p.variants.map((v) => `<tr><th scope="row">${esc(v.title || '—')}</th><td>${esc(v.price)}${v.sku ? ` <span class="muted">SKU ${esc(v.sku)}</span>` : ''}</td></tr>`).join('\n            ')}
          </tbody></table>` : (p.variants[0] && p.variants[0].sku ? `<p class="muted">SKU ${esc(p.variants[0].sku)}</p>` : '')}
          <p class="ticker"><span>Free shipping on orders over $500</span><span class="visually-hidden" aria-hidden="true">Free shipping on orders over $500</span></p>
          <div class="pdp__order">
            ${p.available === false
              ? `<p class="pcard__stock pcard__stock--out">Sold out</p>`
              : `<button class="btn btn--primary btn--block btn--knurled" type="button" data-add="${attr(p.handle)}" data-title="${attr(p.title)}" data-price="${attr(p.price)}">Add to cart</button>`}
            ${(p.variants.length ? p.variants : [{ title: p.title }]).map(() =>
              `<p class="visually-hidden" data-variant-state>Variant unavailable Sold out</p>`).join('')}
            <a class="btn btn--block btn--knurled" style="margin-top:var(--gap-3)" href="tel:${attr(PHONE)}">${ICON.phone} Order Online &middot; Call ${esc(PHONE)}</a>
            <p class="pdp__note">Opening hours: ${esc(HOURS)}</p>
            <a class="btn btn--sm btn--block" href="mailto:${attr(EMAIL)}">Or email ${esc(EMAIL)}</a>
          </div>
          ${cols.length ? `<p class="chips"><span class="chips__label">In:</span> ${[...cols]
            // superlative-named categories last, so the phrase is followed by the full stop
            .sort((a, b) => (/\b(best|top|leading|#1)\b/i.test(a.title) ? 1 : 0) - (/\b(best|top|leading|#1)\b/i.test(b.title) ? 1 : 0))
            .map((c) => `<a class="chip" href="/collections/${attr(c.handle)}">${esc(c.title)}</a>`).join(' ')}.</p>` : ''}
        </div>
      </div>
    </section>

    <div class="stickybuy" data-sticky hidden>
      <div class="shell stickybuy__inner">
        <p class="stickybuy__title">${esc(p.title)}</p>
        <p class="stickybuy__price"><span class="visually-hidden">Regular price</span>${esc(p.price)} USD</p>
        <div class="field stickybuy__qty">
          <label for="sticky-qty-${attr(p.handle)}">Quantity</label>
          <input id="sticky-qty-${attr(p.handle)}" type="number" min="1" step="1" value="1">
        </div>
        ${p.available === false
          ? `<p class="pcard__stock pcard__stock--out">Sold out</p>`
          : `<button class="btn btn--primary btn--knurled" type="button" data-add="${attr(p.handle)}" data-title="${attr(p.title)}" data-price="${attr(p.price)}">Add to cart</button>`}
      </div>
    </div>
    <dialog class="lightbox" data-lightbox>
      <div class="lightbox__stage" data-lightbox-stage></div>
      <button class="btn btn--sm" type="button" data-lightbox-close>Close</button>
    </dialog>

    ${descBlocks ? `<section class="shell sec">
      <div class="prose" data-reveal>
        ${p.descHeading ? '' : '<h2>Product Description</h2>'}
        ${descBlocks}
      </div>
    </section>` : ''}

    ${related.length ? `<section class="shell sec">
      <div class="sec__head" data-reveal><div><span class="sec__kicker">More from ${esc(cols[0].title)}</span><h2 class="sec__title">You might also like</h2></div></div>
      ${productGrid(related)}
    </section>` : ''}`;

  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.title, url: ORIGIN + '/products/' + p.handle,
    ...(p.vendor ? { brand: { '@type': 'Brand', name: p.vendor } } : {}),
    ...(p.description ? { description: p.description } : {}),
    ...(imgs[0] ? { image: imgs.map((u) => (u.startsWith('http') ? u : ORIGIN + u)) } : {}),
    ...(p.variants[0] && p.variants[0].sku ? { sku: p.variants[0].sku } : {}),
    offers: {
      '@type': 'Offer', priceCurrency: 'USD', price: (p.priceCents / 100).toFixed(2),
      url: ORIGIN + '/products/' + p.handle, availability: 'https://schema.org/InStock',
    },
  };

  return layout({
    title: `${p.title} | ${BRAND}`,
    description: metaFrom(p.description, `${p.title}${p.vendor ? ' by ' + p.vendor : ''} — ${p.price} at ${BRAND_LONG}.`),
    canonical: ORIGIN + '/products/' + p.handle,
    jsonld: [breadcrumbLd(trail), productLd],
    body,
  });
}

function renderPage(pg) {
  const trail = [{ label: 'Home', href: '/' }, { label: pg.title }];
  const isContact = pg.handle === 'contact';
  const isFaq = pg.handle === 'faqs';

  // Render the page's whole block structure. Rendering only <p> runs dropped
  // every heading and list item on the policy pages — on a returns policy that
  // is losing the clauses, not the preamble.
  const blocks = (pg.blocks && pg.blocks.length) ? pg.blocks : pg.paragraphs.map((t) => ({ tag: 'p', text: t }));
  const renderBlocks = (bs) => {
    const out = [];
    let openList = false;
    for (const b of bs) {
      if (b.tag === 'li') {
        if (!openList) { out.push('<ul>'); openList = true; }
        out.push(`<li>${esc(b.text)}</li>`);
        continue;
      }
      if (openList) { out.push('</ul>'); openList = false; }
      const tag = (b.tag === 'h2' || b.tag === 'h3' || b.tag === 'h4') ? b.tag : 'p';
      out.push(`<${tag}>${esc(b.text)}</${tag}>`);
    }
    if (openList) out.push('</ul>');
    return out.join('\n        ');
  };
  let inner = renderBlocks(blocks);

  if (isContact) {
    inner = `<div class="grid grid--2" style="gap:var(--gap-7);align-items:start">
        <div class="prose" data-reveal>
          <h2>Get in Touch</h2>
          ${renderBlocks(blocks)}
          <table class="spec"><tbody>
            <tr><th scope="row">Phone</th><td><a href="tel:${attr(PHONE)}">${esc(PHONE)}</a></td></tr>
            <tr><th scope="row">Email</th><td><a href="mailto:${attr(EMAIL)}">${esc(EMAIL)}</a></td></tr>
            <tr><th scope="row">Address</th><td>${esc(ADDR.street)}, ${esc(ADDR.locality)}, ${esc(ADDR.region)} ${esc(ADDR.postalCode)}</td></tr>
            <tr><th scope="row">Working Hours</th><td>${esc(HOURS)}</td></tr>
          </tbody></table>
        </div>
        <form class="plate" style="padding:var(--gap-6)" method="post" action="/pages/contact">
          <h2 style="margin-top:0">Contact form</h2>
          <div class="field"><label for="cf-name">Name</label><input id="cf-name" name="name" type="text" autocomplete="name"></div>
          <div class="field"><label for="cf-email">Email <span class="req">*</span></label><input id="cf-email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="cf-phone">Phone number</label><input id="cf-phone" name="phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label for="cf-comment">Comment</label><textarea id="cf-comment" name="comment"></textarea></div>
          <button class="btn btn--primary btn--block btn--knurled" type="submit">Send</button>
        </form>
      </div>`;
  }

  if (isFaq) {
    // The source FAQ page carries a heading and nothing else. Rather than invent
    // answers, the rebuild shows the seven real Q&As the homepage publishes.
    inner = `<div class="acc" data-reveal>
        ${model.home.faqs.map((f, i) => `<details${i === 0 ? ' open' : ''}>
          <summary>${esc(f.q)}</summary>
          <div class="acc__body">${esc(f.a)}</div>
        </details>`).join('\n        ')}
      </div>
      <div class="faq-cta">
        <p class="muted">Still need a hand?</p>
        <div class="faq-cta__actions">
          <a class="btn btn--primary btn--knurled" href="/pages/contact">Contact us</a>
          <a class="btn" href="tel:${attr(PHONE)}">Or call ${esc(PHONE)}</a>
        </div>
      </div>`;
  }

  const body = `${crumbs(trail)}
    <section class="shell sec" style="margin-top:0">
      <h1>${esc(pg.title)}</h1>
      ${isContact || isFaq ? inner : `<div class="prose shell-narrow" style="margin-inline:0;padding-inline:0">${inner}</div>`}
    </section>`;

  return layout({
    title: `${pg.title} | ${BRAND}`,
    description: metaFrom(pg.paragraphs.join(' '), `${pg.title} — ${BRAND_LONG}, ${ADDR.locality}, ${ADDR.region}.`),
    canonical: ORIGIN + '/pages/' + pg.handle,
    jsonld: [breadcrumbLd(trail)],
    body,
  });
}

function renderBlog(b) {
  const trail = [{ label: 'Home', href: '/' }, { label: b.title || 'News' }];
  const body = `${crumbs(trail)}
    <section class="shell sec" style="margin-top:0">
      <h1>${esc(b.title || 'News')}</h1>
      <p class="empty-note">No articles have been published yet.</p>
    </section>`;
  return layout({
    title: `${b.title || 'News'} | ${BRAND}`,
    description: `News and updates from ${BRAND_LONG}, ${ADDR.locality}, ${ADDR.region}.`,
    canonical: ORIGIN + '/blogs/news',
    jsonld: [breadcrumbLd(trail)],
    body,
  });
}

function renderSearch() {
  const trail = [{ label: 'Home', href: '/' }, { label: 'Search' }];
  const body = `${crumbs(trail)}
    <section class="shell sec" style="margin-top:0">
      <h1>Search</h1>
      ${searchForm('search-page')}
      <link rel="preload" as="fetch" id="search-index-url" href="/search-index.json" crossorigin>
      <p class="muted" data-search-summary></p>
      <div class="grid grid--4" data-search-results></div>
      <p class="empty-note" data-search-empty hidden>No products matched that search.</p>
    </section>`;
  return layout({
    title: `Search | ${BRAND}`,
    description: `Search the ${BRAND_LONG} catalogue of smoke, vape and CBD products.`,
    canonical: ORIGIN + '/search',
    jsonld: [breadcrumbLd(trail)],
    body,
  });
}

// The quote basket. There is no payment runtime in a static build, so this
// collects a basket and hands it to the enquiry path the client already uses —
// the phone number and address in their own footer. It never pretends to check out.
function renderCart() {
  const trail = [{ label: 'Home', href: '/' }, { label: 'Quote basket' }];
  const body = `${crumbs(trail)}
    <section class="shell sec" style="margin-top:0">
      <h1>Quote basket</h1>
      <p class="muted">Add the products you want, then send the list over. Pricing and availability are confirmed by ${esc(BRAND_LONG)} before anything is charged.</p>
      <div data-cart-table></div>
      <p class="empty-note" data-cart-empty hidden>Your basket is empty.</p>
      <form class="plate" style="padding:var(--gap-6);margin-top:var(--gap-6)" method="post" action="/cart" data-cart-form hidden>
        <h2 style="margin-top:0">Request a quote</h2>
        <div class="field"><label for="q-name">Name</label><input id="q-name" name="name" type="text" autocomplete="name"></div>
        <div class="field"><label for="q-email">Email <span class="req">*</span></label><input id="q-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="q-phone">Phone number</label><input id="q-phone" name="phone" type="tel" autocomplete="tel"></div>
        <div class="field"><label for="q-comment">Comment</label><textarea id="q-comment" name="comment"></textarea></div>
        <input type="hidden" name="basket" data-cart-payload>
        <button class="btn btn--primary btn--block btn--knurled" type="submit">Send</button>
        <p class="pdp__note">Or call <a href="tel:${attr(PHONE)}">${esc(PHONE)}</a> &middot; ${esc(HOURS)}</p>
      </form>
    </section>`;
  return layout({
    title: `Quote basket | ${BRAND}`,
    description: `Build a wholesale quote request from the ${BRAND_LONG} catalogue.`,
    canonical: ORIGIN + '/cart',
    jsonld: [breadcrumbLd(trail)],
    body,
  });
}

// ------------------------------------------------------------------- write
function write(rel, html) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) n += copyDir(path.join(from, e.name), path.join(to, e.name));
    else { fs.copyFileSync(path.join(from, e.name), path.join(to, e.name)); n++; }
  }
  return n;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
write('index.html', renderHome()); n++;
for (const c of model.collections) { write(`collections/${c.handle}/index.html`, renderCollection(c)); n++; }
for (const p of model.products) { write(`products/${p.handle}/index.html`, renderProduct(p)); n++; }
for (const pg of model.pages) { write(`pages/${pg.handle}/index.html`, renderPage(pg)); n++; }
if (model.blog) { write('blogs/news/index.html', renderBlog(model.blog)); n++; }
write('search/index.html', renderSearch()); n++;
write('cart/index.html', renderCart()); n++;

// The search index: every product and collection, as the smallest record the
// client-side search needs. Written once rather than embedded in every page.
const index = {
  generated: new Date().toISOString(),
  products: model.products.map((p) => ({
    t: p.title, h: p.handle, pr: p.price, v: p.vendor,
    a: p.available !== false,
    i: p.images[0] ? localImage(p.images[0], 'search-index') : '',
    c: (p.collections || []).join(' '),
  })),
  collections: model.collections.map((c) => ({ t: c.title, h: c.handle, n: c.productHandles.length })),
};
fs.writeFileSync(path.join(OUT, 'search-index.json'), JSON.stringify(index));

for (const f of ['tokens.css', 'fonts.css', 'site.css', 'motion.css']) {
  fs.mkdirSync(path.join(OUT, 'styles'), { recursive: true });
  fs.copyFileSync(path.join('src/styles', f), path.join(OUT, 'styles', f));
}
const nf = copyDir('src/assets/fonts', path.join(OUT, 'assets', 'fonts'));
// Only the generated images that passed inspection are published.
fs.mkdirSync(path.join(OUT, 'assets', 'generated'), { recursive: true });
let ng = 0;
for (const g of genById.values()) {
  fs.copyFileSync(path.join('src/assets/generated', g.file), path.join(OUT, 'assets', 'generated', g.file));
  ng++;
}
const ns = copyDir('src/scripts', path.join(OUT, 'scripts'));

// These are the CLIENT'S OWN product photographs with their studio background
// removed. That is a modification of supplied imagery, so it is written down
// rather than left implicit.
if (cutoutsUsed.length) {
  fs.mkdirSync('audit', { recursive: true });
  fs.writeFileSync('audit/cutouts.json', JSON.stringify({
    schema: 'smokeshopgurus/cutouts@1',
    generated: new Date().toISOString(),
    note: 'Client product photographs with the studio background flood-filled away by tools/cutout.mjs, for the Best Seller marquee only. The originals are untouched and are still what every product page and grid shows.',
    tool: 'tools/cutout.mjs',
    count: cutoutsUsed.length,
    files: cutoutsUsed
  }, null, 1));
  console.log('  cut-outs used: ' + cutoutsUsed.length + ' -> audit/cutouts.json');
}

console.log('generated ' + n + ' pages -> ' + OUT);
console.log('  styles 4 · fonts ' + nf + ' · generated-img ' + ng + ' · scripts ' + ns + ' · product/collection img ' + imgCopied.size);
if (imgMisses.length) {
  const uniq = [...new Set(imgMisses.map((m) => m.url))];
  console.log('  IMAGE MISSES (still pointing at the source CDN): ' + uniq.length);
  uniq.slice(0, 5).forEach((u) => console.log('    ' + u.slice(0, 120)));
  fs.writeFileSync('audit/image-misses.json', JSON.stringify({ generated: new Date().toISOString(), count: uniq.length, urls: uniq }, null, 1));
}
