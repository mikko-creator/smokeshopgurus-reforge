# Deploying this build

`dist/` is a static site. There is no build step at serve time, no runtime
dependency and no server requirement beyond returning files.

---

## Hosting

Upload `dist/` anywhere that serves static files. Paths are relative to each page,
so the site works at a domain root, in a subdirectory, or from a `file://` path
without reconfiguration.

Two things a host should be told:

- **Directory indexes.** Pages live at `products/<handle>/index.html`, so
  `/products/aleaf-10-bubble-beaker` must resolve to that file. Netlify, Cloudflare
  Pages, GitHub Pages, S3 with `index.html` as the index document and nginx with
  `try_files $uri $uri/ =404` all do this by default.
- **`search-index.json` must be served as JSON.** The search page fetches it. It is
  at the build root.

`robots.txt`, `sitemap.xml` and `llms.txt` are generated into `dist/` and point at
`https://smokeshopgurus.com`. If this build goes live anywhere else, re-run
`sr-seo.mjs --apply --site-url <the real origin>` so the sitemap and canonicals
name the domain it is actually served from.

---

## What still needs wiring

This is the honest list. Everything below is inert in the static build.

### 1. Checkout — the only real gap

The source ran Shopify's cart and checkout. A static build cannot take payment, and
nothing here pretends to.

What is built instead is a **quote basket**: add-to-cart on every product card and
product page, quantities, a basket at `/cart/`, and a request-a-quote form. It is
`localStorage` only — nothing leaves the browser. That matches how the client
already sells (the header CTA on the source site is "Order Online Call Us
(505)-288-9953", and the About page positions the business as a wholesale supplier),
but it is not a checkout.

To restore purchasing, either:
- point the basket at a commerce backend (Shopify Storefront API, Snipcart,
  Medusa — the basket shape is `{handle, title, price, qty}` in `localStorage`
  under `ssg.cart.v1`), or
- leave it as a quote request and wire the form, below.

### 2. Forms

Two forms post and nothing receives them:

| form | page | fields |
|---|---|---|
| Contact | `/pages/contact/` | name, email (required), phone, comment |
| Request a quote | `/cart/` | name, email (required), phone, comment, basket (hidden) |

Both are plain `<form method="post">`. Point the `action` at a form handler
(Formspree, Netlify Forms, a mail endpoint) or add a handler at the current action.
The basket field arrives as a single string: `2 x aLeaf (10" Bubble Beaker) ($40.00); …`

### 3. Customer accounts

The source had Shopify customer accounts ("Log in"). There is no static equivalent
and none is faked. If accounts are needed they come with whatever commerce backend
is chosen in (1).

### 4. Search, filtering and sorting — already working

These were server-side on Shopify and are rebuilt as real client-side behaviour, so
they need nothing:

- **Search** at `/search?q=…`, over `search-index.json` (82 products, 46 collections).
- **Collection filters** — availability and price range, on every collection page.
- **Sort** — alphabetical and price orderings are real. "Featured", "Most relevant",
  "Best selling" and the two date orderings keep the collection's published order,
  because the harvest contains no popularity or date signal and inventing a ranking
  would be inventing data.

### 5. Age verification

The source ran a Shopify age-gate app. The rebuild ships an equivalent 21+
interstitial (`localStorage` key `ssg.age.ok`). Confirm it satisfies whatever the
client's compliance advice requires before launch — it is a like-for-like
replacement of a control that was already there, not legal advice.

---

## One thing the client must decide before launch

**The Terms & Conditions page still says the store is powered by Shopify.**

`pages/term-and-services/index.html` carries this sentence, verbatim from the live
site:

> Smoke Shop Gurus is powered by Shopify, which enables us to provide the Services to you.

It has been left exactly as written. It is the client's legal text, and rewriting a
customer's terms of service is not a developer's call — but once this build replaces
the Shopify site, the sentence is no longer accurate.

This is also the single reason `sr-decontaminate` reports CONTAMINATED and gate check
C21 is red. It is not a platform artifact that survived the migration; it is a
sentence in a legal document. **Have the client's counsel update it**, then re-run:

```bash
node <skill>/scripts/sr-decontaminate.mjs --project . --strict
```

and C21 goes green with no other change.

---

## Performance notes

- 137 images converted to WebP: **36.9 MB → 6.4 MB**, 1,034 references rewritten.
- Fonts are self-hosted (`src/assets/fonts`, 20 woff2, 804 KB) — Fira Sans, Inter and
  Poppins, the same families the source loaded from Google Fonts. No third-party
  request is made by any page.
- Two scripts total, both deferred: `site.js` (age gate, gallery, nav ARIA) and
  `shop.js` (basket, facets, search, lightbox, sticky buy bar).
- Every image carries explicit `width`/`height`; everything below the fold is
  `loading="lazy"`.
- `prefers-reduced-motion` is honoured throughout, including the ticker and the
  basket notification.
